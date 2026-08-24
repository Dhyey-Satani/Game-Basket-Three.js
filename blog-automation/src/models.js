// blog-automation/src/models.js
'use strict';

function pricePer1k(model) {
  const p = model.pricing || {};
  const prompt = parseFloat(p.prompt);
  const completion = parseFloat(p.completion);
  return Math.max(0, (Number.isFinite(prompt) ? prompt : 0) + (Number.isFinite(completion) ? completion : 0));
}

function fetchTimeout(url, opts, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return globalThis.fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(t));
}

async function getJson(url, cfg, auth) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) headers.Authorization = `Bearer ${auth}`;
  const res = await fetchTimeout(url, { headers }, cfg.FETCH_TIMEOUT_MS);
  if (!res.ok) throw new Error(`OpenRouter ${url} -> HTTP ${res.status}`);
  return res.json();
}

async function fetchModels(keys, cfg) {
  const key = Array.isArray(keys) ? keys[0] : keys;
  const v1 = await getJson(cfg.OPENROUTER_MODELS_URL, cfg, key);
  const v1Models = Array.isArray(v1.data) ? v1.data : [];
  return { v1Models, popularMap: new Map() };
}

function filterCandidates(models, cfg) {
  return models.filter((m) => {
    const name = (m.name || '').toLowerCase();
    if (/(image|vision|audio|video|whisper|tts|dall.e|flux|midjourney|stable.diffusion)/i.test(name)) return false;
    const id = m.id || '';
    if (/^openrouter\/auto(?:-|$)/.test(id)) return false;
    if (id.includes(':batch')) return false;
    const arch = m.architecture || {};
    if (arch.input_modalities && (arch.input_modalities.includes('audio') || arch.input_modalities.includes('video'))) return false;
    const prov = m.top_provider || {};
    if (prov.is_moderated === false) return false;
    if (prov.max_completion_tokens && prov.max_completion_tokens < cfg.MAX_OUTPUT_TOKENS) return false;
    if (m.context_length && m.context_length < cfg.MIN_CONTEXT_LENGTH) return false;
    const cost = pricePer1k(m);
    if (cfg.MAX_COST_PER_1K_TOKENS && cost > cfg.MAX_COST_PER_1K_TOKENS) return false;
    return true;
  });
}

function scoreModel(m, popularMap, cfg, nowMs = Date.now()) {
  const cost = pricePer1k(m);
  const created = m.created ? Number(m.created) : 0;
  const daysOld = created ? (nowMs - created * 1000) / 86400000 : 3650;
  const recency = Math.max(0, Math.min(1, 1 - Math.max(0, daysOld) / 730));
  const popularity = popularMap.get(m.id) || popularMap.get(m.slug) || 0;
  const brand = (cfg.PREFERRED_PREFIXES || []).some((p) => String(m.id || '').startsWith(p)) ? 1 : 0;
  const context = Math.min(1, (m.context_length || 0) / 200000);
  const price = cfg.MAX_COST_PER_1K_TOKENS ? Math.max(0, 1 - cost / cfg.MAX_COST_PER_1K_TOKENS) : 0.5;
  return recency * 0.3 + popularity * 0.1 + brand * 0.35 + context * 0.15 + price * 0.2;
}

function isFreeModel(m) {
  const id = String(m.id || '');
  if (id.includes(':free')) return true;
  const p = m.pricing || {};
  return String(p.prompt) === '0' && String(p.completion) === '0';
}
 
const FREE_EXCLUDE_NAME = /(image|vision|audio|video|whisper|tts|dall.e|flux|midjourney|stable.diffusion|sora|lyria|code|safety|stealth|dots|inkling|poolside|lfm|nano|nemotron|liquid|reasoning)/i;
 
function filterFreeCandidates(models, cfg) {
  return models.filter((m) => {
    if (!isFreeModel(m)) return false;
    const name = (m.name || '').toLowerCase();
    const id = String(m.id || '').toLowerCase();
    if (FREE_EXCLUDE_NAME.test(name) || FREE_EXCLUDE_NAME.test(id)) return false;
    if (/^openrouter\/(auto|free)(?:-|$)/.test(id)) return false;
    if (id.includes(':batch')) return false;
    if (m.context_length && m.context_length < cfg.MIN_CONTEXT_LENGTH) return false;
    const prov = m.top_provider || {};
    if (prov.max_completion_tokens && prov.max_completion_tokens < cfg.MAX_OUTPUT_TOKENS) return false;
    return true;
  });
}
 
function scoreFreeModel(m, cfg, nowMs = Date.now()) {
  const context = Math.min(1, (m.context_length || 0) / 1000000);
  const brand = (cfg.PREFERRED_FREE_PREFIXES || []).some((p) => String(m.id || '').startsWith(p)) ? 1 : 0;
  const created = m.created ? Number(m.created) : 0;
  const daysOld = created ? (nowMs - created * 1000) / 86400000 : 3650;
  const recency = Math.max(0, Math.min(1, 1 - Math.max(0, daysOld) / 730));
  return brand * 0.7 + context * 0.25 + recency * 0.05;
}
 
async function pickFreeModel(keys, cfg) {
  const { v1Models } = await fetchModels(keys, cfg);
  const candidates = filterFreeCandidates(v1Models, cfg);
  if (!candidates.length) return null;
  let best = null;
  let bestScore = -1;
  for (const m of candidates) {
    const s = scoreFreeModel(m, cfg);
    if (s > bestScore) {
      bestScore = s;
      best = m;
    }
  }
  return {
    id: best.id,
    name: best.name,
    context_length: best.context_length || null,
    score: bestScore,
    costPer1k: 0,
    source: 'free',
  };
}
 
async function getModelCandidates(keys, cfg, limit = 3) {
  const { v1Models } = await fetchModels(keys, cfg);
  const free = filterFreeCandidates(v1Models, cfg)
    .sort((a, b) => scoreFreeModel(b, cfg) - scoreFreeModel(a, cfg));
  const picks = free.slice(0, limit).map((m) => ({
    id: m.id,
    name: m.name,
    context_length: m.context_length || null,
    score: scoreFreeModel(m, cfg),
    costPer1k: 0,
    source: 'free',
  }));
  if (picks.length) return picks;
  const candidates = filterCandidates(v1Models, cfg);
  if (!candidates.length) {
    return cfg.FALLBACK_MODELS.map((id) => ({ id, name: id, context_length: null, source: 'fallback' }));
  }
  let best = candidates[0];
  let bestScore = -1;
  for (const m of candidates) {
    const s = scoreModel(m, new Map(), cfg);
    if (s > bestScore) {
      bestScore = s;
      best = m;
    }
  }
  return [{

    id: best.id,
    name: best.name,
    context_length: best.context_length || null,
    score: bestScore,
    costPer1k: pricePer1k(best),
   source: 'paid',
  }];
}
 
async function pickBestModel(keys, cfg) {
  const list = await getModelCandidates(keys, cfg, 1);
  return list[0];
}

module.exports = {
  pricePer1k,
  fetchModels,
  filterCandidates,
  scoreModel,
  isFreeModel,
  filterFreeCandidates,
  scoreFreeModel,
  pickFreeModel,
  getModelCandidates,
  pickBestModel,
};
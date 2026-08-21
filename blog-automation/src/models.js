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

async function pickBestModel(keys, cfg) {
  const { v1Models, popularMap } = await fetchModels(keys, cfg);
  const candidates = filterCandidates(v1Models, cfg);
  if (!candidates.length) {
    return { id: cfg.FALLBACK_MODELS[0], name: cfg.FALLBACK_MODELS[0], context_length: null };
  }
  let best = candidates[0];
  let bestScore = -1;
  for (const m of candidates) {
    const s = scoreModel(m, popularMap, cfg);
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
    costPer1k: pricePer1k(best),
  };
}

module.exports = { pricePer1k, fetchModels, filterCandidates, scoreModel, pickBestModel };

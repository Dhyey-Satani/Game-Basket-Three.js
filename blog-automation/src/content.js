// blog-automation/src/content.js
'use strict';

function buildNewsPrompt(slot, headline, cfg, related) {
  const relatedLine = related
    ? `Reference this related article on our site naturally in the closing section: "${related.title}" at ${cfg.SITE_URL}/blog/${related.slug}/`
    : `Reference our game at ${cfg.SITE_URL} naturally in the closing section.`;
  return `You are an SEO content writer for ${cfg.SITE_URL}, a basketball game website with a blog. Write a search-engine-optimized news article in plain English.

Category: ${slot.badge}.
Source headline: "${headline.title}"
Source URL: ${headline.link}

Write a factual, engaging news article that expands this headline into something useful. Requirements:
- Title: 50-60 characters, keyword-rich, compelling.
- metaDescription: 150-160 characters containing the primary keyword.
- keywords: 4-6 relevant keywords as an array.
- intro: 1-2 sentence hook.
- Exactly 4-6 sections; each section has an h2 heading (plain sentence case, no markdown) and 2-3 blocks.
- Blocks: type "p" for paragraphs, "ul"/"ol" for bullet/numbered lists, type "quote" for exactly one pull-quote somewhere.
- 700-1000 words total. No markdown anywhere inside block text.
- ${relatedLine}

Return ONLY valid JSON matching exactly this schema:
{"title":"...","metaDescription":"...","keywords":["..."],"imageQuery":"...","intro":"...","sections":[{"heading":"...","blocks":[{"type":"p","text":"..."}]}],"ctaText":"..."}`;
}

function buildEvergreenPrompt(slot, cfg, related) {
  const relatedLine = related
    ? `Reference this related article on our site naturally in the closing section: "${related.title}" at ${cfg.SITE_URL}/blog/${related.slug}/`
    : `Reference our game at ${cfg.SITE_URL} naturally in the closing section.`;
  return `You are an SEO content writer for ${cfg.SITE_URL}, a basketball game website with a blog. Write a search-engine-optimized evergreen guide in plain English.

Topic: ${slot.topic}
Category: ${slot.badge}

Requirements:
- Title: 50-60 characters, keyword-rich, compelling.
- metaDescription: 150-160 characters containing the primary keyword.
- keywords: 4-6 relevant keywords as an array.
- intro: 1-2 sentence hook.
- Exactly 4-6 sections; each section has an h2 heading (plain sentence case, no markdown) and 2-3 blocks.
- Blocks: type "p" for paragraphs, "ul"/"ol" for bullet/numbered lists, type "quote" for exactly one pull-quote somewhere.
- 700-1000 words total. Practical, actionable advice. No markdown anywhere inside block text.
- ${relatedLine}

Return ONLY valid JSON matching exactly this schema:
{"title":"...","metaDescription":"...","keywords":["..."],"imageQuery":"...","intro":"...","sections":[{"heading":"...","blocks":[{"type":"p","text":"..."}]}],"ctaText":"..."}`;
}

function parseContentResponse(raw) {
  let text = String(raw == null ? '' : raw).trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  const data = JSON.parse(text);
  const required = ['title', 'metaDescription', 'intro', 'sections'];
  for (const k of required) {
    if (!data[k] || (Array.isArray(data[k]) && !data[k].length)) throw new Error(`AI content missing "${k}"`);
  }
  if (!Array.isArray(data.sections) || !data.sections.length) throw new Error('AI content has no sections');
  return {
    title: String(data.title).trim(),
    metaDescription: String(data.metaDescription).trim(),
    keywords: Array.isArray(data.keywords) ? data.keywords.map(String) : [],
    imageQuery: String(data.imageQuery || data.title).trim(),
    intro: String(data.intro).trim(),
    ctaText: String(data.ctaText || 'Try our online basketball game and put these tips into practice.').trim(),
    sections: data.sections
      .map((s) => ({
        heading: String(s.heading || '').trim(),
        blocks: (Array.isArray(s.blocks) ? s.blocks : []).map((b) => {
          if (b.type === 'ul' || b.type === 'ol') return { type: b.type, items: (b.items || []).map(String) };
          return { type: 'p', text: String(b.text || '') };
        }),
      }))
      .filter((s) => s.heading),
  };
}

async function chatCompletion(cfg, apiKeys, model, prompt) {
  const keys = Array.isArray(apiKeys) ? apiKeys : [apiKeys];
  let lastErr = null;
  for (const key of keys) {
    for (let attempt = 0; attempt <= cfg.RETRY_ATTEMPTS; attempt++) {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), cfg.FETCH_TIMEOUT_MS);
        const res = await fetch(cfg.OPENROUTER_CHAT_URL, {
          method: 'POST',
          signal: ctrl.signal,
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://dhyey.bond',
            'X-OpenRouter-Title': 'Basketball Arena Blog Automation',
          },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: cfg.MAX_OUTPUT_TOKENS,
            temperature: cfg.MODEL_TEMPERATURE,
          }),
        }).finally(() => clearTimeout(t));
        const data = await res.json();
        if (res.status === 429 || res.status === 401) {
          lastErr = new Error(`HTTP ${res.status}`);
          if (res.status === 401) break;
          continue;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${data.error?.message || JSON.stringify(data.error)}`);
        const text = data.choices?.[0]?.message?.content;
        if (!text) throw new Error('Empty response from model');
        return text;
      } catch (err) {
        lastErr = err;
      }
    }
  }
  throw lastErr || new Error('chatCompletion failed');
}

async function generatePost({ slot, headline, cfg, apiKeys, model, related, chat }) {
  const modelId = typeof model === 'string' ? model : (model && model.id) || '';
  const prompt = slot.type === 'news'
    ? buildNewsPrompt(slot, headline, cfg, related)
    : buildEvergreenPrompt(slot, cfg, related);
  const caller = chat || chatCompletion;
  const raw = await caller(cfg, apiKeys, modelId, prompt);
  return parseContentResponse(raw);
}

module.exports = { buildNewsPrompt, buildEvergreenPrompt, parseContentResponse, chatCompletion, generatePost };

# Daily Blog Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A system that publishes 5 SEO-friendly blog posts every day to `https://dhyey.bond/blog/` (baseball, esports, current events), written by the best model picked from OpenRouter, with Pexels photos, committed and deployed via GitHub Actions.

**Architecture:** A Node.js automation core (`blog-automation/`) with one module per responsibility (config, models, rss, state, content, images, article, index-updater, runner, cli) plus a dev-only Express server. A daily GitHub Actions cron workflow runs the core, commits any successful posts to `main`, and dispatches the existing Pages deploy workflow.

**Tech Stack:** Node 22 (built-in `fetch`, `node:test`), `rss-parser`, `dotenv`, `express` (dev server only), OpenRouter Chat Completions API, Pexels API, GitHub Actions.

## Global Constraints

- Site URL: `https://dhyey.bond`; blog path: `/blog/`; blog dir: `/workspace/blog`; sitemap: `/workspace/sitemap.xml`.
- Generated articles MUST match the existing template (`blog/1v1-basketball-strategies/index.html`): every `<h2>` needs an `id` (blog.js TOC depends on it), cards need `data-search` (blog.js search depends on it).
- Images: 1200×630; Pexels photos require photographer credit in a `<figcaption>` (license requirement); SVG fallback when Pexels fails or no key.
- Cost guardrail: `MAX_COST_PER_1K_TOKENS` filters candidates BEFORE ranking; `MAX_OUTPUT_TOKENS` caps every generation call.
- Secrets never committed: real keys live in `blog-automation/.env` (already gitignored) and GitHub secrets; `.env.example` holds placeholders only.
- Partial failure tolerance: per-slot `try/catch`; commit whatever succeeds; exit non-zero if 0 posts generated.
- Dedup: `state.json` (committed) tracks recent headlines + slugs; skip covered headlines and used slugs.
- Workflow cron is UTC: `'0 6 * * *'` = 06:00 UTC = 11:30 IST (comment in workflow).
- `concurrency.group: blog-generation` with `cancel-in-progress: false` serializes cron vs manual runs.
- Dev-only Express server is excluded from CI; CI runs `node src/cli.js --ci`.

---

### Task 1: Scaffold `blog-automation` package

**Files:**
- Create: `blog-automation/package.json`
- Create: `blog-automation/.env.example`
- Create: `blog-automation/README.md`
- Create: `blog-automation/test/.gitkeep`

**Interfaces:**
- Consumes: nothing.
- Produces: `blog-automation/` folder with `npm test` (runs `node --test test/`) and `npm run generate`.

- [ ] **Step 1: Create `blog-automation/package.json`**

```json
{
  "name": "blog-automation",
  "version": "1.0.0",
  "private": true,
  "description": "Daily 5-post SEO blog automation for Basketball Arena",
  "main": "server.js",
  "scripts": {
    "generate": "node src/cli.js",
    "test": "node --test test/",
    "start": "node server.js"
  },
  "dependencies": {
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "rss-parser": "^3.13.0"
  }
}
```

- [ ] **Step 2: Create `blog-automation/.env.example`**

```
# OpenRouter keys (the two user-provided keys)
OPENROUTER_API_KEY_1=your-openrouter-key-1
OPENROUTER_API_KEY_2=your-openrouter-key-2
# Pexels photo search key (free at https://www.pexels.com/api/)
PEXELS_API_KEY=your-pexels-key
# Dev server port
PORT=3050
# Failure notification webhook (Discord/Slack), used only by CI
NOTIFY_WEBHOOK_URL=
```

- [ ] **Step 3: Create `blog-automation/README.md`**

```markdown
# Blog Automation

Daily 5-post SEO blog automation for Basketball Arena (https://dhyey.bond/blog/).

## Setup
1. `cd blog-automation && npm install`
2. Copy `.env.example` to `.env` and fill in your keys:
   - `OPENROUTER_API_KEY_1` / `OPENROUTER_API_KEY_2` — OpenRouter keys.
   - `PEXELS_API_KEY` — free key from https://www.pexels.com/api/
3. Run once: `npm run generate`

## Local usage
- `npm run generate` — generate today's 5 posts into `../blog/` (updates blog index + sitemap + state).
- `npm test` — unit tests (Node built-in test runner).
- `npm start` — DEV-ONLY Express server (status / manual generate / model ranking). Never run this in CI; CI runs `node src/cli.js --ci`.

## GitHub Actions (production)
The `.github/workflows/auto-blog.yml` workflow runs daily at 06:00 UTC (11:30 IST), generates 5 posts, commits + pushes to `main`, and dispatches the Pages deploy. Required repository secrets:
- `OPENROUTER_API_KEY_1`, `OPENROUTER_API_KEY_2`
- `PEXELS_API_KEY`
- `NOTIFY_WEBHOOK_URL` (optional, failure alerts)

## How it works
1. Pick the best OpenRouter model (recency + popularity + context + price, filtered by `MAX_COST_PER_1K_TOKENS`).
2. For each of 5 slots: news slots fetch an RSS headline (ESPN/MLB, esports, BBC) that the AI rewrites into an SEO article; evergreen slots are pure AI generation on a rotating topic.
3. Fetch a Pexels photo (photographer credited in the article `<figcaption>`), with a branded SVG fallback.
4. Write `blog/<slug>/index.html`, update `blog/index.html` and `sitemap.xml`, record slugs/headlines in `state.json`.
5. Failures are per-slot; a run that produces at least 1 post commits its successes.
```

- [ ] **Step 4: Create `blog-automation/test/.gitkeep`** (empty file).

- [ ] **Step 5: Install dependencies**

Run: `cd /workspace/blog-automation && npm install`
Expected: creates `package-lock.json` and `node_modules/`, exit 0.

- [ ] **Step 6: Verify test runner works**

Run: `cd /workspace/blog-automation && npm test`
Expected: `# tests 0` / `pass 0` (no test files yet), exit 0.

- [ ] **Step 7: Commit**

```bash
git add blog-automation/package.json blog-automation/package-lock.json blog-automation/.env.example blog-automation/README.md blog-automation/test/.gitkeep
git commit -m "feat(blog): scaffold blog-automation package"
```

---

### Task 2: `config.js` — site configuration

**Files:**
- Create: `blog-automation/config.js`
- Test: `blog-automation/test/config.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `cfg` object used by every module: `AUTO_DIR`, `BLOG_DIR`, `SITE_URL`, `BLOG_PATH`, `STATE_FILE`, `POSTS_FILE`, `OPENROUTER_CHAT_URL`, `OPENROUTER_MODELS_URL`, `OPENROUTER_POPULAR_URL`, `MAX_COST_PER_1K_TOKENS`, `MIN_CONTEXT_LENGTH`, `MAX_OUTPUT_TOKENS`, `RETRY_ATTEMPTS`, `FETCH_TIMEOUT_MS`, `RSS_TIMEOUT_MS`, `RECENT_WINDOW_DAYS`, `WORDS_PER_MINUTE`, `MODEL_TEMPERATURE`, `FALLBACK_MODELS`, `RSS_FEEDS` (each category has 2+ URLs), `EVERGREEN_TOPICS` (per category), `SLOTS` (5 slots with `id`, `type`, `category`, `badge`).

- [ ] **Step 1: Write the failing test**

```js
// blog-automation/test/config.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const cfg = require('../config');
const path = require('node:path');

test('config exposes site constants', () => {
  assert.strictEqual(cfg.SITE_URL, 'https://dhyey.bond');
  assert.strictEqual(cfg.BLOG_PATH, '/blog/');
  assert.ok(cfg.MAX_COST_PER_1K_TOKENS > 0);
  assert.ok(cfg.MIN_CONTEXT_LENGTH > 0);
  assert.ok(cfg.MAX_OUTPUT_TOKENS > 0);
});

test('config paths point into repo', () => {
  assert.strictEqual(path.resolve(cfg.BLOG_DIR), path.resolve(__dirname, '..', '..', 'blog'));
  assert.ok(cfg.STATE_FILE.endsWith('state.json'));
  assert.ok(cfg.POSTS_FILE.endsWith('posts.json'));
});

test('every RSS category has at least 2 feeds', () => {
  for (const cat of ['baseball', 'esports', 'current']) {
    assert.ok(Array.isArray(cfg.RSS_FEEDS[cat]), `${cat} feeds missing`);
    assert.ok(cfg.RSS_FEEDS[cat].length >= 2, `${cat} needs >= 2 feeds`);
  }
});

test('there are exactly 5 slots covering the required mix', () => {
  assert.strictEqual(cfg.SLOTS.length, 5);
  const types = cfg.SLOTS.map((s) => s.type);
  const cats = cfg.SLOTS.map((s) => s.category);
  assert.ok(types.includes('news'));
  assert.ok(types.includes('evergreen'));
  assert.ok(cats.includes('baseball'));
  assert.ok(cats.includes('esports'));
  assert.ok(cats.includes('current'));
});

test('evergreen topics pools exist for baseball and esports', () => {
  assert.ok(cfg.EVERGREEN_TOPICS.baseball.length >= 4);
  assert.ok(cfg.EVERGREEN_TOPICS.esports.length >= 4);
});

test('fallback model list exists', () => {
  assert.ok(Array.isArray(cfg.FALLBACK_MODELS));
  assert.ok(cfg.FALLBACK_MODELS.length > 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /workspace/blog-automation && npm test`
Expected: FAIL — `Cannot find module '../config'`.

- [ ] **Step 3: Write minimal implementation**

```js
// blog-automation/config.js
'use strict';
const path = require('node:path');

const AUTO_DIR = __dirname;

module.exports = {
  AUTO_DIR,
  BLOG_DIR: path.resolve(AUTO_DIR, '..', 'blog'),
  SITE_URL: 'https://dhyey.bond',
  BLOG_PATH: '/blog/',
  STATE_FILE: path.join(AUTO_DIR, 'state.json'),
  POSTS_FILE: path.join(AUTO_DIR, 'posts.json'),

  OPENROUTER_CHAT_URL: 'https://openrouter.ai/api/v1/chat/completions',
  OPENROUTER_MODELS_URL: 'https://openrouter.ai/api/v1/models',
  OPENROUTER_POPULAR_URL:
    'https://openrouter.ai/api/frontend/models/find?fmt=cards&input_modalities=text&max_price=0&order=most-popular',

  MAX_COST_PER_1K_TOKENS: 0.0008,
  MIN_CONTEXT_LENGTH: 32000,
  MAX_OUTPUT_TOKENS: 1600,
  RETRY_ATTEMPTS: 2,
  FETCH_TIMEOUT_MS: 20000,
  RSS_TIMEOUT_MS: 10000,
  RECENT_WINDOW_DAYS: 30,
  WORDS_PER_MINUTE: 200,
  MODEL_TEMPERATURE: 0.7,

  FALLBACK_MODELS: [
    'meta-llama/llama-3.3-70b-instruct:free',
    'google/gemma-3-27b-it:free',
    'openai/gpt-4o-mini',
  ],

  RSS_FEEDS: {
    baseball: [
      'https://www.espn.com/espn/rss/mlb/news',
      'https://www.mlb.com/feeds/news/rss.xml',
    ],
    esports: [
      'https://www.espn.com/espn/rss/esports/news',
      'https://www.hltv.org/rss/news',
    ],
    current: [
      'http://feeds.bbci.co.uk/news/rss.xml',
      'https://www.espn.com/espn/rss/news',
    ],
  },

  EVERGREEN_TOPICS: {
    baseball: [
      'best baseball gloves 2026',
      'baseball batting drills to fix your swing',
      'baseball rules explained for new fans',
      'baseball pitching mechanics fundamentals',
      'baseball practice plans for young teams',
      'baseball workout routines for players',
    ],
    esports: [
      'esports team roles explained',
      'best esports games to watch',
      'esports training routine for beginners',
      'esports peripherals guide',
      'esports tournaments explained',
      'how to go pro in esports',
    ],
  },

  SLOTS: [
    { id: 'baseball-news', type: 'news', category: 'baseball', badge: 'Baseball News' },
    { id: 'baseball-guide', type: 'evergreen', category: 'baseball', badge: 'Baseball Guide' },
    { id: 'esports-news', type: 'news', category: 'esports', badge: 'Esports News' },
    { id: 'esports-guide', type: 'evergreen', category: 'esports', badge: 'Esports Guide' },
    { id: 'current-events', type: 'news', category: 'current', badge: 'Current Events' },
  ],
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /workspace/blog-automation && npm test`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add blog-automation/config.js blog-automation/test/config.test.js
git commit -m "feat(blog): add site configuration module"
```

---

### Task 3: `src/models.js` — best-model selection with cost guardrail

**Files:**
- Create: `blog-automation/src/models.js`
- Test: `blog-automation/test/models.test.js`

**Interfaces:**
- Consumes: `cfg` (Task 2).
- Produces:
  - `pricePer1k(model) → number`
  - `fetchModels(keys, cfg) → Promise<{ v1Models: Array, popularMap: Map }>`
  - `filterCandidates(models, cfg) → Array` (text modality + context + `MAX_COST_PER_1K_TOKENS` hard filter)
  - `scoreModel(model, popularMap, cfg, nowMs?) → number`
  - `pickBestModel(keys, cfg) → Promise<{ id, name, context_length, score, costPer1k }>`

- [ ] **Step 1: Write the failing tests**

```js
// blog-automation/test/models.test.js
'use strict';
const { test, mock } = require('node:test');
const assert = require('node:assert');
const cfg = require('../config');
const models = require('../src/models');

function makeModel(overrides = {}) {
  return {
    id: 'org/model:free',
    name: 'Test Model',
    created: 1750000000,
    context_length: 128000,
    pricing: { prompt: '0', completion: '0' },
    ...overrides,
  };
}

test('pricePer1k sums prompt and completion', () => {
  assert.strictEqual(models.pricePer1k(makeModel()), 0);
  assert.strictEqual(models.pricePer1k(makeModel({ pricing: { prompt: '0.000001', completion: '0.000002' } })), 0.000003);
});

test('filterCandidates excludes vision models', () => {
  const vision = makeModel({ id: 'org/vision:free', name: 'Vision Model' });
  const text = makeModel();
  const out = models.filterCandidates([vision, text], cfg);
  assert.deepStrictEqual(out.map((m) => m.id), ['org/model:free']);
});

test('filterCandidates excludes models over cost cap', () => {
  const cheap = makeModel({ id: 'a', pricing: { prompt: '0.0001', completion: '0.0001' } });
  const pricey = makeModel({ id: 'b', pricing: { prompt: '0.01', completion: '0.02' } });
  const out = models.filterCandidates([cheap, pricey], cfg);
  assert.deepStrictEqual(out.map((m) => m.id), ['a']);
});

test('filterCandidates excludes small-context models', () => {
  const small = makeModel({ id: 'small', context_length: 4096 });
  const big = makeModel({ id: 'big', context_length: 131072 });
  const out = models.filterCandidates([small, big], cfg);
  assert.deepStrictEqual(out.map((m) => m.id), ['big']);
});

test('scoreModel rewards newer and cheaper models', () => {
  const now = 1760000000000; // ~Sep 2025
  const fresh = makeModel({ id: 'fresh', created: 1760000000, pricing: { prompt: '0', completion: '0' } });
  const old = makeModel({ id: 'old', created: 1600000000, pricing: { prompt: '0.0005', completion: '0.0005' } });
  const pop = new Map([['fresh', 1], ['old', 0]]);
  assert.ok(models.scoreModel(fresh, pop, cfg, now) > models.scoreModel(old, pop, cfg, now));
});

test('pickBestModel returns the highest-scoring candidate', async () => {
  const calls = [];
  mock.method(globalThis, 'fetch', async (url) => {
    calls.push(String(url));
    if (String(url).includes('/v1/models')) {
      return {
        ok: true,
        json: async () => ({
          data: [
            makeModel({ id: 'cheap-new', name: 'Cheap New', created: 1755000000, context_length: 131072, pricing: { prompt: '0', completion: '0' } }),
            makeModel({ id: 'old-ok', name: 'Old OK', created: 1600000000, context_length: 128000, pricing: { prompt: '0', completion: '0' } }),
          ],
        }),
      };
    }
    return { ok: true, json: async () => ({ data: { models: [{ slug: 'cheap-new' }, { slug: 'old-ok' }] } }) };
  });
  try {
    const best = await models.pickBestModel(['sk-test'], cfg);
    assert.strictEqual(best.id, 'cheap-new');
    assert.ok(calls.some((u) => u.includes('/v1/models')));
  } finally {
    mock.restoreAll();
  }
});

test('pickBestModel falls back when no candidates', async () => {
  mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({ data: [] }) }));
  try {
    const best = await models.pickBestModel(['sk-test'], cfg);
    assert.strictEqual(best.id, cfg.FALLBACK_MODELS[0]);
  } finally {
    mock.restoreAll();
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /workspace/blog-automation && npm test`
Expected: FAIL — `Cannot find module '../src/models'`.

- [ ] **Step 3: Write minimal implementation**

```js
// blog-automation/src/models.js
'use strict';

function pricePer1k(model) {
  const p = model.pricing || {};
  const prompt = parseFloat(p.prompt);
  const completion = parseFloat(p.completion);
  return (Number.isFinite(prompt) ? prompt : 0) + (Number.isFinite(completion) ? completion : 0);
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
  const [v1, popular] = await Promise.all([
    getJson(cfg.OPENROUTER_MODELS_URL, cfg, key),
    getJson(cfg.OPENROUTER_POPULAR_URL, cfg, null).catch(() => ({ data: [] })),
  ]);
  const v1Models = Array.isArray(v1.data) ? v1.data : [];
  const cards = popular?.data?.models || popular?.models || [];
  const popularMap = new Map();
  cards.forEach((c, i) => {
    popularMap.set(c.slug || c.id, 1 - i / Math.max(cards.length, 1));
  });
  return { v1Models, popularMap };
}

function filterCandidates(models, cfg) {
  return models.filter((m) => {
    const name = (m.name || '').toLowerCase();
    if (/(image|vision|audio|video|whisper|tts|dall.e|flux|midjourney|stable.diffusion)/i.test(name)) return false;
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
  const recency = Math.max(0, 1 - Math.max(0, daysOld) / 730);
  const popularity = popularMap.get(m.id) || popularMap.get(m.slug) || 0;
  const context = Math.min(1, (m.context_length || 0) / 200000);
  const price = cfg.MAX_COST_PER_1K_TOKENS ? Math.max(0, 1 - cost / cfg.MAX_COST_PER_1K_TOKENS) : 0.5;
  return recency * 0.4 + popularity * 0.25 + context * 0.15 + price * 0.2;
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /workspace/blog-automation && npm test`
Expected: PASS (all models tests + config tests).

- [ ] **Step 5: Commit**

```bash
git add blog-automation/src/models.js blog-automation/test/models.test.js
git commit -m "feat(blog): add OpenRouter model ranking with cost guardrail"
```

---

### Task 4: `src/state.js` + seed `posts.json`

**Files:**
- Create: `blog-automation/src/state.js`
- Create: `blog-automation/posts.json` (seed with the 6 existing posts)
- Test: `blog-automation/test/state.test.js`

**Interfaces:**
- Consumes: `cfg` (Task 2).
- Produces:
  - `loadState(cfg) → { recentHeadlines: Array<{title,date}>, recentSlugs: string[] }`
  - `saveState(cfg, state)`
  - `normalizeHeadline(title) → string`
  - `isHeadlineCovered(state, title, cfg) → boolean`
  - `isSlugUsed(state, slug) → boolean`
  - `recordHeadlines(state, entries, cfg)` (trims to `RECENT_WINDOW_DAYS` and max 200)
  - `recordSlugs(state, slugs, cfg)` (dedup, max 200)
  - `readPosts(cfg) → Array` (from posts.json)
  - `writePosts(cfg, posts)`
- Post registry entry shape (used by index-updater and runner): `{ slug, title, badge, excerpt, datePublished, dateModified, readingMinutes, imageHref, keywords: string[] }`.

- [ ] **Step 1: Write the failing tests**

```js
// blog-automation/test/state.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const state = require('../src/state');

function tmpCfg() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-state-'));
  return {
    STATE_FILE: path.join(dir, 'state.json'),
    POSTS_FILE: path.join(dir, 'posts.json'),
    RECENT_WINDOW_DAYS: 30,
  };
}

test('loadState returns empty shape when missing', () => {
  const st = state.loadState(tmpCfg());
  assert.deepStrictEqual(st, { recentHeadlines: [], recentSlugs: [] });
});

test('saveState + loadState round-trip', () => {
  const cfg = tmpCfg();
  const orig = { recentHeadlines: [{ title: 'A', date: '2026-08-18' }], recentSlugs: ['a'] };
  state.saveState(cfg, orig);
  assert.deepStrictEqual(state.loadState(cfg), orig);
});

test('isHeadlineCovered matches normalized titles', () => {
  const st = { recentHeadlines: [{ title: 'MLB: Big Win Tonight!', date: '2026-08-18' }], recentSlugs: [] };
  assert.ok(state.isHeadlineCovered(st, 'mlb big win tonight', tmpCfg()));
  assert.ok(!state.isHeadlineCovered(st, 'A different story', tmpCfg()));
});

test('recordSlugs dedupes and caps at 200', () => {
  const cfg = tmpCfg();
  const st = { recentHeadlines: [], recentSlugs: ['a', 'a', 'b'] };
  state.recordSlugs(st, ['c', 'c'], cfg);
  assert.deepStrictEqual(st.recentSlugs, ['a', 'b', 'c']);
  const many = Array.from({ length: 250 }, (_, i) => `slug-${i}`);
  state.recordSlugs(st, many, cfg);
  assert.strictEqual(st.recentSlugs.length, 200);
});

test('recordHeadlines trims entries older than the window', () => {
  const cfg = tmpCfg();
  const st = { recentHeadlines: [], recentSlugs: [] };
  const oldEntry = { title: 'old', date: '2020-01-01' };
  const newEntry = { title: 'new', date: new Date().toISOString().slice(0, 10) };
  state.recordHeadlines(st, [oldEntry, newEntry], cfg);
  assert.deepStrictEqual(st.recentHeadlines.map((h) => h.title), ['new']);
});

test('readPosts/writePosts round-trip', () => {
  const cfg = tmpCfg();
  const posts = [{ slug: 'x', title: 'X', badge: 'B', excerpt: 'e', datePublished: '2026-08-18', dateModified: '2026-08-18', readingMinutes: 5, imageHref: 'images/x.jpg', keywords: ['k'] }];
  state.writePosts(cfg, posts);
  assert.deepStrictEqual(state.readPosts(cfg), posts);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /workspace/blog-automation && npm test`
Expected: FAIL — `Cannot find module '../src/state'`.

- [ ] **Step 3: Write minimal implementation**

```js
// blog-automation/src/state.js
'use strict';
const fs = require('node:fs');
const path = require('node:path');

function ensure(file) {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadState(cfg) {
  try {
    return JSON.parse(fs.readFileSync(cfg.STATE_FILE, 'utf8'));
  } catch {
    return { recentHeadlines: [], recentSlugs: [] };
  }
}

function saveState(cfg, state) {
  ensure(cfg.STATE_FILE);
  fs.writeFileSync(cfg.STATE_FILE, JSON.stringify(state, null, 2) + '\n');
}

function normalizeHeadline(title) {
  return (title || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function isHeadlineCovered(state, title, cfg) {
  const n = normalizeHeadline(title);
  return state.recentHeadlines.some((h) => normalizeHeadline(h.title) === n);
}

function isSlugUsed(state, slug) {
  return state.recentSlugs.includes(slug);
}

function recordHeadlines(state, entries, cfg) {
  const cutoff = Date.now() - cfg.RECENT_WINDOW_DAYS * 86400000;
  const fresh = [...state.recentHeadlines, ...entries].filter((h) => !h.date || new Date(h.date).getTime() >= cutoff);
  state.recentHeadlines = fresh.slice(-200);
}

function recordSlugs(state, slugs, cfg) {
  state.recentSlugs = [...new Set([...state.recentSlugs, ...slugs])].slice(-200);
}

function readPosts(cfg) {
  try {
    return JSON.parse(fs.readFileSync(cfg.POSTS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function writePosts(cfg, posts) {
  ensure(cfg.POSTS_FILE);
  fs.writeFileSync(cfg.POSTS_FILE, JSON.stringify(posts, null, 2) + '\n');
}

module.exports = {
  loadState,
  saveState,
  normalizeHeadline,
  isHeadlineCovered,
  isSlugUsed,
  recordHeadlines,
  recordSlugs,
  readPosts,
  writePosts,
};
```

- [ ] **Step 4: Create the seed `blog-automation/posts.json`**

```json
[
  {
    "slug": "how-to-improve-basketball-shooting",
    "title": "How to Improve Your Basketball Shooting: 7 Simple Tips",
    "badge": "Basketball Shooting",
    "excerpt": "Basketball shooting is a skill anyone can master with the right technique. Learn 7 simple tips to improve your jump shot, free throws and confidence from anywhere on the court.",
    "datePublished": "2026-07-28",
    "dateModified": "2026-07-28",
    "readingMinutes": 7,
    "imageHref": "images/basketball-shooting.svg",
    "keywords": ["basketball shooting", "shooting technique", "jump shot form", "free throws"]
  },
  {
    "slug": "basketball-tips-for-beginners",
    "title": "Basketball Tips for Beginners: Your First 30 Days",
    "badge": "Basketball Tips",
    "excerpt": "New to basketball? This beginner-friendly guide covers the basics: dribbling, passing, shooting form, court rules and how to build a simple practice routine.",
    "datePublished": "2026-08-01",
    "dateModified": "2026-08-01",
    "readingMinutes": 7,
    "imageHref": "images/basketball-beginners.svg",
    "keywords": ["basketball tips", "beginner basketball", "first 30 days"]
  },
  {
    "slug": "1v1-basketball-strategies",
    "title": "1v1 Basketball Strategies for Beginners",
    "badge": "1v1 Strategy",
    "excerpt": "Winning a 1v1 takes more than athleticism. Discover positioning, timing, counters and the small habits that give you the edge in one-on-one play.",
    "datePublished": "2026-08-02",
    "dateModified": "2026-08-02",
    "readingMinutes": 6,
    "imageHref": "images/basketball-1v1.svg",
    "keywords": ["1v1 basketball", "one on one", "basketball strategies"]
  },
  {
    "slug": "online-basketball-guide",
    "title": "How to Play Online Basketball: The Complete Guide",
    "badge": "Guides",
    "excerpt": "Online basketball games let you sharpen your timing and decision making anywhere. Here's what to expect and how to get the most out of playing basketball online.",
    "datePublished": "2026-07-20",
    "dateModified": "2026-07-20",
    "readingMinutes": 8,
    "imageHref": "images/basketball-online.svg",
    "keywords": ["online basketball", "basketball games", "play online"]
  },
  {
    "slug": "basketball-dribbling-tips",
    "title": "Basketball Dribbling Tips: 9 Drills to Improve Your Handle",
    "badge": "Dribbling",
    "excerpt": "A tight handle beats a fast defender. These dribbling tips and drills will improve your ball control, both-hand ambidexterity and confidence under pressure.",
    "datePublished": "2026-08-05",
    "dateModified": "2026-08-05",
    "readingMinutes": 6,
    "imageHref": "images/basketball-dribbling.svg",
    "keywords": ["basketball dribbling", "dribbling drills", "ball control"]
  },
  {
    "slug": "how-to-improve-basketball-score",
    "title": "How to Improve Your Basketball Score",
    "badge": "Scoring",
    "excerpt": "Scoring more points isn't just about talent. Learn smart shot selection, footwork, reading the defense and simple drills that raise your scoring average.",
    "datePublished": "2026-07-15",
    "dateModified": "2026-07-15",
    "readingMinutes": 5,
    "imageHref": "images/basketball-score.svg",
    "keywords": ["basketball scoring", "shot selection", "basketball footwork"]
  }
]
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /workspace/blog-automation && npm test`
Expected: PASS (state tests + earlier tests).

- [ ] **Step 6: Commit**

```bash
git add blog-automation/src/state.js blog-automation/posts.json blog-automation/test/state.test.js
git commit -m "feat(blog): add state registry and seed posts manifest"
```

---

### Task 5: `src/rss.js` — headline fetcher with feed fallback

**Files:**
- Create: `blog-automation/src/rss.js`
- Test: `blog-automation/test/rss.test.js`

**Interfaces:**
- Consumes: `cfg.RSS_FEEDS` (Task 2), `cfg.RSS_TIMEOUT_MS`.
- Produces:
  - `fetchOneFeed(url, cfg, parser?) → Promise<Array<{title, link, pubDate, source}>>`
  - `fetchRss(cfg, category, parser?) → Promise<{ source: string, headlines: Array<{title, link, pubDate, source}> }>`
    - `parser` is injectable (`rss-parser` instance) for tests; when omitted it creates `new Parser({ timeout: cfg.RSS_TIMEOUT_MS })`.

- [ ] **Step 1: Write the failing tests**

```js
// blog-automation/test/rss.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const rss = require('../src/rss');

const cfg = {
  RSS_FEEDS: {
    baseball: ['https://feed-a.example', 'https://feed-b.example'],
    esports: ['https://feed-x.example'],
    current: ['https://feed-c.example'],
  },
  RSS_TIMEOUT_MS: 5000,
};

function fakeParser(itemsByUrl) {
  return {
    parseURL: async (url) => ({
      items: (itemsByUrl[url] || []).map((t) => ({ title: t, link: `https://x/${t}`, pubDate: '2026-08-18T00:00:00Z' })),
    }),
  };
}

test('fetchOneFeed maps items to headlines', async () => {
  const parser = fakeParser({ 'https://feed-a.example': ['Headline One', 'Headline Two'] });
  const items = await rss.fetchOneFeed('https://feed-a.example', cfg, parser);
  assert.strictEqual(items.length, 2);
  assert.strictEqual(items[0].title, 'Headline One');
  assert.strictEqual(items[0].link, 'https://x/Headline One');
  assert.ok(items[0].pubDate);
});

test('fetchRss uses primary feed when it works', async () => {
  const parser = fakeParser({ 'https://feed-a.example': ['A1', 'A2'], 'https://feed-b.example': ['B1'] });
  const res = await rss.fetchRss(cfg, 'baseball', parser);
  assert.strictEqual(res.source, 'https://feed-a.example');
  assert.strictEqual(res.headlines.length, 2);
});

test('fetchRss falls back to second feed when primary fails', async () => {
  const parser = {
    parseURL: async (url) => {
      if (url === 'https://feed-a.example') throw new Error('boom');
      return { items: [{ title: 'B1', link: 'https://x/B1' }] };
    },
  };
  const res = await rss.fetchRss(cfg, 'baseball', parser);
  assert.strictEqual(res.source, 'https://feed-b.example');
  assert.strictEqual(res.headlines[0].title, 'B1');
});

test('fetchRss throws when all feeds fail', async () => {
  const parser = { parseURL: async () => { throw new Error('down'); } };
  await assert.rejects(() => rss.fetchRss(cfg, 'baseball', parser), /all failed/);
});

test('fetchRss throws when feeds return no items', async () => {
  const parser = fakeParser({ 'https://feed-a.example': [], 'https://feed-b.example': [] });
  await assert.rejects(() => rss.fetchRss(cfg, 'baseball', parser), /no items/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /workspace/blog-automation && npm test`
Expected: FAIL — `Cannot find module '../src/rss'`.

- [ ] **Step 3: Write minimal implementation**

```js
// blog-automation/src/rss.js
'use strict';
const Parser = require('rss-parser');

async function fetchOneFeed(url, cfg, parser) {
  const p = parser || new Parser({ timeout: cfg.RSS_TIMEOUT_MS });
  const feed = await p.parseURL(url);
  const items = Array.isArray(feed.items) ? feed.items : [];
  return items
    .map((it) => ({
      title: String(it.title || '').trim(),
      link: it.link || '',
      pubDate: it.isoDate || it.pubDate || '',
      source: url,
    }))
    .filter((it) => it.title);
}

async function fetchRss(cfg, category, parser) {
  const urls = cfg.RSS_FEEDS[category] || [];
  let lastErr = null;
  for (const url of urls) {
    try {
      const items = await fetchOneFeed(url, cfg, parser);
      if (items.length) return { source: url, headlines: items };
      lastErr = new Error(`empty feed`);
    } catch (err) {
      lastErr = err;
    }
  }
  if (lastErr) throw new Error(`RSS feeds for "${category}" all failed: ${lastErr.message}`);
  throw new Error(`RSS feeds for "${category}" returned no items`);
}

module.exports = { fetchOneFeed, fetchRss };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /workspace/blog-automation && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add blog-automation/src/rss.js blog-automation/test/rss.test.js
git commit -m "feat(blog): add RSS fetcher with primary/fallback feeds"
```

---

### Task 6: `src/content.js` — AI prompts, JSON parsing, key failover

**Files:**
- Create: `blog-automation/src/content.js`
- Test: `blog-automation/test/content.test.js`

**Interfaces:**
- Consumes: `cfg` (Task 2).
- Produces:
  - `buildNewsPrompt(slot, headline, cfg, related) → string`
  - `buildEvergreenPrompt(slot, cfg, related) → string` (uses `slot.topic`)
  - `parseContentResponse(raw) → content` (throws on invalid)
    - content shape: `{ title, metaDescription, keywords: string[], imageQuery, intro, ctaText, sections: [{ heading, blocks: Array<{type:'p'|'ul'|'ol'|'quote', text?|items?}> }] }`
  - `chatCompletion(cfg, apiKeys, model, prompt) → Promise<string>` (key failover on 401/429, retries on other errors)
  - `generatePost({ slot, headline, cfg, apiKeys, model, related, chat? }) → Promise<content>` (`chat` defaults to `chatCompletion`)

- [ ] **Step 1: Write the failing tests**

```js
// blog-automation/test/content.test.js
'use strict';
const { test, mock } = require('node:test');
const assert = require('node:assert');
const content = require('../src/content');

const cfg = {
  OPENROUTER_CHAT_URL: 'https://openrouter.ai/api/v1/chat/completions',
  MAX_OUTPUT_TOKENS: 1600,
  MODEL_TEMPERATURE: 0.7,
  RETRY_ATTEMPTS: 2,
  FETCH_TIMEOUT_MS: 5000,
  SITE_URL: 'https://dhyey.bond',
};

const goodJson = JSON.stringify({
  title: 'Best Baseball Gloves 2026',
  metaDescription: 'The best baseball gloves 2026 guide covers leather, webbing and fit to help you choose.',
  keywords: ['baseball gloves', 'baseball gear'],
  imageQuery: 'baseball glove on field',
  intro: 'Finding the right glove changes everything.',
  ctaText: 'Test your swing in our game.',
  sections: [
    { heading: 'Why Gloves Matter', blocks: [{ type: 'p', text: 'A good glove is a second hand.' }] },
    { heading: 'Top Picks', blocks: [{ type: 'ul', items: ['Rawlings', 'Wilson'] }, { type: 'quote', text: 'Fit beats brand.' }] },
  ],
});

test('parseContentResponse strips markdown fences', () => {
  const raw = '```json\n' + goodJson + '\n```';
  const c = content.parseContentResponse(raw);
  assert.strictEqual(c.title, 'Best Baseball Gloves 2026');
  assert.strictEqual(c.sections.length, 2);
  assert.deepStrictEqual(c.sections[1].blocks[0].items, ['Rawlings', 'Wilson']);
});

test('parseContentResponse throws when sections missing', () => {
  assert.throws(() => content.parseContentResponse('{"title":"X","metaDescription":"Y","intro":"Z"}'), /sections/);
});

test('parseContentResponse throws on invalid JSON', () => {
  assert.throws(() => content.parseContentResponse('not json'));
});

test('buildNewsPrompt embeds headline and related link', () => {
  const slot = { id: 'baseball-news', type: 'news', category: 'baseball', badge: 'Baseball News' };
  const headline = { title: 'Braves Win World Series Game One', link: 'https://espn.example/x' };
  const related = { title: 'Baseball Rules Explained', slug: 'baseball-rules-explained' };
  const prompt = content.buildNewsPrompt(slot, headline, cfg, related);
  assert.ok(prompt.includes('Braves Win World Series Game One'));
  assert.ok(prompt.includes('https://dhyey.bond/blog/baseball-rules-explained/'));
});

test('buildEvergreenPrompt embeds topic', () => {
  const slot = { id: 'baseball-guide', type: 'evergreen', category: 'baseball', badge: 'Baseball Guide', topic: 'best baseball gloves 2026' };
  assert.ok(content.buildEvergreenPrompt(slot, cfg, null).includes('best baseball gloves 2026'));
});

test('chatCompletion fails over to second key on 401', async () => {
  const calls = [];
  mock.method(globalThis, 'fetch', async (url, opts) => {
    const auth = opts.headers.Authorization;
    calls.push(auth);
    return { status: 401, ok: false, json: async () => ({ error: { message: 'bad key' } }) };
  });
  try {
    await assert.rejects(() => content.chatCompletion(cfg, ['key1', 'key2'], 'model', 'prompt'), /HTTP 401/);
    assert.ok(calls.includes('Bearer key1'));
    assert.ok(calls.includes('Bearer key2'));
  } finally {
    mock.restoreAll();
  }
});

test('chatCompletion returns content on success', async () => {
  mock.method(globalThis, 'fetch', async () => ({
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content: 'hello from model' } }] }),
  }));
  try {
    const text = await content.chatCompletion(cfg, ['key1'], 'model', 'prompt');
    assert.strictEqual(text, 'hello from model');
  } finally {
    mock.restoreAll();
  }
});

test('generatePost uses injected chat function', async () => {
  const slot = { id: 'baseball-guide', type: 'evergreen', category: 'baseball', badge: 'Baseball Guide', topic: 'best baseball gloves 2026' };
  const chat = async () => goodJson;
  const c = await content.generatePost({ slot, headline: null, cfg, apiKeys: ['k'], model: 'm', related: null, chat });
  assert.strictEqual(c.title, 'Best Baseball Gloves 2026');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /workspace/blog-automation && npm test`
Expected: FAIL — `Cannot find module '../src/content'`.

- [ ] **Step 3: Write minimal implementation**

```js
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
  const prompt = slot.type === 'news'
    ? buildNewsPrompt(slot, headline, cfg, related)
    : buildEvergreenPrompt(slot, cfg, related);
  const caller = chat || chatCompletion;
  const raw = await caller(cfg, apiKeys, model, prompt);
  return parseContentResponse(raw);
}

module.exports = { buildNewsPrompt, buildEvergreenPrompt, parseContentResponse, chatCompletion, generatePost };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /workspace/blog-automation && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add blog-automation/src/content.js blog-automation/test/content.test.js
git commit -m "feat(blog): add AI content generation with key failover"
```

---

### Task 7: `src/images.js` — Pexels photos with photographer credit + SVG fallback

**Files:**
- Create: `blog-automation/src/images.js`
- Test: `blog-automation/test/images.test.js`

**Interfaces:**
- Consumes: `cfg.BLOG_DIR`, `cfg.FETCH_TIMEOUT_MS`.
- Produces:
  - `slugify(text) → string` (lowercase, alphanumeric + hyphens, max 80 chars)
  - `buildSvgFallback({ slug, badge, cfg }) → image`
  - `searchPexels(pexelsKey, query, cfg) → Promise<Array<photo>>`
  - `downloadFile(url, destPath) → Promise<void>`
  - `findHeroImage({ query, slug, badge, cfg, pexelsKey }) → Promise<image>`
- image object shape: `{ href: 'images/<file>', absPath: string, alt: string, photographer: string, photographerUrl: string, credit: string, kind: 'photo'|'svg' }`.

- [ ] **Step 1: Write the failing tests**

```js
// blog-automation/test/images.test.js
'use strict';
const { test, mock } = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const images = require('../src/images');

function tmpCfg() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-img-'));
  return { BLOG_DIR: dir, FETCH_TIMEOUT_MS: 5000 };
}

test('slugify normalizes and caps length', () => {
  assert.strictEqual(images.slugify('Best Baseball Gloves 2026!'), 'best-baseball-gloves-2026');
  assert.strictEqual(images.slugify('Café Naïve — a b c'), 'cafe-naive-a-b-c');
  assert.ok(images.slugify('a'.repeat(200)).length <= 80);
});

test('buildSvgFallback writes an SVG and returns image object', () => {
  const cfg = tmpCfg();
  const img = images.buildSvgFallback({ slug: 'test-post', badge: 'Baseball News', cfg });
  assert.strictEqual(img.href, 'images/test-post.svg');
  assert.ok(fs.existsSync(img.absPath));
  assert.match(fs.readFileSync(img.absPath, 'utf8'), /<svg/);
  assert.strictEqual(img.kind, 'svg');
  assert.strictEqual(img.photographer, '');
});

test('findHeroImage falls back to SVG when Pexels fails', async () => {
  const cfg = tmpCfg();
  mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 500, json: async () => ({}) }));
  try {
    const img = await images.findHeroImage({ query: 'baseball', slug: 'fallback', badge: 'Baseball News', cfg, pexelsKey: 'key' });
    assert.strictEqual(img.kind, 'svg');
    assert.ok(fs.existsSync(img.absPath));
  } finally {
    mock.restoreAll();
  }
});

test('findHeroImage downloads a Pexels photo with credit', async () => {
  const cfg = tmpCfg();
  const photo = {
    alt: 'Baseball game at night',
    photographer: 'Jane Doe',
    photographer_url: 'https://www.pexels.com/@jane',
    src: { large2x: 'https://images.pexels.example/x.jpg' },
  };
  mock.method(globalThis, 'fetch', async (url) => {
    const u = String(url);
    if (u.includes('api.pexels.com')) return { ok: true, json: async () => ({ photos: [photo] }) };
    return { ok: true, arrayBuffer: async () => new TextEncoder().encode('FAKEJPG').buffer };
  });
  try {
    const img = await images.findHeroImage({ query: 'baseball', slug: 'photo-post', badge: 'Baseball News', cfg, pexelsKey: 'key' });
    assert.strictEqual(img.kind, 'photo');
    assert.strictEqual(img.photographer, 'Jane Doe');
    assert.strictEqual(img.photographerUrl, 'https://www.pexels.com/@jane');
    assert.strictEqual(img.credit, 'Photo by Jane Doe');
    assert.strictEqual(fs.readFileSync(img.absPath, 'utf8'), 'FAKEJPG');
  } finally {
    mock.restoreAll();
  }
});

test('findHeroImage uses SVG when no Pexels key', async () => {
  const cfg = tmpCfg();
  const img = await images.findHeroImage({ query: 'x', slug: 'nokey', badge: 'X', cfg, pexelsKey: '' });
  assert.strictEqual(img.kind, 'svg');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /workspace/blog-automation && npm test`
Expected: FAIL — `Cannot find module '../src/images'`.

- [ ] **Step 3: Write minimal implementation**

```js
// blog-automation/src/images.js
'use strict';
const fs = require('node:fs');
const path = require('node:path');

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function imagesDir(cfg) {
  return path.join(cfg.BLOG_DIR, 'images');
}

function escapeXml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildSvgFallback({ slug, badge, cfg }) {
  const dir = imagesDir(cfg);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filename = `${slug}.svg`;
  const absPath = path.join(dir, filename);
  const label = String(badge || 'Blog').toUpperCase().slice(0, 24);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" role="img" aria-label="${escapeXml(badge)} article">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0d1322"/>
      <stop offset="1" stop-color="#0a0d16"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.42" r="0.62">
      <stop offset="0" stop-color="#ff7a18" stop-opacity="0.55"/>
      <stop offset="0.55" stop-color="#ff7a18" stop-opacity="0.12"/>
      <stop offset="1" stop-color="#ff7a18" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#glow)"/>
  <circle cx="600" cy="250" r="170" fill="none" stroke="#00e5ff" stroke-opacity="0.35" stroke-width="4"/>
  <circle cx="600" cy="250" r="110" fill="none" stroke="#ff7a18" stroke-opacity="0.55" stroke-width="6"/>
  <circle cx="600" cy="250" r="50" fill="none" stroke="#ffffff" stroke-opacity="0.25" stroke-width="3"/>
  <g fill="#00e5ff" opacity="0.8">
    <circle cx="180" cy="150" r="7"/><circle cx="990" cy="120" r="5"/><circle cx="1050" cy="470" r="8"/>
    <circle cx="150" cy="470" r="5"/><circle cx="900" cy="90" r="4"/><circle cx="240" cy="260" r="4"/>
  </g>
  <g fill="#ff7a18" opacity="0.7">
    <circle cx="760" cy="140" r="5"/><circle cx="60" cy="300" r="6"/><circle cx="1140" cy="300" r="6"/>
    <circle cx="340" cy="90" r="4"/><circle cx="980" cy="560" r="5"/>
  </g>
  <rect x="300" y="500" width="600" height="70" rx="35" fill="rgba(10,13,22,0.72)" stroke="rgba(255,255,255,0.16)"/>
  <text x="600" y="546" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="800" letter-spacing="5" fill="#ffffff">${label}</text>
</svg>
`;
  fs.writeFileSync(absPath, svg);
  return {
    href: `images/${filename}`,
    absPath,
    alt: `${badge || 'Blog'} article`,
    photographer: '',
    photographerUrl: '',
    credit: '',
    kind: 'svg',
  };
}

async function searchPexels(pexelsKey, query, cfg) {
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&orientation=landscape&per_page=5`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), cfg.FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { Authorization: pexelsKey }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`Pexels HTTP ${res.status}`);
    const data = await res.json();
    return (data.photos || []).filter((p) => p && p.src && p.src.large2x);
  } finally {
    clearTimeout(t);
  }
}

async function downloadFile(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${url} -> HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(destPath, buf);
}

async function findHeroImage({ query, slug, badge, cfg, pexelsKey }) {
  const dir = imagesDir(cfg);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (pexelsKey) {
    try {
      const photos = await searchPexels(pexelsKey, query, cfg);
      const photo = photos[0];
      if (photo) {
        const filename = `${slug}.jpg`;
        const absPath = path.join(dir, filename);
        await downloadFile(photo.src.large2x, absPath);
        return {
          href: `images/${filename}`,
          absPath,
          alt: String(photo.alt || '').slice(0, 120),
          photographer: photo.photographer || '',
          photographerUrl: photo.photographer_url || '',
          credit: photo.photographer ? `Photo by ${photo.photographer}` : '',
          kind: 'photo',
        };
      }
    } catch (err) {
      // fall through to SVG fallback
    }
  }
  return buildSvgFallback({ slug, badge, cfg });
}

module.exports = { slugify, buildSvgFallback, searchPexels, downloadFile, findHeroImage };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /workspace/blog-automation && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add blog-automation/src/images.js blog-automation/test/images.test.js
git commit -m "feat(blog): add Pexels image fetch with SVG fallback and credit"
```

---

### Task 8: `src/article.js` — article + card HTML rendering

**Files:**
- Create: `blog-automation/src/article.js`
- Test: `blog-automation/test/article.test.js`

**Interfaces:**
- Consumes: `cfg.SITE_URL`, `cfg.BLOG_PATH`, `cfg.WORDS_PER_MINUTE`.
- Produces:
  - `escapeHtml(s) → string`
  - `slugify(text) → string` (re-exported from images.js semantics)
  - `readingMinutes(text, wpm?) → number`
  - `formatDate(iso) → string` (e.g. "August 18, 2026")
  - `blockToHtml(block) → string`
  - `sectionHtml(section) → string` (h2 with id from `slugify(heading)`)
  - `renderArticleHtml(post, cfg) → string`
  - `renderCardHtml(post) → string` (includes `data-search`)
- `post` shape (full, as produced by runner): `{ slug, title, badge, metaDescription, keywords: string[], intro, sections, ctaText, datePublished, dateModified, readingMinutes, image: imageObject, related: {title,slug,badge}|null }`.

- [ ] **Step 1: Write the failing tests**

```js
// blog-automation/test/article.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const article = require('../src/article');

const cfg = { SITE_URL: 'https://dhyey.bond', BLOG_PATH: '/blog/', WORDS_PER_MINUTE: 200 };

function samplePost() {
  return {
    slug: 'best-baseball-gloves-2026',
    title: 'Best Baseball Gloves 2026',
    badge: 'Baseball Guide',
    metaDescription: 'The best baseball gloves 2026 guide covers leather, webbing and fit to help you choose.',
    keywords: ['baseball gloves', 'baseball gear'],
    intro: 'Finding the right glove changes everything.',
    ctaText: 'Test your swing in our game.',
    sections: [
      { heading: 'Why Gloves Matter', blocks: [{ type: 'p', text: 'A good glove is a second hand.' }] },
      { heading: 'Top Picks', blocks: [{ type: 'ul', items: ['Rawlings', 'Wilson'] }, { type: 'quote', text: 'Fit beats brand.' }] },
    ],
    datePublished: '2026-08-18',
    dateModified: '2026-08-18',
    readingMinutes: 5,
    image: { href: 'images/best-baseball-gloves-2026.jpg', alt: 'Baseball glove', photographer: 'Jane Doe', photographerUrl: 'https://www.pexels.com/@jane', credit: 'Photo by Jane Doe' },
    related: { title: 'Baseball Rules Explained', slug: 'baseball-rules-explained', badge: 'Baseball Guide' },
  };
}

test('escapeHtml escapes special chars', () => {
  assert.strictEqual(article.escapeHtml('<b>"x" & \'y\''), '&lt;b&gt;&quot;x&quot; &amp; &#39;y&#39;');
});

test('readingMinutes computes from word count', () => {
  assert.strictEqual(article.readingMinutes('one two three four five six', 2), 3);
  assert.strictEqual(article.readingMinutes('', 200), 1);
});

test('formatDate renders long form', () => {
  assert.strictEqual(article.formatDate('2026-08-18'), 'August 18, 2026');
});

test('sectionHtml gives every h2 an id', () => {
  const html = article.sectionHtml({ heading: 'Why Gloves Matter', blocks: [{ type: 'p', text: 'x' }] });
  assert.match(html, /<h2 id="why-gloves-matter">/);
});

test('renderArticleHtml includes hero, credit figcaption, schema and related link', () => {
  const html = article.renderArticleHtml(samplePost(), cfg);
  assert.match(html, /"@type": "Article"/);
  assert.match(html, /<h1 class="article-title">Best Baseball Gloves 2026<\/h1>/);
  assert.match(html, /<figcaption>Photo by <a href="https:\/\/www\.pexels\.com\/@jane"/);
  assert.match(html, /<h2 id="why-gloves-matter">/);
  assert.match(html, /<time datetime="2026-08-18">August 18, 2026<\/time>/);
  assert.match(html, /baseball-rules-explained\//);
  assert.match(html, /canonical/);
});

test('renderCardHtml includes data-search and card structure', () => {
  const post = samplePost();
  const card = article.renderCardHtml(post);
  assert.match(card, /data-search="[^"]*baseball gloves/);
  assert.match(card, /class="article-card"/);
  assert.match(card, /href="best-baseball-gloves-2026\/"/);
  assert.match(card, /5 min read/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /workspace/blog-automation && npm test`
Expected: FAIL — `Cannot find module '../src/article'`.

- [ ] **Step 3: Write minimal implementation**

```js
// blog-automation/src/article.js
'use strict';

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function wordCount(text) {
  return String(text || '').trim().split(/\s+/).filter(Boolean).length;
}

function readingMinutes(text, wpm = 200) {
  return Math.max(1, Math.round(wordCount(text) / wpm));
}

function formatDate(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString('en-US', { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' });
}

function blockToHtml(block) {
  if (block.type === 'ul') {
    return `<ul>\n${block.items.map((i) => `              <li>${escapeHtml(i)}</li>`).join('\n')}\n            </ul>`;
  }
  if (block.type === 'ol') {
    return `<ol>\n${block.items.map((i) => `              <li>${escapeHtml(i)}</li>`).join('\n')}\n            </ol>`;
  }
  if (block.type === 'quote') {
    return `            <blockquote>\n              <p>${escapeHtml(block.text)}</p>\n            </blockquote>`;
  }
  return `            <p>${escapeHtml(block.text)}</p>`;
}

function sectionHtml(section) {
  const id = slugify(section.heading) || 'section';
  const blocks = (section.blocks || []).map(blockToHtml).join('\n\n');
  return `            <h2 id="${id}">${escapeHtml(section.heading)}</h2>\n${blocks}`;
}

function heroHtml(post) {
  const img = post.image || { href: 'images/placeholder.svg', alt: post.badge, photographer: '', photographerUrl: '', credit: '' };
  const credit = img.photographer
    ? `\n              <figcaption>Photo by <a href="${escapeHtml(img.photographerUrl)}" rel="nofollow">${escapeHtml(img.photographer)}</a></figcaption>`
    : '';
  return `<figure class="hero-image">
              <img src="../${escapeHtml(img.href)}" alt="${escapeHtml(img.alt)}" width="1200" height="630">${credit}
            </figure>`;
}

function relatedHtml(post, cfg) {
  const r = post.related;
  if (!r) return '';
  return `
            <h2 id="see-also">See Also</h2>
            <p>If you enjoyed this ${escapeHtml(post.badge)} article, check out <a href="../${escapeHtml(r.slug)}/">${escapeHtml(r.title)}</a> for more useful reading.</p>`;
}

function renderArticleHtml(post, cfg) {
  const canonical = `${cfg.SITE_URL}${cfg.BLOG_PATH}${post.slug}/`;
  const ogImage = `${cfg.SITE_URL}${cfg.BLOG_PATH}${post.image ? post.image.href : 'images/placeholder.svg'}`;
  const keywordsMeta = (post.keywords || []).join(', ');
  const sections = post.sections.map(sectionHtml).join('\n\n');
  const related = relatedHtml(post, cfg);
  return `<!DOCTYPE html>
<html lang="en">

<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="${escapeHtml(post.metaDescription)}">
  <meta name="keywords" content="${escapeHtml(keywordsMeta)}">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <meta name="theme-color" content="#0a0d16">
  <meta name="application-name" content="Basketball Arena Blog">

  <title>${escapeHtml(post.title)} | Basketball Arena</title>

  <link rel="canonical" href="${canonical}">

  <!-- Favicon / Icons -->
  <link rel="icon" type="image/svg+xml" href="../../assets/favicon.svg">
  <link rel="icon" type="image/png" sizes="32x32" href="../../assets/favicon-32x32.png">
  <link rel="icon" type="image/png" sizes="16x16" href="../../assets/favicon-16x16.png">

  <!-- Open Graph -->
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="Basketball Arena">
  <meta property="og:title" content="${escapeHtml(post.title)}">
  <meta property="og:description" content="${escapeHtml(post.metaDescription)}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${ogImage}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${escapeHtml(post.badge)}">
  <meta property="og:locale" content="en_US">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(post.title)}">
  <meta name="twitter:description" content="${escapeHtml(post.metaDescription)}">
  <meta name="twitter:image" content="${ogImage}">
  <meta name="twitter:image:alt" content="${escapeHtml(post.badge)}">

  <!-- Structured Data: Article -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": "${escapeHtml(post.title).replace(/"/g, '\\"')}",
    "description": "${escapeHtml(post.metaDescription).replace(/"/g, '\\"')}",
    "image": ["${ogImage}"],
    "datePublished": "${post.datePublished}",
    "dateModified": "${post.dateModified}",
    "author": {
      "@type": "Person",
      "name": "Dhyey Satani"
    },
    "publisher": {
      "@type": "Organization",
      "name": "Basketball Arena",
      "logo": {
        "@type": "ImageObject",
        "url": "https://dhyey.bond/assets/og-image.png"
      }
    },
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": "${canonical}"
    }
  }
  </script>

  <!-- Structured Data: Breadcrumbs -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home", "item": "${cfg.SITE_URL}/" },
      { "@type": "ListItem", "position": 2, "name": "Blog", "item": "${cfg.SITE_URL}${cfg.BLOG_PATH}" },
      { "@type": "ListItem", "position": 3, "name": "${escapeHtml(post.badge).replace(/"/g, '\\"')}", "item": "${canonical}" }
    ]
  }
  </script>

  <link rel="stylesheet" href="../css/blog.css">
</head>

<body>

  <header class="site-header">
    <div class="container header-inner">
      <a class="site-logo" href="/" aria-label="Basketball Arena - back to game">
        <span class="logo-t1">BASKETBALL</span>
        <span class="logo-t2">ARENA</span>
      </a>
      <nav class="site-nav" id="site-nav" aria-label="Main navigation">
        <ul>
          <li><a href="/">PLAY NOW</a></li>
          <li><a href="/blog/">BLOG</a></li>
          <li><a href="/">LEADERBOARD</a></li>
        </ul>
      </nav>
      <button type="button" class="nav-toggle" id="nav-toggle" aria-expanded="false" aria-controls="site-nav" aria-label="Toggle navigation menu">
        <span class="bar"></span>
        <span class="bar"></span>
        <span class="bar"></span>
        <span class="visually-hidden">Toggle navigation</span>
      </button>
    </div>
  </header>

  <main id="main">

    <nav class="breadcrumb" aria-label="Breadcrumb">
      <div class="container">
        <ol>
          <li><a href="/">Home</a></li>
          <li><a href="/blog/">Blog</a></li>
          <li aria-current="page">${escapeHtml(post.badge)}</li>
        </ol>
      </div>
    </nav>

    <article>

      <header class="article-header">
        <div class="container">
          <span class="badge">${escapeHtml(post.badge)}</span>
          <h1 class="article-title">${escapeHtml(post.title)}</h1>
          <p class="article-intro">${escapeHtml(post.intro)}</p>
          <div class="article-meta">
            <span>Category: ${escapeHtml(post.badge)}</span>
            <span class="dot" aria-hidden="true"></span>
            <span>Published: <time datetime="${post.datePublished}">${formatDate(post.datePublished)}</time></span>
            <span class="dot" aria-hidden="true"></span>
            <span>Updated: <time datetime="${post.dateModified}">${formatDate(post.dateModified)}</time></span>
            <span class="dot" aria-hidden="true"></span>
            <span>${post.readingMinutes} min read</span>
          </div>
        </div>
      </header>

      <div class="container">
        <div class="article-layout">

          <div id="article-body" class="article-body">

${heroHtml(post)}

${sections}
${related}

            <aside class="article-cta">
              <h2>READY TO TEST YOUR SKILLS?</h2>
              <p>${escapeHtml(post.ctaText)}</p>
              <a class="btn" href="/">PLAY NOW</a>
            </aside>

          </div>

          <aside class="toc" id="toc" aria-labelledby="toc-title">
            <h2 id="toc-title">TABLE OF CONTENTS</h2>
          </aside>

        </div>
      </div>

    </article>

  </main>

  <footer class="site-footer">
    <div class="container">
      <div class="footer-grid">
        <div class="footer-brand">
          <a class="site-logo" href="/" aria-label="Basketball Arena - back to game">
            <span class="logo-t1">BASKETBALL</span>
            <span class="logo-t2">ARENA</span>
          </a>
          <p>Free 3D arcade basketball game with realistic physics, combos, Fire Mode and global leaderboards. Play instantly in your browser - no download needed.</p>
        </div>
        <div class="footer-col">
          <h2>Site</h2>
          <ul>
            <li><a href="/">Play Now</a></li>
            <li><a href="/blog/">Blog</a></li>
          </ul>
        </div>
      </div>
      <p class="footer-copy">&copy; 2026 Dhyey Satani &middot; Basketball Arena</p>
    </div>
  </footer>

  <script src="../js/blog.js" defer></script>

</body>

</html>
`;
}

function renderCardHtml(post) {
  const search = [post.title, ...(post.keywords || []), post.badge].join(' ');
  const imageHref = post.imageHref || 'images/placeholder.svg';
  const alt = post.image ? post.image.alt : post.title;
  return `<article class="article-card" data-search="${escapeHtml(search)}">
            <a class="card-media" href="${post.slug}/">
              <img src="${escapeHtml(imageHref)}" alt="${escapeHtml(alt)}" loading="lazy" width="1200" height="630">
            </a>
            <div class="card-body">
              <span class="badge">${escapeHtml(post.badge)}</span>
              <h3 class="card-title"><a href="${post.slug}/">${escapeHtml(post.title)}</a></h3>
              <p class="card-excerpt">${escapeHtml(post.excerpt)}</p>
              <div class="card-meta">
                <time datetime="${post.datePublished}">${formatDate(post.datePublished)}</time>
                <span class="dot" aria-hidden="true"></span>
                <span>${post.readingMinutes} min read</span>
              </div>
              <a class="btn btn-sm" href="${post.slug}/">READ ARTICLE</a>
            </div>
          </article>`;
}

module.exports = {
  escapeHtml,
  slugify,
  readingMinutes,
  formatDate,
  blockToHtml,
  sectionHtml,
  renderArticleHtml,
  renderCardHtml,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /workspace/blog-automation && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add blog-automation/src/article.js blog-automation/test/article.test.js
git commit -m "feat(blog): add article and card HTML rendering"
```

---

### Task 9: `src/index-updater.js` + wire markers into `blog/index.html`

**Files:**
- Create: `blog-automation/src/index-updater.js`
- Modify: `/workspace/blog/index.html` (add `<!-- AUTO-POSTS:START -->` / `<!-- AUTO-POSTS:END -->` markers around the grid content)
- Test: `blog-automation/test/index-updater.test.js`

**Interfaces:**
- Consumes: `cfg.BLOG_DIR`, `cfg.SITE_URL`, `cfg.BLOG_PATH`, post registry entries from Task 4.
- Produces:
  - `cardsBlockHtml(posts) → string` (newest first; first card wrapped in `<div class="featured">`, ends with the `no-results` paragraph)
  - `sitemapXml(cfg, posts) → string`
  - `updateBlogIndex(cfg, posts) → void` (replaces content between markers; throws if markers missing)
  - `updateSitemap(cfg, posts) → void`

- [ ] **Step 1: Add markers to the real `blog/index.html`**

Edit `/workspace/blog/index.html`:

1. Replace the line `<div class="grid" id="articles-grid">` with:

```
<div class="grid" id="articles-grid">

          <!-- AUTO-POSTS:START -->
```

2. Replace the line `<p class="no-results" id="no-results" hidden>No articles match your search. Try a different keyword.</p>` with:

```
          <p class="no-results" id="no-results" hidden>No articles match your search. Try a different keyword.</p>

        <!-- AUTO-POSTS:END -->
```

- [ ] **Step 2: Write the failing tests**

```js
// blog-automation/test/index-updater.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const updater = require('../src/index-updater');

function tmpCfg() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-upd-'));
  return {
    BLOG_DIR: path.join(dir, 'blog'),
    SITE_URL: 'https://dhyey.bond',
    BLOG_PATH: '/blog/',
  };
}

function samplePosts() {
  return [
    { slug: 'b', title: 'Post B', badge: 'News', excerpt: 'About B', datePublished: '2026-08-18', dateModified: '2026-08-18', readingMinutes: 4, imageHref: 'images/b.jpg', keywords: ['b'], image: { alt: 'B' } },
    { slug: 'a', title: 'Post A', badge: 'Guide', excerpt: 'About A', datePublished: '2026-08-17', dateModified: '2026-08-17', readingMinutes: 6, imageHref: 'images/a.jpg', keywords: ['a'], image: { alt: 'A' } },
  ];
}

test('cardsBlockHtml puts newest first and wraps it as featured', () => {
  const block = updater.cardsBlockHtml(samplePosts());
  const featuredIdx = block.indexOf('class="featured"');
  const aIdx = block.indexOf('href="a/"');
  const bIdx = block.indexOf('href="b/"');
  assert.ok(featuredIdx !== -1);
  assert.ok(featuredIdx < bIdx, 'featured wrapper starts before newest card');
  assert.ok(aIdx < bIdx, 'newest card rendered first');
  assert.ok(block.includes('no-results'));
});

test('sitemapXml lists home, blog, and every post', () => {
  const xml = updater.sitemapXml(tmpCfg(), samplePosts());
  assert.match(xml, /https:\/\/dhyey\.bond\//);
  assert.match(xml, /https:\/\/dhyey\.bond\/blog\//);
  assert.match(xml, /https:\/\/dhyey\.bond\/blog\/a\//);
  assert.match(xml, /https:\/\/dhyey\.bond\/blog\/b\//);
});

test('updateBlogIndex replaces content between markers', () => {
  const cfg = tmpCfg();
  fs.mkdirSync(path.join(cfg.BLOG_DIR, 'images'), { recursive: true });
  const file = path.join(cfg.BLOG_DIR, 'index.html');
  fs.writeFileSync(file, '<div class="grid" id="articles-grid">\n<!-- AUTO-POSTS:START -->OLD CARDS<!-- AUTO-POSTS:END -->\n</div>\n');
  updater.updateBlogIndex(cfg, samplePosts());
  const html = fs.readFileSync(file, 'utf8');
  assert.ok(!html.includes('OLD CARDS'));
  assert.ok(html.includes('href="b/"'));
  assert.match(html, /<!-- AUTO-POSTS:START -->/);
});

test('updateBlogIndex throws when markers missing', () => {
  const cfg = tmpCfg();
  fs.mkdirSync(path.join(cfg.BLOG_DIR, 'images'), { recursive: true });
  fs.writeFileSync(path.join(cfg.BLOG_DIR, 'index.html'), '<div class="grid"></div>\n');
  assert.throws(() => updater.updateBlogIndex(cfg, []), /AUTO-POSTS/);
});

test('updateSitemap writes the sitemap file', () => {
  const cfg = tmpCfg();
  fs.mkdirSync(path.join(cfg.BLOG_DIR, 'images'), { recursive: true });
  updater.updateSitemap(cfg, samplePosts());
  const xml = fs.readFileSync(path.join(cfg.BLOG_DIR, '..', 'sitemap.xml'), 'utf8');
  assert.match(xml, /<urlset/);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd /workspace/blog-automation && npm test`
Expected: FAIL — `Cannot find module '../src/index-updater'`.

- [ ] **Step 4: Write minimal implementation**

```js
// blog-automation/src/index-updater.js
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const article = require('./article');

function cardsBlockHtml(posts) {
  const sorted = [...posts].sort((a, b) => b.datePublished.localeCompare(a.datePublished));
  const parts = sorted.map((p, i) => {
    const card = article.renderCardHtml(p);
    return i === 0 ? `          <div class="featured">\n${card}\n          </div>` : card;
  });
  parts.push(
    '          <p class="no-results" id="no-results" hidden>No articles match your search. Try a different keyword.</p>'
  );
  return parts.join('\n\n');
}

function updateBlogIndex(cfg, posts) {
  const file = path.join(cfg.BLOG_DIR, 'index.html');
  const html = fs.readFileSync(file, 'utf8');
  const startMarker = '<!-- AUTO-POSTS:START -->';
  const endMarker = '<!-- AUTO-POSTS:END -->';
  const start = html.indexOf(startMarker);
  if (start === -1) throw new Error('blog/index.html missing AUTO-POSTS:START marker');
  const end = html.indexOf(endMarker);
  if (end === -1) throw new Error('blog/index.html missing AUTO-POSTS:END marker');
  const before = html.slice(0, start);
  const after = html.slice(end + endMarker.length);
  const block = `${startMarker}\n${cardsBlockHtml(posts)}\n        ${endMarker}`;
  fs.writeFileSync(file, `${before}${block}${after}`);
}

function sitemapXml(cfg, posts) {
  const today = new Date().toISOString().slice(0, 10);
  const sorted = [...posts].sort((a, b) => b.datePublished.localeCompare(a.datePublished));
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    `  <url>\n    <loc>${cfg.SITE_URL}/</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>1.0</priority>\n  </url>`,
    `  <url>\n    <loc>${cfg.SITE_URL}${cfg.BLOG_PATH}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.9</priority>\n  </url>`,
  ];
  for (const p of sorted) {
    lines.push(
      `  <url>\n    <loc>${cfg.SITE_URL}${cfg.BLOG_PATH}${p.slug}/</loc>\n    <lastmod>${p.dateModified || p.datePublished}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n  </url>`
    );
  }
  lines.push('</urlset>', '');
  return lines.join('\n');
}

function updateSitemap(cfg, posts) {
  const out = path.join(cfg.BLOG_DIR, '..', 'sitemap.xml');
  fs.writeFileSync(out, sitemapXml(cfg, posts));
}

module.exports = { cardsBlockHtml, sitemapXml, updateBlogIndex, updateSitemap };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /workspace/blog-automation && npm test`
Expected: PASS.

- [ ] **Step 6: Verify the real `blog/index.html` markers work end-to-end locally**

Run (after Task 10 exists it will be covered by the integration test; for now run a dry render):

```bash
cd /workspace/blog-automation && node -e "
const cfg = require('./config');
const updater = require('./src/index-updater');
const posts = require('./posts.json');
console.log(updater.cardsBlockHtml(posts).split('\n').length, 'card lines rendered');
"
```

Expected: prints a card line count > 0 and no throw.

- [ ] **Step 7: Commit**

```bash
git add blog-automation/src/index-updater.js blog-automation/test/index-updater.test.js blog/index.html
git commit -m "feat(blog): add index/sitemap updater with AUTO-POSTS markers"
```

---

### Task 10: `src/runner.js` — orchestration with per-slot resilience

**Files:**
- Create: `blog-automation/src/runner.js`
- Test: `blog-automation/test/runner.test.js`

**Interfaces:**
- Consumes: all prior modules: `models`, `rss`, `state`, `content`, `images`, `article`, `index-updater`.
- Produces:
  - `todayIso() → string` (UTC `YYYY-MM-DD`)
  - `buildExcerpt(content) → string` (~28 words from `intro`)
  - `runPipeline(cfg, { apiKeys, pexelsKey, log? }) → Promise<{ generated: Post[], failures: Array<{slot,error}>, model }>`
    - throws if `generated.length === 0`
    - writes article files, updates `posts.json`, `state.json`, `blog/index.html`, `sitemap.xml`

- [ ] **Step 1: Write the failing tests**

```js
// blog-automation/test/runner.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const runner = require('../src/runner');

function tmpCfg() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-run-'));
  const blogDir = path.join(dir, 'blog');
  fs.mkdirSync(path.join(blogDir, 'images'), { recursive: true });
  fs.writeFileSync(path.join(blogDir, 'index.html'), '<div class="grid" id="articles-grid">\n<!-- AUTO-POSTS:START -->OLD<!-- AUTO-POSTS:END -->\n</div>\n');
  fs.writeFileSync(path.join(dir, 'sitemap.xml'), '<?xml version="1.0"?>\n<urlset/>\n');
  return {
    BLOG_DIR: blogDir,
    SITE_URL: 'https://dhyey.bond',
    BLOG_PATH: '/blog/',
    STATE_FILE: path.join(dir, 'state.json'),
    POSTS_FILE: path.join(dir, 'posts.json'),
    RECENT_WINDOW_DAYS: 30,
    WORDS_PER_MINUTE: 200,
    SLOTS: [
      { id: 'baseball-news', type: 'news', category: 'baseball', badge: 'Baseball News' },
      { id: 'baseball-guide', type: 'evergreen', category: 'baseball', badge: 'Baseball Guide' },
      { id: 'esports-news', type: 'news', category: 'esports', badge: 'Esports News' },
      { id: 'esports-guide', type: 'evergreen', category: 'esports', badge: 'Esports Guide' },
      { id: 'current-events', type: 'news', category: 'current', badge: 'Current Events' },
    ],
    EVERGREEN_TOPICS: {
      baseball: ['topic b1', 'topic b2'],
      esports: ['topic e1', 'topic e2'],
    },
    RSS_FEEDS: {
      baseball: ['https://fb.example'],
      esports: ['https://fe.example'],
      current: ['https://fc.example'],
    },
    FALLBACK_MODELS: ['fallback-model'],
  };
}

const goodContent = JSON.stringify({
  title: 'A Great Baseball Story',
  metaDescription: 'A great baseball story with a keyword inside the description.',
  keywords: ['baseball', 'story'],
  imageQuery: 'baseball',
  intro: 'This is the intro hook for the article body.',
  ctaText: 'Play our game now.',
  sections: [
    { heading: 'The Story', blocks: [{ type: 'p', text: 'A good paragraph about baseball.' }] },
    { heading: 'The Details', blocks: [{ type: 'ul', items: ['One', 'Two'] }] },
  ],
});

const failingContent = JSON.stringify({ title: '', metaDescription: '', keywords: [], imageQuery: '', intro: '', ctaText: '', sections: [] });

test('todayIso returns YYYY-MM-DD', () => {
  assert.match(runner.todayIso(), /^\d{4}-\d{2}-\d{2}$/);
});

test('runPipeline generates posts and commits partial successes', async () => {
  const cfg = tmpCfg();
  const realRss = require('../src/rss');
  const originalFetchRss = realRss.fetchRss;
  let calls = 0;
  realRss.fetchRss = async (c, cat) => ({ source: 'https://x', headlines: [{ title: `Headline ${cat} ${calls++}`, link: 'https://x', pubDate: '2026-08-18T00:00:00Z' }] });
  const realModels = require('../src/models');
  const originalPick = realModels.pickBestModel;
  realModels.pickBestModel = async () => ({ id: 'best', name: 'Best', context_length: 100000, score: 1, costPer1k: 0 });

  let chatCalls = 0;
  const originalChat = require('../src/content').chatCompletion;
  require('../src/content').chatCompletion = async () => {
    chatCalls += 1;
    return chatCalls === 2 ? failingContent : goodContent;
  };

  const realImages = require('../src/images');
  const originalFind = realImages.findHeroImage;
  realImages.findHeroImage = async ({ slug, badge, cfg: c }) => {
    const absPath = path.join(c.BLOG_DIR, 'images', `${slug}.svg`);
    fs.writeFileSync(absPath, '<svg/>');
    return { href: `images/${slug}.svg`, absPath, alt: badge, photographer: '', photographerUrl: '', credit: '', kind: 'svg' };
  };

  const log = [];
  try {
    const result = await runner.runPipeline(cfg, { apiKeys: ['k'], pexelsKey: '', log: (m) => log.push(m) });
    assert.strictEqual(result.generated.length, 4, 'one slot should fail, four succeed');
    assert.strictEqual(result.failures.length, 1);
    assert.strictEqual(result.failures[0].slot, 'baseball-guide');
    for (const p of result.generated) {
      assert.ok(fs.existsSync(path.join(cfg.BLOG_DIR, p.slug, 'index.html')));
    }
    const indexHtml = fs.readFileSync(path.join(cfg.BLOG_DIR, 'index.html'), 'utf8');
    assert.ok(indexHtml.includes('A Great Baseball Story'));
    const sitemap = fs.readFileSync(path.join(cfg.BLOG_DIR, '..', 'sitemap.xml'), 'utf8');
    assert.ok(sitemap.includes('a-great-baseball-story'));
    const posts = JSON.parse(fs.readFileSync(cfg.POSTS_FILE, 'utf8'));
    assert.strictEqual(posts.length, 4);
    const st = JSON.parse(fs.readFileSync(cfg.STATE_FILE, 'utf8'));
    assert.ok(st.recentSlugs.length === 4);
  } finally {
    realRss.fetchRss = originalFetchRss;
    realModels.pickBestModel = originalPick;
    require('../src/content').chatCompletion = originalChat;
    realImages.findHeroImage = originalFind;
  }
});

test('runPipeline throws when zero posts generated', async () => {
  const cfg = tmpCfg();
  const realRss = require('../src/rss');
  const originalFetchRss = realRss.fetchRss;
  realRss.fetchRss = async () => ({ source: 'https://x', headlines: [{ title: 'H', link: 'x', pubDate: '2026-08-18' }] });
  const realModels = require('../src/models');
  const originalPick = realModels.pickBestModel;
  realModels.pickBestModel = async () => ({ id: 'best', name: 'Best', context_length: 100000 });
  const originalChat = require('../src/content').chatCompletion;
  require('../src/content').chatCompletion = async () => failingContent;
  try {
    await assert.rejects(() => runner.runPipeline(cfg, { apiKeys: ['k'], pexelsKey: '' }), /0 of 5 posts generated/);
  } finally {
    realRss.fetchRss = originalFetchRss;
    realModels.pickBestModel = originalPick;
    require('../src/content').chatCompletion = originalChat;
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /workspace/blog-automation && npm test`
Expected: FAIL — `Cannot find module '../src/runner'`.

- [ ] **Step 3: Write minimal implementation**

```js
// blog-automation/src/runner.js
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const models = require('./models');
const rss = require('./rss');
const state = require('./state');
const content = require('./content');
const images = require('./images');
const article = require('./article');
const updater = require('./index-updater');

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function buildExcerpt(contentData) {
  const text = String(contentData.intro || '')
    .replace(/[^a-zA-Z0-9\s.,'"-]/g, ' ')
    .trim();
  const words = text.split(/\s+/).filter(Boolean);
  const excerpt = words.slice(0, 28).join(' ');
  return words.length > 28 ? `${excerpt}...` : excerpt;
}

function dayOfYear() {
  const now = new Date();
  const start = Date.UTC(now.getUTCFullYear(), 0, 0);
  return Math.floor((now.getTime() - start) / 86400000);
}

async function runPipeline(cfg, { apiKeys, pexelsKey, log = () => {} } = {}) {
  const st = state.loadState(cfg);
  const posts = state.readPosts(cfg);
  const existingSlugs = new Set(posts.map((p) => p.slug));
  const generated = [];
  const failures = [];
  const headlines = new Map();
  const doy = dayOfYear();

  let model;
  try {
    model = await models.pickBestModel(apiKeys, cfg);
    log(`Model: ${model.id} (score=${model.score == null ? 'n/a' : model.score.toFixed(3)}, cost/1k=$${model.costPer1k ?? 0})`);
  } catch (err) {
    model = { id: cfg.FALLBACK_MODELS[0], name: cfg.FALLBACK_MODELS[0], context_length: null };
    log(`Model discovery failed (${err.message}); using fallback ${model.id}`);
  }

  for (const baseSlot of cfg.SLOTS) {
    const slot = { ...baseSlot };
    try {
      let headline = null;
      if (slot.type === 'news') {
        if (!headlines.has(slot.category)) {
          const res = await rss.fetchRss(cfg, slot.category);
          headlines.set(slot.category, res.headlines);
        }
        const fresh = headlines.get(slot.category).filter((h) => !state.isHeadlineCovered(st, h.title, cfg));
        if (!fresh.length) {
          log(`No fresh headlines for ${slot.id}; falling back to evergreen`);
          slot.type = 'evergreen';
        } else {
          headline = fresh[0];
        }
      }
      if (slot.type === 'evergreen') {
        const pool = cfg.EVERGREEN_TOPICS[slot.category] || ['general guide'];
        slot.topic = pool[doy % pool.length];
      }
      const related = posts
        .filter((p) => p.badge === slot.badge)
        .sort((a, b) => b.datePublished.localeCompare(a.datePublished))[0] || posts[0] || null;
      const data = await content.generatePost({ slot, headline, cfg, apiKeys, model, related, chat: content.chatCompletion });
      const slug = article.slugify(data.title);
      if (existingSlugs.has(slug) || state.isSlugUsed(st, slug)) {
        log(`Slug "${slug}" already used; skipping`);
        continue;
      }
      const datePublished = todayIso();
      const words = [
        data.intro,
        ...data.sections.flatMap((s) => [s.heading, ...s.blocks.map((b) => b.text || (b.items || []).join(' '))]),
      ].join(' ');
      const post = {
        slug,
        title: data.title,
        badge: slot.badge,
        metaDescription: data.metaDescription,
        keywords: data.keywords,
        intro: data.intro,
        sections: data.sections,
        ctaText: data.ctaText,
        datePublished,
        dateModified: datePublished,
        readingMinutes: article.readingMinutes(words, cfg.WORDS_PER_MINUTE),
        excerpt: buildExcerpt(data),
        imageHref: 'images/placeholder.svg',
        related,
      };
      const image = await images.findHeroImage({ query: data.imageQuery, slug, badge: slot.badge, cfg, pexelsKey });
      post.imageHref = image.href;
      post.image = image;
      const html = article.renderArticleHtml(post, cfg);
      const dir = path.join(cfg.BLOG_DIR, slug);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'index.html'), html);
      generated.push(post);
      log(`Generated ${slug} (${slot.badge})`);
    } catch (err) {
      failures.push({ slot: slot.id, error: err.message });
      log(`FAILED ${slot.id}: ${err.message}`);
    }
  }

  if (!generated.length) {
    throw new Error(`0 of ${cfg.SLOTS.length} posts generated. Failures: ${failures.map((f) => `${f.slot}: ${f.error}`).join('; ')}`);
  }

  state.recordSlugs(st, generated.map((p) => p.slug), cfg);
  for (const [cat, items] of headlines) {
    if (items.length) {
      state.recordHeadlines(st, items.slice(0, 3).map((h) => ({ title: h.title, date: h.pubDate || todayIso() })), cfg);
    }
  }
  state.saveState(cfg, st);

  const allPosts = [...posts, ...generated];
  state.writePosts(cfg, allPosts);
  updater.updateBlogIndex(cfg, allPosts);
  updater.updateSitemap(cfg, allPosts);
  log(`Updated blog index + sitemap with ${allPosts.length} posts`);
  return { generated, failures, model };
}

module.exports = { runPipeline, buildExcerpt, todayIso };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /workspace/blog-automation && npm test`
Expected: PASS (integration test exercises real file writes in a temp dir).

- [ ] **Step 5: Commit**

```bash
git add blog-automation/src/runner.js blog-automation/test/runner.test.js
git commit -m "feat(blog): add resilient pipeline runner"
```

---

### Task 11: `src/cli.js` — CLI entry point

**Files:**
- Create: `blog-automation/src/cli.js`
- Test: `blog-automation/test/cli.test.js`

**Interfaces:**
- Consumes: `config`, `runner.runPipeline`.
- Produces: process exit 0 when ≥1 post generated; exit 1 otherwise; loads `.env` via `dotenv`.

- [ ] **Step 1: Write the failing test**

```js
// blog-automation/test/cli.test.js
'use strict';
const { test, mock } = require('node:test');
const assert = require('node:assert');

test('cli is a valid module that can be loaded without side effects', () => {
  const cfg = require('../config');
  const cliPath = require.resolve('../src/cli.js');
  const fs = require('node:fs');
  assert.ok(fs.existsSync(cliPath));
  assert.ok(cfg.SITE_URL);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /workspace/blog-automation && npm test`
Expected: FAIL — cannot resolve `../src/cli.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// blog-automation/src/cli.js
'use strict';
require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env') });
const cfg = require('../config');
const { runPipeline } = require('./runner');

async function main() {
  const apiKeys = [process.env.OPENROUTER_API_KEY_1, process.env.OPENROUTER_API_KEY_2].filter(Boolean);
  const pexelsKey = process.env.PEXELS_API_KEY || '';
  const log = (m) => console.log(`[${new Date().toISOString()}] ${m}`);
  if (!apiKeys.length) {
    console.error('ERROR: set OPENROUTER_API_KEY_1 (or OPENROUTER_API_KEY_2) in blog-automation/.env or the environment');
    process.exit(1);
  }
  if (!pexelsKey) log('WARNING: PEXELS_API_KEY not set; using SVG fallback images');
  const start = Date.now();
  const result = await runPipeline(cfg, { apiKeys, pexelsKey, log });
  log(`DONE: ${result.generated.length} posts generated, ${result.failures.length} failed in ${((Date.now() - start) / 1000).toFixed(1)}s`);
  if (result.failures.length) {
    log(`Failures: ${result.failures.map((f) => `${f.slot}: ${f.error}`).join('; ')}`);
  }
  process.exit(result.generated.length ? 0 : 1);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`[${new Date().toISOString()}] FATAL:`, err);
    process.exit(1);
  });
}

module.exports = { main };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /workspace/blog-automation && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add blog-automation/src/cli.js blog-automation/test/cli.test.js
git commit -m "feat(blog): add CLI entry point"
```

---

### Task 12: `server.js` — dev-only Express API

**Files:**
- Create: `blog-automation/server.js`
- Test: `blog-automation/test/server.test.js`

**Interfaces:**
- Consumes: `config`, `src/runner`, `src/models`.
- Produces: Express app with `GET /api/status`, `POST /api/generate`, `GET /api/models`; listens on `process.env.PORT || 3050` only when run directly.

- [ ] **Step 1: Write the failing test**

```js
// blog-automation/test/server.test.js
'use strict';
const { test, mock } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

test('server exposes status endpoint', async () => {
  const realKeys = { OPENROUTER_API_KEY_1: process.env.OPENROUTER_API_KEY_1, OPENROUTER_API_KEY_2: process.env.OPENROUTER_API_KEY_2 };
  process.env.OPENROUTER_API_KEY_1 = 'sk-test';
  delete process.env.OPENROUTER_API_KEY_2;
  mock.method(require('../src/runner'), 'runPipeline', async () => ({ generated: [{ slug: 'x' }], failures: [], model: { id: 'm' } }));
  const app = require('../server');
  try {
    const server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    const port = server.address().port;
    const res = await fetch(`http://127.0.0.1:${port}/api/status`);
    const body = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(body.ok, true);
    server.close();
  } finally {
    mock.restoreAll();
    if (process.env.OPENROUTER_API_KEY_1 !== undefined) process.env.OPENROUTER_API_KEY_1 = realKeys.OPENROUTER_API_KEY_1;
    if (realKeys.OPENROUTER_API_KEY_2 !== undefined) process.env.OPENROUTER_API_KEY_2 = realKeys.OPENROUTER_API_KEY_2;
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /workspace/blog-automation && npm test`
Expected: FAIL — `Cannot find module '../server'`.

- [ ] **Step 3: Write minimal implementation**

```js
// blog-automation/server.js
'use strict';
// DEV-ONLY server. Never run in CI. CI uses `node src/cli.js`.
require('dotenv').config();
const express = require('express');
const cfg = require('./config');
const { runPipeline } = require('./src/runner');

const app = express();
app.use(express.json());

let lastRun = null;

function keys() {
  return [process.env.OPENROUTER_API_KEY_1, process.env.OPENROUTER_API_KEY_2].filter(Boolean);
}

app.get('/api/status', (req, res) => {
  res.json({ ok: true, lastRun, now: new Date().toISOString() });
});

app.post('/api/generate', async (req, res) => {
  const apiKeys = keys();
  if (!apiKeys.length) return res.status(400).json({ error: 'OpenRouter API key not configured.' });
  try {
    const result = await runPipeline(cfg, { apiKeys, pexelsKey: process.env.PEXELS_API_KEY || '' });
    lastRun = { at: new Date().toISOString(), generated: result.generated.map((p) => p.slug), failures: result.failures };
    res.json({ generated: result.generated.map((p) => p.slug), failures: result.failures, model: result.model });
  } catch (err) {
    lastRun = { at: new Date().toISOString(), error: err.message };
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/models', async (req, res) => {
  const apiKeys = keys();
  if (!apiKeys.length) return res.status(400).json({ error: 'OpenRouter API key not configured.' });
  try {
    const { fetchModels, filterCandidates, scoreModel } = require('./src/models');
    const { v1Models, popularMap } = await fetchModels(apiKeys, cfg);
    const ranked = filterCandidates(v1Models, cfg)
      .sort((a, b) => scoreModel(b, popularMap, cfg) - scoreModel(a, popularMap, cfg))
      .slice(0, 10)
      .map((m) => ({ id: m.id, name: m.name, score: scoreModel(m, popularMap, cfg) }));
    res.json({ models: ranked });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const port = process.env.PORT || 3050;
if (require.main === module) {
  app.listen(port, () => console.log(`Blog automation dev server on :${port}`));
}

module.exports = app;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /workspace/blog-automation && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add blog-automation/server.js blog-automation/test/server.test.js
git commit -m "feat(blog): add dev-only Express API server"
```

---

### Task 13: GitHub Actions daily workflow + README note

**Files:**
- Create: `.github/workflows/auto-blog.yml`
- Modify: `blog-automation/README.md` (add the note that `NOTIFY_WEBHOOK_URL` is a Discord/Slack webhook)

**Interfaces:**
- Consumes: `node src/cli.js --ci`; secrets `OPENROUTER_API_KEY_1`, `OPENROUTER_API_KEY_2`, `PEXELS_API_KEY`, `NOTIFY_WEBHOOK_URL`.
- Produces: daily 06:00 UTC run; commits posts to `main`; dispatches `deploy.yml`.

- [ ] **Step 1: Create `.github/workflows/auto-blog.yml`**

```yaml
name: Daily Blog Generation

on:
  schedule:
    # 06:00 UTC daily == 11:30 IST (cron runs in UTC by default)
    - cron: '0 6 * * *'
  workflow_dispatch:

concurrency:
  group: blog-generation
  cancel-in-progress: false   # queue, never cancel -> serializes cron vs manual runs

permissions:
  contents: write

jobs:
  generate-and-post:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: blog-automation/package-lock.json

      - name: Generate posts
        env:
          OPENROUTER_API_KEY_1: ${{ secrets.OPENROUTER_API_KEY_1 }}
          OPENROUTER_API_KEY_2: ${{ secrets.OPENROUTER_API_KEY_2 }}
          PEXELS_API_KEY: ${{ secrets.PEXELS_API_KEY }}
        run: |
          cd blog-automation
          npm ci
          node src/cli.js --ci

      - name: Commit & push (if changes)
        run: |
          git config user.name "blog-bot"
          git config user.email "blog-bot@users.noreply.github.com"
          git add -A
          if ! git diff --cached --quiet; then
            git commit -m "feat(blog): daily automated posts $(date -u +%F)"
            git push
          else
            echo "No changes to commit"
          fi

      - name: Trigger Pages deploy
        run: gh workflow run deploy.yml --repo "$GITHUB_REPOSITORY"
        env:
          GH_TOKEN: ${{ github.token }}

  notify-failure:
    needs: generate-and-post
    if: failure()
    runs-on: ubuntu-latest
    steps:
      - name: Notify failure
        run: |
          curl -fsS -X POST "${{ secrets.NOTIFY_WEBHOOK_URL }}" \
            -H 'Content-Type: application/json' \
            -d "{\"content\":\"Daily blog automation FAILED on $(date -u +%F). See $GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID\"}" \
            || true
```

- [ ] **Step 2: Add the webhook note to `blog-automation/README.md`**

After the "Failure notification webhook (Discord/Slack), used only by CI" line in the secrets section, verify the README already documents: GitHub Actions runs daily at 06:00 UTC (11:30 IST), commits to `main`, and requires the four secrets. If anything is missing, add it.

- [ ] **Step 3: Verify YAML syntax**

Run: `node -e "new (require('js-yaml'))" 2>/dev/null; ruby -e 'require "yaml"; YAML.load_file(".github/workflows/auto-blog.yml"); puts "YAML OK"'`
Expected: prints `YAML OK` (or the equivalent parse passes with an available parser).

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/auto-blog.yml blog-automation/README.md
git commit -m "ci: add daily blog generation workflow"
```

---

### Task 14: End-to-end verification with real keys (manual, no push)

**Files:**
- Read: generated output under `/workspace/blog/`, `/workspace/blog/index.html`, `/workspace/sitemap.xml`, `blog-automation/state.json`, `blog-automation/posts.json`

**Interfaces:**
- Consumes: everything above plus real `OPENROUTER_API_KEY_1/2` and `PEXELS_API_KEY`.

- [ ] **Step 1: Create `.env` from example**

Run:
```bash
cp /workspace/blog-automation/.env.example /workspace/blog-automation/.env
```
Then the user fills `OPENROUTER_API_KEY_1`, `OPENROUTER_API_KEY_2`, and `PEXELS_API_KEY` into `/workspace/blog-automation/.env`. (The two OpenRouter keys are supplied by the user; the Pexels key is created at https://www.pexels.com/api/.)

- [ ] **Step 2: Full test suite**

Run: `cd /workspace/blog-automation && npm test`
Expected: all tests PASS.

- [ ] **Step 3: Real generation run**

Run: `cd /workspace/blog-automation && npm run generate`
Expected:
- Log lines show the picked model (with score) and `Generated <slug> (<badge>)` for each slot.
- `blog/<slug>/index.html` exists for every generated slug.
- `blog/index.html` now contains the new cards inside `<!-- AUTO-POSTS:START --> ... <!-- AUTO-POSTS:END -->`.
- `sitemap.xml` lists the new post URLs.
- `state.json` and `posts.json` are updated.

- [ ] **Step 4: Validate generated article HTML**

For the newest generated slug `<slug>`, run:
```bash
cd /workspace/blog && rg -n '<h2 id=' "<slug>/index.html" | head -20
```
Expected: every `<h2>` has an `id`.
And confirm the hero figure contains a `<figcaption>` with `Photo by` when the image is a Pexels photo (or no figcaption for SVG fallback).

- [ ] **Step 5: Validate blog index + search + TOC contract**

Run:
```bash
cd /workspace/blog && rg -c 'data-search=' index.html && node -e "console.log(require('fs').readFileSync('index.html','utf8').includes('AUTO-POSTS:START') && require('fs').readFileSync('index.html','utf8').includes('AUTO-POSTS:END') ? 'markers OK' : 'markers MISSING')"
```
Expected: a card count number, then `markers OK`.

- [ ] **Step 6: Leave the working tree ready for user review**

Do NOT push in this step. Report the generated slugs and any failures so the user can review before committing the day's posts.

---

## Self-Review Notes (checked)

- **Spec coverage:** model ranking w/ cost filter → Task 3; dual-key failover → Task 6 `chatCompletion`; RSS primary+fallback → Task 5 + config; evergreen fallback on empty RSS → Task 10; dedup via state.json → Tasks 4 + 10; Pexels + photographer credit → Tasks 7 + 8; SVG fallback → Task 7; partial-failure commit → Task 10; 0-success non-zero exit → Task 10 + 11; UTC cron comment + concurrency + notify-failure → Task 13; internal "see also" link → Task 8 `relatedHtml`; dev-only server excluded from CI → Tasks 12 + 13; sitemap + index update → Task 9.
- **Placeholder scan:** no TBD/TODO; every code step is complete.
- **Type consistency:** `imageHref` used by `renderCardHtml` and set by runner; `post.image` object shape (`href/absPath/alt/photographer/photographerUrl/credit/kind`) consistent between Task 7 output and Task 8 input; `slot.topic` set in Task 10 runner before Task 6 `buildEvergreenPrompt` reads it; `related` passed through `generatePost` in Task 6.

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

test('pricePer1k clamps negative pricing to 0', () => {
  assert.strictEqual(models.pricePer1k(makeModel({ pricing: { prompt: '-1', completion: '-2' } })), 0);
});

test('filterCandidates excludes openrouter auto-routing models', () => {
  const auto = makeModel({ id: 'openrouter/auto', name: 'Auto Router' });
  const autoBeta = makeModel({ id: 'openrouter/auto-beta', name: 'Auto Router Beta' });
  const text = makeModel();
  const out = models.filterCandidates([auto, autoBeta, text], cfg);
  assert.deepStrictEqual(out.map((m) => m.id), ['org/model:free']);
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
  const now = 1760000000000;
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
     assert.strictEqual(best.source, 'fallback');
  } finally {
    mock.restoreAll();
  }
});
 
test('filterFreeCandidates keeps free text models only', () => {
  const free = makeModel({ id: 'org/ok:free' });
  const paid = makeModel({ id: 'org/paid', pricing: { prompt: '0.001', completion: '0.001' } });
  const code = makeModel({ id: 'org/code:free', name: 'Code Model' });
  const audio = makeModel({ id: 'org/audio:free', name: 'Lyria Audio' });
  const router = makeModel({ id: 'openrouter/free', name: 'Free Auto Router' });
  const out = models.filterFreeCandidates([free, paid, code, audio, router], cfg);
  assert.deepStrictEqual(out.map((m) => m.id), ['org/ok:free']);
});
 
test('scoreFreeModel rewards larger context', () => {
  const small = makeModel({ id: 'a', context_length: 32000 });
  const large = makeModel({ id: 'b', context_length: 1000000 });
  assert.ok(models.scoreFreeModel(large, cfg) > models.scoreFreeModel(small, cfg));
});
 
test('pickFreeModel picks largest-context free model', async () => {
  mock.method(globalThis, 'fetch', async () => ({
    ok: true,
    json: async () => ({
      data: [
        makeModel({ id: 'org/small:free', context_length: 40000 }),
        makeModel({ id: 'org/large:free', context_length: 900000 }),
      ],
    }),
  }));
  try {
    const best = await models.pickFreeModel(['sk-test'], cfg);
    assert.strictEqual(best.id, 'org/large:free');
    assert.strictEqual(best.source, 'free');
  } finally {
    mock.restoreAll();
  }
});
 
test('pickBestModel prefers a free model when available', async () => {
  mock.method(globalThis, 'fetch', async () => ({
    ok: true,
    json: async () => ({
      data: [
        makeModel({ id: 'org/free:free', context_length: 900000 }),
        makeModel({ id: 'org/paid', pricing: { prompt: '0.001', completion: '0.001' }, context_length: 1000000 }),
      ],
    }),
  }));
  try {
    const best = await models.pickBestModel(['sk-test'], cfg);
    assert.strictEqual(best.id, 'org/free:free');
    assert.strictEqual(best.source, 'free');
  } finally {
    mock.restoreAll();
  }
});

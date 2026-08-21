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

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

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

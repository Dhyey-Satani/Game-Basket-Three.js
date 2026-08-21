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

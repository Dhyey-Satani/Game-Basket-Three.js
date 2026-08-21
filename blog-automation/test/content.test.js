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

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

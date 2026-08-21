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
  assert.ok(bIdx < aIdx, 'newest card (b, 2026-08-18) rendered first');
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

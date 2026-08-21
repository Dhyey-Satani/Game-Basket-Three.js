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

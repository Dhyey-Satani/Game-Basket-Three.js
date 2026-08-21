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
  let sawEmpty = false;
  for (const url of urls) {
    try {
      const items = await fetchOneFeed(url, cfg, parser);
      if (items.length) return { source: url, headlines: items };
      sawEmpty = true;
    } catch (err) {
      lastErr = err;
    }
  }
  if (lastErr) throw new Error(`RSS feeds for "${category}" all failed: ${lastErr.message}`);
  if (sawEmpty) throw new Error(`RSS feeds for "${category}" returned no items`);
  throw new Error(`RSS feeds for "${category}" returned no items`);
}

module.exports = { fetchOneFeed, fetchRss };

// blog-automation/src/state.js
'use strict';
const fs = require('node:fs');
const path = require('node:path');

function ensure(file) {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadState(cfg) {
  try {
    return JSON.parse(fs.readFileSync(cfg.STATE_FILE, 'utf8'));
  } catch {
    return { recentHeadlines: [], recentSlugs: [] };
  }
}

function saveState(cfg, state) {
  ensure(cfg.STATE_FILE);
  fs.writeFileSync(cfg.STATE_FILE, JSON.stringify(state, null, 2) + '\n');
}

function normalizeHeadline(title) {
  return (title || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function isHeadlineCovered(state, title, cfg) {
  const n = normalizeHeadline(title);
  return state.recentHeadlines.some((h) => normalizeHeadline(h.title) === n);
}

function isSlugUsed(state, slug) {
  return state.recentSlugs.includes(slug);
}

function recordHeadlines(state, entries, cfg) {
  const cutoff = Date.now() - cfg.RECENT_WINDOW_DAYS * 86400000;
  const fresh = [...state.recentHeadlines, ...entries].filter((h) => !h.date || new Date(h.date).getTime() >= cutoff);
  state.recentHeadlines = fresh.slice(-200);
}

function recordSlugs(state, slugs, cfg) {
  state.recentSlugs = [...new Set([...state.recentSlugs, ...slugs])].slice(-200);
}

function readPosts(cfg) {
  try {
    return JSON.parse(fs.readFileSync(cfg.POSTS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function writePosts(cfg, posts) {
  ensure(cfg.POSTS_FILE);
  fs.writeFileSync(cfg.POSTS_FILE, JSON.stringify(posts, null, 2) + '\n');
}

module.exports = {
  loadState,
  saveState,
  normalizeHeadline,
  isHeadlineCovered,
  isSlugUsed,
  recordHeadlines,
  recordSlugs,
  readPosts,
  writePosts,
};

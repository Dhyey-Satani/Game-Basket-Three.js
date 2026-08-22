// blog-automation/src/runner.js
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const models = require('./models');
const rss = require('./rss');
const state = require('./state');
const content = require('./content');
const images = require('./images');
const article = require('./article');
const updater = require('./index-updater');

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function buildExcerpt(contentData) {
  const text = String(contentData.intro || '')
    .replace(/[^a-zA-Z0-9\s.,'"-]/g, ' ')
    .trim();
  const words = text.split(/\s+/).filter(Boolean);
  const excerpt = words.slice(0, 28).join(' ');
  return words.length > 28 ? `${excerpt}...` : excerpt;
}

function dayOfYear() {
  const now = new Date();
  const start = Date.UTC(now.getUTCFullYear(), 0, 0);
  return Math.floor((now.getTime() - start) / 86400000);
}

async function runPipeline(cfg, { apiKeys, pexelsKey, log = () => {} } = {}) {
  const st = state.loadState(cfg);
  const posts = state.readPosts(cfg);
  const existingSlugs = new Set(posts.map((p) => p.slug));
  const generated = [];
  const failures = [];
  const headlines = new Map();
  const doy = dayOfYear();

  let model;
  try {
    model = await models.pickBestModel(apiKeys, cfg);
    log(`Model: ${model.id} (score=${model.score == null ? 'n/a' : model.score.toFixed(3)}, cost/1k=$${model.costPer1k ?? 0})`);
  } catch (err) {
    model = { id: cfg.FALLBACK_MODELS[0], name: cfg.FALLBACK_MODELS[0], context_length: null };
    log(`Model discovery failed (${err.message}); using fallback ${model.id}`);
  }

  for (const baseSlot of cfg.SLOTS) {
    const slot = { ...baseSlot };
    try {
      let headline = null;
      if (slot.type === 'news') {
        if (!headlines.has(slot.category)) {
          const res = await rss.fetchRss(cfg, slot.category);
          headlines.set(slot.category, res.headlines);
        }
        const fresh = headlines.get(slot.category).filter((h) => !state.isHeadlineCovered(st, h.title, cfg));
        if (!fresh.length) {
          log(`No fresh headlines for ${slot.id}; falling back to evergreen`);
          slot.type = 'evergreen';
        } else {
          headline = fresh[0];
        }
      }
      if (slot.type === 'evergreen') {
        const pool = cfg.EVERGREEN_TOPICS[slot.category] || ['general guide'];
        const usedCount = posts.filter((p) => p.badge === slot.badge).length;
        slot.topic = pool[(doy + usedCount) % pool.length];
      }
      const related = posts
        .filter((p) => p.badge === slot.badge)
        .sort((a, b) => b.datePublished.localeCompare(a.datePublished))[0] || posts[0] || null;
      const data = await content.generatePost({ slot, headline, cfg, apiKeys, model, related, chat: content.chatCompletion });
      const slug = article.slugify(data.title);
      if (existingSlugs.has(slug) || state.isSlugUsed(st, slug) || generated.some((g) => g.slug === slug)) {
        log(`Slug "${slug}" already used; skipping`);
        continue;
      }
      const datePublished = todayIso();
      const words = [
        data.intro,
        ...data.sections.flatMap((s) => [s.heading, ...s.blocks.map((b) => b.text || (b.items || []).join(' '))]),
      ].join(' ');
      const post = {
        slug,
        title: data.title,
        badge: slot.badge,
        metaDescription: data.metaDescription,
        keywords: data.keywords,
        intro: data.intro,
        sections: data.sections,
        ctaText: data.ctaText,
        datePublished,
        dateModified: datePublished,
        readingMinutes: article.readingMinutes(words, cfg.WORDS_PER_MINUTE),
        excerpt: buildExcerpt(data),
        imageHref: 'images/placeholder.svg',
        related,
      };
      const image = await images.findHeroImage({ query: data.imageQuery, slug, badge: slot.badge, cfg, pexelsKey });
      post.imageHref = image.href;
      post.image = image;
      const html = article.renderArticleHtml(post, cfg);
      const dir = path.join(cfg.BLOG_DIR, slug);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'index.html'), html);
      generated.push(post);
      log(`Generated ${slug} (${slot.badge})`);
    } catch (err) {
      failures.push({ slot: slot.id, error: err.message });
      log(`FAILED ${slot.id}: ${err.message}`);
    }
  }

  if (!generated.length) {
    throw new Error(`0 of ${cfg.SLOTS.length} posts generated. Failures: ${failures.map((f) => `${f.slot}: ${f.error}`).join('; ')}`);
  }

  state.recordSlugs(st, generated.map((p) => p.slug), cfg);
  for (const [cat, items] of headlines) {
    if (items.length) {
      state.recordHeadlines(st, items.slice(0, 3).map((h) => ({ title: h.title, date: h.pubDate || todayIso() })), cfg);
    }
  }
  state.saveState(cfg, st);

  const allPosts = [...posts, ...generated];
  state.writePosts(cfg, allPosts);
  updater.updateBlogIndex(cfg, allPosts);
  updater.updateSitemap(cfg, allPosts);
  log(`Updated blog index + sitemap with ${allPosts.length} posts`);
  return { generated, failures, model };
}

module.exports = { runPipeline, buildExcerpt, todayIso };

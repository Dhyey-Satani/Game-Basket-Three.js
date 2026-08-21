// blog-automation/test/runner.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const runner = require('../src/runner');

function tmpCfg() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-run-'));
  const blogDir = path.join(dir, 'blog');
  fs.mkdirSync(path.join(blogDir, 'images'), { recursive: true });
  fs.writeFileSync(path.join(blogDir, 'index.html'), '<div class="grid" id="articles-grid">\n<!-- AUTO-POSTS:START -->OLD<!-- AUTO-POSTS:END -->\n</div>\n');
  fs.writeFileSync(path.join(dir, 'sitemap.xml'), '<?xml version="1.0"?>\n<urlset/>\n');
  return {
    BLOG_DIR: blogDir,
    SITE_URL: 'https://dhyey.bond',
    BLOG_PATH: '/blog/',
    STATE_FILE: path.join(dir, 'state.json'),
    POSTS_FILE: path.join(dir, 'posts.json'),
    RECENT_WINDOW_DAYS: 30,
    WORDS_PER_MINUTE: 200,
    SLOTS: [
      { id: 'baseball-news', type: 'news', category: 'baseball', badge: 'Baseball News' },
      { id: 'baseball-guide', type: 'evergreen', category: 'baseball', badge: 'Baseball Guide' },
      { id: 'esports-news', type: 'news', category: 'esports', badge: 'Esports News' },
      { id: 'esports-guide', type: 'evergreen', category: 'esports', badge: 'Esports Guide' },
      { id: 'current-events', type: 'news', category: 'current', badge: 'Current Events' },
    ],
    EVERGREEN_TOPICS: {
      baseball: ['topic b1', 'topic b2'],
      esports: ['topic e1', 'topic e2'],
    },
    RSS_FEEDS: {
      baseball: ['https://fb.example'],
      esports: ['https://fe.example'],
      current: ['https://fc.example'],
    },
    FALLBACK_MODELS: ['fallback-model'],
  };
}

const failingContent = JSON.stringify({ title: '', metaDescription: '', keywords: [], imageQuery: '', intro: '', ctaText: '', sections: [] });

test('todayIso returns YYYY-MM-DD', () => {
  assert.match(runner.todayIso(), /^\d{4}-\d{2}-\d{2}$/);
});

test('runPipeline generates posts and commits partial successes', async () => {
  const cfg = tmpCfg();
  const realRss = require('../src/rss');
  const originalFetchRss = realRss.fetchRss;
  let calls = 0;
  realRss.fetchRss = async (c, cat) => ({ source: 'https://x', headlines: [{ title: `Headline ${cat} ${calls++}`, link: 'https://x', pubDate: '2026-08-18T00:00:00Z' }] });
  const realModels = require('../src/models');
  const originalPick = realModels.pickBestModel;
  realModels.pickBestModel = async () => ({ id: 'best', name: 'Best', context_length: 100000, score: 1, costPer1k: 0 });

  let chatCalls = 0;
  const originalChat = require('../src/content').chatCompletion;
  require('../src/content').chatCompletion = async () => {
    chatCalls += 1;
    if (chatCalls === 2) return failingContent;
    const title = `Great Baseball Story Number ${chatCalls}`;
    return JSON.stringify({
      title,
      metaDescription: `${title} with a keyword inside the description.`,
      keywords: ['baseball', 'story'],
      imageQuery: 'baseball',
      intro: 'This is the intro hook for the article body.',
      ctaText: 'Play our game now.',
      sections: [
        { heading: 'The Story', blocks: [{ type: 'p', text: 'A good paragraph about baseball.' }] },
        { heading: 'The Details', blocks: [{ type: 'ul', items: ['One', 'Two'] }] },
      ],
    });
  };

  const realImages = require('../src/images');
  const originalFind = realImages.findHeroImage;
  realImages.findHeroImage = async ({ slug, badge, cfg: c }) => {
    const absPath = path.join(c.BLOG_DIR, 'images', `${slug}.svg`);
    fs.writeFileSync(absPath, '<svg/>');
    return { href: `images/${slug}.svg`, absPath, alt: badge, photographer: '', photographerUrl: '', credit: '', kind: 'svg' };
  };

  const log = [];
  try {
    const result = await runner.runPipeline(cfg, { apiKeys: ['k'], pexelsKey: '', log: (m) => log.push(m) });
    assert.strictEqual(result.generated.length, 4, 'one slot should fail, four succeed');
    assert.strictEqual(result.failures.length, 1);
    assert.strictEqual(result.failures[0].slot, 'baseball-guide');
    for (const p of result.generated) {
      assert.ok(fs.existsSync(path.join(cfg.BLOG_DIR, p.slug, 'index.html')));
    }
    const indexHtml = fs.readFileSync(path.join(cfg.BLOG_DIR, 'index.html'), 'utf8');
    assert.ok(indexHtml.includes('Great Baseball Story'));
    const sitemap = fs.readFileSync(path.join(cfg.BLOG_DIR, '..', 'sitemap.xml'), 'utf8');
    assert.ok(sitemap.includes('great-baseball-story'));
    const posts = JSON.parse(fs.readFileSync(cfg.POSTS_FILE, 'utf8'));
    assert.strictEqual(posts.length, 4);
    const st = JSON.parse(fs.readFileSync(cfg.STATE_FILE, 'utf8'));
    assert.ok(st.recentSlugs.length === 4);
  } finally {
    realRss.fetchRss = originalFetchRss;
    realModels.pickBestModel = originalPick;
    require('../src/content').chatCompletion = originalChat;
    realImages.findHeroImage = originalFind;
  }
});

test('runPipeline throws when zero posts generated', async () => {
  const cfg = tmpCfg();
  const realRss = require('../src/rss');
  const originalFetchRss = realRss.fetchRss;
  realRss.fetchRss = async () => ({ source: 'https://x', headlines: [{ title: 'H', link: 'x', pubDate: '2026-08-18' }] });
  const realModels = require('../src/models');
  const originalPick = realModels.pickBestModel;
  realModels.pickBestModel = async () => ({ id: 'best', name: 'Best', context_length: 100000 });
  const originalChat = require('../src/content').chatCompletion;
  require('../src/content').chatCompletion = async () => failingContent;
  try {
    await assert.rejects(() => runner.runPipeline(cfg, { apiKeys: ['k'], pexelsKey: '' }), /0 of 5 posts generated/);
  } finally {
    realRss.fetchRss = originalFetchRss;
    realModels.pickBestModel = originalPick;
    require('../src/content').chatCompletion = originalChat;
  }
});

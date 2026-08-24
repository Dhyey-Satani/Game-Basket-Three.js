'use strict';
const path = require('node:path');

const AUTO_DIR = __dirname;

module.exports = {
  AUTO_DIR,
  BLOG_DIR: path.resolve(AUTO_DIR, '..', 'blog'),
  SITE_URL: 'https://dhyey.bond',
  BLOG_PATH: '/blog/',
  STATE_FILE: path.join(AUTO_DIR, 'state.json'),
  POSTS_FILE: path.join(AUTO_DIR, 'posts.json'),

  OPENROUTER_CHAT_URL: 'https://openrouter.ai/api/v1/chat/completions',
  OPENROUTER_MODELS_URL: 'https://openrouter.ai/api/v1/models',
  OPENROUTER_POPULAR_URL:
    'https://openrouter.ai/api/frontend/models/find?fmt=cards&input_modalities=text&max_price=0&order=most-popular',

  MAX_COST_PER_1K_TOKENS: 0.0008,
  MIN_CONTEXT_LENGTH: 32000,
  MAX_OUTPUT_TOKENS: 4000,
  RETRY_ATTEMPTS: 2,
  FETCH_TIMEOUT_MS: 20000,
  RSS_TIMEOUT_MS: 10000,
  RECENT_WINDOW_DAYS: 30,
  WORDS_PER_MINUTE: 200,
  MODEL_TEMPERATURE: 0.7,

  FALLBACK_MODELS: [
'arcee-ai/trinity-large-preview:free',
    'meta-llama/llama-3.3-70b-instruct:free',
    'google/gemma-3-27b-it:free',
    'deepseek/deepseek-r1:free',
    'mistralai/mistral-7b-instruct:free',
    'microsoft/phi-3-mini-128k-instruct:free',
    'nousresearch/hermes-3-llama-3.1-405b:free',
  ],

  PREFERRED_PREFIXES: [
    'openai/', 'anthropic/', 'google/', 'meta-llama/', 'deepseek/', 'qwen/',
    'mistralai/', 'x-ai/', 'z-ai/', 'moonshotai/', 'nvidia/', 'allenai/', 'cohere/',
  ],

   PREFERRED_FREE_PREFIXES: [
    'google/gemma', 'z-ai/glm', 'qwen/', 'deepseek/', 'meta-llama/', 'mistralai/',
    'moonshotai/', 'openai/', 'arcee-ai/', 'nousresearch/', 'microsoft/',
  ],

  RSS_FEEDS: {
    baseball: [
      'https://www.espn.com/espn/rss/mlb/news',
      'https://www.mlb.com/feeds/news/rss.xml',
    ],
    esports: [
      'https://www.espn.com/espn/rss/esports/news',
      'https://www.hltv.org/rss/news',
    ],
    current: [
      'http://feeds.bbci.co.uk/news/rss.xml',
      'https://www.espn.com/espn/rss/news',
    ],
  },

  EVERGREEN_TOPICS: {
    baseball: [
      'best baseball gloves 2026',
      'baseball batting drills to fix your swing',
      'baseball rules explained for new fans',
      'baseball pitching mechanics fundamentals',
      'baseball practice plans for young teams',
      'baseball workout routines for players',
    ],
    esports: [
      'esports team roles explained',
      'best esports games to watch',
      'esports training routine for beginners',
      'esports peripherals guide',
      'esports tournaments explained',
      'how to go pro in esports',
    ],
  },

  SLOTS: [
    { id: 'baseball-news', type: 'news', category: 'baseball', badge: 'Baseball News' },
    { id: 'baseball-guide', type: 'evergreen', category: 'baseball', badge: 'Baseball Guide' },
    { id: 'esports-news', type: 'news', category: 'esports', badge: 'Esports News' },
    { id: 'esports-guide', type: 'evergreen', category: 'esports', badge: 'Esports Guide' },
    { id: 'current-events', type: 'news', category: 'current', badge: 'Current Events' },
  ],
};

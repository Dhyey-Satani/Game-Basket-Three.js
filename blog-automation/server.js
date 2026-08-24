// blog-automation/server.js
'use strict';
// DEV-ONLY server. Never run in CI. CI uses `node src/cli.js`.
require('dotenv').config();
const express = require('express');
const cfg = require('./config');
const { runPipeline } = require('./src/runner');

const app = express();
app.use(express.json());

let lastRun = null;

function keys() {
  return [process.env.OPENROUTER_API_KEY_1, process.env.OPENROUTER_API_KEY_2].filter(Boolean);
}

app.get('/api/status', (req, res) => {
  res.json({ ok: true, lastRun, now: new Date().toISOString() });
});

app.post('/api/generate', async (req, res) => {
  const apiKeys = keys();
  if (!apiKeys.length) return res.status(400).json({ error: 'OpenRouter API key not configured.' });
  try {
    const result = await runPipeline(cfg, { apiKeys, pexelsKey: process.env.PEXELS_API_KEY || '' });
    lastRun = { at: new Date().toISOString(), generated: result.generated.map((p) => p.slug), failures: result.failures };
    res.json({ generated: result.generated.map((p) => p.slug), failures: result.failures, model: result.model });
  } catch (err) {
    lastRun = { at: new Date().toISOString(), error: err.message };
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/models', async (req, res) => {
  const apiKeys = keys();
  if (!apiKeys.length) return res.status(400).json({ error: 'OpenRouter API key not configured.' });
  try {
   const models = require('./src/models');
    const { v1Models } = await models.fetchModels(apiKeys, cfg);
    const free = models.filterFreeCandidates(v1Models, cfg)
      .sort((a, b) => models.scoreFreeModel(b, cfg) - models.scoreFreeModel(a, cfg))
      .slice(0, 30)
      .map((m) => ({ id: m.id, name: m.name, contextLength: m.context_length || null, isFree: true }));
    const selected = await models.pickBestModel(apiKeys, cfg);
    res.json({
      source: 'openrouter-v1',
      free,
      selected: { id: selected.id, name: selected.name, contextLength: selected.context_length, source: selected.source },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const port = process.env.PORT || 3050;
if (require.main === module) {
  app.listen(port, () => console.log(`Blog automation dev server on :${port}`));
}

module.exports = app;

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
    const { fetchModels, filterCandidates, scoreModel } = require('./src/models');
    const { v1Models, popularMap } = await fetchModels(apiKeys, cfg);
    const ranked = filterCandidates(v1Models, cfg)
      .sort((a, b) => scoreModel(b, popularMap, cfg) - scoreModel(a, popularMap, cfg))
      .slice(0, 10)
      .map((m) => ({ id: m.id, name: m.name, score: scoreModel(m, popularMap, cfg) }));
    res.json({ models: ranked });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const port = process.env.PORT || 3050;
if (require.main === module) {
  app.listen(port, () => console.log(`Blog automation dev server on :${port}`));
}

module.exports = app;

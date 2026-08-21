// blog-automation/src/cli.js
'use strict';
require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env') });
const cfg = require('../config');
const { runPipeline } = require('./runner');

async function main() {
  const apiKeys = [process.env.OPENROUTER_API_KEY_1, process.env.OPENROUTER_API_KEY_2].filter(Boolean);
  const pexelsKey = process.env.PEXELS_API_KEY || '';
  const log = (m) => console.log(`[${new Date().toISOString()}] ${m}`);
  if (!apiKeys.length) {
    console.error('ERROR: set OPENROUTER_API_KEY_1 (or OPENROUTER_API_KEY_2) in blog-automation/.env or the environment');
    process.exit(1);
  }
  if (!pexelsKey) log('WARNING: PEXELS_API_KEY not set; using SVG fallback images');
  const start = Date.now();
  const result = await runPipeline(cfg, { apiKeys, pexelsKey, log });
  log(`DONE: ${result.generated.length} posts generated, ${result.failures.length} failed in ${((Date.now() - start) / 1000).toFixed(1)}s`);
  if (result.failures.length) {
    log(`Failures: ${result.failures.map((f) => `${f.slot}: ${f.error}`).join('; ')}`);
  }
  process.exit(result.generated.length ? 0 : 1);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`[${new Date().toISOString()}] FATAL:`, err);
    process.exit(1);
  });
}

module.exports = { main };

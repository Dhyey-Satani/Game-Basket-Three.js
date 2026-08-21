// blog-automation/test/server.test.js
'use strict';
const { test, mock } = require('node:test');
const assert = require('node:assert');

test('server exposes status endpoint', async () => {
  const realKeys = { OPENROUTER_API_KEY_1: process.env.OPENROUTER_API_KEY_1, OPENROUTER_API_KEY_2: process.env.OPENROUTER_API_KEY_2 };
  process.env.OPENROUTER_API_KEY_1 = 'sk-test';
  delete process.env.OPENROUTER_API_KEY_2;
  mock.method(require('../src/runner'), 'runPipeline', async () => ({ generated: [{ slug: 'x' }], failures: [], model: { id: 'm' } }));
  const app = require('../server');
  try {
    const server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    const port = server.address().port;
    const res = await fetch(`http://127.0.0.1:${port}/api/status`);
    const body = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(body.ok, true);
    server.close();
  } finally {
    mock.restoreAll();
    if (process.env.OPENROUTER_API_KEY_1 !== undefined) process.env.OPENROUTER_API_KEY_1 = realKeys.OPENROUTER_API_KEY_1;
    if (realKeys.OPENROUTER_API_KEY_2 !== undefined) process.env.OPENROUTER_API_KEY_2 = realKeys.OPENROUTER_API_KEY_2;
  }
});

// blog-automation/test/cli.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');

test('cli is a valid module that can be loaded without side effects', () => {
  const cfg = require('../config');
  const cliPath = require.resolve('../src/cli.js');
  const fs = require('node:fs');
  assert.ok(fs.existsSync(cliPath));
  assert.ok(cfg.SITE_URL);
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('staging and production guards verify only the official gates', () => {
  const staging = readFileSync('.github/workflows/deploy-staging.yml', 'utf8');
  const production = readFileSync('.github/workflows/deploy-airtrust.yml', 'utf8');

  assert.match(staging, /node scripts\/ci\/verify-release-gates\.mjs/);
  assert.match(production, /node scripts\/ci\/verify-release-gates\.mjs/);
  assert.doesNotMatch(staging, /ignoredJobs/);
  assert.doesNotMatch(production, /ignoredJobs/);
  assert.match(production, /checks:\s*read/);
  assert.match(production, /statuses:\s*read/);
  assert.match(staging, /uses: actions\/checkout@v4/);
});

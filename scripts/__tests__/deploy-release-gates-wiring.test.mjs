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
  assert.match(production, /validate-production-release-candidate\.mjs/);
  assert.ok(production.includes('RELEASE_SHA: ${{ inputs.expected_sha }}'));
  assert.ok(production.includes('ref: ${{ inputs.expected_sha }}'));
  assert.match(production, /fetch-depth: 0/);
  assert.match(production, /concurrency:[\s\S]*group: deploy-airtrust-production/);

  assert.match(production, /statuses:\s*read/);
  assert.match(staging, /uses: actions\/checkout@v7/);
});

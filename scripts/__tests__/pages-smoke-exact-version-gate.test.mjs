import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('deploy-airtrust.yml Smoke Pages step enforces exact expected APP_VERSION match across retry window', () => {
  const source = readFileSync('.github/workflows/deploy-airtrust.yml', 'utf8');

  // Extract Smoke Pages step
  const smokePagesStart = source.indexOf('- name: Smoke Pages');
  assert.ok(smokePagesStart >= 0, 'Smoke Pages step missing');
  const nextStepIndex = source.indexOf('- name: Write pages summary', smokePagesStart);
  assert.ok(nextStepIndex > smokePagesStart, 'Write pages summary step missing');
  const smokePagesBlock = source.slice(smokePagesStart, nextStepIndex);

  // Must pass EXPECTED_APP_VERSION from needs.guard.outputs.app_version
  assert.match(smokePagesBlock, /EXPECTED_APP_VERSION:\s*\$\{\{\s*needs\.guard\.outputs\.app_version\s*\}\}/);

  // Must check exact equality with EXPECTED_APP_VERSION
  assert.match(smokePagesBlock, /"\$current_version"\s*==\s*"\$EXPECTED_APP_VERSION"/);

  // Must fail if not matched within propagation window
  assert.match(smokePagesBlock, /if\s*\[\[\s*"\$matched"\s*-ne\s*1\s*\]\];\s*then/);
  assert.match(smokePagesBlock, /exit\s+1/);

  // Must maintain /sw.js check
  assert.match(smokePagesBlock, /PAGES_SW_URL/);
  assert.match(smokePagesBlock, /url\.pathname === '\/sw\.js'/);
});

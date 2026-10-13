import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

const workflow = readFileSync(resolve(import.meta.dirname, '../../.github/workflows/staging-audit-201-ui-qa.yml'), 'utf8');

test('staging browser QA accepts only a previously gated commit in main ancestry', () => {
  assert.match(workflow, /EVENT_REF.*github\.ref/);
  assert.match(workflow, /MAIN_ONLY/);
  assert.match(workflow, /RELEASE_SHA_NOT_MAIN_ANCESTOR/);
  assert.match(workflow, /git merge-base --is-ancestor "\$EXPECTED_SHA" "\$EVENT_SHA"/);
  assert.match(workflow, /node scripts\/ci\/verify-release-gates\.mjs/);
  assert.match(workflow, /fetch-depth: 0/);
  assert.doesNotMatch(workflow, /EXPECTED_SHA_NOT_CURRENT_MAIN/);
});

test('browser QA pins both runtime components before and after traversal', () => {
  assert.match(workflow, /STAGING_WORKER_SHA_MISMATCH/);
  assert.match(workflow, /STAGING_FRONTEND_SHA_MISMATCH/);
  assert.match(workflow, /POST_AUDIT_WORKER_SHA_CHANGED/);
  assert.match(workflow, /POST_AUDIT_FRONTEND_SHA_CHANGED/);
  assert.match(workflow, /Authenticated Cross-Module Browser Audit/);
  assert.match(workflow, /staging-audit-201\.spec\.ts/);
  assert.match(workflow, /environment: staging/);
  assert.doesNotMatch(workflow, /--project=production|BASE_URL: https:\/\/airtrust\.online/);
});

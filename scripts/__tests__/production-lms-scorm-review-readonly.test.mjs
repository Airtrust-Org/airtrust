import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow = fs.readFileSync(
  new URL('../../.github/workflows/production-lms-scorm-review-readonly.yml', import.meta.url),
  'utf8',
);
const script = fs.readFileSync(
  new URL('../validation/production-lms-scorm-review-readonly.mjs', import.meta.url),
  'utf8',
);

test('production enrollment review pins the live SHA and canonical release gates', () => {
  assert.match(workflow, /GITHUB_REF.*refs\/heads\/main/);
  assert.match(workflow, /verify-release-gates\.mjs/);
  assert.match(workflow, /git merge-base --is-ancestor/);
  assert.match(workflow, /api\/version/);
  assert.match(workflow, /AIRTRUST_PRODUCTION_SCORM_REVIEW_READONLY/);
  assert.match(workflow, /fetch-depth:\s*0/);
});

test('active candidate can be resolved from the tenant-scoped enrollment read', () => {
  assert.match(script, /\/api\/lms\/matriculas\/\$\{matricula\}/);
  assert.match(script, /activePrefix:\s*enrollment\.scorm_package_r2_prefix/);
  assert.match(script, /EXPECTED_CANDIDATE_ID\s*\|\|\s*'auto'/);
});

test('real-player review blocks all non-read HTTP requests and never targets SCORM commit', () => {
  assert.match(script, /\/api\/lms\/assets\/session/);
  assert.match(script, /\/api\/lms\/scorm\/launch\/\$\{matricula\}/);
  assert.match(script, /import \{ chromium \} from '@playwright\/test'/);
  assert.match(script, /context\.route\('\*\*\/\*'/);
  assert.match(script, /await route\.abort\('blockedbyclient'\)/);
  assert.doesNotMatch(script, /\/api\/lms\/matriculas\/scorm\/commit/);
  assert.doesNotMatch(script, /LMSSetValue|LMSCommit|LMSFinish|cmi\.core\.lesson_status/);
  assert.match(script, /writes:\s*'none/);
});

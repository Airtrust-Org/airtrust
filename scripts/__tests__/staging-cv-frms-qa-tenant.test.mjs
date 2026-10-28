import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const workflow = readFileSync('.github/workflows/staging-cv-frms-coordination-readonly.yml', 'utf8');
const browser = readFileSync('e2e/staging-cv-frms-coordination-readonly.spec.ts', 'utf8');

test('CV/FRMS QA uses the existing examiner staging credential pair, not generic smoke tenant', () => {
  for (const name of ['QA_EXAMINER_ADMIN_EMAIL', 'QA_EXAMINER_ADMIN_PASSWORD']) {
    assert.match(workflow, new RegExp('secrets\\.' + name));
    assert.match(browser, new RegExp('process\\.env\\.' + name));
  }
  assert.doesNotMatch(workflow, /secrets\\.STAGING_SMOKE_(?:EMAIL|PASSWORD)/);
  assert.doesNotMatch(browser, /process\\.env\\.STAGING_SMOKE_(?:EMAIL|PASSWORD)/);
});

test('CV/FRMS QA pins the existing synthetic examiner identity', () => {
  assert.match(workflow, /qa-examiner-admin@staging\\.airtrust\\.invalid/);
  assert.match(browser, /CV_FRMS_ISOLATED_EXAMINER_IDENTITY_MISSING/);
  assert.match(workflow, /tenant 999006/);
  assert.match(browser, /tenant 999006/);
});

test('CV/FRMS QA retains release and staging read-only guards', () => {
  assert.match(workflow, /expected_deployed_sha/);
  assert.match(workflow, /verify-release-gates\\.mjs/);
  assert.match(workflow, /STAGING_WORKER_SHA_MISMATCH/);
  assert.match(workflow, /STAGING_PAGES_SHA_MISMATCH/);
  assert.match(workflow, /airtrust-staging-mutations-and-scorm-qa/);
  assert.match(browser, /installReadOnlyGuard\\(page\\)/);
  assert.match(browser, /guard\\.assertClean\\(\\)/);
  assert.doesNotMatch(workflow, /wrangler d1 execute|migrations apply|seed-/i);
});

test('CV/FRMS QA still requires real operational crew and rejects sensitive payloads', () => {
  assert.match(browser, /CV_FRMS_STAGING_CREW_FIXTURE_MISSING/);
  assert.match(browser, /CV_FRMS_CLASSIFIED_DAILY_INDICATOR_FIXTURE_MISSING/);
  assert.match(browser, /kss_score\\|horas_sono\\|wake_time/);
  assert.match(browser, /CV_FRMS_STAGING_READONLY_VERIFIED/);
});

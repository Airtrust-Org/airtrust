import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const workflow = readFileSync('.github/workflows/staging-cv-frms-coordination-readonly.yml', 'utf8');
const browser = readFileSync('e2e/staging-cv-frms-coordination-readonly.spec.ts', 'utf8');

test('CV/FRMS QA uses the existing examiner staging credential pair, not generic smoke tenant', () => {
  for (const name of ['QA_EXAMINER_ADMIN_EMAIL', 'QA_EXAMINER_ADMIN_PASSWORD']) {
    assert.ok(workflow.includes('secrets.' + name));
    assert.ok(browser.includes('process.env.' + name));
  }
  assert.ok(!workflow.includes('secrets.STAGING_SMOKE_'));
  assert.ok(!browser.includes('process.env.STAGING_SMOKE_'));
});

test('CV/FRMS QA pins the existing synthetic examiner identity', () => {
  assert.ok(workflow.includes('qa-examiner-admin@staging.airtrust.invalid'));
  assert.ok(browser.includes('CV_FRMS_ISOLATED_EXAMINER_IDENTITY_MISSING'));
  assert.ok(workflow.includes('tenant 999006'));
  assert.ok(browser.includes('tenant 999006'));
});

test('CV/FRMS QA retains release and staging read-only guards', () => {
  for (const token of ['expected_deployed_sha', 'verify-release-gates.mjs',
    'STAGING_WORKER_SHA_MISMATCH', 'STAGING_PAGES_SHA_MISMATCH',
    'airtrust-staging-mutations-and-scorm-qa']) assert.ok(workflow.includes(token));
  assert.ok(browser.includes('installReadOnlyGuard(page)'));
  assert.ok(browser.includes('guard.assertClean()'));
  assert.ok(!/wrangler d1 execute|migrations apply|seed-/i.test(workflow));
});

test('CV/FRMS QA still requires real operational crew and rejects sensitive payloads', () => {
  for (const token of ['CV_FRMS_STAGING_CREW_FIXTURE_MISSING',
    'CV_FRMS_CLASSIFIED_DAILY_INDICATOR_FIXTURE_MISSING',
    'kss_score|horas_sono|wake_time', 'CV_FRMS_STAGING_READONLY_VERIFIED'])
    assert.ok(browser.includes(token));
});

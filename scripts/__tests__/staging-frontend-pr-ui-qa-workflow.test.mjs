import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../..');
const workflow = readFileSync(
  resolve(root, '.github/workflows/staging-frontend-pr-ui-qa.yml'),
  'utf8',
);
const summarizer = readFileSync(
  resolve(root, 'scripts/ci/frontend-pr-qa-summarize.mjs'),
  'utf8',
);
const spec = readFileSync(
  resolve(root, 'e2e/frontend-pr-ui-qa/destructive-actions.spec.ts'),
  'utf8',
);
const matcher = readFileSync(
  resolve(root, 'e2e/lib/synthetic-fixture-matcher.mjs'),
  'utf8',
);

test('BLOCKER A — an explicit final-status enforcement step exists', () => {
  assert.match(workflow, /name: Require final QA status PASS/);
  assert.match(workflow, /frontend-pr-ui-qa-final-summary\.json/);
  assert.match(workflow, /STAGING_FRONTEND_PR_UI_QA_BLOCKED/);
  assert.match(workflow, /STAGING_FRONTEND_PR_UI_QA_FAILED/);
  // fail-closed on any non-PASS / unknown status
  assert.match(workflow, /STAGING_FRONTEND_PR_UI_QA_STATUS_UNEXPECTED/);
  assert.match(workflow, /STAGING_FRONTEND_PR_UI_QA_NO_FINAL_SUMMARY/);
});

test('BLOCKER A — enforcement runs AFTER the evidence upload so BLOCKED/FAIL still keep artifacts', () => {
  const uploadIdx = workflow.indexOf('name: Upload sanitized QA evidence');
  const enforceIdx = workflow.indexOf('name: Require final QA status PASS');
  assert.ok(uploadIdx > 0, 'upload step present');
  assert.ok(enforceIdx > uploadIdx, 'enforcement step comes after the artifact upload');
});

test('BLOCKER A — only PASS is allowed through; BLOCKED and FAIL exit non-zero', () => {
  const step = workflow.slice(workflow.indexOf('name: Require final QA status PASS'));
  // PASS branch prints the pass marker and does not exit non-zero.
  assert.match(step, /PASS\)\s*\n\s*echo 'STAGING_FRONTEND_PR_UI_QA_PASS'/);
  // BLOCKED and FAIL branches both `exit 1`.
  assert.match(step, /BLOCKED\)\s*\n\s*echo 'STAGING_FRONTEND_PR_UI_QA_BLOCKED' >&2\s*\n\s*exit 1/);
  assert.match(step, /FAIL\)\s*\n\s*echo 'STAGING_FRONTEND_PR_UI_QA_FAILED' >&2\s*\n\s*exit 1/);
});

test('qa-result stays green only when guard AND ui-qa succeeded (enforcement folds into ui-qa)', () => {
  const job = workflow.slice(workflow.indexOf('qa-result:'));
  assert.match(job, /needs: \[guard, ui-qa\]/);
  assert.match(job, /\[\[ "\$GUARD" == 'success' \]\]/);
  assert.match(job, /\[\[ "\$UI_QA" == 'success' \]\]/);
});

test('BLOCKER E — the workflow validates credentials through the shared resolver, not a hard STAGING_SMOKE_* gate', () => {
  assert.match(workflow, /resolveCredentialPair\(process\.env\)/);
  assert.match(workflow, /credential profile validated/);
  // must NOT hard-require the smoke pair when a complete admin pair exists
  assert.doesNotMatch(workflow, /STAGING_SMOKE_EMAIL_MISSING/);
  assert.doesNotMatch(workflow, /STAGING_SMOKE_PASSWORD_MISSING/);
  // every present secret is masked
  assert.match(workflow, /::add-mask::\$v/);
});

test('BLOCKER D — the workflow re-assertion uses the exact staging build-version matcher', () => {
  assert.match(workflow, /matchesStagingBuildVersion\(p\.frontendBuildVersion, short\)/);
  assert.doesNotMatch(workflow, /frontendBuildVersion \|\| ''\)\.toLowerCase\(\)\.includes\(short\)/);
});

test('the guard job runs the workflow-contract test alongside the unit tests', () => {
  assert.match(workflow, /scripts\/__tests__\/staging-frontend-pr-ui-qa-workflow\.test\.mjs/);
});

test('no production identifier is ever a live target in the pipeline', () => {
  assert.doesNotMatch(workflow, /https:\/\/api\.airtrust\.online/);
  assert.doesNotMatch(workflow, /https:\/\/airtrust-api\.airtrust\.workers\.dev/);
});

test('BLOCKER J — the summarizer never hard-codes authentication: REAL_STAGING', () => {
  assert.doesNotMatch(summarizer, /authentication:\s*'REAL_STAGING'/);
  assert.doesNotMatch(summarizer, /authentication:\s*"REAL_STAGING"/);
  // absence must stay absence — no `?? 'REAL_STAGING'` style default
  assert.doesNotMatch(summarizer, /q\.authentication\s*\?\?\s*['"]REAL_STAGING['"]/);
  assert.match(summarizer, /typeof q\.authentication === 'string'/);
});

test('the guard job type-checks and runs the synthetic-fixture matcher tests', () => {
  assert.match(workflow, /e2e\/lib\/synthetic-fixture-matcher\.mjs/);
  assert.match(workflow, /e2e\/lib\/synthetic-fixture-matcher\.test\.mjs/);
});

test('BLOCKER K — no generic fixture/synthetic word is matched without an explicit QA prefix anchor', () => {
  // the matcher module itself must anchor on an explicit QA prefix
  assert.match(matcher, /\^\\s\*\(\?:\\\[QA\\\]\|QA\(\?:\\s\+\|\[_-\]/);
  // the spec must consume the shared matcher, not its own ad-hoc broad regex
  assert.match(spec, /isSyntheticQaFixtureLabel/);
  assert.doesNotMatch(spec, /\/qa\[_\\s-\]\?sint\|qa\[_\\s-\]\?synthetic\|synthetic\|fixture/);
  assert.doesNotMatch(spec, /SYNTHETIC_FIXTURE_PATTERN\s*=\s*\/[^/]*\bfixture\b[^/]*\/[a-z]*;?\s*$/m);
});


test('runtime regression — early Playwright failure still creates a sanitized summary path', () => {
  const buildSummary = workflow.slice(
    workflow.indexOf('name: Build sanitized final summary'),
    workflow.indexOf('name: Publish sanitized summary'),
  );
  assert.match(buildSummary, /mkdir -p "\$\(dirname "\$QA_SUMMARY_PATH"\)"/);
  assert.match(buildSummary, /if \[\[ ! -f "\$QA_SUMMARY_PATH" \]\]; then/);
  assert.match(buildSummary, /"status":"NO_SUMMARY"/);
});


test('canonical staging QA-space fixture names are accepted without widening mid-string matching', async () => {
  const { isSyntheticQaFixtureLabel } = await import(
    resolve(root, 'e2e/lib/synthetic-fixture-matcher.mjs')
  );
  assert.equal(isSyntheticQaFixtureLabel('QA Participante Alfa'), true);
  assert.equal(isSyntheticQaFixtureLabel('QA Instrutor Examinador'), true);
  assert.equal(isSyntheticQaFixtureLabel('Maria QA Silva'), false);
  assert.equal(isSyntheticQaFixtureLabel('QATar funcionário'), false);
});

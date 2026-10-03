import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const resolver = 'scripts/staging/resolve-training-compliance-qa-request.mjs';
const workflowPath = '.github/workflows/staging-training-compliance-qa.yml';

function run(env) {
  return spawnSync(process.execPath, [resolver], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

test('comment resolves exact single-line Training Compliance QA request', () => {
  const sha = 'a'.repeat(40);
  const result = run({
    EVENT_NAME: 'issue_comment',
    ISSUE_NUMBER: '1144',
    COMMENT_ACTOR: 'reviewer',
    GITHUB_ACTOR: 'reviewer',
    COMMENT_BODY: `AIRTRUST_STAGING_TRAINING_COMPLIANCE_QA ${sha}`,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^confirmation=AIRTRUST_STAGING_TRAINING_COMPLIANCE_QA$/m);
  assert.match(result.stdout, new RegExp(`^expected_deployed_sha=${sha}$`, 'm'));
  assert.match(result.stdout, /^pr_number=1144$/m);
  assert.match(result.stdout, /^request_source=issue_comment$/m);
});

test('comment rejects multiline, actor mismatch and malformed SHA', () => {
  const base = {
    EVENT_NAME: 'issue_comment',
    ISSUE_NUMBER: '1144',
    COMMENT_ACTOR: 'reviewer',
    GITHUB_ACTOR: 'reviewer',
    COMMENT_BODY: `AIRTRUST_STAGING_TRAINING_COMPLIANCE_QA ${'b'.repeat(40)}`,
  };
  const multiline = run({ ...base, COMMENT_BODY: `${base.COMMENT_BODY}\nextra` });
  assert.notEqual(multiline.status, 0);
  assert.match(multiline.stderr, /COMMENT_COMMAND_MUST_BE_SINGLE_LINE/);

  const mismatch = run({ ...base, COMMENT_ACTOR: 'someone-else' });
  assert.notEqual(mismatch.status, 0);
  assert.match(mismatch.stderr, /COMMENT_ACTOR_MISMATCH/);

  const malformed = run({ ...base, COMMENT_BODY: 'AIRTRUST_STAGING_TRAINING_COMPLIANCE_QA deadbeef' });
  assert.notEqual(malformed.status, 0);
  assert.match(malformed.stderr, /COMMENT_COMMAND_INVALID/);
});

test('workflow_dispatch remains supported and normalizes SHA case', () => {
  const upper = 'ABCDEF1234567890ABCDEF1234567890ABCDEF12';
  const result = run({
    EVENT_NAME: 'workflow_dispatch',
    INPUT_CONFIRMATION: 'AIRTRUST_STAGING_TRAINING_COMPLIANCE_QA',
    INPUT_EXPECTED_DEPLOYED_SHA: upper,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^expected_deployed_sha=abcdef1234567890abcdef1234567890abcdef12$/m);
  assert.match(result.stdout, /^request_source=workflow_dispatch$/m);
});

test('workflow preserves staging provenance guards and validates 0526', () => {
  const workflow = readFileSync(workflowPath, 'utf8');
  assert.match(workflow, /issue_comment:\s*\n\s*types:\s*\n\s*- created/);
  assert.match(workflow, /github\.event\.issue\.pull_request/);
  assert.match(workflow, /AIRTRUST_STAGING_TRAINING_COMPLIANCE_QA /);
  assert.match(workflow, /resolve-training-compliance-qa-request\.mjs/);
  assert.match(workflow, /ACTOR_PERMISSION_INSUFFICIENT/);
  assert.match(workflow, /STAGING_WORKER_SHA_MISMATCH/);
  assert.match(workflow, /assertLiveFrontendShaFromOrigin/);
  assert.match(workflow, /verify-release-gates\.mjs/);
  assert.match(workflow, /validate-0526-postconditions\.sh/);
  assert.match(workflow, /airtrust-db-staging-baseline-20260701/);
  assert.doesNotMatch(workflow, /api\.airtrust\.online/);
  assert.doesNotMatch(workflow, /airtrust-db-production/);
});

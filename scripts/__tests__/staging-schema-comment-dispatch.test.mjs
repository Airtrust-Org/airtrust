import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const resolver = 'scripts/staging/resolve-schema-change-request.mjs';
const workflowPath = '.github/workflows/staging-d1-schema-change.yml';

function run(env) {
  return spawnSync(process.execPath, [resolver], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

test('comment request resolves exact single-line staging command', () => {
  const sha = 'a'.repeat(40);
  const result = run({
    EVENT_NAME: 'issue_comment',
    ISSUE_NUMBER: '1234',
    COMMENT_ACTOR: 'reviewer',
    GITHUB_ACTOR: 'reviewer',
    COMMENT_BODY:
      `AIRTRUST_STAGING_SCHEMA_CHANGE 0526_training_compliance_matrix_alignment.sql ${sha} Apply reviewed 0526 in staging`,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^confirmation=AIRTRUST_STAGING_SCHEMA_CHANGE$/m);
  assert.match(result.stdout, /^pr_number=1234$/m);
  assert.match(result.stdout, new RegExp(`^release_sha=${sha}$`, 'm'));
  assert.match(result.stdout, /^approved_migration=0526_training_compliance_matrix_alignment\.sql$/m);
  assert.match(result.stdout, /^release_reason=Apply reviewed 0526 in staging$/m);
});

test('comment parser rejects multiline and actor mismatch', () => {
  const base = {
    EVENT_NAME: 'issue_comment',
    ISSUE_NUMBER: '1234',
    COMMENT_ACTOR: 'reviewer',
    GITHUB_ACTOR: 'reviewer',
    COMMENT_BODY:
      `AIRTRUST_STAGING_SCHEMA_CHANGE 0526_training_compliance_matrix_alignment.sql ${'b'.repeat(40)} reason`,
  };
  const multiline = run({ ...base, COMMENT_BODY: `${base.COMMENT_BODY}\nextra` });
  assert.notEqual(multiline.status, 0);
  assert.match(multiline.stderr, /COMMENT_COMMAND_MUST_BE_SINGLE_LINE/);

  const mismatch = run({ ...base, COMMENT_ACTOR: 'someone-else' });
  assert.notEqual(mismatch.status, 0);
  assert.match(mismatch.stderr, /COMMENT_ACTOR_MISMATCH/);
});

test('manual workflow request remains supported and normalized', () => {
  const sha = 'ABCDEF1234567890ABCDEF1234567890ABCDEF12';
  const result = run({
    EVENT_NAME: 'workflow_dispatch',
    INPUT_CONFIRMATION: 'AIRTRUST_STAGING_SCHEMA_CHANGE',
    INPUT_PR_NUMBER: '1137',
    INPUT_RELEASE_SHA: sha,
    INPUT_APPROVED_MIGRATION: '0526_training_compliance_matrix_alignment.sql',
    INPUT_RELEASE_REASON: '  governed   staging   apply  ',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^release_sha=abcdef1234567890abcdef1234567890abcdef12$/m);
  assert.match(result.stdout, /^release_reason=governed staging apply$/m);
});

test('workflow comment surface preserves all release and target guards', () => {
  const workflow = readFileSync(workflowPath, 'utf8');
  assert.match(workflow, /issue_comment:\s*\n\s*types:\s*\n\s*- created/);
  assert.match(workflow, /github\.event\.issue\.pull_request/);
  assert.match(workflow, /startsWith\(github\.event\.comment\.body, 'AIRTRUST_STAGING_SCHEMA_CHANGE '\)/);
  assert.match(workflow, /resolve-schema-change-request\.mjs/);
  assert.match(workflow, /PR_BASE_NOT_MAIN/);
  assert.match(workflow, /PR_FROM_FORK_REJECTED/);
  assert.match(workflow, /MERGED_PR_SHA_MISMATCH/);
  assert.match(workflow, /RELEASE_SHA_NOT_CURRENT_MAIN/);
  assert.match(workflow, /ACTOR_PERMISSION_INSUFFICIENT/);
  assert.match(workflow, /verify-release-gates\.mjs/);
  assert.match(workflow, /0526_training_compliance_matrix_alignment\.sql/);
  assert.match(workflow, /ALLOWED_STAGING_DB_ID: bf9963f4-eb12-439b-a830-20bbf577ac22/);
  assert.match(workflow, /BLOCKED_PRODUCTION_DB_ID: 7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae/);
  assert.match(workflow, /Production target rejected/);
  assert.match(workflow, /group: airtrust-staging-d1-schema-change/);
  assert.match(workflow, /APPROVED_MIGRATION: \$\{\{ needs\.guard\.outputs\.approved_migration \}\}/);
});

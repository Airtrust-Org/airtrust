import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const NAME = '0526_training_compliance_matrix_alignment.sql';
const read = (p) => readFileSync(p, 'utf8');

test('0526 is routed only through the governed staging release path', () => {
  const workflow = read('.github/workflows/staging-d1-schema-change.yml');
  const outer = read('scripts/staging/apply-approved-migrations.sh');
  const recovery = read('scripts/staging/apply-approved-migration-with-recovery-point.sh');
  assert.match(workflow, new RegExp(NAME.replaceAll('.', '\\.')));
  assert.match(outer, new RegExp(NAME.replaceAll('.', '\\.')));
  assert.match(recovery, new RegExp(NAME.replaceAll('.', '\\.')));
  assert.match(recovery, /validate-0526-preflight\.sh/);
  assert.match(recovery, /validate-0526-postconditions\.sh/);
});

test('0526 staging validators are staging-only and do not depend on unapplied 0525', () => {
  const pre = read('scripts/staging/validate-0526-preflight.sh');
  const post = read('scripts/staging/validate-0526-postconditions.sh');
  assert.match(pre, /airtrust-db-staging-baseline-20260701/);
  assert.match(post, /airtrust-db-staging-baseline-20260701/);
  assert.match(pre, /dependency-0524/);
  assert.doesNotMatch(pre, /dependency-0525/);
  assert.match(pre, /migration-ledger-0526-absent/);
  assert.match(post, /migration-ledger-0526/);
  assert.match(post, /inferred-new-assignments/);
});

test('0526 staging scripts are syntactically valid shell', () => {
  for (const file of [
    'scripts/staging/validate-0526-preflight.sh',
    'scripts/staging/validate-0526-postconditions.sh',
    'scripts/staging/apply-approved-migrations.sh',
    'scripts/staging/apply-approved-migration-with-recovery-point.sh',
  ]) execFileSync('bash', ['-n', file]);
});


test('0526 production Schema V2 workflow has explicit fail-closed validation', () => {
  const workflow = read('.github/workflows/apply-schema-change-v2.yml');
  const pre = read('scripts/schema-v2/validate-0526-production-preflight.sh');
  const post = read('scripts/schema-v2/validate-0526-production-postconditions.sh');
  assert.match(workflow, /training-compliance-matrix-alignment-0526/);
  assert.match(workflow, /validate-0526-production-preflight\.sh/);
  assert.match(workflow, /validate-0526-production-postconditions\.sh/);
  assert.match(pre, /dependency-0524/);
  assert.doesNotMatch(pre, /dependency-0525/);
  assert.match(pre, /unapplied-change/);
  assert.match(post, /schema-v2-change/);
  assert.match(pre, /--env production/);
  assert.match(post, /--env production/);
});

test('0526 production validators are syntactically valid shell', () => {
  execFileSync('bash', ['-n', 'scripts/schema-v2/validate-0526-production-preflight.sh']);
  execFileSync('bash', ['-n', 'scripts/schema-v2/validate-0526-production-postconditions.sh']);
});

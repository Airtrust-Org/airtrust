import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const NAME = '0529_training_compliance_loft_category_bootstrap.sql';
const read = (p) => readFileSync(p, 'utf8');

test('0529 is routed only through governed staging release paths', () => {
  const workflow = read('.github/workflows/staging-d1-schema-change.yml');
  const outer = read('scripts/staging/apply-approved-migrations.sh');
  const recovery = read('scripts/staging/apply-approved-migration-with-recovery-point.sh');
  assert.match(workflow, new RegExp(NAME.replaceAll('.', '\\.')));
  assert.match(outer, new RegExp(NAME.replaceAll('.', '\\.')));
  assert.match(recovery, new RegExp(NAME.replaceAll('.', '\\.')));
  assert.match(recovery, /validate-0529-preflight\.sh/);
  assert.match(recovery, /validate-0529-postconditions\.sh/);
});

test('0529 validators enforce prerequisite-only ordering and exact environments', () => {
  const pre = read('scripts/staging/validate-0529-preflight.sh');
  const post = read('scripts/staging/validate-0529-postconditions.sh');
  const prodPre = read('scripts/schema-v2/validate-0529-production-preflight.sh');
  const prodPost = read('scripts/schema-v2/validate-0529-production-postconditions.sh');
  assert.match(pre, /airtrust-db-staging-baseline-20260701/);
  assert.match(pre, /dependency-0524/);
  assert.match(pre, /reviewed-active-category/);
  assert.match(pre, /superseded-0527-unapplied/);
  assert.match(pre, /alignment-0526-unapplied/);
  assert.match(post, /alignment-0526-still-unapplied/);
  assert.match(prodPre, /--env production/);
  assert.match(prodPre, /training-compliance-loft-category-bootstrap-0529/);
  assert.match(prodPost, /schema-v2-change/);
});

test('0529 shell validators and routed apply scripts are syntactically valid', () => {
  for (const file of [
    'scripts/staging/validate-0529-preflight.sh',
    'scripts/staging/validate-0529-postconditions.sh',
    'scripts/schema-v2/validate-0529-production-preflight.sh',
    'scripts/schema-v2/validate-0529-production-postconditions.sh',
    'scripts/staging/apply-approved-migrations.sh',
    'scripts/staging/apply-approved-migration-with-recovery-point.sh',
  ]) execFileSync('bash', ['-n', file]);
});

test('0529 production Schema V2 workflow has explicit fail-closed pre/post validation', () => {
  const workflow = read('.github/workflows/apply-schema-change-v2.yml');
  assert.match(workflow, /training-compliance-loft-category-bootstrap-0529/);
  assert.match(workflow, /validate-0529-production-preflight\.sh/);
  assert.match(workflow, /validate-0529-production-postconditions\.sh/);
});

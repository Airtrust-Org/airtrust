import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../..');
const workflow = readFileSync(
  resolve(root, '.github/workflows/provision-staging-standard-identity.yml'),
  'utf8',
);

test('staging identity provisioning remains main-only and exact-D1 guarded', () => {
  assert.match(workflow, /refs\/heads\/main/);
  assert.match(workflow, /AIRTRUST_STAGING_IDENTITY/);
  assert.match(workflow, /airtrust-db-staging-baseline-20260701/);
  assert.doesNotMatch(workflow, /airtrust-db-production/);
});

test('examiner tenant seed is followed by fail-closed tenant/admin/employee postconditions', () => {
  const seedIdx = workflow.indexOf('name: Reseed synthetic QA examiner fixture');
  const verifyIdx = workflow.indexOf('name: Verify synthetic examiner tenant fixture postconditions');
  assert.ok(seedIdx >= 0, 'canonical examiner seed step exists');
  assert.ok(verifyIdx > seedIdx, 'postconditions run after examiner seed');
  assert.match(workflow, /qa_examiner_training/);
  assert.match(workflow, /QA Administrador Examinador/);
  assert.match(workflow, /QA-INSTRUTOR-EXAMINADOR/);
  assert.match(workflow, /QA-PARTICIPANTE-ALFA/);
  assert.match(workflow, /QA-PARTICIPANTE-BRAVO/);
  assert.match(workflow, /QA_EXAMINER_TENANT_COUNT_INVALID/);
  assert.match(workflow, /QA_EXAMINER_ADMIN_LINK_INVALID/);
  assert.match(workflow, /QA_EXAMINER_FUNCIONARIO_FIXTURE_COUNT_INVALID/);
  assert.match(workflow, /QA_EXAMINER_TENANT_FIXTURE_READY/);
});

test('provisioning workflow does not deploy application code or apply migrations', () => {
  assert.doesNotMatch(workflow, /wrangler\s+deploy/);
  assert.doesNotMatch(workflow, /pages\s+deploy/);
  assert.doesNotMatch(workflow, /migrations\s+apply/);
  assert.doesNotMatch(workflow, /deploy-staging\.yml/);
});

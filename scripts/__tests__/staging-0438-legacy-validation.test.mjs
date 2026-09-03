import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../..');
const workflow = readFileSync(resolve(root, '.github/workflows/staging-0438-legacy-validation.yml'), 'utf8');
const physical = readFileSync(resolve(root, 'scripts/staging/validate-0438-legacy-physical-state.sh'), 'utf8');
const tenant = readFileSync(resolve(root, 'scripts/staging/validate-0438-e2e-tenant-records.mjs'), 'utf8');

const forbiddenRemoteMutation = /\b(?:INSERT\s+INTO|UPDATE\s+[A-Za-z_]|DELETE\s+FROM|ALTER\s+TABLE|DROP\s+TABLE|CREATE\s+TABLE)\b/i;

test('0438 legacy workflow is staging-only and never reconciles schema ledgers', () => {
  assert.match(workflow, /AIRTRUST_STAGING_0438_LEGACY_VALIDATION/);
  assert.match(workflow, /airtrust-db-staging-baseline-20260701/);
  assert.match(workflow, /Require staging Worker provenance to match frozen SHA/);
  assert.match(workflow, /Schema V2 staging ledger reconciliation: intentionally NOT performed/);
  assert.doesNotMatch(workflow, /apply-schema-change-v2\.yml/);
  assert.doesNotMatch(workflow, /AIRTRUST_PRODUCTION/);
  assert.doesNotMatch(workflow, /apply_change/);
  assert.doesNotMatch(workflow, /build-0438-dual-ledger-apply/);
});

test('legacy physical validator requires exact historical divergence without writing', () => {
  assert.match(physical, /d1-ledger" 1/);
  assert.match(physical, /schema-v2-ledger-intentionally-absent" 0/);
  assert.match(physical, /active-baseline" 1/);
  assert.match(physical, /active-stage-duplicate-groups" 0/);
  assert.match(physical, /RDV_0438_SCHEMA_V2_LEDGER_RECONCILED=NO/);
  assert.doesNotMatch(physical, /--apply/);
  assert.doesNotMatch(physical, forbiddenRemoteMutation);
});

test('functional validation reuses full lifecycle, checks tenant records, and always cleans fixtures', () => {
  for (const operation of [
    'enviar_rdv',
    'iniciar_revisao',
    'devolver_rdv',
    'reenviar_rdv',
    'aprovar_rdv',
    'finalizar_rdv',
    'tenant_b_nao_acessa_rdv_tenant_a',
    'tenant_b_nao_acessa_abastecimentos_tenant_a',
  ]) {
    assert.match(workflow, new RegExp(operation));
  }
  assert.match(workflow, /validate-0438-e2e-tenant-records\.mjs/);
  assert.match(workflow, /cleanup-controle-voos-e2e-fixtures\.mjs/);
  assert.match(workflow, /if: \$\{\{ always\(\) \}\}/);
  assert.match(workflow, /rdv-0438-legacy-functional-evidence/);
  assert.doesNotMatch(tenant, /--apply/);
  assert.doesNotMatch(tenant, forbiddenRemoteMutation);
});

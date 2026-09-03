import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync('.github/workflows/staging-0438-legacy-validation-v2.yml', 'utf8');
const runner = readFileSync('scripts/staging/run-controle-voos-e2e-cas-v2.mjs', 'utf8');
const cleanup = readFileSync('scripts/staging/cleanup-controle-voos-e2e-fixtures-v2.mjs', 'utf8');
const orphan = readFileSync('scripts/staging/cleanup-controle-voos-e2e-orphan-run-v2.mjs', 'utf8');

test('0438 validation v2 stays staging-only and has no schema apply path', () => {
  assert.match(workflow, /AIRTRUST_STAGING_0438_LEGACY_VALIDATION_V2/);
  assert.doesNotMatch(workflow, /AIRTRUST_PRODUCTION/);
  assert.doesNotMatch(workflow, /apply-schema-change-v2/);
  assert.doesNotMatch(workflow, /apply_change/);
  assert.match(workflow, /validate-0438-legacy-physical-state\.sh/);
  assert.match(workflow, /schema-v2-0438-rdv-coordination-workflow\.test\.mjs/);
  assert.match(workflow, /cleanup-controle-voos-e2e-fixtures-v2\.mjs/);
  assert.match(workflow, /cleanup-controle-voos-e2e-orphan-run-v2\.mjs/);
});

test('CAS compatibility runner is fail closed and sends current RDV version', () => {
  assert.match(runner, /START_MARKER_NOT_FOUND/);
  assert.match(runner, /END_MARKER_NOT_FOUND/);
  assert.match(runner, /STALE_CORRECTION_SHAPE_CHANGED/);
  assert.match(runner, /CANONICAL_SOURCE_ALREADY_CAS_AWARE/);
  assert.match(runner, /body: \{ versao: rdvVersao, ocorrencias:/);
  assert.match(runner, /rdvVersao = correction\.json\?\.data\?\.versao \?\? rdvVersao \+ 1/);
});

test('fixture cleanup is fail closed and removes domain event dependencies', () => {
  assert.match(cleanup, /airtrust-db-staging-baseline-20260701/);
  assert.match(cleanup, /prod\|production/);
  assert.match(cleanup, /DELETE FROM domain_events WHERE empresa_id IN/);
  assert.match(cleanup, /DELETE FROM auditoria_avancada_v2/);
  assert.match(cleanup, /CLEANUP_POSTCONDITION_FAILED/);
  assert.doesNotMatch(cleanup, /AVISO: comando falhou \(continuando cleanup\)/);
});

test('orphan cleanup only derives synthetic companies from an 8-hex run id', () => {
  assert.match(orphan, /\^\[0-9a-f\]\{8\}\$/);
  assert.match(orphan, /cv_e2e_synth_a_/);
  assert.match(orphan, /cv_e2e_synth_b_/);
  assert.match(orphan, /CV E2E Synthetic Tenant/);
  assert.match(orphan, /NON_SYNTHETIC_CODE_REJECTED/);
  assert.match(orphan, /NON_SYNTHETIC_NAME_REJECTED/);
});

// source_reference: static contract test for the staging-only 0438 legacy validation v2 workflow and synthetic cleanup scripts.
// operational_decision: assertions inspect DML/text only to prove the revision-evidence overlay remains narrow and cleanup remains synthetic, dependency-aware, fail-closed and outside production/schema apply paths.
// dry_run_required: not applicable; this test performs no remote execution and writes no database state.
// rollback_plan_required: not applicable; this test is read-only and has no external side effects.

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

test('V2 overlay is fail closed, revision-only and exercises coordination etapa revisions', () => {
  assert.match(runner, /ETAPA_CAPTURE_START_MARKER_NOT_FOUND/);
  assert.match(runner, /ETAPA_REVISION_END_MARKER_NOT_FOUND/);
  assert.match(runner, /SHAPE_CHANGED/);
  assert.match(runner, /editar_etapa_coordenacao_revisao/);
  assert.match(runner, /mode: 'coordenacao'/);
  assert.match(runner, /justificativa: 'Ajuste de combustivel durante revisao/);
  assert.match(runner, /const etapaId = etapaJson\.data\.id/);
  assert.doesNotMatch(runner, /CANONICAL_SOURCE_ALREADY_CAS_AWARE/);
  assert.doesNotMatch(runner, /operation: 'corrigir_apos_devolucao'/);
});

test('fixture cleanup is fail closed and deletes auth/employee dependencies before users', () => {
  assert.match(cleanup, /airtrust-db-staging-baseline-20260701/);
  assert.match(cleanup, /prod\|production/);
  assert.match(cleanup, /DELETE FROM domain_events WHERE empresa_id IN/);
  assert.match(cleanup, /DELETE FROM auditoria_avancada_v2/);
  assert.match(cleanup, /DELETE FROM refresh_tokens WHERE user_id IN/);
  assert.match(cleanup, /CLEANUP_POSTCONDITION_FAILED/);
  assert.doesNotMatch(cleanup, /AVISO: comando falhou \(continuando cleanup\)/);
  assert.ok(cleanup.indexOf("['refresh_tokens'") < cleanup.indexOf("['usuarios'"));
  assert.ok(cleanup.indexOf("['funcionarios'") < cleanup.indexOf("['usuarios'"));
  assert.ok(cleanup.indexOf("['setores'") < cleanup.indexOf("['usuarios'"));
});

test('orphan cleanup derives only exact synthetic companies/users from an 8-hex run id', () => {
  assert.match(orphan, /\^\[0-9a-f\]\{8\}\$/);
  assert.match(orphan, /cv_e2e_synth_a_/);
  assert.match(orphan, /cv_e2e_synth_b_/);
  assert.match(orphan, /CV E2E Synthetic Tenant/);
  assert.match(orphan, /cv\.e2e\.admin\.a\.\$\{runId\}@synthetic\.invalid/);
  assert.match(orphan, /cv\.e2e\.admin\.b\.\$\{runId\}@synthetic\.invalid/);
  assert.match(orphan, /NON_SYNTHETIC_CODE_REJECTED/);
  assert.match(orphan, /NON_SYNTHETIC_NAME_REJECTED/);
  assert.match(orphan, /NON_SYNTHETIC_USER_REJECTED/);
  assert.match(orphan, /DELETE FROM refresh_tokens WHERE user_id IN/);
  assert.ok(orphan.indexOf("['refresh_tokens'") < orphan.indexOf("['usuarios'"));
  assert.ok(orphan.indexOf("['funcionarios'") < orphan.indexOf("['usuarios'"));
});

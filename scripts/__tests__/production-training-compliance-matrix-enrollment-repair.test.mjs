import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const script = readFileSync('scripts/production/training-compliance-matrix-enrollment-repair.mjs', 'utf8');
const workflow = readFileSync('.github/workflows/production-training-compliance-matrix-enrollment-repair.yml', 'utf8');

test('repair derives only mandatory EAD requirements from the current matrix', () => {
  assert.match(script, /r\.obrigatoriedade='OBRIGATORIA'/);
  assert.match(script, /IN \('EAD','TREINAMENTO EAD'\)/);
  assert.match(script, /ROW_NUMBER\(\) OVER/);
  assert.match(script, /prioridade DESC,regra_id DESC/);
});

test('repair never sends enrollment e-mail or calls invitation endpoint', () => {
  assert.match(script, /enviar_convite_email: false/);
  assert.doesNotMatch(script, /\/api\/lms\/matriculas\/convites/);
  assert.doesNotMatch(script, /enviar_convite_email:\s*true/);
});

test('global wrong enrollment audit covers all active employees and preserves explicit standalone decisions', () => {
  assert.match(script, /treinamento_matricula_reconciliacoes/);
  assert.match(script, /MANTER_AVULSA/);
  assert.doesNotMatch(script, /m\.observacoes=\$\{JSON\.stringify\(PREVIOUS_BATCH_MARKER\)\}/);
  assert.match(script, /WRONG_ENROLLMENTS_WITH_EVIDENCE_REQUIRE_MANUAL_REVIEW/);
  assert.match(script, /lms_progresso_scorm/);
  assert.match(script, /lms_xapi_statements/);
  assert.match(script, /lms_completion_diagnostics_snapshots/);
  assert.match(script, /qualificacoes_historico/);
});

test('dry-run reports unsafe wrong enrollments while apply remains fail-closed', () => {
  const dryRunBranch = script.indexOf("if (mode === 'dry-run')");
  const unsafeApplyGuard = script.indexOf("if (before.unsafe_wrong_count > 0) fail('WRONG_ENROLLMENTS_WITH_EVIDENCE_REQUIRE_MANUAL_REVIEW')");
  assert.ok(dryRunBranch >= 0);
  assert.ok(unsafeApplyGuard > dryRunBranch);
  assert.match(script, /unsafe_wrong_count: state\.unsafe_wrong_count/);
});

test('workflow is exact-SHA, dry-run-first and recovery guarded', () => {
  assert.match(workflow, /options: \[dry-run, apply\]/);
  assert.match(workflow, /reviewed_dry_run_run_id/);
  assert.match(workflow, /Verify official release gates on exact SHA/);
  assert.match(workflow, /d1 time-travel info airtrust-db --env production/);
  assert.match(workflow, /CLOUDFLARE_D1_MIGRATION_API_TOKEN/);
  assert.match(workflow, /PROD_SMOKE_EMAIL \|\| secrets\.QA_EXAMINER_ADMIN_EMAIL/);
  assert.match(workflow, /production-training-compliance-matrix-enrollment-repair-dry-run-/);
});

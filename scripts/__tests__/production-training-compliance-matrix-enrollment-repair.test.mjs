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


test('missing enrollment target is organizational-role only and defers designation-specific training', () => {
  assert.match(script, /enrollment_target AS/);
  assert.match(script, /condicao_id IS NULL/);
  assert.match(script, /escopo IN \('EMPRESA','SETOR','FUNCAO','SETOR_FUNCAO'\)/);
  assert.ok(script.includes("UPPER(TRIM(COALESCE(fundamento_tipo,'')))<>'DESIGNACAO'"));
  for (const code of ['I', 'L', 'FDM-EAD', 'GATEKEEPER', 'LOSA', 'PPSP_SUP', 'E8', 'NR-05', 'BRIGADA_INCENDIO', 'PRIMEIROS_SOCORROS', 'NR-12']) {
    assert.match(script, new RegExp(`'${code.replaceAll('-', '\-')}'`));
  }
  assert.match(script, /FROM enrollment_target e/);
  assert.match(script, /LEFT JOIN expected e ON e\.funcionario_id=a\.funcionario_id/);
});

test('production enrollment repair uses small API batches to stay within Worker request timeouts', () => {
  assert.match(script, /employeeChunk of chunk\(\[\.\.\.new Set\(employeeIds\)\]\.sort\(\(a, b\) => a - b\), 10\)/);
});

test('production enrollment repair retries only timeout-like failures for idempotent no-email batch enrollment', () => {
  assert.match(script, /retryTimeouts = retry\.retryTimeouts === true/);
  assert.match(script, /name === 'TimeoutError' \|\| name === 'AbortError'/);
  assert.match(script, /retryTimeouts: true, maxAttempts: 5, timeoutMs: 30000/);
  assert.match(script, /enviar_convite_email: false/);
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
  assert.doesNotMatch(script, /WRONG_ENROLLMENTS_WITH_EVIDENCE_REQUIRE_MANUAL_REVIEW/);
  assert.match(script, /lms_progresso_scorm/);
  assert.match(script, /lms_xapi_statements/);
  assert.match(script, /lms_completion_diagnostics_snapshots/);
  assert.match(script, /qualificacoes_historico/);
});

test('dry-run reports evidenced wrong enrollments and apply preserves evidence while cancelling active state', () => {
  assert.match(script, /unsafe_wrong_count: state\.unsafe_wrong_count/);
  assert.match(script, /wrong_with_evidence_count: state\.unsafe_wrong_count/);
  assert.match(script, /historical_evidence_preserved: true/);
  assert.doesNotMatch(script, /SET status='CANCELADO',deleted_at=datetime\('now'\)/);
  assert.match(script, /SET status='CANCELADO',updated_at=datetime\('now'\)/);
  assert.match(script, /cancelled_wrong_with_evidence_enrollments = before\.unsafe_wrong_count/);
});

test('workflow is exact-SHA, dry-run-first and recovery guarded', () => {
  assert.match(workflow, /options: \[dry-run, apply\]/);
  assert.match(workflow, /reviewed_dry_run_run_id/);
  assert.match(workflow, /Verify official release gates on exact SHA/);
  assert.match(workflow, /d1 time-travel info airtrust-db --env production/);
  assert.match(workflow, /CLOUDFLARE_D1_MIGRATION_API_TOKEN/);
  assert.match(workflow, /PROD_SMOKE_EMAIL \|\| secrets\.QA_EXAMINER_ADMIN_EMAIL/);
  assert.match(workflow, /production-training-compliance-matrix-enrollment-repair-dry-run-/);
  assert.match(workflow, /APPLY_COMPLIANCE_MATRIX_ENROLLMENT_REPAIR_CANCEL_NONREQUIRED_NO_EMAIL/);
  assert.doesNotMatch(workflow, /REVIEWED_UNSAFE_WRONG_NOT_ZERO/);
});

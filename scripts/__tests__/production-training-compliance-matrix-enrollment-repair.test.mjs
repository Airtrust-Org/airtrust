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

test('wrong enrollments are restricted to prior batch and only evidence-free rows may be cancelled', () => {
  assert.match(script, /PREVIOUS_BATCH_MARKER/);
  assert.match(script, /WRONG_ENROLLMENTS_WITH_EVIDENCE_REQUIRE_MANUAL_REVIEW/);
  assert.match(script, /lms_progresso_scorm/);
  assert.match(script, /lms_xapi_statements/);
  assert.match(script, /lms_completion_diagnostics_snapshots/);
  assert.match(script, /qualificacoes_historico/);
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

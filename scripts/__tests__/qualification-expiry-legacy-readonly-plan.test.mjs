import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan, expectedExpiry } from '../production/qualification-expiry-legacy-readonly-plan.mjs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const row = (overrides={}) => ({
  id: 1, empresa_id: 6, qualificacao_id: 101, model_code: 'MNT_S76AC',
  status: 'CONCLUIDA', data_conclusao: '2024-01-15', data_vencimento: '2025-01-15',
  historical_months: 12, model_months: 24, model_end_of_month: 0,
  origem_tipo: 'LMS', certificado_arquivo_id: null,
  lms_matricula_id: 10, has_uploaded_certificate: 0, ...overrides,
});

test('uses canonical exact-day and month-end arithmetic including calendar rollovers', () => {
  assert.equal(expectedExpiry('2024-01-15', 24), '2026-01-15');
  assert.equal(expectedExpiry('2024-01-15', 24, true), '2026-01-31');
  assert.equal(expectedExpiry('2024-01-31', 1), '2024-03-02');
  assert.equal(expectedExpiry('2024-01-31', 1, true), '2024-02-29');
  assert.equal(expectedExpiry('2024-02-30', 1), null);
  assert.equal(expectedExpiry('2024-01-15', 0), null);
});

test('reconciles legacy model months and expiry without touching completion and status', () => {
  const plan = buildPlan([row()]);
  assert.equal(plan.total_read, 1);
  assert.equal(plan.eligible_candidate_count, 1);
  assert.equal(plan.candidates[0].next_validity_months, 24);
  assert.equal(plan.candidates[0].next_expiry, '2026-01-15');
  assert.equal(plan.candidates[0].expected_completion_date, '2024-01-15');
  assert.equal(plan.candidates[0].expected_status, 'CONCLUIDA');
  assert.equal(plan.production_apply_authorized, false);
  assert.equal(plan.writes, 0);
});

test('does not change consistent current records or treat 24 months as 12', () => {
  const plan = buildPlan([row({ historical_months: 24, data_vencimento: '2026-01-15' })]);
  assert.equal(plan.consistent, 1);
  assert.equal(plan.eligible_candidate_count, 0);
});

test('fails closed on certificates, special rules, invalid model and non-realized status', () => {
  const plan = buildPlan([
    row({ id: 1, certificado_arquivo_id: 123 }),
    row({ id: 2, model_code: 'CMA' }),
    row({ id: 3, model_months: null }),
    row({ id: 4, status: 'PLANEJADA' }),
    row({ id: 5, origem_tipo: 'MANUAL', historical_months: 24, data_vencimento: '2026-02-01' }),
    row({ id: 6, model_code: null }),
    row({ id: 7, empresa_id: 7 }),
    row({ id: 8, model_code: 'ASO' }),
    row({ id: 9, model_code: 'CHT-TIPO-A139' }),
  ]);
  assert.equal(plan.eligible_candidate_count, 0);
  assert.equal(plan.blocked_total, 9);
  assert.equal(plan.blocked.issued_certificate_requires_review, 1);
  assert.equal(plan.blocked.regulatory_special_case, 3);
  assert.equal(plan.blocked.model_validity_ambiguous, 1);
  assert.equal(plan.blocked.non_realized_or_unrecognized_status, 1);
  assert.equal(plan.blocked.manual_expiry_override_requires_review, 1);
  assert.equal(plan.blocked.model_link_missing, 1);
  assert.equal(plan.blocked.invalid_tenant_or_id, 1);
});

test('plan hash and candidate order are independent of D1 row ordering; duplicate ids fail', () => {
  const left = row({ id: 42 });
  const right = row({ id: 7, model_code: 'LGPD' });
  const a = buildPlan([left, right]);
  const b = buildPlan([right, left]);
  assert.equal(a.plan_sha256, b.plan_sha256);
  assert.deepEqual(a.candidates.map(x => x.id), [7, 42]);
  assert.throws(() => buildPlan([left, left]), /DUPLICATE_HISTORY_ID_FAIL_CLOSED/);
});

test('CLI forbids production apply and requires explicit readonly approval before any D1 request', () => {
  const script = fileURLToPath(new URL('../production/qualification-expiry-legacy-readonly-plan.mjs', import.meta.url));
  const deniedWrite = spawnSync(process.execPath, [script, '--apply'], {
    encoding: 'utf8', env: { ...process.env, AIRTRUST_EXPIRY_READONLY_CONFIRMATION: 'wrong' },
  });
  assert.notEqual(deniedWrite.status, 0);
  assert.match(deniedWrite.stderr, /PRODUCTION_WRITE_FORBIDDEN/);
  const deniedRead = spawnSync(process.execPath, [script], {
    encoding: 'utf8', env: { ...process.env, AIRTRUST_EXPIRY_READONLY_CONFIRMATION: 'wrong' },
  });
  assert.notEqual(deniedRead.status, 0);
  assert.match(deniedRead.stderr, /EXPLICIT_READONLY_CONFIRMATION_REQUIRED/);
});

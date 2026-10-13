import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reconcileFrmsCvEvidence, AUDIT_DATE, TENANT_ID, QUERY_KEYS } from '../production/frms-cv-20261013-readonly-coherence.mjs';

const base = () => ({
  allocation: [{ funcionario_id: 10 }, { funcionario_id: 11 }],
  base: [{ funcionario_id: 11 }, { funcionario_id: 12 }],
  checkins: [{ funcionario_id: 10, submitted_at: '2026-10-13 12:00:00' }],
  journeys: [{ funcionario_id: 10 }],
  legacyScale: [{ funcionario_id: 10 }],
  flights: [{ id: 90, status: 'planejado' }, { id: 91, status: 'planejado' }],
  crew: [
    { voo_id: 90, funcionario_id: 10, employee_valid: 1 },
    { voo_id: 91, funcionario_id: 10, employee_valid: 1 },
    { voo_id: 91, funcionario_id: 12, employee_valid: 1 },
  ],
});

test('fixed tenant/date and complete source sets', () => {
  assert.equal(AUDIT_DATE, '2026-10-13');
  assert.equal(TENANT_ID, 6);
  assert.deepEqual(QUERY_KEYS, ['tenant', 'allocation', 'base', 'checkins', 'flights', 'crew', 'journeys', 'legacyScale']);
});

test('quinzena roster union requires checkin even without flight or journey', () => {
  const r = reconcileFrmsCvEvidence(base());
  assert.equal(r.readOnly, true);
  assert.equal(r.writes, 0);
  assert.equal(r.evidence.unionActiveFortnightEmployees, 3);
  assert.equal(r.evidence.activeFortnightCheckinPending, 2);
  assert.equal(r.evidence.activeFortnightWithCheckin, 1);
  assert.equal(r.evidence.activeFortnightWithoutJourney, 2);
  assert.equal(r.evidence.controleVoosCrewDistinctEmployees, 2);
  assert.equal(r.evidence.controleVoosCrewCheckinPending, 1);
  assert.equal(r.evidence.controleVoosFlights, 2);
  assert.equal(r.alerts.duplicateCrewRows, 0);
  assert.equal(r.verdict, 'SOURCE_FACTS_RECONCILED_WITH_PENDING_OBLIGATIONS');
  assert.equal(r.interpretation.flightGateRecomputed, false);
});

test('orphan employee links, duplicate checkins, duplicate same flight crew are explicit anomalies', () => {
  const a = base();
  a.checkins.push({ funcionario_id: 10, submitted_at: null });
  a.crew.push({ voo_id: 91, funcionario_id: 10, employee_valid: 1 });
  a.crew.push({ voo_id: 90, funcionario_id: 20, employee_valid: 0 });
  const r = reconcileFrmsCvEvidence(a);
  assert.equal(r.alerts.duplicateCheckinEmployees, 1);
  assert.equal(r.alerts.duplicateCrewRows, 1);
  assert.equal(r.alerts.crewWithoutActiveEmployeeLink, 1);
  assert.equal(r.alerts.unknownCheckinTimestampRecords, 1);
  assert.equal(r.evidence.crewOutsideConfirmedFortnight, 1);
  assert.equal(r.verdict, 'ANOMALIES_NEED_REVIEW');
});

test('never outputs employee identifiers, names or flight IDs in report', () => {
  const out = JSON.stringify(reconcileFrmsCvEvidence(base()));
  assert.doesNotMatch(out, /funcionario_id|voo_id|nome|email|password_hash|submitted_at|hora_checkin/);
  assert.doesNotMatch(out, /"id":(90|91|10|11|12)/);
});

test('workflow uses read-only exact-production credentials and main SHA guard', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/frms-cv-20261013-readonly-coherence.yml', import.meta.url), 'utf8');
  const source = readFileSync(new URL('../production/frms-cv-20261013-readonly-coherence.mjs', import.meta.url), 'utf8');
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /EXPECTED_SHA.*GITHUB_SHA/);
  assert.match(workflow, /AIRTRUST_FRMS_CV_READONLY_20261013/);
  assert.doesNotMatch(workflow, /wrangler d1 execute|--apply|deploy-airtrust|migrate/);
  assert.match(source, /PRODUCTION_TARGET_GUARD_FAILED/);
  assert.match(source, /MUTATING_SQL_BLOCKED/);
  assert.match(source, /MULTI_STATEMENT_BLOCKED/);
  assert.doesNotMatch(source, /(?<!NO_)\b(INSERT INTO|UPDATE usuarios|DELETE FROM)\b/i);
});

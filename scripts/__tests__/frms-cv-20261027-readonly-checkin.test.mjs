import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  AUDIT_DATE, TENANT_ID, AIRCRAFT_PREFIX, QUERIES,
  reconcileDailyCrewCheckins, saoPauloDateOf,
} from '../production/frms-cv-20261027-readonly-checkin.mjs';

const fixture = () => ({
  flights: [{id: 101}, {id: 102}],
  crew: [
    {voo_id: 101, funcionario_id: 10, funcao: 'PIC', employee_valid: 1},
    {voo_id: 101, funcionario_id: 11, funcao: 'SIC', employee_valid: 1},
    {voo_id: 102, funcionario_id: 10, funcao: 'PIC', employee_valid: 1},
    {voo_id: 102, funcionario_id: 11, funcao: 'SIC', employee_valid: 1},
    {voo_id: 333, funcionario_id: 99, funcao: 'PIC', employee_valid: 1},
  ],
  checkins: [
    {funcionario_id: 10, data_checkin: '2026-10-27', active: 1},
    {funcionario_id: 99, data_checkin: '2026-10-27', active: 1},
  ],
});

test('scope fixed to one tenant/date/aircraft and four SELECT-only SQL statements', () => {
  assert.equal(AUDIT_DATE, '2026-10-27');
  assert.equal(TENANT_ID, 6);
  assert.equal(AIRCRAFT_PREFIX, 'PS-CDV');
  assert.deepEqual(Object.keys(QUERIES), ['tenant', 'flights', 'crew', 'checkins']);
  for (const sql of Object.values(QUERIES)) {
    assert.match(sql, /^SELECT\s/);
    assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP|MERGE|TRUNCATE|PRAGMA)\b|;/i);
  }
  assert.match(QUERIES.checkins, /ch\.empresa_id = \?/);
  assert.match(QUERIES.crew, /t\.empresa_id = \?/);
  assert.match(QUERIES.flights, /prefixo = \?/);
});

test('one person assigned to two flights counts once and missing check-in remains pending', () => {
  const r = reconcileDailyCrewCheckins(fixture());
  assert.equal(r.readOnly, true);
  assert.equal(r.writes, 0);
  assert.equal(r.matchedFlights, 2);
  assert.equal(r.crewAssignments, 4);
  assert.equal(r.uniqueAssigned, 2);
  assert.deepEqual(r.currentDate, {assigned: 2, received: 1, pending: 1});
  assert.deepEqual(r.roles.PIC, {assigned: 1, received: 1, pending: 0});
  assert.deepEqual(r.roles.SIC, {assigned: 1, received: 0, pending: 1});
});

test("a check-in from yesterday or a soft-deleted one cannot mark today's check-in received", () => {
  const f = fixture();
  f.checkins.push({funcionario_id: 11, data_checkin: '2026-10-26', active: 1});
  f.checkins.push({funcionario_id: 11, data_checkin: '2026-10-27', active: 0});
  const r = reconcileDailyCrewCheckins(f);
  assert.equal(r.roles.SIC.pending, 1);
  assert.equal(r.assignedWithOnlySoftDeletedToday, 1);
  assert.equal(r.assignedWithPreviousDayCheckinButMissingToday, 1);
  assert.equal(r.assignedWithNextDayCheckinButMissingToday, 0);
});

test('next-day check-in remains a separate evidence band, never a receipt on the target date', () => {
  const f = fixture();
  f.checkins.push({funcionario_id: 11, data_checkin: '2026-10-28', active: 1});
  f.checkins.push({funcionario_id: 11, data_checkin: '2026-10-28', active: 1});
  const r = reconcileDailyCrewCheckins(f);
  assert.deepEqual(r.currentDate, {assigned: 2, received: 1, pending: 1});
  assert.deepEqual(r.roles.SIC, {assigned: 1, received: 0, pending: 1});
  assert.equal(r.assignedWithNextDayCheckinButMissingToday, 1);
  assert.equal(r.sameDayDuplicateCheckinEmployees, 0);
});

test('unrelated or malformed identifiers cannot change target-day receipt or leak into aggregate', () => {
  const f = fixture();
  f.checkins.push({funcionario_id: 99, data_checkin: '2026-10-27', active: 1});
  f.checkins.push({funcionario_id: 'not-a-number', data_checkin: '2026-10-27', active: 1});
  f.checkins.push({funcionario_id: 0, data_checkin: '2026-10-27', active: 1});
  const r = reconcileDailyCrewCheckins(f);
  assert.equal(r.uniqueAssigned, 2);
  assert.deepEqual(r.currentDate, {assigned: 2, received: 1, pending: 1});
  assert.equal(r.sameDayDuplicateCheckinEmployees, 0);
  assert.doesNotMatch(JSON.stringify(r), /not-a-number|funcionario_id|voo_id/);
});

test('duplicate active rows detected without disclosing individuals', () => {
  const f = fixture();
  f.checkins.push({funcionario_id: 10, data_checkin: '2026-10-27', active: 1});
  const r = reconcileDailyCrewCheckins(f);
  assert.equal(r.sameDayDuplicateCheckinEmployees, 1);
  assert.doesNotMatch(JSON.stringify(r), /funcionario_id|voo_id|nome|email|created_by|PS-CDV|"id"/);
});

test('workflow requires explicit SHA, production environment and readonly confirmation', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/frms-cv-20261027-readonly-checkin.yml', import.meta.url), 'utf8');
  const script = readFileSync(new URL('../production/frms-cv-20261027-readonly-checkin.mjs', import.meta.url), 'utf8');
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /permissions:\s*\n\s*contents: read/);
  assert.match(workflow, /AIRTRUST_FRMS_CV_READONLY_20261027/);
  assert.match(workflow, /EXPECTED_SHA.*GITHUB_SHA/);
  assert.doesNotMatch(workflow, /wrangler d1 execute|deploy-airtrust|--apply|migrations apply/);
  assert.match(script, /PRODUCTION_TARGET_PIN_FAILED/);
  assert.match(script, /MUTATING_OR_MULTISTATEMENT_SQL_BLOCKED/);
  assert.match(script, /writeFile\(out/);
});

test('adjacent check-in is classified by the Sao Paulo day it was really submitted', () => {
  assert.equal(saoPauloDateOf('2026-10-28 01:30:00'), '2026-10-27'); // 22:30 BRT on the 27th
  assert.equal(saoPauloDateOf('2026-10-28 03:00:00'), '2026-10-28');
  assert.equal(saoPauloDateOf('garbage'), null);
  const f = fixture();
  // label 28/10 but sent 27/10 22:30 BRT -> date-attribution defect candidate
  f.checkins.push({funcionario_id: 11, data_checkin: '2026-10-28', created_at: '2026-10-28 01:30:00', active: 1});
  let r = reconcileDailyCrewCheckins(f);
  assert.deepEqual(r.adjacentCheckinSubmissionDayBrt, {submittedOnAuditDay: 1, submittedOnOwnLabelDay: 0, submittedOtherDay: 0, createdAtUnavailable: 0});
  // legitimately sent on 28/10 -> pending is real
  f.checkins[f.checkins.length - 1].created_at = '2026-10-28 12:00:00';
  r = reconcileDailyCrewCheckins(f);
  assert.deepEqual(r.adjacentCheckinSubmissionDayBrt, {submittedOnAuditDay: 0, submittedOnOwnLabelDay: 1, submittedOtherDay: 0, createdAtUnavailable: 0});
  assert.deepEqual(r.roles.SIC, {assigned: 1, received: 0, pending: 1});
  assert.doesNotMatch(JSON.stringify(r), /created_at|funcionario_id/);
});

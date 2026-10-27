#!/usr/bin/env node
// Fixed-scope production readback for the 27 Oct CV/FRMS incident.
// SQL only SELECT, tenant 6, one known aircraft, 3-day check-in window.
// Never print employee, user, aircraft, flight or check-in identifiers.
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const AUDIT_DATE = '2026-10-27';
export const TENANT_ID = 6;
export const AIRCRAFT_PREFIX = 'PS-CDV';
export const PREVIOUS_DATE = '2026-10-26';
export const NEXT_DATE = '2026-10-28';
const DB_ID = '7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae';
const BLOCKED_DB_IDS = ['bf9963f4-eb12-439b-a830-20bbf577ac22', 'a72fb05b-0912-4ad9-9686-e7948c8b'];

export const QUERIES = Object.freeze({
  tenant: 'SELECT id, nome, codigo FROM empresas WHERE id = ? AND ativo = 1 AND deleted_at IS NULL',
  flights: [
    'SELECT id FROM cv_voos',
    'WHERE empresa_id = ? AND data_programacao = ? AND prefixo = ? AND deleted_at IS NULL',
  ].join(' '),
  crew: [
    'SELECT CAST(t.voo_id AS INTEGER) AS voo_id, CAST(t.funcionario_id AS INTEGER) AS funcionario_id,',
    't.funcao, CASE WHEN f.id IS NULL THEN 0 ELSE 1 END AS employee_valid',
    'FROM cv_voo_tripulantes t',
    'JOIN cv_voos v ON v.id = t.voo_id AND v.empresa_id = t.empresa_id',
    'AND v.deleted_at IS NULL AND v.data_programacao = ? AND v.prefixo = ?',
    'LEFT JOIN funcionarios f ON f.id = t.funcionario_id AND f.empresa_id = t.empresa_id AND f.deleted_at IS NULL',
    'WHERE t.empresa_id = ? AND t.deleted_at IS NULL',
  ].join(' '),
  checkins: [
    'SELECT CAST(ch.funcionario_id AS INTEGER) AS funcionario_id,',
    'ch.data_checkin, CASE WHEN ch.deleted_at IS NULL THEN 1 ELSE 0 END AS active',
    'FROM frms_fadiga_checkin ch',
    'WHERE ch.empresa_id = ? AND ch.data_checkin BETWEEN ? AND ?',
  ].join(' '),
});

function assertReadOnly(sql) {
  if (!/^SELECT\s/i.test(sql)) throw new Error('ONLY_SELECT_ALLOWED');
  if (/\b(INSERT|UPDATE|DELETE|REPLACE|MERGE|CREATE|ALTER|DROP|TRUNCATE|VACUUM|ATTACH|DETACH|REINDEX|PRAGMA)\b/i.test(sql) || sql.includes(';')) {
    throw new Error('MUTATING_OR_MULTISTATEMENT_SQL_BLOCKED');
  }
}
for (const sql of Object.values(QUERIES)) assertReadOnly(sql);

const positiveId = (raw) => {
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};
const role = (raw) => {
  const x = String(raw || '').trim().toUpperCase();
  return x === 'PIC' ? 'PIC' : x === 'SIC' ? 'SIC' : 'OTHER';
};
export function reconcileDailyCrewCheckins({ flights = [], crew = [], checkins = [] }) {
  const flightIds = new Set(flights.map(f => positiveId(f.id)).filter(Boolean));
  const assigned = crew.filter(c => flightIds.has(positiveId(c.voo_id)));
  const byRole = new Map([['PIC', new Set()], ['SIC', new Set()], ['OTHER', new Set()]]);
  for (const member of assigned) {
    const id = positiveId(member.funcionario_id);
    if (id) byRole.get(role(member.funcao)).add(id);
  }
  const allAssigned = new Set([...byRole.values()].flatMap(ids => [...ids]));
  const forDay = (date, active) => new Set(checkins.filter(ch => ch.data_checkin === date && Number(ch.active) === active).map(ch => positiveId(ch.funcionario_id)).filter(id => id && allAssigned.has(id)));
  const received = forDay(AUDIT_DATE, 1);
  const softDeleted = forDay(AUDIT_DATE, 0);
  const prev = forDay(PREVIOUS_DATE, 1);
  const next = forDay(NEXT_DATE, 1);
  const assignedCounts = (ids) => ({
    assigned: ids.size,
    received: [...ids].filter(id => received.has(id)).length,
    pending: [...ids].filter(id => !received.has(id)).length,
  });
  return {
    date: AUDIT_DATE,
    scope: 'one pre-approved tenant and aircraft, no row identifiers',
    readOnly: true,
    writes: 0,
    matchedFlights: flightIds.size,
    crewAssignments: assigned.length,
    crewWithoutActiveEmployeeLink: assigned.filter(c => Number(c.employee_valid) !== 1).length,
    uniqueAssigned: allAssigned.size,
    currentDate: assignedCounts(allAssigned),
    roles: Object.fromEntries([...byRole].map(([r, ids]) => [r, assignedCounts(ids)])),
    assignedWithOnlySoftDeletedToday: [...allAssigned].filter(id => !received.has(id) && softDeleted.has(id)).length,
    assignedWithPreviousDayCheckinButMissingToday: [...allAssigned].filter(id => !received.has(id) && prev.has(id)).length,
    assignedWithNextDayCheckinButMissingToday: [...allAssigned].filter(id => !received.has(id) && next.has(id)).length,
    sameDayDuplicateCheckinEmployees: [...received].filter(id =>
      checkins.filter(ch => positiveId(ch.funcionario_id) === id && ch.data_checkin === AUDIT_DATE && Number(ch.active) === 1).length > 1
    ).length,
    interpretation: 'Persistence evidence only. No verdict about fitness, compliance, or root cause of a missing submission.',
  };
}
async function queryProduction(sql, params) {
  assertReadOnly(sql);
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const dbId = process.env.PRODUCTION_D1_ID;
  if (dbId !== DB_ID || BLOCKED_DB_IDS.includes(dbId)) throw new Error('PRODUCTION_TARGET_PIN_FAILED');
  if (!accountId || !token) throw new Error('READONLY_CREDENTIALS_UNAVAILABLE');
  const url = 'https://api.cloudflare.com/client/v4/accounts/' + encodeURIComponent(accountId) + '/d1/database/' + DB_ID + '/query';
  const res = await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({sql, params}) });
  const body = await res.json().catch(() => ({}));
  const section = Array.isArray(body.result) ? body.result[0] : body.result;
  if (!res.ok || body.success !== true || section?.success === false || !Array.isArray(section?.results)) throw new Error('READONLY_QUERY_FAILED');
  return section.results;
}
export async function runProductionReadonly() {
  if (process.env.CONFIRM_READONLY !== 'AIRTRUST_FRMS_CV_READONLY_20261027') throw new Error('CONFIRMATION_REQUIRED');
  if (!/^[a-f0-9]{40}$/.test(process.env.EXPECTED_SHA || '')) throw new Error('SOURCE_SHA_REQUIRED');
  const tenant = await queryProduction(QUERIES.tenant, [TENANT_ID]);
  if (tenant.length !== 1 || !/costa\s*(?:do\s*)?sol|\bcds\b/i.test(String(tenant[0].nome || '') + ' ' + String(tenant[0].codigo || ''))) {
    throw new Error('PRODUCTION_TENANT_GUARD_FAILED');
  }
  const flights = await queryProduction(QUERIES.flights, [TENANT_ID, AUDIT_DATE, AIRCRAFT_PREFIX]);
  const crew = await queryProduction(QUERIES.crew, [AUDIT_DATE, AIRCRAFT_PREFIX, TENANT_ID]);
  const checkins = await queryProduction(QUERIES.checkins, [TENANT_ID, PREVIOUS_DATE, NEXT_DATE]);
  const report = reconcileDailyCrewCheckins({flights, crew, checkins});
  if (report.matchedFlights === 0 || report.matchedFlights > 8) throw new Error('TARGET_FLIGHTS_NOT_UNAMBIGUOUS');
  report.sourceSha = process.env.EXPECTED_SHA;
  const out = String(process.env.AUDIT_REPORT_PATH || '');
  if (!out.startsWith('/')) throw new Error('REPORT_PATH_NOT_ABSOLUTE');
  await writeFile(out, JSON.stringify(report, null, 2) + '\n', {mode: 0o600});
  console.log('FRMS_CV_OCT27_READONLY_COMPLETED matches=' + report.matchedFlights + ' crew=' + report.uniqueAssigned + ' received=' + report.currentDate.received + ' pending=' + report.currentDate.pending + ' writes=0');
  return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runProductionReadonly().catch(error => {
    console.error('FRMS_CV_OCT27_READONLY_FAILED:' + String(error?.message || 'unknown'));
    process.exitCode = 1;
  });
}

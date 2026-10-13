#!/usr/bin/env node
// Read-only, fixed-date production FRMS x Controle de Voos evidence.
// No production write, migration, application secret, PII, employee ID or SQL in logs.
import { pathToFileURL } from 'node:url';
import { writeFile } from 'node:fs/promises';

export const AUDIT_DATE = '2026-10-13';
export const TENANT_ID = 6; // Costa do Sol, fixed audit scope; never infer another tenant.
const PRODUCTION_DB_ID = '7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae';
const STAGING_DB_ID = 'bf9963f4-eb12-439b-a830-20bbf577ac22';
const DEV_DB_ID = 'a72fb05b-0912-4ad9-9686-e7948c8b09eb';

const queries = Object.freeze({
  tenant: [
    'SELECT id, nome, codigo FROM empresas WHERE id = ? AND ativo = 1 AND deleted_at IS NULL',
  ].join(' '),
  allocation: [
    'SELECT DISTINCT CAST(ea.funcionario_id AS INTEGER) AS funcionario_id',
    'FROM escala_alocacoes ea',
    'JOIN funcionarios f ON f.id = ea.funcionario_id AND f.empresa_id = ?',
    'AND f.deleted_at IS NULL AND COALESCE(f.ativo, 1) = 1',
    "AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'",
    "AND (UPPER(COALESCE(f.funcao, '')) IN ('PILOTO','COPILOTO','COMANDANTE','PIC','SIC','TRIPULANTE')",
    "OR UPPER(COALESCE(f.cargo, '')) IN ('PILOTO','COPILOTO','COMANDANTE','PIC','SIC','TRIPULANTE'))",
    'LEFT JOIN escalas_quinzenas eq ON eq.id = ea.quinzena_id',
    'AND eq.empresa_id = f.empresa_id AND eq.deleted_at IS NULL',
    "WHERE ea.deleted_at IS NULL AND LOWER(COALESCE(ea.status, '')) <> 'cancelado'",
    'AND (ea.aeronave_id IS NOT NULL OR ea.quinzena_id IS NOT NULL',
    "OR (ea.situacao_tipo IS NOT NULL AND UPPER(ea.situacao_tipo) <> 'FOLGA'))",
    'AND COALESCE(eq.data_inicio, ea.data_inicio) <= ?',
    'AND COALESCE(eq.data_fim, ea.data_fim) >= ?',
  ].join(' '),
  base: [
    'SELECT DISTINCT CAST(f.id AS INTEGER) AS funcionario_id FROM funcionarios f',
    'JOIN escalas_quinzenas eq ON eq.empresa_id = f.empresa_id AND eq.deleted_at IS NULL',
    'AND eq.numero = CASE LOWER(TRIM(COALESCE(f.quinzena, \'\')))',
    "WHEN 'primeira' THEN 1 WHEN '1' THEN 1 WHEN '1q' THEN 1 WHEN 'q1' THEN 1",
    "WHEN '1ª' THEN 1 WHEN '1a' THEN 1 WHEN 'primeira quinzena' THEN 1",
    "WHEN 'segunda' THEN 2 WHEN '2' THEN 2 WHEN '2q' THEN 2 WHEN 'q2' THEN 2",
    "WHEN '2ª' THEN 2 WHEN '2a' THEN 2 WHEN 'segunda quinzena' THEN 2 ELSE 0 END",
    'WHERE f.empresa_id = ? AND f.deleted_at IS NULL AND COALESCE(f.ativo, 1) = 1',
    "AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'",
    "AND (UPPER(COALESCE(f.funcao, '')) IN ('PILOTO','COPILOTO','COMANDANTE','PIC','SIC','TRIPULANTE')",
    "OR UPPER(COALESCE(f.cargo, '')) IN ('PILOTO','COPILOTO','COMANDANTE','PIC','SIC','TRIPULANTE'))",
    'AND eq.data_inicio <= ? AND eq.data_fim >= ?',
  ].join(' '),
  checkins: [
    'SELECT CAST(ch.funcionario_id AS INTEGER) AS funcionario_id,',
    'ch.submitted_at, ch.hora_checkin, ch.status_operacional, ch.kss_score',
    'FROM frms_fadiga_checkin ch',
    'JOIN funcionarios f ON f.id = ch.funcionario_id AND f.empresa_id = ch.empresa_id',
    'AND f.deleted_at IS NULL',
    'WHERE ch.deleted_at IS NULL AND ch.empresa_id = ? AND ch.data_checkin = ?',
  ].join(' '),
  flights: [
    'SELECT id, status FROM cv_voos',
    'WHERE empresa_id = ? AND data_programacao = ? AND deleted_at IS NULL',
  ].join(' '),
  crew: [
    'SELECT t.voo_id, CAST(t.funcionario_id AS INTEGER) AS funcionario_id,',
    'CASE WHEN f.id IS NULL THEN 0 ELSE 1 END AS employee_valid',
    'FROM cv_voo_tripulantes t',
    'JOIN cv_voos v ON v.id = t.voo_id AND v.empresa_id = t.empresa_id',
    'AND v.deleted_at IS NULL AND v.data_programacao = ?',
    'LEFT JOIN funcionarios f ON f.id = t.funcionario_id',
    'AND f.empresa_id = t.empresa_id AND f.deleted_at IS NULL',
    'WHERE t.empresa_id = ? AND t.deleted_at IS NULL',
  ].join(' '),
  journeys: [
    'SELECT DISTINCT CAST(j.tripulante_id AS INTEGER) AS funcionario_id',
    'FROM frms_jornada j JOIN funcionarios f',
    'ON f.id = CAST(j.tripulante_id AS INTEGER) AND f.deleted_at IS NULL',
    'WHERE f.empresa_id = ? AND j.deleted_at IS NULL AND j.data = ?',
  ].join(' '),
  legacyScale: [
    'SELECT DISTINCT CAST(e.pic_id AS INTEGER) AS funcionario_id FROM escala_voo_diaria e',
    'WHERE e.empresa_id = ? AND e.data = ? AND e.deleted_at IS NULL AND e.pic_id IS NOT NULL',
    'UNION SELECT DISTINCT CAST(e.sic_id AS INTEGER) AS funcionario_id FROM escala_voo_diaria e',
    'WHERE e.empresa_id = ? AND e.data = ? AND e.deleted_at IS NULL AND e.sic_id IS NOT NULL',
  ].join(' '),
});
export const QUERY_KEYS = Object.freeze(Object.keys(queries));

function assertReadOnly(sql) {
  if (!/^SELECT\s/i.test(sql)) throw new Error('NOT_SELECT');
  if (/\b(INSERT|UPDATE|DELETE|REPLACE|MERGE|CREATE|ALTER|DROP|TRUNCATE|VACUUM|ATTACH|DETACH|REINDEX)\b/i.test(sql)) {
    throw new Error('MUTATING_SQL_BLOCKED');
  }
  if (sql.includes(';')) throw new Error('MULTI_STATEMENT_BLOCKED');
}
for (const sql of Object.values(queries)) assertReadOnly(sql);

function ids(rows) {
  return new Set(rows.map((row) => Number(row.funcionario_id)).filter((v) => Number.isInteger(v) && v > 0));
}
function intersectNotIn(left, right) {
  return [...left].filter((id) => !right.has(id)).length;
}
export function reconcileFrmsCvEvidence(data) {
  const allocations = ids(data.allocation);
  const base = ids(data.base);
  const roster = new Set([...allocations, ...base]);
  const checkinIds = ids(data.checkins);
  const journeys = ids(data.journeys);
  const legacyScale = ids(data.legacyScale);
  const flightIds = new Set(data.flights.map((f) => Number(f.id)));
  const crew = data.crew.filter((c) => flightIds.has(Number(c.voo_id)));
  const crewIds = ids(crew);
  const counts = new Map();
  for (const record of data.checkins) {
    const id = Number(record.funcionario_id);
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  const crewMissing = intersectNotIn(crewIds, checkinIds);
  const cohortMissing = intersectNotIn(roster, checkinIds);
  const invalidCrew = crew.filter((c) => Number(c.employee_valid) !== 1);
  const missingCrewFlights = data.flights.filter(
    (flight) => !crew.some((c) => Number(c.voo_id) === Number(flight.id)),
  );
  const unknownCheckinTime = data.checkins.filter((ch) => !ch.submitted_at);
  const duplicateCrewRows = crew.length - new Set(crew.map((c) => String(c.voo_id) + ':' + String(c.funcionario_id))).size;
  const duplicateCheckinRows = [...counts.values()].filter((n) => n > 1).length;
  const result = {
    date: AUDIT_DATE,
    tenantScope: 'Costa do Sol (tenant 6 only)',
    readOnly: true,
    writes: 0,
    // Roster from current allocation/base fortnight only; FRMS_LEGACY is not evidence.
    evidence: {
      activeAllocationEmployees: allocations.size,
      baseFortnightEmployees: base.size,
      unionActiveFortnightEmployees: roster.size,
      checkinReceivedEmployees: checkinIds.size,
      checkinRecords: data.checkins.length,
      activeFortnightCheckinPending: cohortMissing,
      activeFortnightWithCheckin: roster.size - cohortMissing,
      operationalJourneysEmployees: journeys.size,
      dailyLegacyScaleEmployees: legacyScale.size,
      controleVoosFlights: data.flights.length,
      controleVoosCrewDistinctEmployees: crewIds.size,
      controleVoosCrewRows: crew.length,
      controleVoosCrewCheckinPending: crewMissing,
      crewOutsideConfirmedFortnight: intersectNotIn(crewIds, roster),
      activeFortnightWithoutJourney: intersectNotIn(roster, journeys),
    },
    alerts: {
      duplicateCheckinEmployees: duplicateCheckinRows,
      duplicateCrewRows,
      unknownCheckinTimestampRecords: unknownCheckinTime.length,
      crewWithoutActiveEmployeeLink: invalidCrew.length,
      flightsWithoutCrew: missingCrewFlights.length,
    },
    interpretation: {
      missingCheckinIsPendingNotNonRequired: true,
      flightGateRecomputed: false,
      apiSnapshotCorrelated: false,
      visualAsOfScreenshotCorrelated: false,
      note: 'Counts of current persisted facts for 13/10, not a reconstruction of an earlier UI screenshot. A missing check-in is a pending obligation, not proof of an FRMS software defect. Flight dispatch decisions require the governed backend gate.',
    },
  };
  result.verdict = Object.values(result.alerts).some((n) => n > 0)
    ? 'ANOMALIES_NEED_REVIEW'
    : 'SOURCE_FACTS_RECONCILED_WITH_PENDING_OBLIGATIONS';
  return result;
}

async function queryD1(sql, params) {
  assertReadOnly(sql);
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const dbId = process.env.PRODUCTION_D1_ID;
  if (dbId !== PRODUCTION_DB_ID || [STAGING_DB_ID, DEV_DB_ID].includes(dbId)) {
    throw new Error('PRODUCTION_TARGET_GUARD_FAILED');
  }
  if (!accountId || !token) throw new Error('READ_ONLY_D1_CREDENTIALS_MISSING');
  const url = 'https://api.cloudflare.com/client/v4/accounts/' + encodeURIComponent(accountId) + '/d1/database/' + PRODUCTION_DB_ID + '/query';
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, params }),
  });
  const body = await response.json().catch(() => ({}));
  const section = Array.isArray(body.result) ? body.result[0] : body.result;
  if (!response.ok || body.success !== true || section?.success === false || !Array.isArray(section?.results)) {
    throw new Error('READ_ONLY_QUERY_FAILED:' + response.status);
  }
  return section.results;
}

export async function auditProductionReadOnly() {
  if (!/^[0-9a-f]{40}$/.test(String(process.env.EXPECTED_SHA || ''))) throw new Error('SHA_GUARD_FAILED');
  if (process.env.CONFIRM_READONLY !== 'AIRTRUST_FRMS_CV_READONLY_20261013') throw new Error('CONFIRMATION_GUARD_FAILED');
  const results = {};
  results.tenant = await queryD1(queries.tenant, [TENANT_ID]);
  if (results.tenant.length !== 1) throw new Error('TENANT_SCOPE_NOT_ACTIVE');
  const companyEvidence = String(results.tenant[0].nome || '') + ' ' + String(results.tenant[0].codigo || '');
  if (!/costa\s*(?:do\s*)?sol|\bcds\b/i.test(companyEvidence)) throw new Error('TENANT_NAME_NOT_CONFIRMED');
  results.allocation = await queryD1(queries.allocation, [TENANT_ID, AUDIT_DATE, AUDIT_DATE]);
  results.base = await queryD1(queries.base, [TENANT_ID, AUDIT_DATE, AUDIT_DATE]);
  results.checkins = await queryD1(queries.checkins, [TENANT_ID, AUDIT_DATE]);
  results.flights = await queryD1(queries.flights, [TENANT_ID, AUDIT_DATE]);
  results.crew = await queryD1(queries.crew, [AUDIT_DATE, TENANT_ID]);
  results.journeys = await queryD1(queries.journeys, [TENANT_ID, AUDIT_DATE]);
  results.legacyScale = await queryD1(queries.legacyScale, [TENANT_ID, AUDIT_DATE, TENANT_ID, AUDIT_DATE]);
  const report = reconcileFrmsCvEvidence(results);
  report.generatedAtUtc = new Date().toISOString();
  report.auditSourceSha = process.env.EXPECTED_SHA;
  const outFile = String(process.env.AUDIT_REPORT_PATH || '').trim();
  if (!outFile.startsWith('/')) throw new Error('REPORT_PATH_MUST_BE_ABSOLUTE');
  await writeFile(outFile, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  console.log('FRMS_CV_AUDIT_DONE verdict=' + report.verdict + ' active=' + report.evidence.unionActiveFortnightEmployees
    + ' missingCheckin=' + report.evidence.activeFortnightCheckinPending
    + ' flights=' + report.evidence.controleVoosFlights
    + ' crewCheckinPending=' + report.evidence.controleVoosCrewCheckinPending
    + ' anomalyTotal=' + Object.values(report.alerts).reduce((a, b) => a + b, 0)
    + ' writes=0 tenant=6');
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  auditProductionReadOnly().catch((error) => {
    console.error('FRMS_CV_AUDIT_FAILED:' + String(error.message).replace(/https?:\/\/\S+/g, '<url>'));
    process.exitCode = 1;
  });
}

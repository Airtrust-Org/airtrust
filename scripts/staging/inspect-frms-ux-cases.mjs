#!/usr/bin/env node
// QA 999013: read-only inspection of existing synthetic cases, never a reseed.
// source_reference: #1426; PRs #1550/#1554; no real crew records or health data.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  TENANT_ID, DB_NAME, DB_ID, validateSource, approximation,
} from './seed-frms-ux-30d.mjs';

export const CASE_IDS = [1, 2, 3, 4].map(n => 'qa-frms-ux-case-'+n);
const CASE_CONFIG = [
  { n: 1, crew: 1, kind: 'REPOUSO', daySlot: 3 },
  { n: 2, crew: 2, kind: 'FDP_DIARIO', daySlot: 2 },
  { n: 3, crew: 1, kind: 'HV_7D', daySlot: 1 },
  { n: 4, crew: 2, kind: 'REPOUSO', daySlot: 0 },
];
const pad = (value) => String(value).padStart(2, '0');
// Historical SHA e4bc968e: fixture rows were bound to these FICTIONAL users,
// were unlinked to journeys and could not appear in the canonical cases API.
// These are historical EXPECTATIONS for read-only diagnosis, not a repair.
export const LEGACY_CASE_BASELINE = [
  {id: 'qa-frms-ux-case-1', owner: 'QA-FRMS-UX-07', day: '2026-10-13', kind: 'REPOUSO', level: 'CRITICO'},
  {id: 'qa-frms-ux-case-2', owner: 'QA-FRMS-UX-05', day: '2026-10-12', kind: 'FDP_DIARIO', level: 'ATENCAO'},
  {id: 'qa-frms-ux-case-3', owner: 'QA-FRMS-UX-04', day: '2026-10-10', kind: 'HV_7D', level: 'AVISO'},
  {id: 'qa-frms-ux-case-4', owner: 'QA-FRMS-UX-14', day: '2026-10-09', kind: 'REPOUSO', level: 'CRITICO'},
];


export function expectedQaCases(days) {
  if (!Array.isArray(days) || days.length !== 30) throw new Error('QA_30D_SOURCE_REQUIRED');
  const last = days.filter(d => approximation(d.jornadas) >= 2).slice(-4);
  if (last.length !== 4) throw new Error('QA_VISIBLE_CASE_DAYS_UNAVAILABLE');
  return CASE_CONFIG.map(c => ({
    id: 'qa-frms-ux-case-'+c.n,
    date: last[c.daySlot].day,
    matricula: 'QA-FRMS-UX-'+pad(c.crew),
    kind: c.kind,
  }));
}

/** Never return crew names, documents, emails, tokens or raw database rows. */
export function evaluateQaCases(rows, expected) {
  if (!Array.isArray(rows) || !Array.isArray(expected) || expected.length !== 4)
    throw new Error('QA_CASE_EVALUATION_INPUT_INVALID');
  const found = new Map(rows.map(row => [String(row.id), row]));
  const cases = expected.map(want => {
    const row = found.get(want.id);
    const expectedJourney = 'qa-frms-ux-j-'+want.date+'-'+want.matricula;
    const status = !row ? 'MISSING'
      : row.matricula !== want.matricula || row.tipo_limite !== want.kind
        ? 'CASE_IDENTITY_OR_TYPE_MISMATCH'
        : row.jornada_id !== expectedJourney || row.link_id !== expectedJourney ||
          row.jornada_date !== want.date ? 'JOURNEY_LINK_MISMATCH'
        : row.origem !== 'SIGVOOS' || row.registrado_por !== 'QA_FRMS_UX' ||
          !String(row.observacao ?? '').includes('CENARIO SINTETICO')
            ? 'SIMULATED_SOURCE_INVALID'
        : want.kind === 'FDP_DIARIO' &&
          Number(row.valor_atual_min) !== Number(row.duracao_jornada_minutos)
            ? 'FDP_STALE'
        : Number(row.resolvido) !== 0 ? 'ALREADY_RESOLVED'
        : 'VALID';
    return { case_id: want.id, expected_day: want.date, status };
  });
  return {
    tenant_id: TENANT_ID,
    evaluated: expected.length,
    valid: cases.filter(c => c.status === 'VALID').length,
    verdict: cases.every(c => c.status === 'VALID') ? 'READONLY_ACCEPTANCE_READY'
      : 'GOVERNED_INCREMENTAL_REPAIR_REQUIRED',
    cases,
    writes: 0,
  };
}


/**
 * A SECOND READONLY diagnostic, after the initial four-case assessment.
 * Returns statuses only; NEVER prints DB rows or employee personal fields.
 * A successful diagnosis is NOT an authorization to mutate any QA row.
 */
export function diagnoseLegacyRepairPreflight(caseRows, targetJourneys, expected) {
  if (!Array.isArray(caseRows) || !Array.isArray(targetJourneys) ||
      !Array.isArray(expected) || expected.length !== 4)
    throw new Error('QA_REPAIR_DIAGNOSTIC_INPUT_INVALID');
  const foundCases = new Map(caseRows.map(row => [String(row.id), row]));
  const foundJourneys = new Map(targetJourneys.map(row => [String(row.id), row]));
  const cases = LEGACY_CASE_BASELINE.map((old, index) => {
    const row = foundCases.get(old.id);
    const want = expected[index];
    const journeyId = 'qa-frms-ux-j-'+want.date+'-'+want.matricula;
    const target = foundJourneys.get(journeyId);
    const legacyStatus = !row ? 'MISSING_OR_TENANT_REJECTED'
      : row.matricula !== old.owner || row.tipo_limite !== old.kind ||
        row.nivel !== old.level || String(row.created_at ?? '').slice(0, 10) !== old.day
          ? 'LEGACY_IDENTITY_OR_DATE_DRIFT'
        : row.jornada_id !== null || Number(row.resolvido) !== 0 ||
          Number(row.valor_atual_min) !== 620 || Number(row.valor_limite_min) !== 540 ||
          row.mensagem !== 'QA SINTETICO: revisar contexto e registrar providencia'
            ? 'LEGACY_CASE_STATE_DRIFT'
        : 'LEGACY_CASE_MATCH';
    const targetStatus = !target ? 'TARGET_JOURNEY_MISSING_OR_TENANT_REJECTED'
      : target.matricula !== want.matricula || target.data !== want.date ||
        target.registrado_por !== 'QA_FRMS_UX' ||
        Number(target.duracao_jornada_minutos) <= 0
          ? 'TARGET_JOURNEY_PROVENANCE_DRIFT'
        : target.origem === 'MANUAL' &&
          target.observacao === 'CENARIO SINTETICO - SEM VALIDADE OPERACIONAL'
            ? 'TARGET_JOURNEY_LEGACY_MANUAL'
        : target.origem === 'SIGVOOS' &&
          target.observacao === 'CENARIO SINTETICO - FONTE SIMULADA SEM VALIDADE OPERACIONAL'
            ? 'TARGET_JOURNEY_ALREADY_SIMULATED'
        : 'TARGET_JOURNEY_SOURCE_DRIFT';
    return {case_id: old.id, legacy_case: legacyStatus, target_journey: targetStatus};
  });
  return {
    tenant_id: TENANT_ID,
    reviewed: 4,
    legacy_case_matches: cases.filter(x => x.legacy_case === 'LEGACY_CASE_MATCH').length,
    target_journeys_ready: cases.filter(x => x.target_journey === 'TARGET_JOURNEY_LEGACY_MANUAL' ||
      x.target_journey === 'TARGET_JOURNEY_ALREADY_SIMULATED').length,
    verdict: cases.every(x => x.legacy_case === 'LEGACY_CASE_MATCH' &&
      x.target_journey === 'TARGET_JOURNEY_LEGACY_MANUAL')
        ? 'LEGACY_FIXTURE_PROVEN_READY_FOR_REVIEW'
        : 'BLOCK_ON_UNEXPECTED_PREIMAGE',
    cases,
    writes: 0,
  };
}

function queryReadOnly(sql) {
  if (!/^SELECT\s/i.test(sql) || /;|\b(?:UPDATE|DELETE|INSERT|ALTER|DROP|ATTACH|PRAGMA|REPLACE)\b/i.test(sql))
    throw new Error('READONLY_QUERY_REJECTED');
  const r = spawnSync('npx', [
    'wrangler', 'd1', 'execute', DB_NAME, '--remote', '--json', '--command', sql,
  ], { cwd: join(process.cwd(), 'worker-airtrust'), encoding: 'utf8', maxBuffer: 1048576 });
  if (r.status !== 0) throw new Error('FRMS_QA_REMOTE_READ_FAILED');
  const parsed = JSON.parse(r.stdout);
  return Array.isArray(parsed) ? parsed[0]?.results ?? [] : parsed.results ?? [];
}

function verifyTarget() {
  if (process.env.GITHUB_ACTIONS !== 'true' ||
      process.env.STAGING_D1_NAME !== DB_NAME ||
      process.env.STAGING_D1_ID !== DB_ID ||
      process.env.CONFIRM_FRMS_QA_CASES_INSPECT !== 'AIRTRUST_STAGING_FRMS_CASES_READONLY') {
    throw new Error('FRMS_QA_INSPECTION_SCOPE_REJECTED');
  }
  const r=spawnSync('npx',['wrangler','d1','info',DB_NAME,'--json'],
    {cwd:join(process.cwd(),'worker-airtrust'),encoding:'utf8',maxBuffer:1048576});
  if(r.status!==0) throw new Error('FRMS_QA_DB_ID_CHECK_FAILED');
  const parsed=JSON.parse(r.stdout);
  const observed=String(parsed.uuid??parsed.database_id??parsed.id??parsed.result?.uuid??'');
  if(observed!==DB_ID)throw new Error('FRMS_QA_STAGING_DB_ID_MISMATCH');
}

export async function main() {
  verifyTarget();
  const sha=String(process.env.SOURCE_AGGREGATE_SHA || '');
  const source=validateSource(JSON.parse(readFileSync(
    String(process.env.SANITIZED_AGGREGATE_PATH || ''), 'utf8')), sha);
  const expected=expectedQaCases(source);
  const ids=CASE_IDS.map(id => "'"+id+"'").join(',');
  // Only fixed synthetic identifiers, a hard-coded tenant, and QA-only columns.
  const sql=`SELECT a.id,a.tipo_limite,a.nivel,a.created_at,a.mensagem,a.valor_limite_min,a.valor_atual_min,a.jornada_id,a.resolvido,
      f.matricula,j.id AS link_id,j.data AS jornada_date,j.origem,
      j.registrado_por,j.observacao,j.duracao_jornada_minutos
    FROM frms_alerta a
    INNER JOIN funcionarios f ON f.id=CAST(a.tripulante_id AS INTEGER)
      AND f.empresa_id=${TENANT_ID} AND f.matricula LIKE 'QA-FRMS-UX-%'
      AND f.deleted_at IS NULL
    LEFT JOIN frms_jornada j ON j.id=a.jornada_id
      AND j.tripulante_id=f.id AND j.empresa_id=${TENANT_ID}
      AND j.deleted_at IS NULL
    WHERE a.deleted_at IS NULL AND a.id IN (${ids})`;
  const rows=queryReadOnly(sql);
  const result=evaluateQaCases(rows,expected);
  console.log('FRMS_QA_CASES_READONLY_PREFLIGHT='+JSON.stringify(result));
  if(result.verdict!=='READONLY_ACCEPTANCE_READY') {
    const ids=expected.map(want =>
      "'qa-frms-ux-j-"+want.date+"-"+want.matricula+"'").join(',');
    const targetSql=`SELECT j.id,j.data,j.origem,j.registrado_por,j.observacao,
      j.duracao_jornada_minutos,f.matricula
      FROM frms_jornada j
      INNER JOIN funcionarios f ON f.id=j.tripulante_id AND f.empresa_id=${TENANT_ID}
        AND f.deleted_at IS NULL AND f.matricula LIKE 'QA-FRMS-UX-%'
      WHERE j.empresa_id=${TENANT_ID} AND j.deleted_at IS NULL
        AND j.id IN (${ids})`;
    const targetJourneys=queryReadOnly(targetSql);
    const diagnostic=diagnoseLegacyRepairPreflight(rows,targetJourneys,expected);
    console.log('FRMS_QA_LEGACY_REPAIR_READONLY_DIAGNOSTIC='+JSON.stringify(diagnostic));
    process.exitCode=2;
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch(error => {
    console.error('FRMS_QA_PREFLIGHT_FAILED:', error.message);
    process.exitCode=1;
  });
}

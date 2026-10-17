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
  const sql=`SELECT a.id,a.tipo_limite,a.valor_atual_min,a.jornada_id,a.resolvido,
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
  if(result.verdict!=='READONLY_ACCEPTANCE_READY')process.exitCode=2;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch(error => {
    console.error('FRMS_QA_PREFLIGHT_FAILED:', error.message);
    process.exitCode=1;
  });
}

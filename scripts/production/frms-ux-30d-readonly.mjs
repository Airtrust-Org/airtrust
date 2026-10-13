#!/usr/bin/env node
// Production FRMS 30-day aggregate for UX QA. SELECT-only, fixed tenant/date.
// No individual journeys/check-ins, employee identifiers or raw health values
// are selected, returned, logged or written. This is NOT a data-copy tool.
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const TENANT_ID = 6; // Costa do Sol — verified by name before any aggregate
export const FROM = '2026-09-14';
export const TO = '2026-10-13';
const PROD_DB_ID = '7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae';
const STAGING_DB_ID = 'bf9963f4-eb12-439b-a830-20bbf577ac22';
const DEV_DB_ID = 'a72fb05b-0912-4ad9-9686-e7948c8b09eb';
export const CONFIRMATION = 'AIRTRUST_FRMS_UX_30D_READONLY';

export const QUERIES = Object.freeze({
  tenant: "SELECT nome, codigo FROM empresas WHERE id = ? AND ativo = 1 AND deleted_at IS NULL",
  jornadas: [
    "SELECT j.data AS dia, COUNT(*) AS n FROM frms_jornada j",
    "JOIN funcionarios f ON f.id = CAST(j.tripulante_id AS INTEGER)",
    "WHERE f.empresa_id = ? AND f.deleted_at IS NULL AND j.deleted_at IS NULL",
    "AND j.data BETWEEN ? AND ? GROUP BY j.data ORDER BY j.data",
  ].join(' '),
  checkins: [
    "SELECT ch.data_checkin AS dia, COUNT(*) AS n FROM frms_fadiga_checkin ch",
    "JOIN funcionarios f ON f.id = CAST(ch.funcionario_id AS INTEGER)",
    "WHERE ch.empresa_id = ? AND f.empresa_id = ? AND f.deleted_at IS NULL",
    "AND ch.deleted_at IS NULL AND ch.data_checkin BETWEEN ? AND ?",
    "GROUP BY ch.data_checkin ORDER BY ch.data_checkin",
  ].join(' '),
  casos: [
    "SELECT substr(a.created_at,1,10) AS dia, COUNT(*) AS n FROM frms_alerta a",
    "JOIN funcionarios f ON f.id = CAST(a.tripulante_id AS INTEGER)",
    "WHERE f.empresa_id = ? AND f.deleted_at IS NULL AND a.deleted_at IS NULL",
    "AND substr(a.created_at,1,10) BETWEEN ? AND ?",
    "GROUP BY substr(a.created_at,1,10) ORDER BY dia",
  ].join(' '),
  voos: [
    "SELECT data_programacao AS dia, COUNT(*) AS n FROM cv_voos",
    "WHERE empresa_id = ? AND deleted_at IS NULL AND data_programacao BETWEEN ? AND ?",
    "GROUP BY data_programacao ORDER BY data_programacao",
  ].join(' '),
});

export function assertReadOnlyQuery(sql) {
  if (!/^SELECT\s/i.test(sql)) throw new Error('ONLY_SELECT_PERMITTED');
  if (/\b(INSERT|UPDATE|DELETE|REPLACE|MERGE|CREATE|ALTER|DROP|VACUUM|ATTACH|DETACH|PRAGMA)\b/i.test(sql)) {
    throw new Error('MUTATION_FORBIDDEN');
  }
  if (sql.includes(';')) throw new Error('MULTI_STATEMENT_FORBIDDEN');
}
for (const query of Object.values(QUERIES)) assertReadOnlyQuery(query);

export function disclosureBand(value) {
  if (!Number.isInteger(value) || value < 0 || value > 1000000) throw new Error('INVALID_AGGREGATE');
  if (value === 0) return '0';
  if (value < 5) return '1-4';
  if (value < 10) return '5-9';
  if (value < 20) return '10-19';
  if (value < 50) return '20-49';
  return '50+';
}

function countByDay(rows) {
  const out = new Map();
  for (const row of rows) {
    const date = String(row.dia || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < FROM || date > TO || out.has(date)) {
      throw new Error('INVALID_OR_DUPLICATE_AGGREGATE_DATE');
    }
    const n = Number(row.n);
    if (!Number.isInteger(n) || n < 0) throw new Error('INVALID_AGGREGATE_COUNT');
    out.set(date, n);
  }
  return out;
}

/** Strictly lower-granularity surrogate input; preserves no person or exact minority cell. */
export function prepareSanitized30dAggregates(groups) {
  const keys = ['jornadas', 'checkins', 'casos', 'voos'];
  const maps = Object.fromEntries(keys.map((key) => [key, countByDay(groups[key] || [])]));
  const days = [];
  for (let cursor = Date.parse(FROM + 'T00:00:00Z'); cursor <= Date.parse(TO + 'T00:00:00Z'); cursor += 86400000) {
    const day = new Date(cursor).toISOString().slice(0, 10);
    const bands = { day };
    for (const key of keys) bands[key] = disclosureBand(maps[key].get(day) ?? 0);
    days.push(bands);
  }
  if (days.length !== 30) throw new Error('INVALID_WINDOW');
  return Object.freeze({
    source: 'PRODUCTION_AGGREGATES_NOT_INDIVIDUAL_RECORDS',
    company: 'Costa do Sol',
    from: FROM,
    to: TO,
    suppressedSmallCells: true,
    estimatedOrCopiedEmployeeJourneys: false,
    days,
  });
}

async function queryD1(sql, params) {
  assertReadOnlyQuery(sql);
  const databaseId = process.env.PRODUCTION_D1_ID || '';
  if (databaseId !== PROD_DB_ID || [STAGING_DB_ID, DEV_DB_ID].includes(databaseId)) {
    throw new Error('PRODUCTION_TARGET_MISMATCH');
  }
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !token) throw new Error('READ_ONLY_CREDENTIALS_MISSING');
  const url = 'https://api.cloudflare.com/client/v4/accounts/' +
    encodeURIComponent(accountId) + '/d1/database/' + PROD_DB_ID + '/query';
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, params }),
  });
  const payload = await response.json().catch(() => ({}));
  const first = Array.isArray(payload.result) ? payload.result[0] : payload.result;
  if (!response.ok || payload.success !== true || first?.success === false || !Array.isArray(first?.results)) {
    throw new Error('PRODUCTION_READ_FAILED_HTTP_' + response.status);
  }
  return first.results;
}

export async function main() {
  const expectedSha = String(process.env.EXPECTED_SHA || '');
  if (!/^[a-f0-9]{40}$/.test(expectedSha) || process.env.CONFIRM_READONLY !== CONFIRMATION) {
    throw new Error('READ_ONLY_CONFIRMATION_REJECTED');
  }
  const tenant = await queryD1(QUERIES.tenant, [TENANT_ID]);
  if (tenant.length !== 1 ||
      !/costa\s*(?:do\s*)?sol|\bcds\b/i.test(String(tenant[0].nome || '') + ' ' + String(tenant[0].codigo || ''))) {
    throw new Error('EXPECTED_PRODUCTION_TENANT_NOT_CONFIRMED');
  }
  const groups = {
    jornadas: await queryD1(QUERIES.jornadas, [TENANT_ID, FROM, TO]),
    checkins: await queryD1(QUERIES.checkins, [TENANT_ID, TENANT_ID, FROM, TO]),
    casos: await queryD1(QUERIES.casos, [TENANT_ID, FROM, TO]),
    voos: await queryD1(QUERIES.voos, [TENANT_ID, FROM, TO]),
  };
  const safe = {
    ...prepareSanitized30dAggregates(groups),
    reviewedSourceSha: expectedSha,
    generatedAtUtc: new Date().toISOString(),
    writes: 0,
  };
  const file = String(process.env.AUDIT_REPORT_PATH || '');
  if (!file.startsWith('/') || !file.endsWith('.json')) throw new Error('REPORT_PATH_INVALID');
  await writeFile(file, JSON.stringify(safe, null, 2) + '\n', { mode: 0o600 });
  console.log('FRMS_UX_30D_AGGREGATES_OK days=30 anonymized-bands=true writes=0');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error('FRMS_UX_30D_READONLY_FAILED:' + String(error.message).replace(/https?:\/\/\S+/g, '<url>'));
    process.exitCode = 1;
  });
}

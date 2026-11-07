#!/usr/bin/env node
// Production auth incident diagnostic. Fixed SELECT / PRAGMA only; no subject
// identifiers, role grants, tenant-owned records, or credentials in output.
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REQUIRED = {
  user_platform_roles: ['user_id', 'role_code', 'revoked_at', 'expires_at'],
  support_access_grants: ['user_id', 'empresa_id', 'access_level', 'revoked_at', 'expires_at'],
};

// Hardcoded SQL, no runtime-provided table or query names.
const TABLE_QUERY =
  "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('user_platform_roles', 'support_access_grants') ORDER BY name";
const COLUMN_QUERIES = {
  user_platform_roles: "PRAGMA table_info('user_platform_roles')",
  support_access_grants: "PRAGMA table_info('support_access_grants')",
};
const VALIDATION_QUERIES = {
  user_platform_roles:
    "SELECT role_code FROM user_platform_roles WHERE user_id = -1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP) LIMIT 1",
  support_access_grants:
    "SELECT empresa_id, access_level FROM support_access_grants WHERE user_id = -1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP) LIMIT 1",
};

export function classifySqlProbeError(text) {
  const input = String(text || '');
  if (/no such column/i.test(input)) return 'COLUMN_MISSING';
  if (/no such table/i.test(input)) return 'TABLE_MISSING';
  if (/too many SQL variables|SQLITE_RANGE/i.test(input)) return 'BIND_LIMIT';
  if (/timeout|timed out|deadline exceeded/i.test(input)) return 'TIMEOUT';
  if (/rate limit|429|too many requests/i.test(input)) return 'RATE_LIMIT';
  if (/authentication|authorization|permission|forbidden|403/i.test(input)) return 'ACCESS_DENIED';
  return 'OTHER_D1_FAILURE';
}

export function analyzePlatformSchema(tables, columnsByTable) {
  const available = new Set((tables || []).map((row) => String(row.name || '')));
  const report = {};
  for (const [table, required] of Object.entries(REQUIRED)) {
    const present = available.has(table);
    const columns = new Set((columnsByTable[table] || []).map((row) => String(row.name || '')));
    report[table] = {
      present,
      missingColumns: present ? required.filter((column) => !columns.has(column)) : [],
    };
  }
  return report;
}

function execFixedD1Query(label, sql) {
  if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID) {
    throw new Error('PRODUCTION_D1_READONLY_SECRETS_MISSING');
  }
  const cwd = resolve(dirname(fileURLToPath(import.meta.url)), '../../worker-airtrust');
  const run = spawnSync('npx', [
    '--no-install', 'wrangler', 'd1', 'execute', 'airtrust-db',
    '--env', 'production', '--remote', '--json', '--command', sql,
  ], { cwd, encoding: 'utf8', timeout: 45000, maxBuffer: 2 * 1024 * 1024 });
  if (run.error || run.status !== 0) {
    // Never print SQL, D1 responses, secret environment, or record values.
    console.error(`PLATFORM_ACCESS_READONLY=${label}:FAIL:${classifySqlProbeError(run.stderr || run.error?.message)}`);
    throw new Error(`PRODUCTION_D1_PROBE_FAILED:${label}`);
  }
  let response;
  try {
    response = JSON.parse(run.stdout);
  } catch {
    throw new Error(`PRODUCTION_D1_BAD_RESPONSE:${label}`);
  }
  if (!Array.isArray(response) || !Array.isArray(response[0]?.results)) {
    throw new Error(`PRODUCTION_D1_BAD_RESULT_SHAPE:${label}`);
  }
  return response[0].results;
}

export function runProductionPlatformAccessReadOnly() {
  const tableRows = execFixedD1Query('table_presence', TABLE_QUERY);
  const available = new Set(tableRows.map((row) => String(row.name || '')));
  const columns = {};
  for (const table of Object.keys(REQUIRED)) {
    columns[table] = available.has(table)
      ? execFixedD1Query(`columns_${table}`, COLUMN_QUERIES[table])
      : [];
  }
  const report = analyzePlatformSchema(tableRows, columns);
  let complete = true;
  for (const [table, state] of Object.entries(report)) {
    console.log(`PLATFORM_ACCESS_SCHEMA:${table}:present=${state.present}:missing_columns=${state.missingColumns.join(',') || 'none'}`);
    if (state.missingColumns.length) complete = false;
    if (state.present && !state.missingColumns.length) {
      execFixedD1Query(`parse_${table}`, VALIDATION_QUERIES[table]);
      console.log(`PLATFORM_ACCESS_PARSE:${table}=PASS`);
    }
  }
  if (!complete) throw new Error('PLATFORM_ACCESS_SCHEMA_DRIFT_DETECTED');
  console.log('PLATFORM_ACCESS_SCHEMA_DIAGNOSTIC=PASS (does not certify runtime availability)');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    runProductionPlatformAccessReadOnly();
  } catch (e) {
    process.exitCode = 1;
    console.error(`PLATFORM_ACCESS_DIAGNOSTIC_FAILED=${e instanceof Error ? e.message : 'UNKNOWN'}`);
  }
}

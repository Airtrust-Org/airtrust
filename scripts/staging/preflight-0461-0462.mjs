#!/usr/bin/env node
// Read-only, staging-only contract preflight for the two migrations that are
// ALTER/index-only and therefore cannot be safely classified by table creation.
import { spawnSync } from 'node:child_process';
import {
  MIGRATION_0461,
  MIGRATION_0462,
  assertSequentialOrder,
  evaluate0461,
  evaluate0462,
} from './lib/governed-migration-0461-0462-contract.mjs';

const DB_NAME = 'airtrust-db-staging-baseline-20260701';
const DB_ID = 'bf9963f4-eb12-439b-a830-20bbf577ac22';
const BLOCKED_DB_ID = '7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae';
const requested = process.argv.find((arg) => arg.startsWith('--migration='))?.slice('--migration='.length);

if (![MIGRATION_0461, MIGRATION_0462].includes(requested || '')) {
  throw new Error('Use --migration=0461_refresh_tokens_empresa_id.sql or 0462_qualificacoes_tipos_codigo_tenant_active_unique.sql');
}
if ((process.env.STAGING_D1_NAME || DB_NAME) !== DB_NAME || (process.env.STAGING_D1_ID || DB_ID) !== DB_ID || DB_ID === BLOCKED_DB_ID) {
  throw new Error('STAGING_TARGET_REJECTED');
}

function query(sql) {
  const run = spawnSync('npx', ['wrangler', 'd1', 'execute', DB_NAME, '--remote', '--json', '--command', sql], {
    cwd: new URL('../../worker-airtrust/', import.meta.url), encoding: 'utf8',
  });
  if (run.status !== 0) throw new Error(`NOT_VERIFIABLE: ${run.stderr || run.stdout}`);
  return JSON.parse(run.stdout)[0]?.results ?? [];
}

const tables = query("SELECT name FROM sqlite_master WHERE type='table'").map((row) => row.name);
const ledgerNames = query('SELECT name FROM d1_migrations').map((row) => row.name);
const refreshColumns = query("SELECT name, type, \"notnull\" AS not_null FROM pragma_table_info('refresh_tokens')");
const refreshIndexes = query("SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='refresh_tokens'");
const qualificationColumns = query("SELECT name, type, \"notnull\" AS not_null FROM pragma_table_info('qualificacoes_tipos')");
const qualificationIndexes = query("SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='qualificacoes_tipos'");
const duplicateRows = query("SELECT COUNT(*) AS count FROM (SELECT empresa_id, codigo FROM qualificacoes_tipos WHERE deleted_at IS NULL GROUP BY empresa_id, codigo COLLATE NOCASE HAVING COUNT(*) > 1)");
const status0461 = evaluate0461({ tables, columns: refreshColumns, indexes: refreshIndexes, ledgerNames });
const status0462 = evaluate0462({ tables, columns: qualificationColumns, indexes: qualificationIndexes, ledgerNames, activeDuplicateCount: Number(duplicateRows[0]?.count) });
const selected = requested === MIGRATION_0461 ? status0461 : status0462;
let order = { state: 'OK' };
try {
  assertSequentialOrder(requested, ledgerNames, status0461);
} catch (error) {
  order = { state: 'BLOCKED', reason: error instanceof Error ? error.message : String(error) };
}
console.log(JSON.stringify({ migration: requested, status: selected.state, reason: selected.reason, order, prerequisites: { [MIGRATION_0461]: status0461, [MIGRATION_0462]: status0462 } }, null, 2));
if (!['PENDING', 'ALREADY_APPLIED'].includes(selected.state) || order.state !== 'OK') process.exitCode = 1;

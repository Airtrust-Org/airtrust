#!/usr/bin/env node

// Read-only tenant-integrity verification for the synthetic Controle de Voos
// E2E. It reads only IDs from the temporary manifest/report and aggregate
// counts from the official staging D1. It never prints credentials or row data.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ALLOWED_D1_NAME = 'airtrust-db-staging-baseline-20260701';
const WORKER_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../worker-airtrust');

function fail(message) {
  throw new Error(message);
}

function positiveInt(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) fail(`${label} must be a positive integer`);
  return parsed;
}

function query(sql) {
  const dbName = String(process.env.STAGING_D1_NAME || ALLOWED_D1_NAME).trim();
  if (dbName !== ALLOWED_D1_NAME) fail(`unexpected staging D1 target: ${dbName}`);
  const result = spawnSync(
    'npx',
    ['wrangler', 'd1', 'execute', dbName, '--config', 'wrangler.toml', '--env', 'staging', '--remote', '--command', sql, '--json'],
    { cwd: WORKER_DIR, encoding: 'utf8', env: process.env },
  );
  if (result.status !== 0) fail(`D1 read failed: ${result.stderr || result.stdout}`);
  const parsed = JSON.parse(result.stdout);
  return parsed[0]?.results ?? [];
}

function count(sql) {
  const row = query(sql)[0];
  const value = row?.count ?? row?.COUNT ?? row?.['COUNT(*)'] ?? Object.values(row || {})[0];
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) fail(`invalid aggregate count for ${sql}`);
  return parsed;
}

function operationId(report, operation) {
  const record = report.operations?.find((entry) => entry.operation === operation && entry.result === 'PASS');
  return positiveInt(record?.operation_id, `operation_id:${operation}`);
}

function assertTenantScoped({ table, relationColumn, relationId, empresaId, requireRows = false }) {
  const total = count(`SELECT COUNT(*) AS count FROM ${table} WHERE ${relationColumn} = ${relationId};`);
  const mismatches = count(
    `SELECT COUNT(*) AS count FROM ${table} WHERE ${relationColumn} = ${relationId} AND empresa_id <> ${empresaId};`,
  );
  if (requireRows && total < 1) fail(`${table} expected at least one synthetic support record`);
  if (mismatches !== 0) fail(`${table} has ${mismatches} cross-tenant synthetic support record(s)`);
  process.stdout.write(`RDV_0438_TENANT_SCOPE:${table}:total=${total}:mismatches=${mismatches}\n`);
}

function main() {
  const [manifestPath, reportPath] = process.argv.slice(2);
  if (!manifestPath || !reportPath) {
    fail('usage: validate-0438-e2e-tenant-records.mjs <manifest.json> <e2e-report.json>');
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  if (report.ranFully !== true || Number(report.failed) !== 0) fail('E2E report is not fully green');

  const empresaId = positiveInt(manifest.empresaA?.id, 'empresaA.id');
  const vooId = operationId(report, 'criar_voo');
  const rdvId = operationId(report, 'criar_rdv');

  const rdvOwnerMismatch = count(
    `SELECT COUNT(*) AS count FROM cv_rdv_operacional WHERE id = ${rdvId} AND (voo_id <> ${vooId} OR empresa_id <> ${empresaId});`,
  );
  if (rdvOwnerMismatch !== 0) fail('synthetic RDV owner/tenant mismatch');

  assertTenantScoped({
    table: 'cv_rdv_aprovacoes',
    relationColumn: 'rdv_id',
    relationId: rdvId,
    empresaId,
    requireRows: true,
  });
  assertTenantScoped({
    table: 'cv_rdv_revisoes',
    relationColumn: 'rdv_id',
    relationId: rdvId,
    empresaId,
    requireRows: true,
  });
  assertTenantScoped({
    table: 'cv_rdv_alertas',
    relationColumn: 'rdv_id',
    relationId: rdvId,
    empresaId,
    requireRows: false,
  });
  assertTenantScoped({
    table: 'cv_voo_abastecimentos',
    relationColumn: 'voo_id',
    relationId: vooId,
    empresaId,
    requireRows: true,
  });

  process.stdout.write('RDV_0438_SYNTHETIC_TENANT_RECORDS=PASS\n');
}

try {
  main();
} catch (error) {
  process.stderr.write(`ERROR: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

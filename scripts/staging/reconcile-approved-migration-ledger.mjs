#!/usr/bin/env node

import { existsSync, statSync } from 'node:fs';
import { relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  ALLOWED_STAGING_DB_ID,
  ALLOWED_STAGING_DB_NAME,
  APPROVED_LEDGER_RECONCILIATIONS,
  LEDGER_RECONCILIATION_CONFIRMATION,
  ROOT,
  assertAllowedStagingTarget,
  buildLedgerInsertSql,
  createRemoteExecutor,
  discoverLedgerColumns,
  inspectApprovedMigrations,
  verifyApprovedMigrationFiles,
} from './reconcile-approved-migration-ledger-lib.mjs';

function git(commandArgs) {
  const result = spawnSync('git', commandArgs, { cwd: ROOT, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `git ${commandArgs.join(' ')} falhou`);
  }
  return String(result.stdout || '').trim();
}

function assertWorkingTreeClean() {
  const status = git(['status', '--porcelain']);
  if (status.length > 0) {
    throw new Error('Working tree não está limpa — reconciliação recusada.');
  }
}

function assertBackupFile(backupFile) {
  if (!backupFile) {
    throw new Error('Use --backup-file=<caminho> com um backup oficial válido.');
  }
  if (!existsSync(backupFile)) {
    throw new Error(`Backup não encontrado: ${backupFile}`);
  }
  const stat = statSync(backupFile);
  if (!stat.isFile() || stat.size === 0) {
    throw new Error(`Backup inválido ou vazio: ${backupFile}`);
  }
  const rel = relative(ROOT, backupFile);
  if (!rel.startsWith('..')) {
    throw new Error(`Backup precisa estar fora do Git: ${backupFile}`);
  }
  return {
    path: backupFile,
    sizeBytes: stat.size,
    mtimeUtc: stat.mtime.toISOString(),
  };
}

async function queryLedgerNames(executor) {
  const rows = await executor(
    `SELECT name, applied_at
     FROM d1_migrations
     WHERE name IN (${APPROVED_LEDGER_RECONCILIATIONS.map((item) => `'${item.file}'`).join(', ')})
     ORDER BY name;`,
  );
  return rows;
}

function parseArgs(argv) {
  let apply = false;
  let backupFile = '';

  for (const arg of argv) {
    if (arg === '--apply') {
      apply = true;
      continue;
    }
    if (arg.startsWith('--backup-file=')) {
      backupFile = arg.slice('--backup-file='.length);
      continue;
    }
    throw new Error(`Argumento desconhecido: ${arg}`);
  }

  return { apply, backupFile };
}

async function main() {
  const { apply, backupFile } = parseArgs(process.argv.slice(2));
  const dbName = process.env.STAGING_D1_NAME || ALLOWED_STAGING_DB_NAME;
  const dbId = process.env.STAGING_D1_ID || ALLOWED_STAGING_DB_ID;
  assertAllowedStagingTarget(dbName, dbId);
  assertWorkingTreeClean();

  const gitSha = git(['rev-parse', 'HEAD']);
  const backup = assertBackupFile(backupFile);
  const migrationFiles = verifyApprovedMigrationFiles();
  const executor = createRemoteExecutor(dbName);
  const ledgerBefore = await queryLedgerNames(executor);
  const ledgerColumns = await discoverLedgerColumns(executor);
  const inspections = await inspectApprovedMigrations(executor);
  const blocking = inspections.filter((item) => item.result !== 'INTEGRALMENTE_APLICADA');
  const plannedWrites = inspections
    .filter((item) => item.result === 'INTEGRALMENTE_APLICADA')
    .filter((item) => !ledgerBefore.some((row) => row.name === item.migration))
    .map((item) => item.migration);

  const report = {
    target: { dbName, dbId },
    generatedAtUtc: new Date().toISOString(),
    gitSha,
    backup,
    ledgerColumns: ledgerColumns.columnNames,
    migrationFiles,
    ledgerBefore,
    inspections,
    blocking: blocking.map((item) => ({ migration: item.migration, result: item.result })),
    plannedWrites,
    mode: apply ? 'apply' : 'dry-run',
  };

  console.log(JSON.stringify(report, null, 2));

  if (blocking.length > 0) {
    throw new Error(
      `Estado não reconciliável sem reparo forward-only: ${blocking
        .map((item) => `${item.migration}=${item.result}`)
        .join(', ')}`,
    );
  }

  if (!apply) {
    console.log(
      `DRY_RUN_OK: ${plannedWrites.length} entrada(s) seriam registradas no ledger. ` +
        `Para aplicar, use --apply com CONFIRM_STAGING_LEDGER_RECONCILIATION=${LEDGER_RECONCILIATION_CONFIRMATION}.`,
    );
    return;
  }

  if (process.env.CONFIRM_STAGING_LEDGER_RECONCILIATION !== LEDGER_RECONCILIATION_CONFIRMATION) {
    throw new Error(
      `--apply requer CONFIRM_STAGING_LEDGER_RECONCILIATION=${LEDGER_RECONCILIATION_CONFIRMATION}.`,
    );
  }

  const sql = buildLedgerInsertSql(ledgerColumns.columnNames, APPROVED_LEDGER_RECONCILIATIONS);
  const result = spawnSync(
    'npx',
    ['wrangler', 'd1', 'execute', dbName, '--remote', '--json', '--command', sql],
    { cwd: `${ROOT}/worker-airtrust`, encoding: 'utf8' },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'Falha ao registrar ledger.');
  }

  const ledgerAfter = await queryLedgerNames(executor);
  console.log(
    JSON.stringify(
      {
        applied: true,
        ledgerBefore,
        ledgerAfter,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(String(err?.message || err));
  process.exitCode = 1;
});

#!/usr/bin/env node

import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  PRODUCTION_TARGET,
  assertCleanMain,
  assertPathOutsideRepo,
  assertProductionTarget,
  resolveProductionTargetFromConfig,
} from './lib/reconcile-gates.mjs';
import {
  buildBackupReport,
  buildD1ExportArgs,
  inspectDumpWithSqlite,
} from './lib/backup-d1-readonly.mjs';
import { runCommand } from './lib/simuladores-matriz-preflight.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function fail(message) {
  process.stderr.write(`ERRO: ${message}\n`);
  process.exit(1);
}

function utcStamp() {
  return new Date()
    .toISOString()
    .replace(/[:-]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

function main() {
  const configPath = resolve(arg('--config') || 'worker-airtrust/wrangler.toml');
  const env = String(arg('--env') || 'production');
  const outDir = resolve(arg('--out-dir') || `/tmp/airtrust-production-backups`);
  const outFileArg = arg('--out-file');
  const outFile = assertPathOutsideRepo({
    path:
      outFileArg || join(outDir, `airtrust-db-production-backup-${utcStamp()}-${process.pid}.sql`),
    repoRoot: REPO_ROOT,
  });

  const target = resolveProductionTargetFromConfig(configPath, env);
  assertProductionTarget(target);
  assertCleanMain({ cwd: REPO_ROOT });

  mkdirSync(dirname(outFile), { recursive: true });

  try {
    runCommand(
      'npx',
      buildD1ExportArgs({
        database: PRODUCTION_TARGET.database_name,
        configPath,
        env,
        outputPath: outFile,
      }),
      { cwd: REPO_ROOT },
    );
    const inspected = inspectDumpWithSqlite(outFile);
    const report = buildBackupReport({
      outFile,
      target,
      gitHead: runCommand('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT }).trim(),
      inspected,
    });

    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (!report.ok) {
      process.stderr.write(
        `D1_RESTORE_INTEGRITY_FAILED: integrity=${report.restored_sqlite.integrity_check} ` +
          `foreign_key_violations=${report.restored_sqlite.foreign_key_check_count}\n`,
      );
      process.exitCode = 1;
    }
  } finally {
    rmSync(inspected.scratchDir, { recursive: true, force: true });
  }
}

main();

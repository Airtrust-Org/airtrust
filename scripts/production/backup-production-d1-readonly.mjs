#!/usr/bin/env node

import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
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

const REPO_ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..', '..');

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
    if (report.restored_sqlite.integrity_check !== 'ok') {
      fail(`integrity_check divergente: ${report.restored_sqlite.integrity_check}`);
    }
    rmSync(inspected.scratchDir, { recursive: true, force: true });
  } finally {
    // no-op: local scratch dir is cleaned only after successful inspection.
  }
}

main();

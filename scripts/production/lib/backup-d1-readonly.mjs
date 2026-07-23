import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { sha256OfFile } from './reconcile-gates.mjs';
import { runCommand } from './simuladores-matriz-preflight.mjs';

export function buildD1ExportArgs({ database, configPath, env, outputPath }) {
  return [
    '--no-install',
    'wrangler',
    'd1',
    'export',
    database,
    '--config',
    configPath,
    '--env',
    env,
    '--remote',
    '--output',
    outputPath,
  ];
}

export function inspectDumpWithSqlite(dumpPath, { run = runCommand } = {}) {
  const scratchDir = mkdtempSync(join(tmpdir(), 'airtrust-d1-backup-'));
  const restoredDb = join(scratchDir, 'restore.sqlite');
  try {
    run('sqlite3', [restoredDb], {
      input: `.read ${dumpPath}\n`,
    });
    const integrityCheck = run('sqlite3', [restoredDb, 'PRAGMA integrity_check;']).trim();
    const fkCheckLines = String(
      run('sqlite3', [restoredDb], { input: 'PRAGMA foreign_key_check;\n' }),
    )
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    return {
      scratchDir,
      restoredDb,
      integrity_check: integrityCheck,
      foreign_key_check_count: fkCheckLines.length,
    };
  } catch (error) {
    rmSync(scratchDir, { recursive: true, force: true });
    throw error;
  }
}

export function buildBackupReport({ outFile, target, gitHead, inspected }) {
  return {
    ok: inspected.integrity_check === 'ok',
    generated_at: new Date().toISOString(),
    git_head: gitHead,
    target,
    backup: {
      path: outFile,
      bytes: statSync(outFile).size,
      sha256: sha256OfFile(outFile),
    },
    restored_sqlite: {
      integrity_check: inspected.integrity_check,
      foreign_key_check_count: inspected.foreign_key_check_count,
    },
    policy: {
      outside_git: true,
      uploaded_to_git: false,
      uploaded_to_r2: false,
    },
  };
}

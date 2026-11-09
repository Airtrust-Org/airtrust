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
    // sqlite3 dot-command paths must be quoted (runner temp paths may contain
    // spaces). -bail prevents returning a misleading partial restore on SQL errors.
    run('sqlite3', ['-bail', restoredDb], {
      input: `.read ${JSON.stringify(dumpPath)}\n`,
    });
    const integrityCheck = run('sqlite3', [restoredDb, 'PRAGMA integrity_check;']).trim();
    // Count, never emit row-level foreign key violations: they can reveal
    // production record identifiers and may exceed subprocess stdout buffers.
    const fkViolationCount = Number(
      String(run('sqlite3', ['-bail', restoredDb, 'SELECT COUNT(*) FROM pragma_foreign_key_check;'])).trim(),
    );
    if (!Number.isSafeInteger(fkViolationCount) || fkViolationCount < 0) {
      throw new Error('D1_RESTORE_FOREIGN_KEY_CHECK_INVALID');
    }
    return {
      scratchDir,
      restoredDb,
      integrity_check: integrityCheck,
      foreign_key_check_count: fkViolationCount,
    };
  } catch (error) {
    rmSync(scratchDir, { recursive: true, force: true });
    throw error;
  }
}

export function buildBackupReport({ outFile, target, gitHead, inspected }) {
  return {
    ok: inspected.integrity_check === 'ok' && inspected.foreign_key_check_count === 0,
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

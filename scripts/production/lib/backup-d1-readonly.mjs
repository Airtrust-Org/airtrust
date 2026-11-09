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
    // Aggregates only schema-level FK metadata. Never read or export rowid,
    // child key values, tenant identifiers, or other production row data.
    const groupSql = [
      'SELECT "table" AS child_table, parent AS parent_table,',
      'fkid AS constraint_id, COUNT(*) AS violations',
      'FROM pragma_foreign_key_check',
      'GROUP BY "table", parent, fkid',
      'ORDER BY violations DESC, child_table, parent_table, constraint_id;',
    ].join(' ');
    const groupJson = String(run('sqlite3', ['-json', restoredDb, groupSql])).trim();
    const groups = groupJson ? JSON.parse(groupJson) : [];
    if (!Array.isArray(groups) || groups.length > 10000) {
      throw new Error('D1_RESTORE_FK_GROUPS_INVALID');
    }
    const safeSchemaName = (name) => {
      if (typeof name !== 'string') throw new Error('D1_RESTORE_FK_GROUP_NAME_INVALID');
      return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : '[nonstandard_identifier]';
    };
    const fkGroups = groups.map(group => {
      if (!group || !Number.isSafeInteger(group.constraint_id) || group.constraint_id < 0 ||
          !Number.isSafeInteger(group.violations) || group.violations <= 0) {
        throw new Error('D1_RESTORE_FK_GROUP_INVALID');
      }
      return {
        child_table: safeSchemaName(group.child_table),
        parent_table: safeSchemaName(group.parent_table),
        constraint_id: group.constraint_id,
        violations: group.violations,
      };
    });
    if (fkGroups.reduce((total, group) => total + group.violations, 0) !== fkViolationCount) {
      throw new Error('D1_RESTORE_FK_GROUPS_COUNT_MISMATCH');
    }
    return {
      scratchDir,
      restoredDb,
      integrity_check: integrityCheck,
      foreign_key_check_count: fkViolationCount,
      foreign_key_violation_groups: fkGroups,
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
      foreign_key_violation_groups: inspected.foreign_key_violation_groups ?? [],
    },
    policy: {
      outside_git: true,
      uploaded_to_git: false,
      uploaded_to_r2: false,
    },
  };
}

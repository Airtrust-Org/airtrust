#!/usr/bin/env node
// Offline preparation ONLY. Input is a disposable SQLite restored from an
// authorized D1 export. Never connects to, writes, or drops production D1.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CHILD = '_backup_qh_tmp';
const PARENT = 'funcionarios_backup';
const ARCHIVE = '_archive_qh_fk_20261110';
const EXPECTED = 525;
const sha256 = data => createHash('sha256').update(data).digest('hex');

function fail(code) { throw new Error(code); }
function execSqlite(database, sql, { json = false } = {}) {
  const result = spawnSync('sqlite3', [...(json ? ['-json'] : []), '-batch', '-bail', database, sql], {
    encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0 || result.error) fail('LEGACY_QH_SQLITE_OPERATION_FAILED');
  return result.stdout;
}
function query(database, sql) {
  const output = execSqlite(database, sql, { json: true }).trim();
  return output ? JSON.parse(output) : [];
}
function outsideRepo(path) {
  const rel = relative(REPO, path);
  return rel === '..' || rel.startsWith('..' + sep);
}
export function prepareLegacyQhArchive({ sourceDb, archiveDir }) {
  const source = realpathSync(resolve(sourceDb));
  if (!statSync(source).isFile()) fail('LEGACY_QH_SOURCE_NOT_FILE');
  if (!outsideRepo(source)) fail('LEGACY_QH_SOURCE_INSIDE_REPO');
  const target = resolve(archiveDir);
  if (!outsideRepo(target)) fail('LEGACY_QH_ARCHIVE_INSIDE_REPO');
  if (existsSync(target)) fail('LEGACY_QH_ARCHIVE_DIR_EXISTS');
  const tables = query(source, "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('_backup_qh_tmp', 'funcionarios_backup', '_archive_qh_fk_20261110') ORDER BY name");
  if (tables.length !== 1 || tables[0].name !== CHILD) fail('LEGACY_QH_TABLE_STATE_INVALID');
  const count = Number(query(source, 'SELECT COUNT(*) AS total FROM "_backup_qh_tmp"')[0]?.total);
  if (count !== EXPECTED) fail('LEGACY_QH_ROW_COUNT_CHANGED');
  const groups = query(source, 'SELECT "table" AS child, parent, fkid, COUNT(*) AS total FROM pragma_foreign_key_check GROUP BY "table", parent, fkid');
  if (groups.length !== 1 || groups[0].child !== CHILD || groups[0].parent !== PARENT ||
      groups[0].fkid !== 0 || groups[0].total !== EXPECTED) fail('LEGACY_QH_FK_SIGNATURE_CHANGED');
  const dependencies = query(source, "SELECT name FROM sqlite_master WHERE sql LIKE '%_backup_qh_tmp%' AND name != '_backup_qh_tmp' AND tbl_name != '_backup_qh_tmp'");
  if (dependencies.length !== 0) fail('LEGACY_QH_EXTERNAL_SCHEMA_DEPENDENCY');
  const fk = query(source, 'SELECT "table", "from", "to" FROM pragma_foreign_key_list("_backup_qh_tmp")');
  if (fk.length !== 1 || fk[0].table !== PARENT || fk[0].from !== 'funcionario_id' || fk[0].to !== 'id') {
    fail('LEGACY_QH_FK_DEFINITION_CHANGED');
  }
  // Verify a standalone SQL archive restores exactly the same row payload.
  // Row contents stay in process memory; never expose them in logs or reports.
  const originalRows = execSqlite(source, 'SELECT * FROM "_backup_qh_tmp" ORDER BY id;', { json: true });
  const originalHash = sha256(originalRows);
  const dump = execSqlite(source, '.dump _backup_qh_tmp');
  if (!dump.includes('CREATE TABLE') || !dump.includes(CHILD)) fail('LEGACY_QH_DUMP_EMPTY');
  mkdirSync(target, { recursive: false, mode: 0o700 });
  const actualTarget = realpathSync(target);
  if (!outsideRepo(actualTarget)) { rmSync(target, { recursive: true, force: true }); fail('LEGACY_QH_ARCHIVE_SYMLINK'); }
  const dumpPath = join(actualTarget, 'legacy-qh-525.sql');
  const restorePath = join(actualTarget, 'legacy-qh-525.sqlite');
  const reportPath = join(actualTarget, 'archive-evidence.json');
  try {
    writeFileSync(dumpPath, dump, { flag: 'wx', mode: 0o600 });
    const restore = spawnSync('sqlite3', ['-batch', '-bail', restorePath], {
      input: dump, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    });
    if (restore.status !== 0 || restore.error) fail('LEGACY_QH_ARCHIVE_RESTORE_FAILED');
    const restoredCount = Number(query(restorePath, 'SELECT COUNT(*) AS total FROM "_backup_qh_tmp"')[0]?.total);
    const restoredHash = sha256(execSqlite(restorePath, 'SELECT * FROM "_backup_qh_tmp" ORDER BY id;', { json: true }));
    const integrity = query(restorePath, 'PRAGMA integrity_check;')[0]?.integrity_check;
    if (restoredCount !== EXPECTED || restoredHash !== originalHash || integrity !== 'ok') {
      fail('LEGACY_QH_ARCHIVE_INTEGRITY_FAILED');
    }
    const evidence = {
      status: 'ARCHIVED_AND_RESTORED_OFFLINE',
      source_table: CHILD,
      missing_parent: PARENT,
      rows: EXPECTED,
      source_rows_sha256: originalHash,
      restored_rows_sha256: restoredHash,
      archive_sql_sha256: sha256(readFileSync(dumpPath)),
      archive_sql_bytes: statSync(dumpPath).size,
      archive_sqlite_sha256: sha256(readFileSync(restorePath)),
      archive_sqlite_bytes: statSync(restorePath).size,
      sqlite_integrity: integrity,
      policy: { production_write: false, remote_access: false, requires_independent_durable_storage: true },
    };
    writeFileSync(reportPath, JSON.stringify(evidence, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    return evidence;
  } catch (error) {
    rmSync(actualTarget, { recursive: true, force: true });
    throw error;
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const opts = process.argv.slice(2);
  if (opts.length !== 4 || opts[0] !== '--source-db' || opts[2] !== '--archive-dir') {
    fail('USAGE: --source-db <restored.sqlite> --archive-dir <new-private-directory>');
  }
  try {
    console.log(JSON.stringify(prepareLegacyQhArchive({ sourceDb: opts[1], archiveDir: opts[3] }), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

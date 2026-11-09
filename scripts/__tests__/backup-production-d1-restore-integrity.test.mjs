import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { buildBackupReport, inspectDumpWithSqlite } from '../production/lib/backup-d1-readonly.mjs';

const sqliteAvailable = spawnSync('sqlite3', ['-version'], { encoding: 'utf8' }).status === 0;

function withDump(name, sql, callback) {
  const root = mkdtempSync(join(tmpdir(), 'airtrust-d1-restore-check-'));
  const file = join(root, name);
  writeFileSync(file, sql);
  try {
    return callback(file);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const schema = `
PRAGMA foreign_keys=OFF;
CREATE TABLE parent(id INTEGER PRIMARY KEY);
CREATE TABLE child(id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parent(id));
INSERT INTO parent(id) VALUES(1);
`;

test('restored D1 dump in space-containing path is verified with integrity and FK checks', { skip: !sqliteAvailable }, () => {
  withDump('dump with spaces.sql', schema + 'INSERT INTO child VALUES(2, 1);\n', (file) => {
    const checked = inspectDumpWithSqlite(file);
    try {
      assert.equal(checked.integrity_check, 'ok');
      assert.equal(checked.foreign_key_check_count, 0);
      const report = buildBackupReport({outFile: file, target: {}, gitHead: '0'.repeat(40), inspected: checked});
      assert.equal(report.ok, true);
      assert.equal(report.restored_sqlite.foreign_key_check_count, 0);
    } finally {
      rmSync(checked.scratchDir, { recursive: true, force: true });
    }
  });
});

test('restored dump with orphan FK can pass integrity_check but must FAIL backup proof', { skip: !sqliteAvailable }, () => {
  withDump('orphan.sql', schema + 'INSERT INTO child VALUES(2, 999);\n', (file) => {
    const checked = inspectDumpWithSqlite(file);
    try {
      assert.equal(checked.integrity_check, 'ok');
      assert.equal(checked.foreign_key_check_count, 1);
      const report = buildBackupReport({outFile: file, target: {}, gitHead: '0'.repeat(40), inspected: checked});
      assert.equal(report.ok, false);
    } finally {
      rmSync(checked.scratchDir, { recursive: true, force: true });
    }
  });
});

test('SQL restore errors fail closed instead of reporting a partly restored database', { skip: !sqliteAvailable }, () => {
  withDump('bad.sql', schema + 'INSERT INTO missing_table VALUES(1);\n', (file) => {
    assert.throws(() => inspectDumpWithSqlite(file));
  });
});

test('maintenance workflow requires zero foreign key violations before uploading a PASS report', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/d1-production-backup-restore-drill.yml', import.meta.url), 'utf8');
  assert.match(workflow, /foreign_key_check_count == 0/);
  assert.match(workflow, /integrity_check == "ok"/);
});

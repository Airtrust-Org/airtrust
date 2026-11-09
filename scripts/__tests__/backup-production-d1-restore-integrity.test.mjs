import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { buildBackupReport, inspectDumpWithSqlite } from '../production/lib/backup-d1-readonly.mjs';
import { performProductionD1BackupProof } from '../production/backup-production-d1-readonly.mjs';

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

// source_reference: synthetic SQLite fixtures only; INSERT statements never run against remote D1.
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

function cliWithSyntheticRunner({ file, content, onInspect, failGit = false }) {
  return performProductionD1BackupProof({
    outFile: file,
    target: { database_name: 'synthetic-local' },
    configPath: 'synthetic-test-config',
    env: 'production',
    run: (command, _args) => {
      if (command === 'npx') {
        writeFileSync(file, content);
        return '';
      }
      if (command === 'git') {
        if (failGit) throw new Error('synthetic git head unavailable');
        return `${'a'.repeat(40)}\n`;
      }
      throw new Error(`unexpected external command ${command}`);
    },
    inspect: (dump) => {
      const inspected = inspectDumpWithSqlite(dump);
      onInspect(inspected);
      return inspected;
    },
  });
}

test('CLI shared execution path exits with success proof and removes local restored copy', { skip: !sqliteAvailable }, () => {
  withDump('cli valid.sql', '', (file) => {
    let scratch = '';
    const report = cliWithSyntheticRunner({
      file,
      content: schema + 'INSERT INTO child VALUES(2, 1);\n',
      onInspect: (inspected) => { scratch = inspected.scratchDir; },
    });
    assert.equal(report.ok, true);
    assert.ok(scratch);
    assert.equal(existsSync(scratch), false);
  });
});

test('CLI shared execution path reports invalid FK restore and still removes local restored copy', { skip: !sqliteAvailable }, () => {
  withDump('cli orphan.sql', '', (file) => {
    let scratch = '';
    const report = cliWithSyntheticRunner({
      file,
      content: schema + 'INSERT INTO child VALUES(2, 999);\n',
      onInspect: (inspected) => { scratch = inspected.scratchDir; },
    });
    assert.equal(report.ok, false);
    assert.equal(report.restored_sqlite.foreign_key_check_count, 1);
    assert.ok(scratch);
    assert.equal(existsSync(scratch), false);
  });
});

test('CLI cleanup executes when a post-restore operation fails', { skip: !sqliteAvailable }, () => {
  withDump('cli git failure.sql', '', (file) => {
    let scratch = '';
    assert.throws(() => cliWithSyntheticRunner({
      file,
      content: schema + 'INSERT INTO child VALUES(2, 1);\n',
      onInspect: (inspected) => { scratch = inspected.scratchDir; },
      failGit: true,
    }), /synthetic git head unavailable/);
    assert.ok(scratch);
    assert.equal(existsSync(scratch), false);
  });
});

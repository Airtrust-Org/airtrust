// source_reference: scripts/ci/sqlite3-python-compat.py and scripts/setup-local-lms-smoke-db.sh
// operational_decision: CI-only disposable SQLite unit fixture; never production D1.
// dry_run_required: false; no remote system or operational data is accessed.
// rollback_plan_required: each test deletes its own isolated temporary SQLite file.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const binary = resolve('scripts/ci/sqlite3-python-compat.py');
function query(db, sql, stdin = false) {
  const res = spawnSync('python3', stdin ? [binary, db] : [binary, db, sql], {
    input: stdin ? sql : undefined, encoding: 'utf8', timeout: 10_000,
  });
  return res;
}

test('real Python SQLite executes CI bootstrap statements and emits sqlite3 pipe-separated rows', () => {
  const dir = mkdtempSync(join(tmpdir(), 'airtrust-ci-sqlite-'));
  const db = join(dir, 'local.sqlite');
  try {
    const setup = query(db, `CREATE TABLE IF NOT EXISTS qa (id INTEGER PRIMARY KEY, name TEXT, optional TEXT);
INSERT INTO qa (id, name) VALUES (1, 'LMS');
INSERT INTO qa (id, name) VALUES (2, 'SCORM');`, true);
    assert.equal(setup.status, 0, setup.stderr);
    const count = query(db, 'SELECT COUNT(*) FROM qa;');
    assert.equal(count.status, 0, count.stderr);
    assert.equal(count.stdout.trim(), '2');
    const pragma = query(db, 'PRAGMA table_info(qa);');
    assert.equal(pragma.status, 0, pragma.stderr);
    assert.match(pragma.stdout, /0\|id\|INTEGER\|0\|\|1/);
    const rows = query(db, 'SELECT id,name,optional FROM qa ORDER BY id;');
    assert.equal(rows.stdout.trim(), '1|LMS|\n2|SCORM|');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('SQLite errors, dot commands and missing SQL fail closed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'airtrust-ci-sqlite-errors-'));
  const db = join(dir, 'local.sqlite');
  try {
    assert.notEqual(query(db, 'SELECT * FROM missing;').status, 0);
    assert.notEqual(query(db, '.read /tmp/anything').status, 0);
    assert.notEqual(query(db, '').status, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

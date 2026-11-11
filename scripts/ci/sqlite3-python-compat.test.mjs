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

test('worker migration CLI contract: -bail on stdin and -json on SQL argument and stdin', () => {
  const dir = mkdtempSync(join(tmpdir(), 'airtrust-ci-sqlite-flags-'));
  const db = join(dir, 'local.sqlite');
  const invoke = (flags, sql) => spawnSync('python3', [binary, ...flags], {
    input: sql, encoding: 'utf8', timeout: 10_000,
  });
  try {
    const create = invoke(['-bail', db], "CREATE TABLE qa (id INTEGER, label TEXT);\nINSERT INTO qa VALUES (3,'LMS');");
    assert.equal(create.status, 0, create.stderr);
    const viaArgs = invoke(['-json', db, 'SELECT id,label FROM qa;']);
    assert.equal(viaArgs.status, 0, viaArgs.stderr);
    assert.deepEqual(JSON.parse(viaArgs.stdout), [{ id: 3, label: 'LMS' }]);
    const viaStdin = invoke(['-json', db], 'SELECT id,label FROM qa;');
    assert.equal(viaStdin.status, 0, viaStdin.stderr);
    assert.deepEqual(JSON.parse(viaStdin.stdout), [{ id: 3, label: 'LMS' }]);
    const fail = invoke(['-bail', db], 'INSERT INTO missing VALUES (1);\nINSERT INTO qa VALUES (4,\'bad\');');
    assert.notEqual(fail.status, 0);
    assert.equal(query(db, 'SELECT COUNT(*) FROM qa;').stdout.trim(), '1');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('SQLite compatible -bail supports real multiline triggers without splitting their internal statements', () => {
  const dir = mkdtempSync(join(tmpdir(), 'airtrust-ci-sqlite-triggers-'));
  const db = join(dir, 'local.sqlite');
  try {
    const result = spawnSync('python3', [binary, '-bail', db], {
      input: `CREATE TABLE a (id INTEGER);\nCREATE TABLE audit (id INTEGER);\nCREATE TRIGGER on_insert AFTER INSERT ON a BEGIN\n INSERT INTO audit VALUES (NEW.id);\n INSERT INTO audit VALUES (NEW.id + 1);\nEND;\nINSERT INTO a VALUES (10);`,
      encoding: 'utf8', timeout: 10_000,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(query(db, 'SELECT COUNT(*) FROM audit;').stdout.trim(), '2');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('migration RAISE(ABORT) failures propagate exact fail-closed reason and never execute subsequent statements', () => {
  const dir = mkdtempSync(join(tmpdir(), 'airtrust-ci-sqlite-guard-'));
  const db = join(dir, 'local.sqlite');
  try {
    const setup = query(db, `CREATE TABLE qa(id INTEGER);\nCREATE TRIGGER abort_qa BEFORE INSERT ON qa BEGIN\n SELECT RAISE(ABORT, 'cross-aircraft ownership violation');\nEND;`, true);
    assert.equal(setup.status, 0, setup.stderr);
    const result = spawnSync('python3', [binary, '-bail', db], {
      input: 'INSERT INTO qa VALUES (1);\nINSERT INTO qa VALUES (2);',
      encoding: 'utf8', timeout: 10_000,
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /cross-aircraft ownership violation/);
    assert.equal(query(db, 'SELECT COUNT(*) FROM qa;').stdout.trim(), '0');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('multiple statements sharing a line are executed separately with fail-closed SQL semantics', () => {
  const dir = mkdtempSync(join(tmpdir(), 'airtrust-ci-sqlite-multiline-'));
  const db = join(dir, 'local.sqlite');
  try {
    const setup = query(db, "CREATE TABLE qa(id INTEGER); INSERT INTO qa VALUES(11); INSERT INTO qa VALUES(12);", true);
    assert.equal(setup.status, 0, setup.stderr);
    assert.equal(query(db, 'SELECT COUNT(*) FROM qa;').stdout.trim(), '2');
    const failing = query(db, "INSERT INTO qa VALUES(13); INSERT INTO missing VALUES(14); INSERT INTO qa VALUES(15);", true);
    assert.notEqual(failing.status, 0);
    assert.equal(query(db, 'SELECT GROUP_CONCAT(id) FROM qa;').stdout.trim(), '11,12,13');
    const queryJson = spawnSync('python3', [binary, '-json', db, 'SELECT id FROM qa WHERE id=11; SELECT id FROM qa WHERE id=12;'], {
      encoding: 'utf8', timeout: 10_000,
    });
    assert.equal(queryJson.status, 0, queryJson.stderr);
    assert.equal(queryJson.stdout.trim(), '[{"id":11}]\n[{"id":12}]');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

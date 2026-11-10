// source_reference: synthetic SQLite fixtures only; no production SQL operations.
// operational_decision: assert archive and cleanup guards against fabricated orphan rows.
// dry_run_required: all test DML stays in a disposable local SQLite fixture.
// rollback_plan_required: delete the disposable fixture directory; never contact D1.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { prepareLegacyQhArchive } from '../production/prepare-legacy-qh-archive-offline.mjs';

const sqliteAvailable = spawnSync('sqlite3', ['-version'], { encoding: 'utf8' }).status === 0;
function sql(db, source) {
  const result = spawnSync('sqlite3', ['-batch', '-bail', db], {
    input: source, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
  });
  assert.equal(result.status, 0, 'synthetic SQLite setup must succeed');
}
function fixture(extra = '', count = 525) {
  const root = mkdtempSync(join(tmpdir(), 'airtrust-dr-legacy-qh-'));
  const source = join(root, 'isolated-restore.sqlite');
  const body = Array.from({ length: count }, (_, i) =>
    `INSERT INTO "_backup_qh_tmp" VALUES(${i + 1}, ${1000 + i}, 'synthetic-only-${i}');`).join('\n');
  sql(source, `PRAGMA foreign_keys=OFF;
    CREATE TABLE "_backup_qh_tmp" (
      id INTEGER PRIMARY KEY, funcionario_id INTEGER NOT NULL, note TEXT,
      FOREIGN KEY(funcionario_id) REFERENCES funcionarios_backup(id)
    );
    ${body}
    ${extra}
  `);
  return { root, source, output: join(root, 'private-archive') };
}
function cleanup(root) { rmSync(root, { recursive: true, force: true }); }

test('archives 525 synthetic legacy rows outside repo with verified round-trip and private permissions', { skip: !sqliteAvailable }, () => {
  const f = fixture();
  try {
    const evidence = prepareLegacyQhArchive({ sourceDb: f.source, archiveDir: f.output });
    assert.equal(evidence.status, 'ARCHIVED_AND_RESTORED_OFFLINE');
    assert.equal(evidence.rows, 525);
    assert.equal(evidence.sqlite_integrity, 'ok');
    assert.equal(evidence.source_rows_sha256, evidence.restored_rows_sha256);
    assert.equal(existsSync(join(f.output, 'legacy-qh-525.sql')), true);
    assert.equal(existsSync(join(f.output, 'legacy-qh-525.sqlite')), true);
    assert.equal(existsSync(join(f.output, 'archive-evidence.json')), true);
    assert.equal(statSync(f.output).mode & 0o777, 0o700);
    assert.equal(statSync(join(f.output, 'legacy-qh-525.sql')).mode & 0o777, 0o600);
    assert.equal(readFileSync(join(f.output, 'archive-evidence.json'), 'utf8').includes('synthetic-only-'), false);
    assert.equal(Number(spawnSync('sqlite3', [f.source, 'SELECT COUNT(*) FROM "_backup_qh_tmp";'], { encoding: 'utf8' }).stdout.trim()), 525);
  } finally { cleanup(f.root); }
});
test('rejects changed production-like row count and never creates archive', { skip: !sqliteAvailable }, () => {
  const f = fixture('', 524);
  try {
    assert.throws(() => prepareLegacyQhArchive({ sourceDb: f.source, archiveDir: f.output }), /LEGACY_QH_ROW_COUNT_CHANGED/);
    assert.equal(existsSync(f.output), false);
  } finally { cleanup(f.root); }
});
test('rejects additional FK violations without attempting archival cleanup', { skip: !sqliteAvailable }, () => {
  const f = fixture('CREATE TABLE other (id INTEGER PRIMARY KEY, ref INTEGER REFERENCES missing(id)); INSERT INTO other VALUES (1,2);');
  try {
    assert.throws(() => prepareLegacyQhArchive({ sourceDb: f.source, archiveDir: f.output }), /LEGACY_QH_FK_SIGNATURE_CHANGED/);
    assert.equal(existsSync(f.output), false);
  } finally { cleanup(f.root); }
});
test('rejects schema objects depending on legacy table', { skip: !sqliteAvailable }, () => {
  const f = fixture('CREATE VIEW v_qh AS SELECT * FROM "_backup_qh_tmp";');
  try {
    assert.throws(() => prepareLegacyQhArchive({ sourceDb: f.source, archiveDir: f.output }), /LEGACY_QH_EXTERNAL_SCHEMA_DEPENDENCY/);
    assert.equal(existsSync(f.output), false);
  } finally { cleanup(f.root); }
});
test('refuses overwriting existing independent archives', { skip: !sqliteAvailable }, () => {
  const f = fixture();
  try {
    prepareLegacyQhArchive({ sourceDb: f.source, archiveDir: f.output });
    assert.throws(() => prepareLegacyQhArchive({ sourceDb: f.source, archiveDir: f.output }), /LEGACY_QH_ARCHIVE_DIR_EXISTS/);
  } finally { cleanup(f.root); }
});

test('reviewed 0577 SQL preserves all 525 rows and eliminates only the orphan FK', { skip: !sqliteAvailable }, () => {
  const f = fixture();
  try {
    const before = spawnSync('sqlite3', ['-json', f.source, 'SELECT * FROM "_backup_qh_tmp" ORDER BY id;'], {encoding:'utf8'});
    assert.equal(before.status, 0);
    const migration = readFileSync(new URL('../../worker-airtrust/schema-v2/changes/0577_dr_legacy_qh_fk_archive.sql', import.meta.url), 'utf8');
    sql(f.source, 'PRAGMA foreign_keys=ON;\n' + migration);
    const after = spawnSync('sqlite3', ['-json', f.source, 'SELECT * FROM "_archive_qh_fk_20261110" ORDER BY id;'], {encoding:'utf8'});
    assert.equal(after.status, 0);
    assert.deepEqual(JSON.parse(after.stdout), JSON.parse(before.stdout));
    assert.equal(spawnSync('sqlite3', [f.source, 'SELECT COUNT(*) FROM pragma_foreign_key_check;'], {encoding:'utf8'}).stdout.trim(), '0');
    assert.equal(spawnSync('sqlite3', [f.source, "SELECT COUNT(*) FROM sqlite_master WHERE name IN ('_backup_qh_tmp', '_archive_qh_guard_20261110');"], {encoding:'utf8'}).stdout.trim(), '0');
    assert.equal(spawnSync('sqlite3', [f.source, 'PRAGMA integrity_check;'], {encoding:'utf8'}).stdout.trim(), 'ok');
  } finally { cleanup(f.root); }
});

test('reviewed 0577 SQL blocks an unexpected 524-row source before destructive DROP', { skip: !sqliteAvailable }, () => {
  const f = fixture('', 524);
  try {
    const migration = readFileSync(new URL('../../worker-airtrust/schema-v2/changes/0577_dr_legacy_qh_fk_archive.sql', import.meta.url), 'utf8');
    const attempt = spawnSync('sqlite3', ['-batch', '-bail', f.source], { input: 'PRAGMA foreign_keys=ON;\n' + migration, encoding: 'utf8' });
    assert.notEqual(attempt.status, 0);
    assert.equal(spawnSync('sqlite3', [f.source, 'SELECT COUNT(*) FROM "_backup_qh_tmp";'], {encoding:'utf8'}).stdout.trim(), '524');
    assert.equal(spawnSync('sqlite3', [f.source, "SELECT COUNT(*) FROM sqlite_master WHERE name='_archive_qh_fk_20261110';"], {encoding:'utf8'}).stdout.trim(), '0');
  } finally { cleanup(f.root); }
});

test('production Schema V2 retains independent archive interlock and FK readbacks', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/apply-schema-change-v2.yml', import.meta.url), 'utf8');
  assert.match(workflow, /D1_LEGACY_QH_INDEPENDENT_ARCHIVE_PROOF_MISSING/);
  assert.match(workflow, /inputs\.change_id == 'dr-legacy-qh-fk-archive-0577'/);
  assert.match(workflow, /source_rows !== 525/);
  assert.match(workflow, /expected_violations !== 525/);
  assert.match(workflow, /remaining_fk_violations !== 0/);
  assert.match(workflow, /D1_LEGACY_QH_ARCHIVE_ROWSET_MISMATCH/);
});

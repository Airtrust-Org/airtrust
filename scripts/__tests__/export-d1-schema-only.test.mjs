// source_reference: synthetic sqlite_master fixtures used only to validate schema-only baseline safety checks in PR #221.
// operational_decision: fixtures include inert DML strings to prove the wrapper blocks executable SQL outside triggers while allowing valid DDL such as ON UPDATE/DELETE CASCADE.
// dry_run_required: tests invoke the local analyzer and shell wrapper only against temp JSON fixtures; no remote D1, no baseline apply, no staging runbook.
// rollback_plan_required: no rollback action is needed because tests only create temp files/directories under the local OS temp folder and remove them after assertions.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { analyzeObjects, renderSql, writeArtifacts } from '../export-d1-schema-only.mjs';

const ROOT_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');

function findingCodes(result) {
  return result.findings.map((finding) => finding.code);
}

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'schema-baseline-test-'));
}

function writeFixtureJson(objects) {
  const fixturePath = path.join(makeTempDir(), 'fixture.json');
  fs.writeFileSync(fixturePath, `${JSON.stringify([{ results: objects }], null, 2)}\n`);
  return fixturePath;
}

test('canonical table referencing excluded table fails', () => {
  const result = analyzeObjects([
    { type: 'table', name: 'backups', sql: 'CREATE TABLE backups (id INTEGER PRIMARY KEY);' },
    { type: 'table', name: 'foo', sql: 'CREATE TABLE foo (backup_id INTEGER REFERENCES backups(id));' },
  ]);

  assert.ok(findingCodes(result).includes('canonical_fk_to_excluded_or_absent'));
});

test('canonical view referencing excluded table fails', () => {
  const result = analyzeObjects([
    { type: 'table', name: 'backups', sql: 'CREATE TABLE backups (id INTEGER PRIMARY KEY);' },
    { type: 'view', name: 'vw_ok', sql: 'CREATE VIEW vw_ok AS SELECT id FROM backups;' },
  ]);

  assert.ok(findingCodes(result).includes('canonical_dependency_on_excluded_or_absent'));
});

test('canonical view referencing absent table fails', () => {
  const result = analyzeObjects([
    { type: 'view', name: 'vw_missing', sql: 'CREATE VIEW vw_missing AS SELECT * FROM missing_table;' },
  ]);

  assert.ok(findingCodes(result).includes('canonical_dependency_on_excluded_or_absent'));
});

test('trigger on excluded table is excluded', () => {
  const result = analyzeObjects([
    { type: 'table', name: 'qualificacoes_tipos_old', sql: 'CREATE TABLE qualificacoes_tipos_old (id INTEGER PRIMARY KEY);' },
    {
      type: 'trigger',
      name: 'trg_old',
      tbl_name: 'qualificacoes_tipos_old',
      sql: 'CREATE TRIGGER trg_old AFTER UPDATE ON qualificacoes_tipos_old BEGIN UPDATE qualificacoes_tipos_old SET id = NEW.id; END',
    },
  ]);

  const trigger = result.excludedObjects.find((object) => object.name === 'trg_old');
  assert.ok(trigger);
  assert.ok(trigger.exclusion_reasons.includes('trigger_base_object_excluded'));
});

test('canonical trigger with internal dml is allowed and reported', () => {
  const result = analyzeObjects([
    { type: 'table', name: 'users', sql: 'CREATE TABLE users (id INTEGER PRIMARY KEY, touched_at TEXT);' },
    {
      type: 'trigger',
      name: 'trg_users_touch',
      tbl_name: 'users',
      sql: "CREATE TRIGGER trg_users_touch AFTER UPDATE ON users BEGIN UPDATE users SET touched_at = datetime('now') WHERE id = NEW.id; END",
    },
  ]);

  assert.equal(result.findings.length, 0);
  assert.deepEqual(result.manifest.trigger_dml_objects, ['trg_users_touch']);
  assert.equal(result.canonicalObjects.some((object) => object.name === 'trg_users_touch'), true);
});

test('trigger header without body dml is not reported as trigger dml', () => {
  const result = analyzeObjects([
    { type: 'table', name: 'users', sql: 'CREATE TABLE users (id INTEGER PRIMARY KEY);' },
    {
      type: 'trigger',
      name: 'trg_users_guard',
      tbl_name: 'users',
      sql: 'CREATE TRIGGER trg_users_guard AFTER UPDATE ON users BEGIN SELECT NEW.id; END',
    },
  ]);

  assert.deepEqual(result.manifest.trigger_dml_objects, []);
});

test('canonical fk to absent table fails', () => {
  const result = analyzeObjects([
    { type: 'table', name: 'foo', sql: 'CREATE TABLE foo (missing_id INTEGER REFERENCES missing_table(id));' },
  ]);

  assert.ok(findingCodes(result).includes('canonical_fk_to_excluded_or_absent'));
});

test('excluded object with broken fk only records exclusion', () => {
  const result = analyzeObjects([
    { type: 'table', name: '_backup_qh_tmp', sql: 'CREATE TABLE _backup_qh_tmp (funcionario_id INTEGER REFERENCES funcionarios_backup(id));' },
  ]);

  assert.ok(findingCodes(result).includes('excluded_fk_to_excluded_or_absent'));
  assert.equal(result.findings.filter((finding) => finding.severity === 'fail').length, 0);
  assert.equal(result.excludedObjects[0].name, '_backup_qh_tmp');
});

test('view join aliases do not create fake absent dependencies', () => {
  const result = analyzeObjects([
    { type: 'table', name: 'users', sql: 'CREATE TABLE users (id INTEGER PRIMARY KEY, role_id INTEGER);' },
    { type: 'table', name: 'roles', sql: 'CREATE TABLE roles (id INTEGER PRIMARY KEY);' },
    {
      type: 'view',
      name: 'vw_user_roles',
      sql: 'CREATE VIEW vw_user_roles AS SELECT u.id, r.id AS role_id FROM users u JOIN roles r ON u.role_id = r.id;',
    },
  ]);

  assert.equal(result.findings.filter((finding) => finding.severity === 'fail').length, 0);
});

test('on update and on delete cascade are allowed in valid fk ddl', () => {
  const result = analyzeObjects([
    { type: 'table', name: 'parent', sql: 'CREATE TABLE parent (id INTEGER PRIMARY KEY);' },
    {
      type: 'table',
      name: 'child',
      sql: 'CREATE TABLE child (parent_id INTEGER REFERENCES parent(id) ON UPDATE CASCADE ON DELETE CASCADE);',
    },
  ]);

  assert.equal(findingCodes(result).includes('prohibited_top_level_statement'), false);
});

test('insert outside trigger blocks when emitted as top-level statement', () => {
  const result = analyzeObjects([
    { type: 'table', name: 'bad_insert', sql: 'CREATE TABLE bad_insert (id INTEGER PRIMARY KEY); INSERT INTO bad_insert VALUES (1);' },
  ]);

  assert.ok(findingCodes(result).includes('prohibited_top_level_statement'));
});

test('update outside trigger blocks when emitted as top-level statement', () => {
  const result = analyzeObjects([
    { type: 'table', name: 'bad_update', sql: 'CREATE TABLE bad_update (id INTEGER PRIMARY KEY); UPDATE bad_update SET id = 2;' },
  ]);

  assert.ok(findingCodes(result).includes('prohibited_top_level_statement'));
});

test('drop outside trigger blocks when emitted as top-level statement', () => {
  const result = analyzeObjects([
    { type: 'table', name: 'bad_drop', sql: 'CREATE TABLE bad_drop (id INTEGER PRIMARY KEY); DROP TABLE bad_drop;' },
  ]);

  assert.ok(findingCodes(result).includes('prohibited_top_level_statement'));
});

test('index on excluded table is excluded with base object reason', () => {
  const result = analyzeObjects([
    { type: 'table', name: 'backups_controle', sql: 'CREATE TABLE backups_controle (id INTEGER PRIMARY KEY);' },
    { type: 'index', name: 'idx_backups_controle', tbl_name: 'backups_controle', sql: 'CREATE INDEX idx_backups_controle ON backups_controle(id);' },
  ]);

  const indexObject = result.excludedObjects.find((object) => object.name === 'idx_backups_controle');
  assert.ok(indexObject);
  assert.ok(indexObject.exclusion_reasons.includes('index_base_object_excluded'));
});

test('index on absent table base fails', () => {
  const result = analyzeObjects([
    { type: 'index', name: 'idx_missing', tbl_name: 'missing_base', sql: 'CREATE INDEX idx_missing ON missing_base(id);' },
  ]);

  assert.ok(findingCodes(result).includes('index_base_object_absent'));
});

test('rendered sql keeps table before index and never emits double semicolons', () => {
  const result = analyzeObjects([
    { type: 'table', name: 'users', sql: 'CREATE TABLE users (id INTEGER PRIMARY KEY);' },
    { type: 'index', name: 'idx_users', tbl_name: 'users', sql: 'CREATE INDEX idx_users ON users(id);' },
  ]);

  const sql = renderSql(result.renderableObjects);
  assert.ok(sql.indexOf('CREATE TABLE users') < sql.indexOf('CREATE INDEX idx_users'));
  assert.equal(sql.includes(';;'), false);
});

test('d1_migrations is always excluded', () => {
  const result = analyzeObjects([
    { type: 'table', name: 'd1_migrations', sql: 'CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY);' },
  ]);

  assert.equal(result.excludedObjects[0].name, 'd1_migrations');
});

test('qualificacoes_formatos present fails pre-0412 guard', () => {
  const result = analyzeObjects([
    { type: 'table', name: 'qualificacoes_formatos', sql: 'CREATE TABLE qualificacoes_formatos (id INTEGER PRIMARY KEY);' },
  ]);

  assert.ok(findingCodes(result).includes('pre0412_table_present'));
});

test('writeArtifacts does not emit sql file when analysis fails', () => {
  const outputDir = makeTempDir();
  const analysis = analyzeObjects([
    { type: 'table', name: 'qualificacoes_formatos', sql: 'CREATE TABLE qualificacoes_formatos (id INTEGER PRIMARY KEY);' },
  ]);

  const manifest = writeArtifacts(analysis, {
    outputDir,
    writeSql: true,
    sourceLabel: 'fixture',
    sourceDatabaseName: 'fixture-db',
    sourceDatabaseId: 'fixture-id',
  });

  assert.equal(manifest.status, 'FAIL');
  assert.equal(manifest.sql_emitted, false);
  assert.equal(fs.existsSync(path.join(outputDir, 'schema_baseline_pre0412.sql')), false);
});

test('shell wrapper with --write-sql only emits sql on pass', () => {
  const outputDir = makeTempDir();
  const fixturePath = writeFixtureJson([
    { type: 'table', name: 'qualificacoes_formatos', tbl_name: 'qualificacoes_formatos', sql: 'CREATE TABLE qualificacoes_formatos (id INTEGER PRIMARY KEY);' },
  ]);

  const result = spawnSync('bash', ['scripts/export-d1-schema-only.sh', '--input-json', fixturePath, '--output-dir', outputDir, '--stamp', '20260701', '--write-sql'], {
    cwd: ROOT_DIR,
    encoding: 'utf8',
  });

  assert.notEqual(result.status, 0);
  const manifest = JSON.parse(fs.readFileSync(path.join(outputDir, 'schema_baseline_manifest.json'), 'utf8'));
  assert.equal(manifest.status, 'FAIL');
  assert.equal(manifest.sql_emitted, false);
  assert.equal(fs.existsSync(path.join(outputDir, 'schema_baseline_pre0412.sql')), false);
});

test('canonical fk to documented residual __backup_pessoas warns not fails', () => {
  const result = analyzeObjects([
    { type: 'table', name: 'pessoas_papeis', sql: 'CREATE TABLE pessoas_papeis (pessoa_id INTEGER REFERENCES "__backup_pessoas"(id));' },
  ]);

  const finding = result.findings.find((f) => f.code === 'canonical_fk_to_excluded_or_absent');
  assert.ok(finding);
  assert.equal(finding.severity, 'warn');
  assert.equal(finding.detail.includes('documented residual'), true);
  assert.equal(result.findings.filter((f) => f.severity === 'fail').length, 0);
});

test('canonical fk to documented residual funcionarios_backup warns not fails', () => {
  const result = analyzeObjects([
    { type: 'table', name: 'solicitacoes_lgpd', sql: 'CREATE TABLE solicitacoes_lgpd (funcionario_id INTEGER REFERENCES funcionarios_backup(id));' },
  ]);

  const finding = result.findings.find((f) => f.code === 'canonical_fk_to_excluded_or_absent');
  assert.ok(finding);
  assert.equal(finding.severity, 'warn');
  assert.equal(result.findings.filter((f) => f.severity === 'fail').length, 0);
});

test('canonical fk to documented residual escalas warns not fails', () => {
  const result = analyzeObjects([
    { type: 'table', name: 'hospedagem', sql: 'CREATE TABLE hospedagem (escala_id INTEGER REFERENCES escalas(id));' },
  ]);

  const finding = result.findings.find((f) => f.code === 'canonical_fk_to_excluded_or_absent');
  assert.ok(finding);
  assert.equal(finding.severity, 'warn');
  assert.equal(result.findings.filter((f) => f.severity === 'fail').length, 0);
});

test('canonical fk to undocumented absent target still fails', () => {
  const result = analyzeObjects([
    { type: 'table', name: 'foo', sql: 'CREATE TABLE foo (ref_id INTEGER REFERENCES undocumented_missing(id));' },
  ]);

  const finding = result.findings.find((f) => f.code === 'canonical_fk_to_excluded_or_absent');
  assert.ok(finding);
  assert.equal(finding.severity, 'fail');
  assert.equal(result.findings.filter((f) => f.severity === 'fail').length, 1);
});

test('cte alias does not create false absent dependency', () => {
  const result = analyzeObjects([
    { type: 'table', name: 'funcionarios', sql: 'CREATE TABLE funcionarios (id INTEGER PRIMARY KEY, nome TEXT);' },
    {
      type: 'view',
      name: 'vw_test',
      sql: "CREATE VIEW vw_test AS WITH base AS (SELECT id, nome FROM funcionarios) SELECT * FROM base;",
    },
  ]);

  assert.equal(result.findings.filter((f) => f.severity === 'fail').length, 0);
  assert.equal(result.canonicalObjects.some((o) => o.name === 'vw_test'), true);
});

test('multiple cte aliases do not create false absent dependencies', () => {
  const result = analyzeObjects([
    { type: 'table', name: 'users', sql: 'CREATE TABLE users (id INTEGER PRIMARY KEY);' },
    { type: 'table', name: 'roles', sql: 'CREATE TABLE roles (id INTEGER PRIMARY KEY);' },
    {
      type: 'view',
      name: 'vw_multi_cte',
      sql: 'CREATE VIEW vw_multi_cte AS WITH a AS (SELECT * FROM users), b AS (SELECT * FROM roles) SELECT a.id, b.id FROM a JOIN b ON a.id = b.id;',
    },
  ]);

  assert.equal(result.findings.filter((f) => f.severity === 'fail').length, 0);
  assert.equal(result.canonicalObjects.some((o) => o.name === 'vw_multi_cte'), true);
});

test('cte alias with real missing table inside cte still fails', () => {
  const result = analyzeObjects([
    {
      type: 'view',
      name: 'vw_bad_cte',
      sql: 'CREATE VIEW vw_bad_cte AS WITH base AS (SELECT * FROM really_missing_table) SELECT * FROM base;',
    },
  ]);

  const finding = result.findings.find((f) => f.code === 'canonical_dependency_on_excluded_or_absent');
  assert.ok(finding);
  assert.equal(finding.severity, 'fail');
  assert.equal(finding.detail.includes('really_missing_table'), true);
});

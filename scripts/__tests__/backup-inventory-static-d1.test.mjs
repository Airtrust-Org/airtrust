import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { buildInventory, buildInventoryFromSchemaMetadata, extractCreatedTables, extractConfiguredTables } from '../backup/inventory-static-d1.mjs';

test('ignores SQL comments and parses quoted tables', () => {
  const sql = '-- CREATE TABLE fake(id int);\n/* CREATE TABLE hidden(id int); */\nCREATE TABLE IF NOT EXISTS "real_one" (id int);\nCREATE TABLE main.[real_two] (id int);';
  assert.deepEqual(extractCreatedTables(sql), ['real_one', 'real_two']);
});

test('collects both configured backup table groups', () => {
  assert.deepEqual(extractConfiguredTables("tabelas_principais: ['a'], tabelas_relacionadas: ['b', 'a']"), ['a', 'b']);
});

test('reports static coverage gaps without claiming production coverage', () => {
  const result = buildInventory({
    migrationFiles: [['0001.sql', 'CREATE TABLE a(id int); CREATE TABLE b(id int);']],
    backupSource: "tabelas_principais: ['a', 'missing']",
  });
  assert.equal(result.schema_tables_not_in_worker_backup, 1);
  assert.deepEqual(result.configured_tables_not_found_in_migrations, ['missing']);
  assert.equal(result.source, 'static_migration_metadata_only');
});

test('includes SQLite CREATE TABLE AS SELECT backup tables found in migration 0294', () => {
  const sql = `
    -- Backup interno sem schema explícito
    CREATE TABLE IF NOT EXISTS bkp_qual_historico_20260325 AS SELECT * FROM qualificacoes_historico;
    CREATE TABLE IF NOT EXISTS bkp_qual_tipos_20260325    AS SELECT * FROM qualificacoes_tipos;
    CREATE TEMP TABLE stage_qual AS WITH eligible AS (SELECT 1 AS x) SELECT x FROM eligible;
  `;
  assert.deepEqual(extractCreatedTables(sql), [
    'bkp_qual_historico_20260325', 'bkp_qual_tipos_20260325', 'stage_qual',
  ]);
  const coverage = buildInventory({
    migrationFiles: [['0294_consolidar_qualificacoes_check.sql', sql]],
    backupSource: "tabelas_principais: ['qualificacoes_historico']",
  });
  assert.equal(coverage.schema_tables_detected, 3);
  assert.equal(coverage.schema_tables_not_in_worker_backup, 3);
});

test('includes both internal qualification backup tables from the actual versioned migration', () => {
  const source = readFileSync(new URL('../../worker-airtrust/migrations/0294_consolidar_qualificacoes_check.sql', import.meta.url), 'utf8');
  const actual = extractCreatedTables(source);
  assert.ok(actual.includes('bkp_qual_historico_20260325'));
  assert.ok(actual.includes('bkp_qual_tipos_20260325'));
});

test('uses optional local schema names to calculate exact supplied-schema coverage without DB calls', () => {
  const result = buildInventoryFromSchemaMetadata({
    metadata: { tables: ['Funcionarios', 'qualificacoes_historico', 'sqlite_sequence', 'backup_shadow'] },
    backupSource: "tabelas_principais: ['funcionarios'], tabelas_relacionadas: ['qualificacoes_historico', 'absent']",
  });
  assert.equal(result.source, 'operator_supplied_schema_table_names_only');
  assert.equal(result.schema_tables_detected, 3);
  assert.equal(result.schema_tables_not_in_worker_backup, 1);
  assert.deepEqual(result.configured_tables_not_found_in_schema_metadata, ['absent']);
  assert.deepEqual(result.tables.filter(row => !row.in_worker_backup).map(row => row.table), ['backup_shadow']);
});

test('rejects database dumps, row content, invalid identifiers and case-insensitive duplicates', () => {
  for (const metadata of [
    { tables: ['employees'], rows: [{ cpf: '000' }] },
    { tables: [{name: 'employees', records: []}] },
    { tables: ['x; DROP TABLE y'] },
    { tables: ['Users', 'users'] },
    { tables: 'users' },
  ]) {
    assert.throws(() => buildInventoryFromSchemaMetadata({metadata, backupSource: ''}));
  }
});

test('matches static migration and backup names case-insensitively without double counting', () => {
  const result = buildInventory({
    migrationFiles: [['0001.sql', 'CREATE TABLE "Funcionarios" (id INTEGER); CREATE TABLE funcionarios (id INTEGER); CREATE TABLE Missing (id INTEGER);']],
    backupSource: "tabelas_principais: ['funcionarios', 'ABSENT']",
  });
  assert.equal(result.schema_tables_detected, 2);
  assert.equal(result.schema_tables_not_in_worker_backup, 1);
  assert.deepEqual(result.configured_tables_not_found_in_migrations, ['ABSENT']);
  assert.deepEqual(result.tables.filter(t => t.in_worker_backup).map(t => t.table), ['Funcionarios']);
});

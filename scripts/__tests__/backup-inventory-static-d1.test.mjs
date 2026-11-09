import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { buildInventory, extractCreatedTables, extractConfiguredTables } from '../backup/inventory-static-d1.mjs';

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

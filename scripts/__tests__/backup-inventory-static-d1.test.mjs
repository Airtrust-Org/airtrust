import assert from 'node:assert/strict';
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

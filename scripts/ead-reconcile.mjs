#!/usr/bin/env node
/**
 * Generates a fail-closed, tenant-scoped EAD reconciliation and its exact
 * rollback. This script never writes to a remote database.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';

const EMPRESA_ID = 6;
const CATEGORY_ID = 13;
const CATEGORY_NAME = 'EAD';
const CATEGORY_COLOR = '#EABA0C';
const ROMULO_NAME = 'Rômulo Harfield Castanheira de Menezes';
const ROMULO_CANAC = '15722-4';
const ROMULO_IDS = [5305, 5307, 5308, 5321, 5323, 5373, 5374, 5375, 5440];

function sqlLiteral(value) {
  return value === null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;
}

function priorCondition(column, value) {
  return value === null ? `${column} IS NULL` : `${column} = ${sqlLiteral(value)}`;
}

function runSqlite(dbFile, sql) {
  const result = spawnSync('sqlite3', ['-json', dbFile, sql], {
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 50 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    const detail = String(result.stderr || result.error?.message || 'unknown sqlite failure')
      .replace(/[\r\n]+/g, ' ')
      .slice(0, 500);
    throw new Error(`SQLite query failed: ${detail}`);
  }
  const raw = result.stdout.trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('result is not an array');
    return parsed;
  } catch (error) {
    throw new Error(`SQLite returned invalid JSON: ${error.message}`);
  }
}

function queryOne(dbFile, sql) {
  const rows = runSqlite(dbFile, sql);
  if (rows.length > 1) throw new Error('Expected at most one row, received multiple rows');
  return rows[0] ?? null;
}

function createManifest({ environment, operations, ignored, divergences }) {
  const byTable = Object.groupBy(operations, ({ table }) => table);
  return {
    environment,
    timestamp: new Date().toISOString(),
    empresa_id: EMPRESA_ID,
    categoria_canonica: { id: CATEGORY_ID, nome: CATEGORY_NAME, cor: CATEGORY_COLOR, ativo: 1 },
    total_operations: operations.length,
    operations_by_table: Object.fromEntries(
      Object.entries(byTable).map(([table, entries]) => [
        table,
        entries.map(({ table: _table, ...operation }) => operation),
      ]),
    ),
    romulo_historico_ids: ROMULO_IDS,
    ignored_records_count: ignored.length,
    ignored_records: ignored,
    fail_closed_divergences: divergences,
  };
}

function writeManifest(file, manifest) {
  if (file) writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
}

function addOperation(operations, { table, id, set, previous, reason, precondition }) {
  operations.push({ table, id, previous, expected: set, reason, precondition });
}

function eadHistoricCorrection(row) {
  const set = {};
  const previous = {};
  if (row.categoria_id !== CATEGORY_ID) {
    set.categoria_id = CATEGORY_ID;
    previous.categoria_id = row.categoria_id;
  }
  if (
    String(row.historico_categoria ?? '')
      .trim()
      .toUpperCase() !== CATEGORY_NAME
  ) {
    set.categoria = CATEGORY_NAME;
    previous.categoria = row.historico_categoria;
  }
  if (!Object.keys(set).length) return null;
  return {
    set,
    previous,
    precondition: Object.entries(previous)
      .map(([column, value]) => priorCondition(column, value))
      .join(' AND '),
  };
}

function updateSql(table, id, set, where) {
  const assignments = Object.entries(set)
    .map(([column, value]) => `${column} = ${sqlLiteral(value)}`)
    .join(', ');
  return `UPDATE ${table} SET ${assignments} WHERE id = ${id} AND empresa_id = ${EMPRESA_ID} AND deleted_at IS NULL AND ${where};`;
}

function rollbackSql(table, id, previous, expected) {
  const assignments = Object.entries(previous)
    .map(([column, value]) => `${column} = ${sqlLiteral(value)}`)
    .join(', ');
  const postcondition = Object.entries(expected)
    .map(([column, value]) => priorCondition(column, value))
    .join(' AND ');
  return `UPDATE ${table} SET ${assignments} WHERE id = ${id} AND empresa_id = ${EMPRESA_ID} AND deleted_at IS NULL AND ${postcondition};`;
}

function main() {
  const args = process.argv.slice(2);
  const option = (name) => {
    const index = args.indexOf(name);
    return index === -1 ? null : (args[index + 1] ?? null);
  };
  const dbFile = option('--db-file');
  const manifestFile = option('--manifest');
  const applyFile = option('--apply-sql-output');
  const rollbackFile = option('--rollback-output');
  const environment = process.env.ENVIRONMENT || 'local';
  const divergences = [];
  const ignored = [];
  const operations = [];

  const failClosed = (message) => {
    divergences.push(message);
    writeManifest(manifestFile, createManifest({ environment, operations, ignored, divergences }));
    throw new Error(message);
  };

  try {
    if (!dbFile || !applyFile) failClosed('Usage: --db-file and --apply-sql-output are required');
    if (!existsSync(dbFile)) failClosed('SQLite database file is missing');

    const empresa = queryOne(
      dbFile,
      `SELECT id, deleted_at FROM empresas WHERE id = ${EMPRESA_ID}`,
    );
    if (!empresa || empresa.deleted_at !== null) {
      failClosed('Empresa 6 is missing or deleted');
    }

    const category = queryOne(
      dbFile,
      `SELECT id, empresa_id, nome, cor, ativo, deleted_at FROM qualificacoes_categorias WHERE id = ${CATEGORY_ID}`,
    );
    if (
      !category ||
      category.empresa_id !== EMPRESA_ID ||
      category.deleted_at !== null ||
      category.nome !== CATEGORY_NAME
    ) {
      failClosed('Canonical category 13 is missing, cross-tenant, deleted, or not named EAD');
    }
    const duplicateCategories = runSqlite(
      dbFile,
      `SELECT id FROM qualificacoes_categorias WHERE empresa_id = ${EMPRESA_ID} AND id != ${CATEGORY_ID} AND deleted_at IS NULL AND ativo = 1 AND UPPER(TRIM(nome)) = 'EAD'`,
    );
    if (duplicateCategories.length)
      failClosed(
        `Active duplicate EAD categories found: ${duplicateCategories.map(({ id }) => id).join(', ')}`,
      );

    if (category.cor !== CATEGORY_COLOR) {
      const set = { cor: CATEGORY_COLOR };
      const previous = { cor: category.cor };
      addOperation(operations, {
        table: 'qualificacoes_categorias',
        id: CATEGORY_ID,
        set,
        previous,
        reason: 'restore canonical EAD color',
        precondition: priorCondition('cor', category.cor),
      });
    }
    if (category.ativo !== 1) {
      const set = { ativo: 1 };
      const previous = { ativo: category.ativo };
      addOperation(operations, {
        table: 'qualificacoes_categorias',
        id: CATEGORY_ID,
        set,
        previous,
        reason: 'reactivate canonical EAD category',
        precondition: priorCondition('ativo', category.ativo),
      });
    }

    const eadTypes = runSqlite(
      dbFile,
      `SELECT id, categoria_id, codigo, nome FROM qualificacoes_tipos WHERE empresa_id = ${EMPRESA_ID} AND deleted_at IS NULL AND UPPER(TRIM(categoria)) = 'EAD' AND (categoria_id IS NULL OR categoria_id != ${CATEGORY_ID}) ORDER BY id`,
    );
    for (const type of eadTypes) {
      const set = { categoria_id: CATEGORY_ID };
      const previous = { categoria_id: type.categoria_id };
      addOperation(operations, {
        table: 'qualificacoes_tipos',
        id: type.id,
        set,
        previous,
        reason: `canonical EAD type (${type.codigo}: ${type.nome})`,
        precondition: priorCondition('categoria_id', type.categoria_id),
      });
    }

    const romuloRows = runSqlite(
      dbFile,
      `SELECT qh.id, qh.empresa_id AS historico_empresa_id, qh.categoria_id, qh.categoria AS historico_categoria, qh.deleted_at AS historico_deleted_at, f.id AS funcionario_id, f.empresa_id AS funcionario_empresa_id, f.nome AS funcionario_nome, f.codigo_anac, f.deleted_at AS funcionario_deleted_at, qt.id AS tipo_id, qt.empresa_id AS tipo_empresa_id, qt.categoria AS tipo_categoria, qt.deleted_at AS tipo_deleted_at FROM qualificacoes_historico qh LEFT JOIN funcionarios f ON f.id = qh.funcionario_id LEFT JOIN qualificacoes_tipos qt ON qt.id = qh.qualificacao_id WHERE qh.id IN (${ROMULO_IDS.join(',')}) ORDER BY qh.id`,
    );
    const romuloById = new Map(romuloRows.map((row) => [row.id, row]));
    for (const id of ROMULO_IDS) {
      const row = romuloById.get(id);
      if (!row) failClosed(`Rômulo historic ${id} is missing`);
      const valid =
        row.historico_empresa_id === EMPRESA_ID &&
        row.historico_deleted_at === null &&
        row.funcionario_empresa_id === EMPRESA_ID &&
        row.funcionario_deleted_at === null &&
        row.funcionario_nome === ROMULO_NAME &&
        row.codigo_anac === ROMULO_CANAC &&
        row.tipo_empresa_id === EMPRESA_ID &&
        row.tipo_deleted_at === null &&
        String(row.tipo_categoria || '')
          .trim()
          .toUpperCase() === CATEGORY_NAME;
      if (!valid)
        failClosed(
          `Rômulo historic ${id} failed tenant, identity, active-state, or EAD evidence validation`,
        );
      const correction = eadHistoricCorrection(row);
      if (correction) {
        addOperation(operations, {
          table: 'qualificacoes_historico',
          id,
          ...correction,
          reason: 'verified Rômulo EAD historic',
        });
      } else {
        ignored.push({
          table: 'qualificacoes_historico',
          id,
          reason: 'verified Rômulo EAD historic already canonical',
        });
      }
    }

    const otherHistorics = runSqlite(
      dbFile,
      `SELECT qh.id, qh.categoria_id, qh.categoria AS historico_categoria, qt.id AS tipo_id, qt.codigo AS tipo_codigo, qt.nome AS tipo_nome FROM qualificacoes_historico qh INNER JOIN qualificacoes_tipos qt ON qt.id = qh.qualificacao_id WHERE qh.empresa_id = ${EMPRESA_ID} AND qh.deleted_at IS NULL AND qt.empresa_id = ${EMPRESA_ID} AND qt.deleted_at IS NULL AND UPPER(TRIM(qt.categoria)) = 'EAD' AND (qh.categoria_id IS NULL OR qh.categoria_id != ${CATEGORY_ID} OR UPPER(TRIM(COALESCE(qh.categoria, ''))) != 'EAD') AND qh.id NOT IN (${ROMULO_IDS.join(',')}) ORDER BY qh.id`,
    );
    for (const historic of otherHistorics) {
      const correction = eadHistoricCorrection(historic);
      if (!correction) continue;
      addOperation(operations, {
        table: 'qualificacoes_historico',
        id: historic.id,
        ...correction,
        reason: `verified EAD historic via type ${historic.tipo_id} (${historic.tipo_codigo}: ${historic.tipo_nome})`,
      });
    }

    const applyLines = ['-- EAD Category Reconciliation — allowlisted updates only'];
    const rollbackLines = ['-- EAD Category Reconciliation — exact rollback'];
    for (const operation of operations) {
      applyLines.push(
        updateSql(operation.table, operation.id, operation.expected, operation.precondition),
      );
      rollbackLines.push(
        rollbackSql(operation.table, operation.id, operation.previous, operation.expected),
      );
    }
    writeFileSync(applyFile, `${applyLines.join('\n')}\n`);
    if (rollbackFile) writeFileSync(rollbackFile, `${rollbackLines.join('\n')}\n`);
    writeManifest(manifestFile, createManifest({ environment, operations, ignored, divergences }));
    console.log(
      `EAD reconciliation generated ${operations.length} allowlisted operations for ${environment}.`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown reconciliation failure';
    if (!divergences.length) {
      divergences.push(message);
      writeManifest(
        manifestFile,
        createManifest({ environment, operations, ignored, divergences }),
      );
    }
    console.error(`EAD reconciliation failed closed: ${message}`);
    process.exitCode = 1;
  }
}

main();

#!/usr/bin/env node

// source_reference: scripts/maintenance/lib/simuladores-matriz-v6-data.mjs + airtrust_matriz_v6_2_todas_sessoes_manobras_final.md
// operational_decision: local-only preparation of Costa do Sol matrix V6.2 without remote apply
// dry_run_required: use --dry-run by default and never execute remote/prod apply from this script
// rollback_plan_required: rollback is the inverse of generated local SQL review; no remote state is touched here

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import {
  buildModelMetadataObservacoes,
  buildRowReferencias,
  loadSimuladoresMatrizV6Data,
} from './lib/simuladores-matriz-v6-data.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const LOCAL_DB_GLOB = path.join(
  ROOT,
  'worker-airtrust',
  '.wrangler',
  'state',
  'v3',
  'd1',
  'miniflare-D1DatabaseObject',
);
export const CONFIRM_TEXT =
  'APLICAR MATRIZ V6.2 TRE-INST CRED-EXA E NOMES SEM ALTERAR FICHAS EXISTENTES';
const TEMPLATE_TABLES = ['modelos_sessao', 'modelos_sessao_manobras', 'manobras'];
const HISTORICAL_TABLES = [
  'fichas_sessao',
  'fichas_sessao_manobras',
  'simulador_agendamentos',
  'avaliacoes_manobras',
  'fichas_manobras_historico',
];

function parseArgs(argv) {
  let empresaId = null;
  let dbFile = null;
  let confirm = '';
  let apply = false;
  let dryRun = true;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--empresa-id') {
      empresaId = Number(argv[++index]);
      continue;
    }
    if (arg === '--db-file') {
      dbFile = argv[++index] || null;
      continue;
    }
    if (arg === '--confirm') {
      confirm = argv[++index] || '';
      continue;
    }
    if (arg === '--apply') {
      apply = true;
      dryRun = false;
      continue;
    }
    if (arg === '--dry-run') {
      dryRun = true;
      apply = false;
      continue;
    }
    throw new Error(`unknown_argument:${arg}`);
  }

  if (!Number.isInteger(empresaId) || empresaId <= 0) {
    throw new Error('--empresa-id deve ser um número positivo.');
  }

  return { empresaId, dbFile, confirm, apply, dryRun };
}

function detectLocalDbFile() {
  if (!fs.existsSync(LOCAL_DB_GLOB)) return null;
  const file = fs
    .readdirSync(LOCAL_DB_GLOB)
    .find((name) => name.endsWith('.sqlite') && name !== 'metadata.sqlite');
  return file ? path.join(LOCAL_DB_GLOB, file) : null;
}

function sqliteJson(dbFile, sql) {
  const output = execFileSync('sqlite3', ['-json', dbFile, sql], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  }).trim();
  return output ? JSON.parse(output) : [];
}

function sqliteExec(dbFile, sql) {
  execFileSync('sqlite3', [dbFile], {
    input: sql,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function buildManeuverCatalog(models, registry) {
  const catalog = new Map();
  for (const model of models) {
    for (const row of model.rows) {
      const ref = registry.get(row.codigo);
      if (!ref) {
        throw new Error(`missing_registry_entry:${row.codigo}`);
      }
      const existing = catalog.get(row.codigo);
      const referencias = buildRowReferencias(row);
      const next = {
        codigo: row.codigo,
        nome: ref.nome,
        descricao: ref.nome,
        categoria: ref.categoria || null,
        tipo_sessao: ref.tipo_sessao || 'TREINAMENTO',
        tipo_aeronave: ref.tipo_aeronave || model.aircraft,
        ordem: row.ordem,
        referencias_json: referencias ? JSON.stringify(referencias) : null,
      };

      if (!existing) {
        catalog.set(row.codigo, next);
        continue;
      }

      if (!existing.referencias_json && next.referencias_json) {
        existing.referencias_json = next.referencias_json;
      }
    }
  }
  return [...catalog.values()].sort((left, right) => left.codigo.localeCompare(right.codigo));
}

function buildTargetRows(data) {
  return data.models.flatMap((model) =>
    model.rows.map((row) => ({
      modelCode: model.modelCode,
      modelName: model.modelName,
      aircraft: model.aircraft,
      ordem: row.ordem,
      codigo: row.codigo,
      nome: row.nome,
      observacoes: buildModelMetadataObservacoes(model, row),
    })),
  );
}

function buildAnalyticalSummary(data, empresaId, dbFile) {
  const targetRows = buildTargetRows(data);
  const targetModelCodes = [...new Set(targetRows.map((row) => row.modelCode))].sort();
  const currentRows = data.sourceMapSummary.currentRows.filter((row) => targetModelCodes.includes(row.modelo_codigo));
  const currentModelCounts = new Map();
  for (const row of currentRows) {
    currentModelCounts.set(row.modelo_codigo, (currentModelCounts.get(row.modelo_codigo) || 0) + 1);
  }

  return {
    status: data.issues.length === 0 ? 'READY_FOR_REVIEW' : 'BLOCKED',
    mode: dbFile ? 'db-aware' : 'analytical',
    empresa_id: empresaId,
    db_file: dbFile,
    model_count: targetModelCodes.length,
    technical_rows_total: targetRows.length,
    notechs_expected_total: data.notechsCodes.length,
    current_source_map_models: currentModelCounts.size,
    current_source_map_rows: currentRows.length,
    current_model_row_counts: Object.fromEntries([...currentModelCounts.entries()].sort()),
    target_models: targetModelCodes,
    validation_issues: data.issues,
  };
}

function ensureDbHasData(dbFile, empresaId) {
  const modelosColumns = sqliteJson(dbFile, `PRAGMA table_info(modelos_sessao);`).map((row) => row.name);
  const manobrasColumns = sqliteJson(dbFile, `PRAGMA table_info(manobras);`).map((row) => row.name);

  if (!modelosColumns.includes('empresa_id') || !manobrasColumns.includes('empresa_id')) {
    throw new Error('db_schema_incompatible_for_tenant_scope');
  }

  const counts = sqliteJson(
    dbFile,
    `
      SELECT
        (SELECT COUNT(*) FROM modelos_sessao WHERE deleted_at IS NULL AND empresa_id = ${empresaId}) AS modelos,
        (SELECT COUNT(*) FROM manobras WHERE deleted_at IS NULL AND empresa_id = ${empresaId}) AS manobras;
    `,
  )[0];

  if (!counts || Number(counts.modelos || 0) === 0 || Number(counts.manobras || 0) === 0) {
    throw new Error('db_snapshot_sem_catalogo_ou_modelos');
  }
}

function tableExists(dbFile, tableName) {
  const rows = sqliteJson(
    dbFile,
    `SELECT name FROM sqlite_master WHERE type IN ('table', 'view') AND name = ${sqlString(tableName)};`,
  );
  return rows.length > 0;
}

function buildTableSnapshot(dbFile, tableName) {
  if (!tableExists(dbFile, tableName)) {
    return { table: tableName, exists: false, row_count: null, sha256: null };
  }

  const countRow = sqliteJson(dbFile, `SELECT COUNT(*) AS row_count FROM ${tableName};`)[0] || {};
  const rows = sqliteJson(dbFile, `SELECT * FROM ${tableName} ORDER BY 1;`);
  return {
    table: tableName,
    exists: true,
    row_count: Number(countRow.row_count || 0),
    sha256: crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex'),
  };
}

function buildSnapshots(dbFile, tables) {
  return Object.fromEntries(tables.map((tableName) => [tableName, buildTableSnapshot(dbFile, tableName)]));
}

function compareSnapshots(before, after) {
  const changed = [];
  for (const tableName of Object.keys(before)) {
    if (JSON.stringify(before[tableName]) !== JSON.stringify(after[tableName])) {
      changed.push(tableName);
    }
  }
  return changed;
}

export function buildApplySql(data, empresaId) {
  const catalog = buildManeuverCatalog(data.models, data.registry);
  const targetRows = buildTargetRows(data);
  const targetModels = data.models
    .map((model) => `(${sqlString(model.modelCode)}, ${sqlString(model.modelName)})`)
    .join(',\n    ');
  const targetValues = targetRows
    .map(
      (row) =>
        `(${sqlString(row.modelCode)}, ${sqlString(row.codigo)}, ${row.ordem}, ${sqlString(row.observacoes)})`,
    )
    .join(',\n    ');
  const catalogValues = catalog
    .map(
      (row) =>
        `(${sqlString(row.codigo)}, ${sqlString(row.nome)}, ${sqlString(row.descricao)}, ${
          row.categoria ? sqlString(row.categoria) : 'NULL'
        }, ${sqlString(row.tipo_sessao)}, ${sqlString(row.tipo_aeronave)}, ${row.ordem}, ${
          row.referencias_json ? sqlString(row.referencias_json) : 'NULL'
        })`,
    )
    .join(',\n    ');

  return `
BEGIN TRANSACTION;

WITH target_models(modelo_codigo, modelo_nome) AS (
  VALUES
    ${targetModels}
)
UPDATE modelos_sessao
SET nome = (
      SELECT tm.modelo_nome
      FROM target_models tm
      WHERE tm.modelo_codigo = modelos_sessao.codigo
    ),
    updated_at = datetime('now')
WHERE empresa_id = ${empresaId}
  AND deleted_at IS NULL
  AND codigo IN (SELECT modelo_codigo FROM target_models)
  AND COALESCE(nome, '') <> COALESCE((
      SELECT tm.modelo_nome
      FROM target_models tm
      WHERE tm.modelo_codigo = modelos_sessao.codigo
    ), '');

WITH catalog_rows(codigo, nome, descricao, categoria, tipo_sessao, tipo_aeronave, ordem, referencias_json) AS (
  VALUES
    ${catalogValues}
)
INSERT INTO manobras (
  codigo, nome, descricao, categoria, tipo_sessao, tipo_aeronave, ordem, referencias_json, empresa_id, created_at, updated_at
)
SELECT
  cr.codigo,
  cr.nome,
  cr.descricao,
  cr.categoria,
  cr.tipo_sessao,
  cr.tipo_aeronave,
  cr.ordem,
  cr.referencias_json,
  ${empresaId},
  datetime('now'),
  datetime('now')
FROM catalog_rows cr
WHERE NOT EXISTS (
  SELECT 1
  FROM manobras m
  WHERE m.codigo = cr.codigo
    AND m.empresa_id = ${empresaId}
    AND m.deleted_at IS NULL
);

WITH target_rows(modelo_codigo, manobra_codigo, ordem, observacoes) AS (
  VALUES
    ${targetValues}
),
resolved_rows AS (
  SELECT
    ms.id AS modelo_id,
    ms.codigo AS modelo_codigo,
    m.id AS manobra_id,
    tr.manobra_codigo,
    tr.ordem,
    tr.observacoes
  FROM target_rows tr
  INNER JOIN modelos_sessao ms
    ON ms.codigo = tr.modelo_codigo
   AND ms.empresa_id = ${empresaId}
   AND ms.deleted_at IS NULL
  INNER JOIN manobras m
    ON m.codigo = tr.manobra_codigo
   AND m.empresa_id = ${empresaId}
   AND m.deleted_at IS NULL
),
obsolete_rows AS (
  SELECT msm.id
  FROM modelos_sessao_manobras msm
  INNER JOIN modelos_sessao ms
    ON ms.id = msm.modelo_id
   AND ms.empresa_id = ${empresaId}
   AND ms.deleted_at IS NULL
  WHERE msm.deleted_at IS NULL
    AND ms.codigo IN (SELECT DISTINCT modelo_codigo FROM target_rows)
    AND NOT EXISTS (
      SELECT 1
      FROM resolved_rows rr
      WHERE rr.modelo_id = msm.modelo_id
        AND rr.manobra_id = msm.manobra_id
    )
)
UPDATE modelos_sessao_manobras
SET deleted_at = datetime('now'),
    updated_at = datetime('now')
WHERE id IN (SELECT id FROM obsolete_rows);

WITH target_rows(modelo_codigo, manobra_codigo, ordem, observacoes) AS (
  VALUES
    ${targetValues}
),
resolved_rows AS (
  SELECT
    ms.id AS modelo_id,
    m.id AS manobra_id,
    tr.ordem,
    tr.observacoes
  FROM target_rows tr
  INNER JOIN modelos_sessao ms
    ON ms.codigo = tr.modelo_codigo
   AND ms.empresa_id = ${empresaId}
   AND ms.deleted_at IS NULL
  INNER JOIN manobras m
    ON m.codigo = tr.manobra_codigo
   AND m.empresa_id = ${empresaId}
   AND m.deleted_at IS NULL
)
INSERT INTO modelos_sessao_manobras (
  modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at
)
SELECT
  rr.modelo_id,
  rr.manobra_id,
  rr.ordem,
  1,
  rr.observacoes,
  datetime('now'),
  datetime('now')
FROM resolved_rows rr
WHERE NOT EXISTS (
  SELECT 1
  FROM modelos_sessao_manobras msm
  WHERE msm.modelo_id = rr.modelo_id
    AND msm.manobra_id = rr.manobra_id
    AND msm.deleted_at IS NULL
);

WITH target_rows(modelo_codigo, manobra_codigo, ordem, observacoes) AS (
  VALUES
    ${targetValues}
),
resolved_rows AS (
  SELECT
    ms.id AS modelo_id,
    m.id AS manobra_id,
    tr.ordem,
    tr.observacoes
  FROM target_rows tr
  INNER JOIN modelos_sessao ms
    ON ms.codigo = tr.modelo_codigo
   AND ms.empresa_id = ${empresaId}
   AND ms.deleted_at IS NULL
  INNER JOIN manobras m
    ON m.codigo = tr.manobra_codigo
   AND m.empresa_id = ${empresaId}
   AND m.deleted_at IS NULL
)
UPDATE modelos_sessao_manobras
SET ordem = (
      SELECT rr.ordem
      FROM resolved_rows rr
      WHERE rr.modelo_id = modelos_sessao_manobras.modelo_id
        AND rr.manobra_id = modelos_sessao_manobras.manobra_id
    ),
    observacoes = (
      SELECT rr.observacoes
      FROM resolved_rows rr
      WHERE rr.modelo_id = modelos_sessao_manobras.modelo_id
        AND rr.manobra_id = modelos_sessao_manobras.manobra_id
    ),
    updated_at = datetime('now')
WHERE deleted_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM resolved_rows rr
    WHERE rr.modelo_id = modelos_sessao_manobras.modelo_id
      AND rr.manobra_id = modelos_sessao_manobras.manobra_id
      AND (
        rr.ordem <> modelos_sessao_manobras.ordem
        OR COALESCE(rr.observacoes, '') <> COALESCE(modelos_sessao_manobras.observacoes, '')
      )
  );

COMMIT;
`.trim();
}

function validateDbOutcome(dbFile, data, empresaId) {
  const modelCodes = data.models.map((model) => sqlString(model.modelCode)).join(', ');
  const expectedNames = new Map(data.models.map((model) => [model.modelCode, model.modelName]));
  const rows = sqliteJson(
    dbFile,
    `
      SELECT
        ms.codigo AS modelo_codigo,
        ms.nome AS modelo_nome,
        COUNT(*) AS total,
        COUNT(DISTINCT m.codigo) AS distintos
      FROM modelos_sessao_manobras msm
      INNER JOIN modelos_sessao ms ON ms.id = msm.modelo_id
      INNER JOIN manobras m ON m.id = msm.manobra_id
      WHERE ms.empresa_id = ${empresaId}
        AND ms.codigo IN (${modelCodes})
        AND ms.deleted_at IS NULL
        AND msm.deleted_at IS NULL
        AND m.deleted_at IS NULL
      GROUP BY ms.codigo
      ORDER BY ms.codigo;
    `,
  );

  const missingModels = data.models
    .map((model) => model.modelCode)
    .filter((modelCode) => !rows.some((row) => row.modelo_codigo === modelCode));
  if (missingModels.length > 0) {
    throw new Error(`post_apply_models_missing:${missingModels.join(',')}`);
  }

  const invalid = rows.filter(
    (row) =>
      Number(row.total) !== 18 ||
      Number(row.distintos) !== 18 ||
      row.modelo_nome !== expectedNames.get(row.modelo_codigo),
  );
  if (invalid.length > 0) {
    throw new Error(`post_apply_validation_failed:${JSON.stringify(invalid)}`);
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const data = loadSimuladoresMatrizV6Data();
  if (data.issues.length > 0) {
    throw new Error(`matriz_v6_invalid:${data.issues.join(',')}`);
  }

  const autoDb = detectLocalDbFile();
  const dbFile = options.dbFile || autoDb;
  const summary = buildAnalyticalSummary(data, options.empresaId, dbFile);
  const sql = buildApplySql(data, options.empresaId);
  const writePlan = {
    source_file: data.sourceFile,
    template_tables_only: TEMPLATE_TABLES,
    explicitly_not_touched: HISTORICAL_TABLES,
  };

  if (options.dryRun) {
    const payload = {
      ...summary,
      ...writePlan,
      sql_preview_first_lines: sql.split('\n').slice(0, 40),
      db_snapshot_detected: Boolean(dbFile),
      apply_requires_confirm: CONFIRM_TEXT,
    };

    if (dbFile && fs.existsSync(dbFile)) {
      try {
        ensureDbHasData(dbFile, options.empresaId);
        payload.db_snapshot_status = 'seeded';
        payload.historical_tables_before = buildSnapshots(dbFile, HISTORICAL_TABLES);
        payload.template_tables_before = buildSnapshots(dbFile, TEMPLATE_TABLES);
      } catch (error) {
        payload.db_snapshot_status = 'empty_or_unseeded';
        payload.db_snapshot_warning = String(error.message || error);
      }
    }

    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }

  if (!dbFile) {
    throw new Error('--apply exige --db-file explícito ou snapshot local detectável.');
  }
  if (!fs.existsSync(dbFile)) {
    throw new Error(`db_file_not_found:${dbFile}`);
  }
  if (options.confirm !== CONFIRM_TEXT) {
    throw new Error(`--confirm deve ser exatamente: ${CONFIRM_TEXT}`);
  }

  ensureDbHasData(dbFile, options.empresaId);
  const historicalBefore = buildSnapshots(dbFile, HISTORICAL_TABLES);
  sqliteExec(dbFile, sql);
  const historicalAfter = buildSnapshots(dbFile, HISTORICAL_TABLES);
  const changedHistoricalTables = compareSnapshots(historicalBefore, historicalAfter);
  if (changedHistoricalTables.length > 0) {
    throw new Error(`historical_tables_changed:${changedHistoricalTables.join(',')}`);
  }
  validateDbOutcome(dbFile, data, options.empresaId);

  process.stdout.write(
    `${JSON.stringify(
      {
        status: 'APPLY_OK_LOCAL_ONLY',
        empresa_id: options.empresaId,
        db_file: dbFile,
        model_count: data.models.length,
        technical_rows_total: data.models.length * 18,
        source_file: data.sourceFile,
        template_tables_only: TEMPLATE_TABLES,
        historical_tables_verified_unchanged: HISTORICAL_TABLES,
        historical_tables_before: historicalBefore,
        historical_tables_after: historicalAfter,
      },
      null,
      2,
    )}\n`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

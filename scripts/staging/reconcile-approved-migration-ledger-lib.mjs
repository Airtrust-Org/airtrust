#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..', '..');
const MIGRATIONS_DIR = path.join(ROOT, 'worker-airtrust', 'migrations');

export const ALLOWED_STAGING_DB_NAME = 'airtrust-db-staging-baseline-20260701';
export const ALLOWED_STAGING_DB_ID = 'bf9963f4-eb12-439b-a830-20bbf577ac22';
export const BLOCKED_DB_NAMES = ['airtrust-db', 'airtrust-db-dev', 'airtrust-db-production'];
export const BLOCKED_DB_IDS = [
  '7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae',
  'a72fb05b-0912-4ad9-9686-e7948c8b09eb',
];
export const LEDGER_RECONCILIATION_CONFIRMATION = 'AIRTRUST_STAGING_LEDGER_RECONCILIATION';

export const APPROVED_LEDGER_RECONCILIATIONS = [
  {
    code: '0421',
    file: '0421_shared_session_segment_curricula.sql',
    sha256: '73d90ac9bcceaeb11439e5ed3fab642edbb886efba5410ff494ae759f06f121a',
  },
  {
    code: '0422',
    file: '0422_modelos_sessao_requisitos.sql',
    sha256: 'fc2577968af7fdaca0f5c7d02f8988f81fa84f133c0ae9982d676e66fda5511d',
  },
  {
    code: '0423',
    file: '0423_shared_session_multi_curricula_per_participant.sql',
    sha256: '042b605955c2e2f8b890ea8db41bde6e3a4e227bb8c4d7ebfe4df64f6eaad285',
  },
];

export function assertAllowedStagingTarget(dbName, dbId) {
  const name = String(dbName || '').trim();
  const id = String(dbId || '').trim();

  if (BLOCKED_DB_NAMES.includes(name.toLowerCase()) || BLOCKED_DB_IDS.includes(id)) {
    throw new Error(`Alvo "${name}" (${id}) é produção/desenvolvimento — reconciliação bloqueada.`);
  }
  if (name !== ALLOWED_STAGING_DB_NAME || id !== ALLOWED_STAGING_DB_ID) {
    throw new Error(
      `Alvo "${name}" (${id}) não é o D1 de staging esperado ` +
        `(${ALLOWED_STAGING_DB_NAME} / ${ALLOWED_STAGING_DB_ID}).`,
    );
  }
}

export function normalizeSql(sql) {
  return String(sql || '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([(),=])\s*/g, '$1')
    .trim()
    .toLowerCase();
}

export function sha256File(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

export function createRemoteExecutor(dbName) {
  return async function runRemote(sql) {
    const result = spawnSync(
      'npx',
      ['wrangler', 'd1', 'execute', dbName, '--remote', '--json', '--command', sql],
      { cwd: path.join(ROOT, 'worker-airtrust'), encoding: 'utf8' },
    );
    if (result.status !== 0) {
      throw new Error(result.stderr || result.stdout || 'wrangler d1 execute falhou');
    }
    const parsed = JSON.parse(result.stdout);
    return parsed[0]?.results ?? [];
  };
}

export function createSqliteCliExecutor(dbPath) {
  return async function runSqlite(sql) {
    const result = spawnSync('sqlite3', ['-json', dbPath, sql], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    if (result.status !== 0) {
      throw new Error(result.stderr || result.stdout || 'sqlite3 falhou');
    }
    const text = String(result.stdout || '').trim();
    return text ? JSON.parse(text) : [];
  };
}

async function queryOne(executor, sql) {
  const rows = await executor(sql);
  return rows[0] ?? null;
}

async function queryAll(executor, sql) {
  return executor(sql);
}

async function getSqliteMasterSql(executor, type, name) {
  const row = await queryOne(
    executor,
    `SELECT sql FROM sqlite_master WHERE type = '${type}' AND name = '${name.replace(/'/g, "''")}';`,
  );
  return row?.sql ?? null;
}

async function getTableInfo(executor, tableName) {
  return queryAll(executor, `PRAGMA table_info("${tableName}");`);
}

async function getForeignKeys(executor, tableName) {
  return queryAll(executor, `PRAGMA foreign_key_list("${tableName}");`);
}

async function getIndexList(executor, tableName) {
  return queryAll(executor, `PRAGMA index_list("${tableName}");`);
}

function hasColumn(columns, expected) {
  return columns.some((column) =>
    Object.entries(expected).every(([key, value]) => String(column[key]) === String(value)),
  );
}

function hasForeignKey(rows, expected) {
  return rows.some((row) =>
    Object.entries(expected).every(([key, value]) => String(row[key]) === String(value)),
  );
}

function hasIndex(indexes, expected) {
  return indexes.some((row) =>
    Object.entries(expected).every(([key, value]) => String(row[key]) === String(value)),
  );
}

function makeCheck(name, pass, evidence, blocker = false) {
  return { name, pass, blocker, evidence };
}

function classifyFromChecks(checks, absentAnchors = [], conflictChecks = []) {
  const failingAnchors = absentAnchors.filter((name) => checks.find((check) => check.name === name && !check.pass));
  const failingConflicts = conflictChecks.filter((name) => checks.find((check) => check.name === name && !check.pass));
  const failed = checks.filter((check) => !check.pass);

  if (failed.length === 0) return 'INTEGRALMENTE_APLICADA';
  if (failingConflicts.length > 0) return 'CONFLITANTE';
  if (failingAnchors.length === absentAnchors.length) return 'AUSENTE';
  return 'PARCIALMENTE_APLICADA';
}

async function inspect0421(executor) {
  const segmentoColumns = await getTableInfo(executor, 'simulador_agendamento_segmentos');
  const segmentoAtribuicoesColumns = await getTableInfo(executor, 'simulador_segmento_atribuicoes');
  const segmentoAtribuicoesSql = await getSqliteMasterSql(executor, 'table', 'simulador_segmento_atribuicoes');
  const segmentIndexes = await getIndexList(executor, 'simulador_segmento_atribuicoes');
  const segmentFks = await getForeignKeys(executor, 'simulador_segmento_atribuicoes');
  const uqSegmentosSql = await getSqliteMasterSql(executor, 'index', 'uq_sim_agendamento_segmentos_id_empresa');
  const uqCurricularesSql = await getSqliteMasterSql(executor, 'index', 'uq_sim_atribuicoes_curriculares_id_empresa');

  const checks = [
    makeCheck(
      '0421.finalidade_codigo',
      hasColumn(segmentoColumns, { name: 'finalidade_codigo', type: 'TEXT', notnull: 1, dflt_value: "'OUTRO'" }),
      segmentoColumns.filter((row) => row.name === 'finalidade_codigo'),
    ),
    makeCheck(
      '0421.finalidade_titulo',
      hasColumn(segmentoColumns, { name: 'finalidade_titulo', type: 'TEXT' }),
      segmentoColumns.filter((row) => row.name === 'finalidade_titulo'),
    ),
    makeCheck(
      '0421.uq_segmentos_empresa',
      normalizeSql(uqSegmentosSql) ===
        normalizeSql(
          'CREATE UNIQUE INDEX uq_sim_agendamento_segmentos_id_empresa ON simulador_agendamento_segmentos(id, empresa_id)',
        ),
      uqSegmentosSql,
    ),
    makeCheck(
      '0421.uq_curriculares_empresa',
      normalizeSql(uqCurricularesSql) ===
        normalizeSql(
          'CREATE UNIQUE INDEX uq_sim_atribuicoes_curriculares_id_empresa ON simulador_atribuicoes_curriculares(id, empresa_id)',
        ),
      uqCurricularesSql,
    ),
    makeCheck(
      '0421.segmento_atribuicoes_table',
      Boolean(segmentoAtribuicoesSql),
      segmentoAtribuicoesSql,
    ),
    makeCheck(
      '0421.segmento_atribuicoes_required_columns',
      [
        { name: 'uuid', type: 'TEXT', notnull: 1 },
        { name: 'empresa_id', type: 'INTEGER', notnull: 1 },
        { name: 'segmento_id', type: 'INTEGER', notnull: 1 },
        { name: 'atribuicao_curricular_id', type: 'INTEGER', notnull: 1 },
        { name: 'status', type: 'TEXT', notnull: 1, dflt_value: "'PLANEJADA'" },
      ].every((expected) => hasColumn(segmentoAtribuicoesColumns, expected)),
      segmentoAtribuicoesColumns,
    ),
    makeCheck(
      '0421.segmento_atribuicoes_fks',
      [
        { table: 'empresas', from: 'empresa_id', to: 'id' },
        { table: 'simulador_agendamento_segmentos', from: 'segmento_id', to: 'id' },
        { table: 'simulador_agendamento_segmentos', from: 'empresa_id', to: 'empresa_id' },
        { table: 'simulador_atribuicoes_curriculares', from: 'atribuicao_curricular_id', to: 'id' },
        { table: 'simulador_atribuicoes_curriculares', from: 'empresa_id', to: 'empresa_id' },
      ].every((expected) => hasForeignKey(segmentFks, expected)),
      segmentFks,
    ),
    makeCheck(
      '0421.segmento_atribuicoes_indexes',
      [
        { name: 'idx_sim_segmento_atribuicoes_empresa', unique: 0 },
        { name: 'idx_sim_segmento_atribuicoes_segmento', unique: 0 },
        { name: 'idx_sim_segmento_atribuicoes_atribuicao', unique: 0 },
        { name: 'idx_sim_segmento_atribuicoes_ativa', unique: 1 },
      ].every((expected) => hasIndex(segmentIndexes, expected)),
      segmentIndexes,
    ),
  ];

  return {
    migration: '0421_shared_session_segment_curricula.sql',
    sha256: APPROVED_LEDGER_RECONCILIATIONS[0].sha256,
    checks,
    result: classifyFromChecks(checks, [
      '0421.finalidade_codigo',
      '0421.finalidade_titulo',
      '0421.segmento_atribuicoes_table',
    ]),
  };
}

async function inspect0422(executor) {
  const requisitosColumns = await getTableInfo(executor, 'modelos_sessao_requisitos');
  const requisitosSql = await getSqliteMasterSql(executor, 'table', 'modelos_sessao_requisitos');
  const requisitoIndexes = await getIndexList(executor, 'modelos_sessao_requisitos');
  const requisitoFks = await getForeignKeys(executor, 'modelos_sessao_requisitos');
  const uqModelosSql = await getSqliteMasterSql(executor, 'index', 'uq_modelos_sessao_id_empresa');

  const checks = [
    makeCheck(
      '0422.uq_modelos_empresa',
      normalizeSql(uqModelosSql) ===
        normalizeSql('CREATE UNIQUE INDEX uq_modelos_sessao_id_empresa ON modelos_sessao(id, empresa_id)'),
      uqModelosSql,
    ),
    makeCheck(
      '0422.modelos_sessao_requisitos_table',
      Boolean(requisitosSql),
      requisitosSql,
    ),
    makeCheck(
      '0422.required_columns',
      [
        { name: 'uuid', type: 'TEXT', notnull: 1 },
        { name: 'empresa_id', type: 'INTEGER', notnull: 1 },
        { name: 'modelo_sessao_id', type: 'INTEGER', notnull: 1 },
        { name: 'requisito_modelo_sessao_id', type: 'INTEGER', notnull: 1 },
        { name: 'tipo_requisito', type: 'TEXT', notnull: 1, dflt_value: "'ETAPA_ANTERIOR'" },
        { name: 'obrigatorio', type: 'INTEGER', notnull: 1, dflt_value: '1' },
      ].every((expected) => hasColumn(requisitosColumns, expected)),
      requisitosColumns,
    ),
    makeCheck(
      '0422.foreign_keys',
      [
        { table: 'empresas', from: 'empresa_id', to: 'id' },
        { table: 'modelos_sessao', from: 'modelo_sessao_id', to: 'id' },
        { table: 'modelos_sessao', from: 'empresa_id', to: 'empresa_id' },
        { table: 'modelos_sessao', from: 'requisito_modelo_sessao_id', to: 'id' },
      ].every((expected) => hasForeignKey(requisitoFks, expected)),
      requisitoFks,
    ),
    makeCheck(
      '0422.indexes',
      [
        { name: 'idx_modelos_sessao_requisitos_empresa', unique: 0 },
        { name: 'idx_modelos_sessao_requisitos_modelo', unique: 0 },
        { name: 'idx_modelos_sessao_requisitos_requisito', unique: 0 },
        { name: 'idx_modelos_sessao_requisitos_ativo', unique: 1 },
      ].every((expected) => hasIndex(requisitoIndexes, expected)),
      requisitoIndexes,
    ),
  ];

  return {
    migration: '0422_modelos_sessao_requisitos.sql',
    sha256: APPROVED_LEDGER_RECONCILIATIONS[1].sha256,
    checks,
    result: classifyFromChecks(checks, [
      '0422.uq_modelos_empresa',
      '0422.modelos_sessao_requisitos_table',
    ]),
  };
}

async function inspect0423(executor) {
  const curricularesColumns = await getTableInfo(executor, 'simulador_atribuicoes_curriculares');
  const segmentoAtribuicoesColumns = await getTableInfo(executor, 'simulador_segmento_atribuicoes');
  const fichasColumns = await getTableInfo(executor, 'fichas_sessao');
  const curricularesIndexes = await getIndexList(executor, 'simulador_atribuicoes_curriculares');
  const fichasIndexes = await getIndexList(executor, 'fichas_sessao');
  const idxModeloSql = await getSqliteMasterSql(
    executor,
    'index',
    'idx_sim_atribuicoes_ativas_por_participante_modelo',
  );
  const idxOldSql = await getSqliteMasterSql(executor, 'index', 'idx_sim_atribuicoes_ativas_por_participante');
  const idxOldFichaSql = await getSqliteMasterSql(executor, 'index', 'idx_fichas_sessao_atribuicao_ativa');
  const idxSegmentoAtribAtivaSql = await getSqliteMasterSql(
    executor,
    'index',
    'idx_fichas_sessao_segmento_atribuicao_ativa',
  );
  const idxSegmentoAtribSql = await getSqliteMasterSql(
    executor,
    'index',
    'idx_fichas_sessao_segmento_atribuicao',
  );
  const triggerInsertSql = await getSqliteMasterSql(
    executor,
    'trigger',
    'trg_sim_atribuicoes_curriculares_tenant_guard_insert',
  );
  const triggerUpdateSql = await getSqliteMasterSql(
    executor,
    'trigger',
    'trg_sim_atribuicoes_curriculares_tenant_guard_update',
  );
  const fichaTriggerInsertSql = await getSqliteMasterSql(
    executor,
    'trigger',
    'trg_fichas_sessao_segmento_atribuicao_tenant_guard_insert',
  );
  const fichaTriggerUpdateSql = await getSqliteMasterSql(
    executor,
    'trigger',
    'trg_fichas_sessao_segmento_atribuicao_tenant_guard_update',
  );
  const duplicateCurriculares = await queryAll(
    executor,
    `SELECT agendamento_id, participante_id, COALESCE(modelo_sessao_id, -1) AS modelo_key, COUNT(*) AS total
     FROM simulador_atribuicoes_curriculares
     WHERE deleted_at IS NULL
     GROUP BY 1, 2, 3
     HAVING COUNT(*) > 1
     LIMIT 20;`,
  );
  const duplicateFichas = await queryAll(
    executor,
    `SELECT segmento_atribuicao_id, COUNT(*) AS total
     FROM fichas_sessao
     WHERE segmento_atribuicao_id IS NOT NULL AND deleted_at IS NULL
     GROUP BY 1
     HAVING COUNT(*) > 1
     LIMIT 20;`,
  );
  const fkCheck = await queryAll(executor, 'PRAGMA foreign_key_check;');

  const checks = [
    makeCheck(
      '0423.unique_index_modelo',
      normalizeSql(idxModeloSql) ===
        normalizeSql(
          `CREATE UNIQUE INDEX idx_sim_atribuicoes_ativas_por_participante_modelo
           ON simulador_atribuicoes_curriculares(
             agendamento_id,
             participante_id,
             COALESCE(modelo_sessao_id,-1)
           )
           WHERE deleted_at IS NULL`,
        ),
      idxModeloSql,
    ),
    makeCheck('0423.old_unique_index_removed', idxOldSql === null, idxOldSql),
    makeCheck(
      '0423.segmento_atribuicoes_gera_ficha',
      hasColumn(segmentoAtribuicoesColumns, { name: 'gera_ficha', type: 'INTEGER', notnull: 1, dflt_value: '1' }),
      segmentoAtribuicoesColumns.filter((row) => row.name === 'gera_ficha'),
    ),
    makeCheck(
      '0423.segmento_atribuicoes_id_empresa',
      hasIndex(curricularesIndexes, { name: 'uq_sim_atribuicoes_curriculares_id_empresa', unique: 1 }) &&
        Boolean(
          await getSqliteMasterSql(executor, 'index', 'uq_sim_segmento_atribuicoes_id_empresa'),
        ),
      {
        curricularesIndexes,
        segmentoIndexSql: await getSqliteMasterSql(executor, 'index', 'uq_sim_segmento_atribuicoes_id_empresa'),
      },
    ),
    makeCheck(
      '0423.fichas_segmento_atribuicao_column',
      hasColumn(fichasColumns, { name: 'segmento_atribuicao_id', type: 'INTEGER' }),
      fichasColumns.filter((row) => row.name === 'segmento_atribuicao_id'),
    ),
    makeCheck(
      '0423.fichas_segmento_indices',
      normalizeSql(idxSegmentoAtribSql) ===
        normalizeSql(
          'CREATE INDEX idx_fichas_sessao_segmento_atribuicao ON fichas_sessao(segmento_atribuicao_id)',
        ) &&
        normalizeSql(idxSegmentoAtribAtivaSql) ===
          normalizeSql(
            `CREATE UNIQUE INDEX idx_fichas_sessao_segmento_atribuicao_ativa
             ON fichas_sessao(segmento_atribuicao_id)
             WHERE segmento_atribuicao_id IS NOT NULL
               AND deleted_at IS NULL`,
          ) &&
        idxOldFichaSql === null,
      { idxSegmentoAtribSql, idxSegmentoAtribAtivaSql, idxOldFichaSql, fichasIndexes },
    ),
    makeCheck(
      '0423.tenant_triggers_curriculares',
      Boolean(triggerInsertSql) && Boolean(triggerUpdateSql),
      { triggerInsertSql, triggerUpdateSql },
    ),
    makeCheck(
      '0423.tenant_triggers_fichas',
      Boolean(fichaTriggerInsertSql) && Boolean(fichaTriggerUpdateSql),
      { fichaTriggerInsertSql, fichaTriggerUpdateSql },
    ),
    makeCheck('0423.duplicate_curriculares', duplicateCurriculares.length === 0, duplicateCurriculares, true),
    makeCheck('0423.duplicate_fichas', duplicateFichas.length === 0, duplicateFichas, true),
    makeCheck('0423.foreign_key_check', fkCheck.length === 0, fkCheck, true),
  ];

  return {
    migration: '0423_shared_session_multi_curricula_per_participant.sql',
    sha256: APPROVED_LEDGER_RECONCILIATIONS[2].sha256,
    checks,
    result: classifyFromChecks(
      checks,
      [
        '0423.unique_index_modelo',
        '0423.segmento_atribuicoes_gera_ficha',
        '0423.fichas_segmento_atribuicao_column',
        '0423.tenant_triggers_curriculares',
        '0423.tenant_triggers_fichas',
      ],
      ['0423.duplicate_curriculares', '0423.duplicate_fichas', '0423.foreign_key_check'],
    ),
  };
}

export async function inspectApprovedMigrations(executor) {
  return [
    await inspect0421(executor),
    await inspect0422(executor),
    await inspect0423(executor),
  ];
}

export async function discoverLedgerColumns(executor) {
  const columns = await getTableInfo(executor, 'd1_migrations');
  if (columns.length === 0) {
    throw new Error('Tabela d1_migrations ausente.');
  }
  const columnNames = columns.map((column) => String(column.name));
  if (!columnNames.includes('name')) {
    throw new Error(`Ledger inesperado: coluna "name" ausente (${columnNames.join(', ')}).`);
  }
  return { columns, columnNames };
}

export function buildLedgerInsertSql(columnNames, migrations) {
  const hasAppliedAt = columnNames.includes('applied_at');
  const statements = migrations.map((migration) => {
    if (hasAppliedAt) {
      return `INSERT INTO d1_migrations (name, applied_at)
SELECT '${migration.file}', CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM d1_migrations WHERE name = '${migration.file}'
);`;
    }
    return `INSERT INTO d1_migrations (name)
SELECT '${migration.file}'
WHERE NOT EXISTS (
  SELECT 1 FROM d1_migrations WHERE name = '${migration.file}'
);`;
  });
  return `${statements.join('\n')}\n`;
}

export function verifyApprovedMigrationFiles() {
  const report = APPROVED_LEDGER_RECONCILIATIONS.map((migration) => {
    const filePath = path.join(MIGRATIONS_DIR, migration.file);
    const actualSha = sha256File(filePath);
    return {
      ...migration,
      filePath,
      actualSha,
      matches: actualSha === migration.sha256,
    };
  });

  const mismatches = report.filter((item) => !item.matches);
  if (mismatches.length > 0) {
    throw new Error(
      `SHA-256 inesperado nas migrations aprovadas: ${mismatches
        .map((item) => `${item.file}=${item.actualSha}`)
        .join(', ')}`,
    );
  }
  return report;
}

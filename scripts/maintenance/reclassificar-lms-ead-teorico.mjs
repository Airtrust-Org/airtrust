#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const LEGACY_EAD_CATEGORIES = ['EAD', 'TREINAMENTO EAD'];
const CANONICAL_TEORICO_CATEGORIES = ['Treinamento Teórico', 'Treinamento Teorico'];

function usage() {
  return `
Uso:
  node scripts/maintenance/reclassificar-lms-ead-teorico.mjs --dry-run --db-file <sqlite.db> [--empresa-id 6]
  node scripts/maintenance/reclassificar-lms-ead-teorico.mjs --apply --db-file <sqlite.db> [--empresa-id 6]

Regras:
  - não altera tipo_conteudo
  - não altera publicado/ativo/progresso/matrículas
  - atualiza apenas categoria/formato/campos correlatos de reclassificação
`.trim();
}

function parseArgs(argv) {
  const args = {
    dryRun: false,
    apply: false,
    dbFile: '',
    empresaId: 6,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (arg === '--apply') {
      args.apply = true;
      continue;
    }
    if (arg === '--db-file') {
      args.dbFile = String(argv[index + 1] || '');
      index += 1;
      continue;
    }
    if (arg === '--empresa-id') {
      args.empresaId = Number(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    }
  }

  if (Number.isNaN(args.empresaId) || args.empresaId <= 0) {
    throw new Error('--empresa-id deve ser um número positivo.');
  }

  if (args.dryRun === args.apply) {
    throw new Error('Escolha exatamente um modo: --dry-run ou --apply.');
  }

  if (!args.dbFile) {
    throw new Error('Informe --db-file apontando para um arquivo SQLite local.');
  }

  return args;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function runSql(dbFile, sql) {
  return execFileSync('sqlite3', ['-json', dbFile, sql], { encoding: 'utf8' }).trim();
}

function queryRows(dbFile, sql) {
  const output = runSql(dbFile, sql);
  if (!output) return [];
  return JSON.parse(output);
}

function queryOne(dbFile, sql) {
  const rows = queryRows(dbFile, sql);
  return rows[0] ?? null;
}

function tableColumns(dbFile, tableName) {
  return queryRows(dbFile, `PRAGMA table_info(${tableName});`).map((row) => String(row.name));
}

function hasColumns(columns, required) {
  const set = new Set(columns);
  return required.every((column) => set.has(column));
}

function buildCategoryMatchExpr(columnSqlParts, allowedValues, options = { normalize: 'upper' }) {
  const innerExpr =
    columnSqlParts.length === 0
      ? "''"
      : columnSqlParts.length === 1
        ? columnSqlParts[0]
        : `COALESCE(${columnSqlParts.join(', ')})`;
  const normalizedExpr =
    options.normalize === 'trim'
      ? `TRIM(COALESCE(${innerExpr}, ''))`
      : `UPPER(TRIM(COALESCE(${innerExpr}, '')))`;
  return `${normalizedExpr} IN (${allowedValues.map(shellQuote).join(', ')})`;
}

function legacyCategoryExpr(columnSql) {
  return buildCategoryMatchExpr([columnSql], LEGACY_EAD_CATEGORIES, { normalize: 'upper' });
}

function canonicalTeoricoExpr(columnSql) {
  return buildCategoryMatchExpr([columnSql], CANONICAL_TEORICO_CATEGORIES, { normalize: 'trim' });
}

function countSql(dbFile, label, sql) {
  const row = queryOne(dbFile, sql);
  return { label, total: Number(row?.total ?? 0) };
}

function buildCounts(dbFile, empresaId) {
  const qualificacoesTiposColumns = tableColumns(dbFile, 'qualificacoes_tipos');
  const qualificacoesHistoricoColumns = tableColumns(dbFile, 'qualificacoes_historico');

  const historicoEffectiveCategoryParts = [
    qualificacoesHistoricoColumns.includes('categoria') ? 'qh.categoria' : null,
    qualificacoesTiposColumns.includes('categoria') ? 'qt.categoria' : null,
    qualificacoesHistoricoColumns.includes('qualificacao_codigo') ? 'qh.qualificacao_codigo' : null,
    qualificacoesTiposColumns.includes('codigo') ? 'qt.codigo' : null,
  ].filter(Boolean);

  const historicoExplicitCategoryParts = qualificacoesHistoricoColumns.includes('categoria')
    ? ['categoria']
    : [];

  return {
    qualificacoes_tipos_legacy_ead: countSql(
      dbFile,
      'qualificacoes_tipos_legacy_ead',
      `
        SELECT COUNT(*) AS total
          FROM qualificacoes_tipos
         WHERE empresa_id = ${empresaId}
           AND deleted_at IS NULL
           AND ${legacyCategoryExpr('categoria')}
      `,
    ).total,
    qualificacoes_tipos_teorico: countSql(
      dbFile,
      'qualificacoes_tipos_teorico',
      `
        SELECT COUNT(*) AS total
          FROM qualificacoes_tipos
         WHERE empresa_id = ${empresaId}
           AND deleted_at IS NULL
           AND ${canonicalTeoricoExpr('categoria')}
      `,
    ).total,
    lms_cursos_legacy_ead: countSql(
      dbFile,
      'lms_cursos_legacy_ead',
      `
        SELECT COUNT(*) AS total
          FROM lms_cursos
         WHERE empresa_id = ${empresaId}
           AND deleted_at IS NULL
           AND COALESCE(ativo, 1) = 1
           AND ${legacyCategoryExpr('categoria')}
      `,
    ).total,
    lms_cursos_legacy_ead_publicados: countSql(
      dbFile,
      'lms_cursos_legacy_ead_publicados',
      `
        SELECT COUNT(*) AS total
          FROM lms_cursos
         WHERE empresa_id = ${empresaId}
           AND deleted_at IS NULL
           AND COALESCE(ativo, 1) = 1
           AND COALESCE(publicado, 0) = 1
           AND ${legacyCategoryExpr('categoria')}
      `,
    ).total,
    lms_cursos_teorico: countSql(
      dbFile,
      'lms_cursos_teorico',
      `
        SELECT COUNT(*) AS total
          FROM lms_cursos
         WHERE empresa_id = ${empresaId}
           AND deleted_at IS NULL
           AND COALESCE(ativo, 1) = 1
           AND ${canonicalTeoricoExpr('categoria')}
      `,
    ).total,
    qualificacoes_historico_legacy_explicit: countSql(
      dbFile,
      'qualificacoes_historico_legacy_explicit',
      `
        SELECT COUNT(*) AS total
          FROM qualificacoes_historico
         WHERE empresa_id = ${empresaId}
           AND deleted_at IS NULL
           AND ${buildCategoryMatchExpr(historicoExplicitCategoryParts, LEGACY_EAD_CATEGORIES)}
      `,
    ).total,
    qualificacoes_historico_legacy_effective: countSql(
      dbFile,
      'qualificacoes_historico_legacy_effective',
      `
        SELECT COUNT(*) AS total
          FROM qualificacoes_historico qh
          LEFT JOIN qualificacoes_tipos qt
            ON qt.id = qh.qualificacao_id
           AND qt.deleted_at IS NULL
         WHERE qh.empresa_id = ${empresaId}
           AND qh.deleted_at IS NULL
           AND ${buildCategoryMatchExpr(historicoEffectiveCategoryParts, LEGACY_EAD_CATEGORIES)}
      `,
    ).total,
    qualificacoes_historico_teorico_effective: countSql(
      dbFile,
      'qualificacoes_historico_teorico_effective',
      `
        SELECT COUNT(*) AS total
          FROM qualificacoes_historico qh
          LEFT JOIN qualificacoes_tipos qt
            ON qt.id = qh.qualificacao_id
           AND qt.deleted_at IS NULL
         WHERE qh.empresa_id = ${empresaId}
           AND qh.deleted_at IS NULL
           AND ${buildCategoryMatchExpr(historicoEffectiveCategoryParts, CANONICAL_TEORICO_CATEGORIES, { normalize: 'trim' })}
      `,
    ).total,
  };
}

function buildSqlStatements({ empresaId, eadFormatId, teoricoCategoryId }) {
  return [
    'BEGIN;',
    `
      UPDATE qualificacoes_tipos
         SET categoria = 'Treinamento Teórico',
             formato_id = ${eadFormatId},
             updated_at = datetime('now')
       WHERE empresa_id = ${empresaId}
         AND deleted_at IS NULL
         AND ${legacyCategoryExpr('categoria')};
    `,
    `
      UPDATE lms_cursos
         SET categoria = 'Treinamento Teórico',
             formato_id = ${eadFormatId},
             updated_at = datetime('now')
       WHERE empresa_id = ${empresaId}
         AND deleted_at IS NULL
         AND COALESCE(ativo, 1) = 1
         AND ${legacyCategoryExpr('categoria')};
    `,
    `
      UPDATE qualificacoes_historico
         SET categoria = 'Treinamento Teórico',
             categoria_id = ${teoricoCategoryId},
             categoria_codigo = 'TERICO',
             formato_id = ${eadFormatId},
             formato_codigo = 'EAD',
             updated_at = datetime('now')
       WHERE empresa_id = ${empresaId}
         AND deleted_at IS NULL
         AND ${legacyCategoryExpr('categoria')};
    `,
    'COMMIT;',
  ].join('\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const dbFile = path.resolve(args.dbFile);

  if (!fs.existsSync(dbFile)) {
    throw new Error(`Banco SQLite não encontrado: ${dbFile}`);
  }

  execFileSync('sqlite3', ['-version'], { encoding: 'utf8' });

  const requiredColumns = {
    qualificacoes_tipos: ['categoria', 'formato_id', 'deleted_at', 'empresa_id'],
    lms_cursos: ['categoria', 'formato_id', 'deleted_at', 'empresa_id', 'ativo', 'publicado'],
    qualificacoes_historico: [
      'categoria',
      'categoria_id',
      'categoria_codigo',
      'formato_id',
      'formato_codigo',
      'deleted_at',
      'empresa_id',
    ],
    qualificacoes_categorias: ['codigo', 'deleted_at', 'empresa_id'],
    qualificacoes_formatos: ['codigo', 'deleted_at', 'empresa_id'],
  };

  for (const [table, columns] of Object.entries(requiredColumns)) {
    const tableInfo = tableColumns(dbFile, table);
    if (!hasColumns(tableInfo, columns)) {
      throw new Error(
        `Tabela ${table} não possui as colunas esperadas para a reclassificação: ${columns.join(', ')}`,
      );
    }
  }

  const teoricoCategory = queryOne(
    dbFile,
    `
      SELECT id, nome, codigo
        FROM qualificacoes_categorias
       WHERE empresa_id = ${args.empresaId}
         AND deleted_at IS NULL
         AND UPPER(TRIM(COALESCE(codigo, ''))) = 'TERICO'
       ORDER BY id ASC
       LIMIT 1;
    `,
  );

  if (!teoricoCategory?.id) {
    throw new Error(
      'Não encontrei a categoria canônica Treinamento Teórico (codigo TERICO) para esta empresa.',
    );
  }

  const eadFormat = queryOne(
    dbFile,
    `
      SELECT id, nome, codigo
        FROM qualificacoes_formatos
       WHERE empresa_id = ${args.empresaId}
         AND deleted_at IS NULL
         AND UPPER(TRIM(COALESCE(codigo, ''))) = 'EAD'
       ORDER BY id ASC
       LIMIT 1;
    `,
  );

  if (!eadFormat?.id) {
    throw new Error('Não encontrei o formato canônico EAD para esta empresa.');
  }

  const before = buildCounts(dbFile, args.empresaId);
  const plan = {
    empresa_id: args.empresaId,
    categoria_teorico_id: Number(teoricoCategory.id),
    formato_ead_id: Number(eadFormat.id),
    before,
    expected_updates: {
      qualificacoes_tipos: before.qualificacoes_tipos_legacy_ead,
      lms_cursos: before.lms_cursos_legacy_ead,
      qualificacoes_historico: before.qualificacoes_historico_legacy_explicit,
    },
  };

  if (args.dryRun) {
    console.log(
      JSON.stringify(
        {
          mode: 'dry-run',
          plan,
          sql: buildSqlStatements({
            empresaId: args.empresaId,
            eadFormatId: Number(eadFormat.id),
            teoricoCategoryId: Number(teoricoCategory.id),
          }),
        },
        null,
        2,
      ),
    );
    return;
  }

  const sql = buildSqlStatements({
    empresaId: args.empresaId,
    eadFormatId: Number(eadFormat.id),
    teoricoCategoryId: Number(teoricoCategory.id),
  });

  runSql(dbFile, sql);
  const after = buildCounts(dbFile, args.empresaId);

  console.log(
    JSON.stringify(
      {
        mode: 'apply',
        plan,
        after,
        residual_legacy_rows: {
          qualificacoes_tipos: after.qualificacoes_tipos_legacy_ead,
          lms_cursos: after.lms_cursos_legacy_ead,
          qualificacoes_historico_explicit: after.qualificacoes_historico_legacy_explicit,
        },
      },
      null,
      2,
    ),
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

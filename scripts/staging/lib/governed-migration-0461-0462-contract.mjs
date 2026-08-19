export const MIGRATION_0461 = '0461_refresh_tokens_empresa_id.sql';
export const MIGRATION_0462 = '0462_qualificacoes_tipos_codigo_tenant_active_unique.sql';

function normalizedSql(sql) {
  return String(sql || '').replace(/\s+/g, ' ').trim().toUpperCase();
}

function hasColumn(columns, name, type = null) {
  const column = columns.find((item) => String(item.name).toLowerCase() === name);
  if (!column) return false;
  return type === null || String(column.type || '').toUpperCase() === type;
}

function indexByName(indexes, name) {
  return indexes.find((item) => item.name === name) ?? null;
}

function isGlobalCodigoIndex(index) {
  const sql = normalizedSql(index?.sql);
  return /CREATE UNIQUE INDEX .* ON QUALIFICACOES_TIPOS\(CODIGO\).*WHERE DELETED_AT IS NULL/.test(sql);
}

function isTenantActiveCodigoIndex(index) {
  const sql = normalizedSql(index?.sql);
  return /CREATE UNIQUE INDEX .* ON QUALIFICACOES_TIPOS\(EMPRESA_ID, CODIGO COLLATE NOCASE\).*WHERE DELETED_AT IS NULL/.test(sql);
}

function result(state, reason) {
  return { state, reason };
}

const KNOWN_LEGACY_0462_COLUMNS = [
  ['id', 'INTEGER', 0], ['tipo', 'TEXT', 0], ['codigo', 'TEXT', 1], ['nome', 'TEXT', 1],
  ['descricao', 'TEXT', 0], ['categoria', 'TEXT', 0], ['carga_horaria', 'REAL', 0],
  ['carga_horaria_inicial', 'REAL', 0], ['carga_horaria_recorrente', 'REAL', 0],
  ['conteudo_programatico', 'TEXT', 0], ['validade', 'INTEGER', 0], ['vencimento_fim_mes', 'INTEGER', 0],
  ['observacoes', 'TEXT', 0], ['ativo', 'INTEGER', 0], ['is_check', 'INTEGER', 1],
  ['created_at', 'DATETIME', 0], ['updated_at', 'DATETIME', 0], ['deleted_at', 'DATETIME', 0],
  ['empresa_id', 'INTEGER', 1], ['formato_id', 'INTEGER', 0], ['categoria_id', 'INTEGER', 0],
  ['classe_requisito', 'TEXT', 0], ['dominio_codigo', 'TEXT', 0],
];

const KNOWN_LEGACY_0462_INDEXES = new Map([
  ['idx_qualificacoes_tipos_ativo', 'CREATE INDEX idx_qualificacoes_tipos_ativo ON qualificacoes_tipos(ativo) WHERE deleted_at IS NULL'],
  ['idx_qualificacoes_tipos_deleted_at', 'CREATE INDEX idx_qualificacoes_tipos_deleted_at ON qualificacoes_tipos(deleted_at)'],
  ['idx_qualificacoes_tipos_empresa', 'CREATE INDEX idx_qualificacoes_tipos_empresa ON qualificacoes_tipos(empresa_id)'],
  ['idx_qt_formato', 'CREATE INDEX idx_qt_formato ON qualificacoes_tipos(formato_id, empresa_id) WHERE deleted_at IS NULL'],
  ['idx_qt_categoria_id', 'CREATE INDEX idx_qt_categoria_id ON qualificacoes_tipos(categoria_id, empresa_id) WHERE deleted_at IS NULL'],
  ['idx_qualificacoes_tipos_dominio_codigo', 'CREATE INDEX idx_qualificacoes_tipos_dominio_codigo ON qualificacoes_tipos(dominio_codigo)'],
]);

function isKnownLegacyBaselinePre0462(columns, indexes) {
  if (columns.length !== KNOWN_LEGACY_0462_COLUMNS.length || indexes.length !== KNOWN_LEGACY_0462_INDEXES.size) return false;
  const columnsMatch = KNOWN_LEGACY_0462_COLUMNS.every(([name, type, notNull]) => {
    const column = columns.find((item) => String(item.name).toLowerCase() === name);
    return column && String(column.type || '').toUpperCase() === type && Number(column.notnull ?? column.not_null ?? 0) === notNull;
  });
  if (!columnsMatch) return false;
  return indexes.every((index) => normalizedSql(index.sql) === normalizedSql(KNOWN_LEGACY_0462_INDEXES.get(index.name)));
}

/**
 * Classifies the exact schema + ledger contract for 0461. Callers must treat
 * every state other than PENDING and ALREADY_APPLIED as a hard stop.
 */
export function evaluate0461({ tables, columns, indexes, ledgerNames }) {
  if (!tables.includes('refresh_tokens') || !Array.isArray(columns) || !Array.isArray(indexes)) {
    return result('NOT_VERIFIABLE', 'refresh_tokens metadata could not be read');
  }
  if (!hasColumn(columns, 'id') || !hasColumn(columns, 'user_id') || !hasColumn(columns, 'revoked_at')) {
    return result('UNEXPECTED_SCHEMA', 'refresh_tokens does not have the required legacy columns');
  }

  const registered = ledgerNames.includes(MIGRATION_0461);
  const empresaId = columns.find((item) => String(item.name).toLowerCase() === 'empresa_id');
  const targetIndex = indexByName(indexes, 'idx_refresh_tokens_empresa');

  if (!empresaId && !targetIndex) {
    return registered
      ? result('PARTIALLY_APPLIED', 'ledger records 0461 but empresa_id/index are absent')
      : result('PENDING', 'legacy refresh_tokens schema is intact and ready for 0461');
  }
  if (!empresaId || !targetIndex) {
    return result('PARTIALLY_APPLIED', 'empresa_id column and idx_refresh_tokens_empresa must appear together');
  }
  if (String(empresaId.type || '').toUpperCase() !== 'INTEGER' || Number(empresaId.notnull ?? empresaId.not_null ?? 0) !== 0) {
    return result('UNEXPECTED_SCHEMA', 'empresa_id must be nullable INTEGER exactly as 0461 defines');
  }
  if (!/ON REFRESH_TOKENS\(EMPRESA_ID\)/.test(normalizedSql(targetIndex.sql))) {
    return result('UNEXPECTED_SCHEMA', 'idx_refresh_tokens_empresa does not match the 0461 contract');
  }
  return registered
    ? result('ALREADY_APPLIED', 'schema and ledger both confirm 0461')
    : result('PARTIALLY_APPLIED', '0461 schema exists but ledger entry is absent');
}

/**
 * Classifies the exact schema + data + ledger contract for 0462. Duplicate
 * active tenant/code rows are never auto-repaired by this governance layer.
 */
export function evaluate0462({ tables, columns, indexes, ledgerNames, activeDuplicateCount }) {
  if (!tables.includes('qualificacoes_tipos') || !Array.isArray(columns) || !Array.isArray(indexes)) {
    return result('NOT_VERIFIABLE', 'qualificacoes_tipos metadata could not be read');
  }
  for (const name of ['id', 'empresa_id', 'codigo', 'deleted_at']) {
    if (!hasColumn(columns, name)) {
      return result('UNEXPECTED_SCHEMA', `qualificacoes_tipos is missing required column ${name}`);
    }
  }
  if (!hasColumn(columns, 'empresa_id', 'INTEGER') || !hasColumn(columns, 'codigo', 'TEXT')) {
    return result('UNEXPECTED_SCHEMA', 'qualificacoes_tipos has incompatible empresa_id/codigo types');
  }
  if (!Number.isInteger(activeDuplicateCount) || activeDuplicateCount < 0) {
    return result('NOT_VERIFIABLE', 'active duplicate count is unavailable');
  }
  if (activeDuplicateCount > 0) {
    return result('MIGRATION_DATA_PRECONDITION_FAILURE', 'active tenant/code duplicates require explicit reconciliation');
  }

  const registered = ledgerNames.includes(MIGRATION_0462);
  const oldIndex = indexByName(indexes, 'idx_qualificacoes_tipos_codigo');
  const newIndex = indexByName(indexes, 'idx_qualificacoes_tipos_codigo_empresa_active');
  const globalCodigoIndexes = indexes.filter(isGlobalCodigoIndex);
  const unexpectedGlobalUnique = globalCodigoIndexes.some(
    (index) => index.name !== 'idx_qualificacoes_tipos_codigo',
  );

  if (newIndex && !isTenantActiveCodigoIndex(newIndex)) {
    return result('UNEXPECTED_SCHEMA', 'tenant-active index name exists but its SQL is not the 0462 contract');
  }
  if (oldIndex && !isGlobalCodigoIndex(oldIndex)) {
    return result('UNEXPECTED_SCHEMA', 'legacy index name exists but its SQL is not the expected global contract');
  }
  if (!newIndex && oldIndex && !unexpectedGlobalUnique) {
    return registered
      ? result('PARTIALLY_APPLIED', 'ledger records 0462 but the legacy global index remains')
      : result('PENDING', 'legacy global index and clean data are ready for 0462');
  }
  if (newIndex && !oldIndex && globalCodigoIndexes.length === 0) {
    return registered
      ? result('ALREADY_APPLIED', 'tenant-active index and ledger both confirm 0462')
      : result('PARTIALLY_APPLIED', '0462 index exists but ledger entry is absent');
  }
  if (!newIndex && !oldIndex) {
    if (!registered && isKnownLegacyBaselinePre0462(columns, indexes)) {
      return result('PENDING', 'known schema-only staging baseline (20260701 + 0412/0454) is safe for 0462');
    }
    return registered
      ? result('PARTIALLY_APPLIED', 'ledger records 0462 but neither canonical index exists')
      : result('UNEXPECTED_SCHEMA', 'neither the legacy global nor tenant-active index exists');
  }
  return result('PARTIALLY_APPLIED', 'both or neither canonical index state was observed');
}

export function assertSequentialOrder(migration, ledgerNames, status0461) {
  if (migration !== MIGRATION_0462) return;
  if (!ledgerNames.includes(MIGRATION_0461) || status0461?.state !== 'ALREADY_APPLIED') {
    throw new Error('MIGRATION_ORDER_VIOLATION: 0462 requires ledger-confirmed 0461 first');
  }
}

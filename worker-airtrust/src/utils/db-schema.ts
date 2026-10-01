/**
 * DB SCHEMA UTILS - Cache de introspação de schema D1
 *
 * Problema auditado: probes de sqlite_master / PRAGMA table_info()
 * eram chamados em CADA request, adicionando queries desnecessárias.
 *
 * Solução: cache em memória por binding D1. Requisições que reutilizam o mesmo
 * binding evitam round-trips; bindings diferentes nunca compartilham metadados.
 */

// ===== CACHE DE MÓDULO =====
// Cada worker instance mantém cache por objeto de binding; reset explícito é usado em testes.
let _hasUsuariosEmpresas: boolean | null = null;
let _tableExistenceCacheByDb = new WeakMap<D1Database, Map<string, boolean>>();
let _schemaColumnsCacheByDb = new WeakMap<D1Database, Map<string, ReadonlySet<string>>>();

interface UsuariosSchema {
  hasActive: boolean;
  hasAtivo: boolean;
  /** Cláusula WHERE para filtrar usuários ativos, ex: "AND active = 1" */
  activeWhere: string;
}
let _usuariosSchema: UsuariosSchema | null = null;

// P0-AUTH-001 hardening: cache se refresh_tokens já possui a coluna empresa_id
// (migration 0461, ainda não aplicada em todos os ambientes). Enquanto a coluna
// não existir, o refresh cai no caminho legado documentado (sem pinning).
let _hasRefreshTokensEmpresaId: boolean | null = null;

const USUARIOS_EMPRESAS_SQL =
  "SELECT 1 as found FROM sqlite_master WHERE type = 'table' AND name = 'usuarios_empresas' LIMIT 1";

/**
 * Retorna se uma tabela existe no schema atual.
 * O nome é bindado como valor, nunca interpolado como identificador SQL.
 * Resultado cacheado após a primeira chamada para o lifetime da instância.
 */
function cacheForDb<T>(caches: WeakMap<D1Database, Map<string, T>>, db: D1Database): Map<string, T> {
  let cache = caches.get(db);
  if (!cache) {
    cache = new Map<string, T>();
    caches.set(db, cache);
  }
  return cache;
}

export async function hasSchemaTable(db: D1Database, tableName: string): Promise<boolean> {
  const normalizedTableName = String(tableName || '').trim().toLowerCase();
  if (!normalizedTableName) return false;
  const cache = cacheForDb(_tableExistenceCacheByDb, db);
  const cached = cache.get(normalizedTableName);
  if (cached !== undefined) return cached;
  const result = await db
    .prepare("SELECT 1 as found FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
    .bind(normalizedTableName)
    .first<{ found: number }>();
  const exists = Boolean(result?.found);
  cache.set(normalizedTableName, exists);
  return exists;
}

export async function getSchemaColumns(
  db: D1Database,
  tableName: string,
): Promise<ReadonlySet<string>> {
  const normalizedTableName = String(tableName || '').trim().toLowerCase();
  if (!normalizedTableName) return new Set<string>();
  const cache = cacheForDb(_schemaColumnsCacheByDb, db);
  const cached = cache.get(normalizedTableName);
  if (cached) return cached;
  const escaped = normalizedTableName.replaceAll("'", "''");
  const { results } = await db
    .prepare(`PRAGMA table_info('${escaped}')`)
    .all<{ name: string }>();
  const columns = new Set((results || []).map((row) => String(row.name || '')));
  cache.set(normalizedTableName, columns);
  return columns;
}

export async function hasSchemaColumn(
  db: D1Database,
  tableName: string,
  columnName: string,
): Promise<boolean> {
  if (!(await hasSchemaTable(db, tableName))) return false;
  return (await getSchemaColumns(db, tableName)).has(String(columnName || '').trim());
}

/**
 * Retorna se a tabela usuarios_empresas existe.
 * Resultado cacheado após primeira chamada.
 */
export async function hasUsuariosEmpresasTable(db: D1Database): Promise<boolean> {
  if (_hasUsuariosEmpresas !== null) return _hasUsuariosEmpresas;
  const result = await db.prepare(USUARIOS_EMPRESAS_SQL).first<{ found: number }>();
  _hasUsuariosEmpresas = Boolean(result?.found);
  return _hasUsuariosEmpresas;
}

/**
 * Retorna schema da tabela usuarios (quais colunas de status existem).
 * Resultado cacheado após primeira chamada.
 */
export async function getUsuariosSchema(db: D1Database): Promise<UsuariosSchema> {
  if (_usuariosSchema !== null) return _usuariosSchema;
  const columns =
    (await db.prepare("PRAGMA table_info('usuarios')").all<{ name: string }>()).results || [];
  const hasActive = columns.some((col) => col.name === 'active');
  const hasAtivo = columns.some((col) => col.name === 'ativo');
  const activeWhere = hasActive ? 'AND active = 1' : hasAtivo ? 'AND ativo = 1' : '';
  _usuariosSchema = { hasActive, hasAtivo, activeWhere };
  return _usuariosSchema;
}

/**
 * Retorna se refresh_tokens já possui a coluna empresa_id (migration 0461).
 * Resultado cacheado após primeira chamada.
 */
export async function hasRefreshTokensEmpresaIdColumn(db: D1Database): Promise<boolean> {
  if (_hasRefreshTokensEmpresaId !== null) return _hasRefreshTokensEmpresaId;
  const columns =
    (await db.prepare("PRAGMA table_info('refresh_tokens')").all<{ name: string }>()).results || [];
  _hasRefreshTokensEmpresaId = columns.some((col) => col.name === 'empresa_id');
  return _hasRefreshTokensEmpresaId;
}

let _hasRefreshTokensAccessTokenJti: boolean | null = null;

/**
 * Retorna se refresh_tokens já possui a coluna access_token_jti (migration 0289).
 * Resultado cacheado após primeira chamada.
 */
export async function hasRefreshTokensAccessTokenJtiColumn(db: D1Database): Promise<boolean> {
  if (_hasRefreshTokensAccessTokenJti !== null) return _hasRefreshTokensAccessTokenJti;
  const columns =
    (await db.prepare("PRAGMA table_info('refresh_tokens')").all<{ name: string }>()).results || [];
  _hasRefreshTokensAccessTokenJti = columns.some((col) => col.name === 'access_token_jti');
  return _hasRefreshTokensAccessTokenJti;
}

/**
 * Reseta o cache (útil em testes).
 */
export function resetSchemaCache(): void {
  _hasUsuariosEmpresas = null;
  _tableExistenceCacheByDb = new WeakMap<D1Database, Map<string, boolean>>();
  _schemaColumnsCacheByDb = new WeakMap<D1Database, Map<string, ReadonlySet<string>>>();
  _usuariosSchema = null;
  _hasRefreshTokensEmpresaId = null;
  _hasRefreshTokensAccessTokenJti = null;
}

/**
 * DB SCHEMA UTILS - Cache de introspação de schema D1
 *
 * Problema auditado: probes de sqlite_master / PRAGMA table_info()
 * eram chamados em CADA request, adicionando queries desnecessárias.
 *
 * Solução: cache em memória do worker (válido por lifetime do worker — até
 * próximo deploy). O schema não muda sem deploy, então o cache é safe.
 */

// ===== CACHE DE MÓDULO =====
// Cada worker instance mantém seu próprio cache; ao reiniciar/deploy, o cache é zerado.
let _hasUsuariosEmpresas: boolean | null = null;
const _tableExistenceCache = new Map<string, boolean>();

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
export async function hasSchemaTable(db: D1Database, tableName: string): Promise<boolean> {
  const normalizedTableName = String(tableName || '').trim().toLowerCase();
  if (!normalizedTableName) return false;

  const cached = _tableExistenceCache.get(normalizedTableName);
  if (cached !== undefined) return cached;

  const result = await db
    .prepare("SELECT 1 as found FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
    .bind(normalizedTableName)
    .first<{ found: number }>();
  const exists = Boolean(result?.found);
  _tableExistenceCache.set(normalizedTableName, exists);
  return exists;
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
  _tableExistenceCache.clear();
  _usuariosSchema = null;
  _hasRefreshTokensEmpresaId = null;
  _hasRefreshTokensAccessTokenJti = null;
}

/**
 * P01-03: trocar/redefinir a senha revogava os refresh tokens, mas os access
 * tokens (30 min) emitidos para outros dispositivos continuavam validos, porque
 * so o `jti` do token usado na troca era bloqueado. O desenho por `jti` de cada
 * sessao (refresh_tokens.access_token_jti) nao funciona em producao: a coluna
 * nao existe e nenhum codigo a preenchia.
 *
 * Solucao sem migration: um marcador "sessoes do usuario revogadas ate o
 * instante T" na propria `token_blocklist`, com a chave
 * `user-sessions:<userId>:<T em segundos>`. A verificacao que ja roda em toda
 * requisicao (middleware/auth.ts) rejeita qualquer access token do usuario com
 * `iat < T`. O marcador so precisa viver o TTL do access token (30 min) e o
 * cutoff vai codificado na chave, entao nao depende de colunas que variam entre
 * ambientes (created_at x revoked_at).
 */
export const USER_SESSIONS_REVOKED_PREFIX = 'user-sessions:';
const ACCESS_TOKEN_TTL_MINUTES = 30;
// Folga para tokens emitidos no limite do TTL e pequenos desvios de relogio.
const MARKER_TTL_MINUTES = ACCESS_TOKEN_TTL_MINUTES + 5;

export function userSessionsRevocationLikePattern(userId: number | string): string {
  return `${USER_SESSIONS_REVOKED_PREFIX}${Number(userId)}:%`;
}

/** Posicao (1-based, para substr do SQLite) onde comeca o cutoff na chave do marcador. */
export function userSessionsRevocationCutoffStart(userId: number | string): number {
  return `${USER_SESSIONS_REVOKED_PREFIX}${Number(userId)}:`.length + 1;
}

export async function revokeAllUserAccessTokens(
  db: D1Database,
  userId: number,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<void> {
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new Error('INVALID_USER_ID_FOR_SESSION_REVOCATION');
  }
  await db
    .prepare(
      `INSERT OR IGNORE INTO token_blocklist (jti, expires_at)
       VALUES (?, datetime('now', '+${MARKER_TTL_MINUTES} minutes'))`,
    )
    .bind(`${USER_SESSIONS_REVOKED_PREFIX}${userId}:${nowSeconds}`)
    .run();
}

/**
 * True quando o access token esta revogado: pelo proprio `jti` (logout) ou pelo
 * marcador do usuario (iat < T). Sem `iat` valido e com marcador vigente, o token
 * e tratado como revogado (falha fechado). Erros de leitura sao propagados: o
 * chamador (auth()) os converte em 503, nunca em "nao revogado".
 */
export async function isAccessTokenRevoked(
  db: D1Database,
  token: { jti: string; sub?: string | number; iat?: number },
): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT 1 FROM token_blocklist
       WHERE expires_at > datetime('now')
         AND (jti = ? OR (jti LIKE ? AND CAST(substr(jti, ?) AS INTEGER) > ?))
       LIMIT 1`,
    )
    .bind(
      token.jti,
      userSessionsRevocationLikePattern(token.sub ?? 0),
      userSessionsRevocationCutoffStart(token.sub ?? 0),
      Number.isFinite(token.iat) ? Number(token.iat) : 0,
    )
    .first();
  return Boolean(row);
}

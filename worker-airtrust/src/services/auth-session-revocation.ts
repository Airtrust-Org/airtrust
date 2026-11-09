/**
 * P01-03: trocar/redefinir a senha revogava os refresh tokens, mas os access
 * tokens emitidos para outros dispositivos continuavam validos, porque so o
 * `jti` do token usado na troca era bloqueado. O desenho por `jti` de cada
 * sessao (refresh_tokens.access_token_jti) nao funciona em producao: a coluna
 * nao existe e nenhum codigo a preenchia.
 *
 * Solucao sem migration: UM marcador por usuario na propria `token_blocklist`,
 * com a chave exata `user-sessions:<userId>`. O instante de corte T nao precisa
 * de coluna propria: e `expires_at - MARKER_TTL_SECONDS` (TTL fixo). A
 * verificacao que ja roda em toda requisicao (middleware/auth.ts) rejeita
 * qualquer access token do usuario com `iat < T`. A consulta usa so igualdade
 * em `jti` (indice/PK), sem `LIKE`, entao nao varre a tabela. Nao depende de
 * colunas que variam entre ambientes (created_at x revoked_at).
 */
export const USER_SESSIONS_REVOKED_PREFIX = 'user-sessions:';
// Maior vida de um access token emitido hoje: personificacao admin (3600 s) em
// routes/auth.ts. O marcador precisa viver pelo menos isso, mais folga para
// desvio de relogio; do contrario um token antigo "reviveria" apos o marcador
// expirar.
const MAX_ACCESS_TOKEN_TTL_SECONDS = 3600;
const MARKER_TTL_SECONDS = MAX_ACCESS_TOKEN_TTL_SECONDS + 300;

export function userSessionsRevocationKey(userId: number | string): string {
  return `${USER_SESSIONS_REVOKED_PREFIX}${Number(userId)}`;
}

export async function revokeAllUserAccessTokens(
  db: D1Database,
  userId: number,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<void> {
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new Error('INVALID_USER_ID_FOR_SESSION_REVOCATION');
  }
  // REPLACE: uma nova troca de senha move o corte T para frente (nunca ha mais
  // de um marcador por usuario).
  await db
    .prepare(
      `INSERT OR REPLACE INTO token_blocklist (jti, expires_at)
       VALUES (?, datetime(?, 'unixepoch'))`,
    )
    .bind(userSessionsRevocationKey(userId), nowSeconds + MARKER_TTL_SECONDS)
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
         AND (jti = ?
              OR (jti = ? AND CAST(strftime('%s', expires_at) AS INTEGER) - ? > ?))
       LIMIT 1`,
    )
    .bind(
      token.jti,
      userSessionsRevocationKey(token.sub ?? 0),
      MARKER_TTL_SECONDS,
      Number.isFinite(token.iat) ? Number(token.iat) : 0,
    )
    .first();
  return Boolean(row);
}

/**
 * P01-02: refresh tokens deixam de ser gravados em texto claro.
 *
 * `refresh_tokens.token` passa a guardar `sha256:<hex>` do valor entregue ao
 * cliente. Quem lê o D1 (backup, operador, SQL de suporte) deixa de obter
 * sessões utilizáveis por até 7 dias. Sem migration: a coluna continua TEXT
 * UNIQUE e o índice existente serve às buscas por igualdade.
 *
 * Compatibilidade: linhas emitidas antes desta mudança guardam o valor cru (64
 * hex). Elas só são aceitas pelo formato exato de um token cru (`/^[0-9a-f]{64}$/`).
 * Um valor com prefixo `sha256:` nunca é tratado como cru, então apresentar o
 * conteúdo lido do D1 não autentica ninguém. O fallback some sozinho quando os
 * últimos tokens crus expiram (TTL de 7 dias); depois disso `legacyKey` pode ser
 * removido.
 */
export const REFRESH_TOKEN_HASH_PREFIX = 'sha256:';

const LEGACY_RAW_REFRESH_TOKEN = /^[0-9a-f]{64}$/;

export async function hashRefreshToken(rawToken: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawToken));
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
  return `${REFRESH_TOKEN_HASH_PREFIX}${hex}`;
}

export interface RefreshTokenKeys {
  /** Valor gravado hoje em `refresh_tokens.token`. */
  hashed: string;
  /** Valor cru, apenas se tiver o formato de um token legado; senão `null`. */
  legacyKey: string | null;
}

export async function refreshTokenKeys(rawToken: string): Promise<RefreshTokenKeys> {
  return {
    hashed: await hashRefreshToken(rawToken),
    legacyKey: LEGACY_RAW_REFRESH_TOKEN.test(rawToken) ? rawToken : null,
  };
}

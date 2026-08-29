/**
 * AUTH REFRESH TOKEN SERVICE
 *
 * Extracted from routes/auth.ts (2026-08-17) to keep the route file under the
 * architecture-governance line/prepare-count guards. Pure code-motion — no
 * SQL, error code, or behavior changes. Concentrates the refresh-token
 * lifecycle (cleanup, per-user limit enforcement, persistence, tenant-
 * membership verification, and CAS-based rotation + tenant pinning) used by
 * POST /api/auth/refresh and POST /api/auth/logout.
 */
import { unauthorized } from '../middleware/error-handler';
import { hasRefreshTokensEmpresaIdColumn, hasUsuariosEmpresasTable } from '../utils/db-schema';

const MAX_ACTIVE_REFRESH_TOKENS_PER_USER = 8;

export async function cleanupExpiredRefreshTokens(db: D1Database): Promise<void> {
  await db
    .prepare(
      `DELETE FROM refresh_tokens
       WHERE expires_at <= datetime('now')`,
    )
    .run()
    .catch(() => null);
}

export async function enforceRefreshTokenLimit(db: D1Database, userId: number): Promise<void> {
  const activeTokens = await db
    .prepare(
      `SELECT id
       FROM refresh_tokens
       WHERE user_id = ?
         AND revoked_at IS NULL
         AND expires_at > datetime('now')
       ORDER BY datetime(created_at) DESC, id DESC`,
    )
    .bind(userId)
    .all<{ id: number }>()
    .catch(() => ({ results: [] as Array<{ id: number }> }));

  const staleTokens = (activeTokens.results || []).slice(MAX_ACTIVE_REFRESH_TOKENS_PER_USER);

  for (const token of staleTokens) {
    await db
      .prepare(
        `UPDATE refresh_tokens
         SET revoked_at = COALESCE(revoked_at, datetime('now'))
         WHERE id = ?`,
      )
      .bind(token.id)
      .run()
      .catch(() => null);
  }
}

export async function persistRefreshToken(
  db: D1Database,
  payload: {
    userId: number;
    refreshToken: string;
    expiresAt: string;
    accessTokenJti: string;
    // P0-AUTH-001: empresa vinculada ao token no momento da emissão. Pinada na
    // linha do refresh_token (quando a coluna existe — migration 0461) para que
    // futuras rotações NUNCA re-derivem o tenant a partir do estado atual do
    // usuário (ex.: is_primary alterado por outra sessão/select-empresa).
    empresaId?: number;
  },
): Promise<void> {
  const hasEmpresaIdCol = await hasRefreshTokensEmpresaIdColumn(db);

  if (hasEmpresaIdCol && typeof payload.empresaId === 'number') {
    await db
      .prepare(
        'INSERT INTO refresh_tokens (user_id, token, expires_at, empresa_id) VALUES (?, ?, ?, ?)',
      )
      .bind(payload.userId, payload.refreshToken, payload.expiresAt, payload.empresaId)
      .run()
      .catch(() =>
        db
          .prepare('INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)')
          .bind(payload.userId, payload.refreshToken, payload.expiresAt)
          .run(),
      );
  } else {
    // Caminho legado (coluna empresa_id ainda não migrada): documentado como
    // limitação em CLAUDE.md — "se migration não autorizada, implementar com
    // schema existente". O refresh cai de volta em resolveUserEmpresaId().
    await db
      .prepare('INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)')
      .bind(payload.userId, payload.refreshToken, payload.expiresAt)
      .run();
  }

  await enforceRefreshTokenLimit(db, payload.userId);
}

/**
 * P0-AUTH-001: confirma que o usuário ainda possui vínculo ativo com a empresa
 * pinada no refresh token. Se o acesso foi revogado após a emissão do token, o
 * refresh deve falhar de forma limpa em vez de silenciosamente trocar de tenant.
 */
export async function verifyUserEmpresaMembership(
  db: D1Database,
  userId: number,
  empresaId: number,
): Promise<boolean> {
  if (!(await hasUsuariosEmpresasTable(db))) {
    // Schema legado sem tabela de vínculos — não há como validar; assume ok.
    return true;
  }

  const row = await db
    .prepare(
      `
        SELECT 1 AS found
        FROM usuarios_empresas ue
        INNER JOIN empresas e ON e.id = ue.empresa_id
        WHERE ue.usuario_id = ?
          AND ue.empresa_id = ?
          AND e.deleted_at IS NULL
          AND e.ativo = 1
        LIMIT 1
      `,
    )
    .bind(userId, empresaId)
    .first<{ found: number }>();

  return Boolean(row?.found);
}

/**
 * Resolves the refresh token record, validates it (revoked/expired/legacy
 * without tenant/tenant-membership-revoked), and atomically rotates it via
 * CAS (compare-and-swap) to prevent replay. Returns the userId and pinned
 * empresaId (null when the empresa_id column doesn't exist yet — legacy path
 * where the caller must fall back to resolveUserEmpresaId()).
 *
 * Throws the same typed unauthorized(...) errors previously thrown inline in
 * POST /api/auth/refresh: INVALID_REFRESH_TOKEN, REFRESH_TOKEN_REVOKED,
 * REFRESH_TOKEN_EXPIRED, LEGACY_TOKEN_REQUIRES_REAUTH, TENANT_ACCESS_REVOKED,
 * REFRESH_TOKEN_REPLAYED.
 */
export async function resolveAndRotateRefreshToken(
  db: D1Database,
  refreshToken: string,
): Promise<{ userId: number; empresaId: number | null }> {
  const hasEmpresaIdCol = await hasRefreshTokensEmpresaIdColumn(db);

  type RefreshTokenRecord = {
    user_id: number;
    revoked_at: string | null;
    expires_at: string;
    empresa_id: number | null;
  } | null;
  const refreshTokenRecord = await db
    .prepare(
      hasEmpresaIdCol
        ? `
        SELECT rt.user_id, rt.revoked_at, rt.expires_at, rt.empresa_id
        FROM refresh_tokens rt
        WHERE rt.token = ?
        LIMIT 1
      `
        : `
        SELECT rt.user_id, rt.revoked_at, rt.expires_at
        FROM refresh_tokens rt
        WHERE rt.token = ?
        LIMIT 1
      `,
    )
    .bind(refreshToken)
    .first<RefreshTokenRecord>();

  if (!refreshTokenRecord) {
    throw unauthorized('Refresh token inválido', 'INVALID_REFRESH_TOKEN');
  }

  if (refreshTokenRecord.revoked_at) {
    throw unauthorized('Refresh token revogado', 'REFRESH_TOKEN_REVOKED');
  }

  const expiredRow = await db
    .prepare(`SELECT CASE WHEN datetime(?) <= datetime('now') THEN 1 ELSE 0 END AS expired`)
    .bind(refreshTokenRecord.expires_at)
    .first<{ expired: number }>();

  if (expiredRow?.expired) {
    throw unauthorized('Refresh token expirado', 'REFRESH_TOKEN_EXPIRED');
  }

  // P0-AUTH-001: resolução do tenant do refresh.
  // Se a coluna empresa_id existe (migration 0461):
  //  - token sem empresa_id (emitido antes da migration) é legado — não há
  //    como provar retroativamente o tenant original, então força re-login
  //    em vez de silenciosamente herdar o tenant atual do usuário.
  //  - token com empresa_id pinada é validado contra o vínculo ATIVO do
  //    usuário com aquela empresa (acesso pode ter sido revogado depois).
  // Se a coluna ainda não existe em produção, cai no caminho legado
  // documentado (resolveUserEmpresaId por estado atual) — limitação
  // conhecida até a migration 0461 ser aplicada.
  let pinnedEmpresaId: number | null = null;
  if (hasEmpresaIdCol) {
    if (refreshTokenRecord.empresa_id === null || refreshTokenRecord.empresa_id === undefined) {
      await db
        .prepare('UPDATE refresh_tokens SET revoked_at = datetime("now") WHERE token = ?')
        .bind(refreshToken)
        .run()
        .catch(() => null);
      throw unauthorized(
        'Sessão legada sem tenant vinculado. Faça login novamente.',
        'LEGACY_TOKEN_REQUIRES_REAUTH',
      );
    }

    pinnedEmpresaId = refreshTokenRecord.empresa_id;
    const stillMember = await verifyUserEmpresaMembership(
      db,
      refreshTokenRecord.user_id,
      pinnedEmpresaId,
    );
    if (!stillMember) {
      await db
        .prepare('UPDATE refresh_tokens SET revoked_at = datetime("now") WHERE token = ?')
        .bind(refreshToken)
        .run()
        .catch(() => null);
      throw unauthorized('Acesso à empresa desta sessão foi revogado.', 'TENANT_ACCESS_REVOKED');
    }
  }

  // P1-AUTH-002: rotação via CAS — só marca revoked_at se o token ainda
  // estava válido (revoked_at IS NULL e não expirado) no momento exato do
  // UPDATE. Se duas requisições de refresh concorrentes usam o mesmo
  // token, apenas uma altera a linha (meta.changes === 1); a outra recebe
  // meta.changes === 0 e é rejeitada como replay, em vez de ambas
  // rotacionarem com sucesso (double-spend).
  const casResult = await db
    .prepare(
      `UPDATE refresh_tokens
         SET revoked_at = datetime('now')
       WHERE token = ?
         AND revoked_at IS NULL
         AND expires_at > datetime('now')`,
    )
    .bind(refreshToken)
    .run();

  if (Number(casResult.meta?.changes ?? 0) !== 1) {
    throw unauthorized(
      'Refresh token já utilizado ou inválido (possível replay).',
      'REFRESH_TOKEN_REPLAYED',
    );
  }

  return { userId: refreshTokenRecord.user_id, empresaId: pinnedEmpresaId };
}

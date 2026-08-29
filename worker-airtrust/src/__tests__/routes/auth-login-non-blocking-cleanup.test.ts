import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';
import { errorHandler } from '../../middleware/error-handler';
import { resetSchemaCache } from '../../utils/db-schema';

let tokenCounter = 0;

vi.mock('../../middleware/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../middleware/rate-limit')>();
  return {
    ...actual,
    rateLimiter: () => async (_c: unknown, next: () => Promise<void>) => {
      await next();
    },
  };
});

vi.mock('../../lib/rbac/platform-access', () => ({
  resolvePlatformAccessState: vi.fn(async () => ({
    hasPersistedPlatformAdmin: false,
    isLegacyPlatformAdmin: false,
    hasSupportReadOnlyRole: false,
    hasSupportElevatedRole: false,
    supportGrants: [],
    source: 'none',
  })),
  isPlatformAdminAccess: vi.fn(() => false),
}));

vi.mock('../../utils/security', () => ({
  generateJWT: vi.fn(
    async (payload: Record<string, unknown>, _secret: string, expiresIn = 1800) => {
      tokenCounter += 1;
      const jti = `jti-${tokenCounter}`;
      return {
        token: `access|${String(payload.sub)}|${String(payload.empresa_id)}|${jti}|${expiresIn}`,
        jti,
      };
    },
  ),
  verifyJWT: vi.fn(async (token: string) => {
    if (token.startsWith('access|')) {
      const [, sub, empresa_id, jti] = token.split('|');
      return { sub, empresa_id, jti };
    }
    return null;
  }),
  verifyPassword: vi.fn(async (plain: string, hashed: string) => hashed === `hash:${plain}`),
  hashPassword: vi.fn(async (plain: string) => `hash:${plain}`),
  generateRefreshToken: vi.fn(() => {
    tokenCounter += 1;
    return `refresh-${tokenCounter}`;
  }),
  getRefreshTokenExpiry: vi.fn((days: number) => {
    const date = new Date('2026-08-29T12:00:00.000Z');
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString();
  }),
  extractBearerToken: vi.fn((header?: string) =>
    header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null,
  ),
}));

import { authRoutes } from '../../routes/auth';

type MockUser = {
  id: number;
  email: string;
  nome: string;
  perfil: string;
  password_hash: string;
  funcionario_id: number | null;
  active: number;
  deleted_at: string | null;
};

type MockLink = {
  usuario_id: number;
  empresa_id: number;
  role: string;
  is_primary: number;
};

type MockRefreshToken = {
  id: number;
  user_id: number;
  token: string;
  expires_at: string;
  revoked_at: string | null;
  access_token_jti: string | null;
  empresa_id: number | null;
  created_at: string;
};

function createTestApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.onError(errorHandler);
  app.route('/api/auth', authRoutes);
  return app;
}

const NOW = '2026-08-29T12:00:00.000Z';
const PAST = '2026-08-01T12:00:00.000Z';
const FUTURE = '2026-11-27T12:00:00.000Z';

describe('POST /api/auth/login — Non-blocking Refresh Token Lifecycle', () => {
  let executedSqls: string[] = [];
  let users: MockUser[] = [];
  let links: MockLink[] = [];
  let refreshTokens: MockRefreshToken[] = [];
  let blocklistedJtis: string[] = [];
  let nextRefreshId = 100;
  const empresasAtivas = new Set([6]);

  beforeEach(() => {
    resetSchemaCache();
    tokenCounter = 0;
    executedSqls = [];
    blocklistedJtis = [];
    nextRefreshId = 100;

    users = [
      {
        id: 1,
        email: 'pilot@airtrust.com',
        nome: 'Pilot User',
        perfil: 'piloto',
        password_hash: 'hash:CorrectPassword123!',
        funcionario_id: 10,
        active: 1,
        deleted_at: null,
      },
      {
        id: 2,
        email: 'orphan@airtrust.com',
        nome: 'Orphan User',
        perfil: 'piloto',
        password_hash: 'hash:CorrectPassword123!',
        funcionario_id: null,
        active: 1,
        deleted_at: null,
      },
    ];

    links = [
      {
        usuario_id: 1,
        empresa_id: 6,
        role: 'piloto',
        is_primary: 1,
      },
    ];

    refreshTokens = [
      {
        id: 1,
        user_id: 1,
        token: 'expired-token-123',
        expires_at: PAST,
        revoked_at: null,
        access_token_jti: null,
        empresa_id: 6,
        created_at: PAST,
      },
      {
        id: 2,
        user_id: 1,
        token: 'valid-token-456',
        expires_at: FUTURE,
        revoked_at: null,
        access_token_jti: null,
        empresa_id: 6,
        created_at: NOW,
      },
    ];
  });

  function createMockDb(): D1Database {
    return {
      prepare(sql: string) {
        executedSqls.push(sql);
        const statement = {
          params: [] as unknown[],
          bind(...args: unknown[]) {
            statement.params = args;
            return statement;
          },
          async first<T>() {
            if (
              sql.includes(
                "FROM sqlite_master WHERE type = 'table' AND name = 'usuarios_empresas'",
              ) ||
              sql.includes("FROM sqlite_master WHERE type='table' AND name='usuarios_empresas'")
            ) {
              return { found: 1 } as T;
            }

            if (sql.includes('SELECT rt.user_id, rt.revoked_at, rt.expires_at, rt.empresa_id')) {
              const token = String(statement.params[0] || '');
              const row = refreshTokens.find((item) => item.token === token) || null;
              return (
                row
                  ? {
                      user_id: row.user_id,
                      revoked_at: row.revoked_at,
                      expires_at: row.expires_at,
                      empresa_id: row.empresa_id,
                    }
                  : null
              ) as T;
            }

            if (sql.includes('CASE WHEN datetime(?) <= datetime')) {
              const value = String(statement.params[0] || '');
              return { expired: value <= NOW ? 1 : 0 } as T;
            }

            if (
              sql.includes('SELECT 1 AS found') &&
              sql.includes('FROM usuarios_empresas ue') &&
              sql.includes('ue.empresa_id = ?')
            ) {
              const userId = Number(statement.params[0]);
              const empresaId = Number(statement.params[1]);
              const found =
                links.some((l) => l.usuario_id === userId && l.empresa_id === empresaId) &&
                empresasAtivas.has(empresaId);
              return (found ? { found: 1 } : null) as T;
            }

            if (sql.includes('SELECT ue.empresa_id') && sql.includes('FROM usuarios_empresas ue')) {
              const userId = Number(statement.params[0]);
              const primaryLink = [...links]
                .filter((item) => item.usuario_id === userId && empresasAtivas.has(item.empresa_id))
                .sort((a, b) => b.is_primary - a.is_primary || a.empresa_id - b.empresa_id)[0];
              return (primaryLink ? { empresa_id: primaryLink.empresa_id } : null) as T;
            }

            if (sql.includes('SELECT ue.role') && sql.includes('FROM usuarios_empresas ue')) {
              const userId = Number(statement.params[0]);
              const empresaId = Number(statement.params[1]);
              const link = links.find(
                (item) => item.usuario_id === userId && item.empresa_id === empresaId,
              );
              return (link ? { role: link.role } : null) as T;
            }

            if (
              sql.includes('SELECT id, email, nome, perfil, password_hash') &&
              sql.includes('FROM usuarios')
            ) {
              const email = String(statement.params[0] || '').toLowerCase();
              const found = users.find(
                (item) => item.email === email && item.deleted_at === null && item.active === 1,
              );
              return (found || null) as T;
            }

            if (sql.includes('SELECT funcionario_id FROM usuarios WHERE id = ?')) {
              const userId = Number(statement.params[0]);
              const found = users.find((u) => u.id === userId);
              return (found ? { funcionario_id: found.funcionario_id } : null) as T;
            }

            if (
              sql.includes('SELECT rt.user_id, u.email, u.perfil, u.nome, u.funcionario_id') &&
              sql.includes('FROM refresh_tokens rt')
            ) {
              const token = String(statement.params[0] || '');
              const refreshToken = refreshTokens.find((item) => item.token === token) || null;
              if (!refreshToken) return null as T;
              const user =
                users.find(
                  (item) =>
                    item.id === refreshToken.user_id &&
                    item.deleted_at === null &&
                    item.active === 1,
                ) || null;
              return (
                user
                  ? {
                      user_id: user.id,
                      email: user.email,
                      perfil: user.perfil,
                      nome: user.nome,
                      funcionario_id: user.funcionario_id,
                    }
                  : null
              ) as T;
            }

            if (sql.includes('SELECT access_token_jti FROM refresh_tokens WHERE token = ?')) {
              const token = String(statement.params[0]);
              const found = refreshTokens.find((r) => r.token === token);
              return (found ? { access_token_jti: found.access_token_jti } : null) as T;
            }

            return null as T;
          },
          async all<T>() {
            if (sql.includes("PRAGMA table_info('usuarios')")) {
              return { results: [{ name: 'id' }, { name: 'email' }, { name: 'active' }] } as T;
            }

            if (sql.includes("PRAGMA table_info('refresh_tokens')")) {
              return { results: [{ name: 'id' }, { name: 'empresa_id' }] } as T;
            }

            if (sql.includes('SELECT permissao, tipo FROM usuario_permissoes')) {
              return { results: [] } as T;
            }

            if (sql.includes('SELECT id') && sql.includes('FROM refresh_tokens')) {
              const userId = Number(statement.params[0]);
              return {
                results: refreshTokens
                  .filter(
                    (item) =>
                      item.user_id === userId && item.revoked_at === null && item.expires_at > NOW,
                  )
                  .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id)
                  .map((item) => ({ id: item.id })),
              } as T;
            }

            return { results: [] } as T;
          },
          async run() {
            if (sql.includes('DELETE FROM refresh_tokens')) {
              const remaining = refreshTokens.filter((item) => item.expires_at > NOW);
              refreshTokens.splice(0, refreshTokens.length, ...remaining);
              return { meta: { changes: 1 } };
            }

            if (sql.includes('INSERT INTO refresh_tokens') && sql.includes('empresa_id')) {
              const userIdRaw = statement.params[0];
              const tokenRaw = statement.params[1];
              const expiresAtRaw = statement.params[2];
              const empresaIdRaw = statement.params[3];
              refreshTokens.push({
                id: nextRefreshId++,
                user_id: Number(userIdRaw),
                token: String(tokenRaw),
                expires_at: String(expiresAtRaw),
                revoked_at: null,
                access_token_jti: null,
                empresa_id: typeof empresaIdRaw === 'number' ? empresaIdRaw : null,
                created_at: NOW,
              });
              return { meta: { changes: 1 } };
            }

            if (
              sql.includes('UPDATE refresh_tokens SET revoked_at = datetime("now") WHERE token = ?')
            ) {
              const token = String(statement.params[0]);
              const found = refreshTokens.find((r) => r.token === token);
              if (found) found.revoked_at = NOW;
              return { meta: { changes: 1 } };
            }

            if (
              sql.includes('UPDATE refresh_tokens') &&
              sql.includes('WHERE token = ?') &&
              sql.includes('revoked_at IS NULL')
            ) {
              const token = String(statement.params[0]);
              const found = refreshTokens.find((r) => r.token === token);
              if (found && found.revoked_at === null && found.expires_at > NOW) {
                found.revoked_at = NOW;
                return { meta: { changes: 1 } };
              }
              return { meta: { changes: 0 } };
            }

            if (sql.includes('INSERT OR IGNORE INTO token_blocklist')) {
              blocklistedJtis.push(String(statement.params[0]));
              return { meta: { changes: 1 } };
            }

            return { meta: { changes: 0 } };
          },
        };
        return statement as unknown as D1PreparedStatement;
      },
    } as unknown as D1Database;
  }

  function createEnv(db: D1Database): Env {
    return {
      DB: db,
      JWT_SECRET: 'test-jwt-secret-min-32-chars-long-security',
      ENVIRONMENT: 'production',
    } as unknown as Env;
  }

  it('1. POST /api/auth/login does NOT execute DELETE FROM refresh_tokens in the critical path', async () => {
    const app = createTestApp();
    const db = createMockDb();
    const env = createEnv(db);

    const res = await app.request(
      'http://localhost/api/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'pilot@airtrust.com',
          senha: 'CorrectPassword123!',
        }),
      },
      env,
    );

    const body = (await res.json()) as {
      success?: boolean;
      error?: string;
      code?: string;
      data?: { accessToken: string; refreshToken: string };
    };
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data?.accessToken).toBeDefined();
    expect(body.data?.refreshToken).toBeDefined();

    // Verify zero global DELETE queries were executed during login
    const deleteQueries = executedSqls.filter((s) => s.includes('DELETE FROM refresh_tokens'));
    expect(deleteQueries.length).toBe(0);
  });

  it('2. POST /api/auth/refresh rejects expired refresh tokens (REFRESH_TOKEN_EXPIRED) without relying on global DELETE', async () => {
    const app = createTestApp();
    const db = createMockDb();
    const env = createEnv(db);

    const res = await app.request(
      'http://localhost/api/auth/refresh',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          refreshToken: 'expired-token-123',
        }),
      },
      env,
    );

    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string; code: string };
    expect(body.code).toBe('REFRESH_TOKEN_EXPIRED');
  });

  it('3. POST /api/auth/refresh rotates valid tokens and preserves tenant pinning', async () => {
    const app = createTestApp();
    const db = createMockDb();
    const env = createEnv(db);

    const res = await app.request(
      'http://localhost/api/auth/refresh',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          refreshToken: 'valid-token-456',
        }),
      },
      env,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      data: { accessToken: string; refreshToken: string };
    };
    expect(body.success).toBe(true);
    expect(body.data.accessToken).toBeDefined();
    expect(body.data.refreshToken).toBeDefined();

    // Old token must now be revoked
    const oldToken = refreshTokens.find((r) => r.token === 'valid-token-456');
    expect(oldToken?.revoked_at).not.toBeNull();

    // New token must be pinned to the same empresaId (6)
    const newlyIssuedToken = refreshTokens.find((r) => r.token === body.data.refreshToken);
    expect(newlyIssuedToken?.empresa_id).toBe(6);
  });

  it('4. POST /api/auth/logout revokes refresh token without running global DELETE', async () => {
    const app = createTestApp();
    const db = createMockDb();
    const env = createEnv(db);

    const res = await app.request(
      'http://localhost/api/auth/logout',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer access|1|6|jti-initial|1800',
        },
        body: JSON.stringify({
          refreshToken: 'valid-token-456',
        }),
      },
      env,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean };
    expect(body.success).toBe(true);

    const deleteQueries = executedSqls.filter((s) => s.includes('DELETE FROM refresh_tokens'));
    expect(deleteQueries.length).toBe(0);

    const token = refreshTokens.find((r) => r.token === 'valid-token-456');
    expect(token?.revoked_at).toBe(NOW);
  });

  it('5. POST /api/auth/login fails closed when user has no active tenant membership (USER_WITHOUT_EMPRESA)', async () => {
    const app = createTestApp();
    const db = createMockDb();
    const env = createEnv(db);

    const res = await app.request(
      'http://localhost/api/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'orphan@airtrust.com',
          senha: 'CorrectPassword123!',
        }),
      },
      env,
    );

    expect(res.status).toBe(401);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('USER_WITHOUT_EMPRESA');
  });

  it('6. POST /api/auth/login fails closed on invalid password (INVALID_CREDENTIALS)', async () => {
    const app = createTestApp();
    const db = createMockDb();
    const env = createEnv(db);

    const res = await app.request(
      'http://localhost/api/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'pilot@airtrust.com',
          senha: 'WrongPassword!',
        }),
      },
      env,
    );

    expect(res.status).toBe(401);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('INVALID_CREDENTIALS');
  });
});

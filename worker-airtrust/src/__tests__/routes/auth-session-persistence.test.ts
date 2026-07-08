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
    rateLimiter:
      () =>
      async (_c: unknown, next: () => Promise<void>) => {
        await next();
      },
  };
});

vi.mock('../../middleware/auth', () => ({
  auth:
    () =>
    async (c: any, next: () => Promise<void>) => {
      if (!c.req.header('Authorization')) {
        return c.json({ success: false, error: 'Token de autenticação não fornecido' }, 401);
      }

      c.set('userId', Number(c.req.header('x-test-user-id') || 1));
      c.set('empresaId', Number(c.req.header('x-test-empresa-id') || 10));
      c.set('userRole', 'ADMINISTRADOR');
      await next();
    },
}));

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
  generateJWT: vi.fn(async (payload: Record<string, unknown>, _secret: string, expiresIn = 1800) => {
    tokenCounter += 1;
    const jti = `jti-${tokenCounter}`;
    return {
      token: `access|${String(payload.sub)}|${String(payload.empresa_id)}|${jti}|${expiresIn}`,
      jti,
    };
  }),
  verifyJWT: vi.fn(async (token: string) => {
    const [, subRaw, empresaIdRaw, jti] = token.split('|');
    if (!subRaw || !empresaIdRaw || !jti) return null;
    return {
      sub: subRaw,
      empresa_id: Number(empresaIdRaw),
      jti,
      email: 'user@airtrust.com',
      role: 'ADMINISTRADOR',
    };
  }),
  verifyPassword: vi.fn(async (plain: string, hashed: string) => hashed === `hash:${plain}`),
  hashPassword: vi.fn(async (plain: string) => `hash:${plain}`),
  generateRefreshToken: vi.fn(() => {
    tokenCounter += 1;
    return `refresh-${tokenCounter}`;
  }),
  getRefreshTokenExpiry: vi.fn((days: number) => {
    const date = new Date('2026-06-29T12:00:00.000Z');
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString();
  }),
  extractBearerToken: vi.fn((header?: string) =>
    header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null,
  ),
}));

import { generateJWT } from '../../utils/security';
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
  created_at: string;
};

function createAuthApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.onError(errorHandler);
  app.route('/api/auth', authRoutes);
  return app;
}

function createDb(options?: {
  users?: MockUser[];
  links?: MockLink[];
  refreshTokens?: MockRefreshToken[];
}) {
  const users = [...(options?.users || [])];
  const links = [...(options?.links || [])];
  const refreshTokens = [...(options?.refreshTokens || [])];
  const blockedJtis = new Set<string>();
  let nextRefreshId = refreshTokens.reduce((max, item) => Math.max(max, item.id), 0) + 1;

  const db = {
    prepare(sql: string) {
      const statement = {
        params: [] as unknown[],
        bind(...params: unknown[]) {
          statement.params = params;
          return statement;
        },
        async first<T>() {
          if (sql.includes("sqlite_master") && sql.includes("name = 'usuarios_empresas'")) {
            return { found: 1 } as T;
          }

          if (sql.includes('SELECT rt.user_id, rt.revoked_at, rt.expires_at')) {
            const token = String(statement.params[0] || '');
            const row = refreshTokens.find((item) => item.token === token) || null;
            return (row
              ? {
                  user_id: row.user_id,
                  revoked_at: row.revoked_at,
                  expires_at: row.expires_at,
                }
              : null) as T;
          }

          if (sql.includes('CASE WHEN datetime(?) <= datetime')) {
            const value = String(statement.params[0] || '');
            return { expired: value <= '2026-06-29T12:00:00.000Z' ? 1 : 0 } as T;
          }

          if (sql.includes('SELECT access_token_jti FROM refresh_tokens')) {
            const token = String(statement.params[0] || '');
            const row =
              refreshTokens.find((item) => item.token === token && item.revoked_at === null) || null;
            return (row ? { access_token_jti: row.access_token_jti } : null) as T;
          }

          if (sql.includes('SELECT ue.empresa_id') && sql.includes('FROM usuarios_empresas ue')) {
            const userId = Number(statement.params[0]);
            const primaryLink = [...links]
              .filter((item) => item.usuario_id === userId)
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

          if (sql.includes('SELECT id, email, nome, perfil, password_hash') && sql.includes('WHERE email = ?')) {
            const email = String(statement.params[0] || '').toLowerCase();
            const user =
              users.find(
                (item) =>
                  item.email === email && item.deleted_at === null && item.active === 1,
              ) || null;
            return user as T;
          }

          if (sql.includes('SELECT funcionario_id FROM usuarios WHERE id = ?')) {
            const userId = Number(statement.params[0]);
            const user = users.find((item) => item.id === userId) || null;
            return (user ? { funcionario_id: user.funcionario_id } : null) as T;
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
                  item.id === refreshToken.user_id && item.deleted_at === null && item.active === 1,
              ) || null;
            return (user
              ? {
                  user_id: user.id,
                  email: user.email,
                  perfil: user.perfil,
                  nome: user.nome,
                  funcionario_id: user.funcionario_id,
                }
              : null) as T;
          }

          if (sql.includes('SELECT id, email, nome, perfil') && sql.includes('WHERE id = ?')) {
            const userId = Number(statement.params[0]);
            const user =
              users.find(
                (item) => item.id === userId && item.deleted_at === null && item.active === 1,
              ) || null;
            return (user
              ? { id: user.id, email: user.email, nome: user.nome, perfil: user.perfil }
              : null) as T;
          }

          if (sql.includes('SELECT id, password_hash') && sql.includes('WHERE id = ?')) {
            const userId = Number(statement.params[0]);
            const user =
              users.find(
                (item) => item.id === userId && item.deleted_at === null && item.active === 1,
              ) || null;
            return (user ? { id: user.id, password_hash: user.password_hash } : null) as T;
          }

          if (sql.includes('SELECT 1 FROM token_blocklist')) {
            const jti = String(statement.params[0] || '');
            return (blockedJtis.has(jti) ? { found: 1 } : null) as T;
          }

          return null as T;
        },
        async all<T>() {
          if (sql.includes("PRAGMA table_info('usuarios')")) {
            return { results: [{ name: 'active' }] } as T;
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
                    item.user_id === userId &&
                    item.revoked_at === null &&
                    item.expires_at > '2026-06-29T12:00:00.000Z',
                )
                .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id)
                .map((item) => ({ id: item.id })),
            } as T;
          }

          return { results: [] } as T;
        },
        async run() {
          if (sql.includes('DELETE FROM refresh_tokens')) {
            const remaining = refreshTokens.filter(
              (item) => item.expires_at > '2026-06-29T12:00:00.000Z',
            );
            refreshTokens.splice(0, refreshTokens.length, ...remaining);
            return { meta: { changes: 1 } };
          }

          if (sql.includes('INSERT INTO refresh_tokens')) {
            const [userIdRaw, tokenRaw, expiresAtRaw, jtiRaw] = statement.params;
            refreshTokens.push({
              id: nextRefreshId++,
              user_id: Number(userIdRaw),
              token: String(tokenRaw),
              expires_at: String(expiresAtRaw),
              revoked_at: null,
              access_token_jti: typeof jtiRaw === 'string' ? jtiRaw : null,
              created_at: `2026-06-29T12:00:${String(nextRefreshId).padStart(2, '0')}.000Z`,
            });
            return { meta: { changes: 1 } };
          }

          if (sql.includes('UPDATE refresh_tokens SET revoked_at = datetime("now") WHERE token = ?')) {
            const token = String(statement.params[0] || '');
            refreshTokens.forEach((item) => {
              if (item.token === token) {
                item.revoked_at = '2026-06-29T12:00:00.000Z';
              }
            });
            return { meta: { changes: 1 } };
          }

          if (sql.includes('UPDATE refresh_tokens') && sql.includes('WHERE user_id = ?')) {
            const userId = Number(statement.params[0]);
            refreshTokens.forEach((item) => {
              if (item.user_id === userId && item.revoked_at === null) {
                item.revoked_at = '2026-06-29T12:00:00.000Z';
              }
            });
            return { meta: { changes: 1 } };
          }

          if (sql.includes('INSERT OR IGNORE INTO token_blocklist')) {
            const jti = String(statement.params[0] || '');
            blockedJtis.add(jti);
            return { meta: { changes: 1 } };
          }

          if (sql.includes('UPDATE usuarios SET password_hash = ?')) {
            const [passwordHashRaw, userIdRaw] = statement.params;
            const user = users.find((item) => item.id === Number(userIdRaw));
            if (user) {
              user.password_hash = String(passwordHashRaw);
            }
            return { meta: { changes: user ? 1 : 0 } };
          }

          return { meta: { changes: 0 } };
        },
      };

      return statement;
    },
  } as unknown as D1Database;

  return { db, refreshTokens, blockedJtis };
}

async function hit(
  db: D1Database,
  path: string,
  options?: { method?: 'GET' | 'POST'; body?: unknown; headers?: Record<string, string> },
) {
  const app = createAuthApp();
  return app.fetch(
    new Request(`http://localhost${path}`, {
      method: options?.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      body: options?.body ? JSON.stringify(options.body) : undefined,
    }),
    { DB: db, JWT_SECRET: 'test-secret', ENVIRONMENT: 'test' } as unknown as Env,
    {} as ExecutionContext,
  );
}

const baseUsers: MockUser[] = [
  {
    id: 1,
    email: 'admin@airtrust.com',
    nome: 'Admin',
    perfil: 'ADMIN',
    password_hash: 'hash:senha-segura',
    funcionario_id: 100,
    active: 1,
    deleted_at: null,
  },
];

const baseLinks: MockLink[] = [
  { usuario_id: 1, empresa_id: 10, role: 'admin', is_primary: 1 },
  { usuario_id: 1, empresa_id: 20, role: 'manager', is_primary: 0 },
];

describe('auth session persistence routes', () => {
  beforeEach(() => {
    tokenCounter = 0;
    resetSchemaCache();
  });

  it('faz login válido com access token curto e refresh token longo', async () => {
    const { db, refreshTokens } = createDb({ users: baseUsers, links: baseLinks });

    const response = await hit(db, '/api/auth/login', {
      method: 'POST',
      body: { email: 'admin@airtrust.com', senha: 'senha-segura' },
    });

    const json = await response.json() as Record<string, unknown>;
    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect((json.data as Record<string, unknown>).accessToken).toContain('access|1|10|jti-1|1800');
    expect((json.data as Record<string, unknown>).refreshToken).toMatch(/^refresh-/);
    expect(refreshTokens).toHaveLength(1);
    expect(refreshTokens[0].expires_at).toContain('2026-09-27');
  });

  it('rejeita login inválido com JSON consistente', async () => {
    const { db } = createDb({ users: baseUsers, links: baseLinks });

    const response = await hit(db, '/api/auth/login', {
      method: 'POST',
      body: { email: 'admin@airtrust.com', senha: 'senha-errada' },
    });

    const json = await response.json() as Record<string, unknown>;
    expect(response.status).toBe(401);
    expect(json.success).toBe(false);
    expect(json.code).toBe('INVALID_CREDENTIALS');
  });

  it('renova sessão válida, revoga refresh anterior e mantém múltiplos vínculos', async () => {
    const { db, refreshTokens } = createDb({
      users: baseUsers,
      links: baseLinks,
      refreshTokens: [
        {
          id: 1,
          user_id: 1,
          token: 'refresh-atual',
          expires_at: '2026-09-27T12:00:00.000Z',
          revoked_at: null,
          access_token_jti: 'jti-atual',
          created_at: '2026-06-29T11:00:00.000Z',
        },
      ],
    });

    const refreshResponse = await hit(db, '/api/auth/refresh', {
      method: 'POST',
      body: { refreshToken: 'refresh-atual' },
    });
    const refreshJson = await refreshResponse.json() as Record<string, unknown>;

    expect(refreshResponse.status).toBe(200);
    expect(refreshJson.success).toBe(true);
    expect(refreshTokens[0].revoked_at).not.toBeNull();
    expect(refreshTokens.filter((item) => item.revoked_at === null)).toHaveLength(1);
    expect(vi.mocked(generateJWT).mock.calls.at(-1)?.[0]).toMatchObject({ empresa_id: 10 });

    const meResponse = await hit(db, '/api/auth/me', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${(refreshJson.data as Record<string, unknown>).accessToken}`,
        'x-test-user-id': '1',
        'x-test-empresa-id': '10',
      },
    });
    const meJson = await meResponse.json() as Record<string, unknown>;

    expect(meResponse.status).toBe(200);
    expect(meJson.success).toBe(true);
    expect((meJson.data as Record<string, unknown>).email).toBe('admin@airtrust.com');
  });

  it('retorna erro claro para refresh expirado', async () => {
    const { db } = createDb({
      users: baseUsers,
      links: baseLinks,
      refreshTokens: [
        {
          id: 1,
          user_id: 1,
          token: 'refresh-expirado',
          expires_at: '2026-06-01T12:00:00.000Z',
          revoked_at: null,
          access_token_jti: 'jti-expirado',
          created_at: '2026-05-01T12:00:00.000Z',
        },
      ],
    });

    const response = await hit(db, '/api/auth/refresh', {
      method: 'POST',
      body: { refreshToken: 'refresh-expirado' },
    });
    const json = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(401);
    expect(json.code).toBe('REFRESH_TOKEN_EXPIRED');
  });

  it('bloqueia refresh para usuário inativo', async () => {
    const inactiveUsers = [{ ...baseUsers[0], active: 0 }];
    const { db, refreshTokens } = createDb({
      users: inactiveUsers,
      links: baseLinks,
      refreshTokens: [
        {
          id: 1,
          user_id: 1,
          token: 'refresh-inativo',
          expires_at: '2026-09-27T12:00:00.000Z',
          revoked_at: null,
          access_token_jti: 'jti-inativo',
          created_at: '2026-06-29T11:00:00.000Z',
        },
      ],
    });

    const response = await hit(db, '/api/auth/refresh', {
      method: 'POST',
      body: { refreshToken: 'refresh-inativo' },
    });
    const json = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(401);
    expect(json.code).toBe('USER_INACTIVE');
    expect(refreshTokens[0].revoked_at).not.toBeNull();
  });

  it('logout revoga a sessão e bloqueia o access token atual', async () => {
    const { db, refreshTokens, blockedJtis } = createDb({
      users: baseUsers,
      links: baseLinks,
      refreshTokens: [
        {
          id: 1,
          user_id: 1,
          token: 'refresh-logout',
          expires_at: '2026-09-27T12:00:00.000Z',
          revoked_at: null,
          access_token_jti: 'jti-logout',
          created_at: '2026-06-29T11:00:00.000Z',
        },
      ],
    });

    const response = await hit(db, '/api/auth/logout', {
      method: 'POST',
      body: { refreshToken: 'refresh-logout' },
      headers: { Authorization: 'Bearer access|1|10|jti-logout|1800' },
    });
    const json = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(refreshTokens[0].revoked_at).not.toBeNull();
    expect(blockedJtis.has('jti-logout')).toBe(true);
  });
});

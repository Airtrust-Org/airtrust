/**
 * P0-AUTH-001 follow-up — select-empresa must scope the tenant switch to the
 * CALLING session only, never to the user globally.
 *
 * Before this change, POST /api/auth/select-empresa ran:
 *   UPDATE usuarios_empresas SET is_primary = CASE WHEN empresa_id = ? THEN 1
 *   ELSE 0 END WHERE usuario_id = ?
 * which flipped is_primary for ALL of the user's links, independent of which
 * session/tab made the call. Combined with refresh re-deriving the tenant
 * from is_primary (fixed separately), this let one tab's tenant switch bleed
 * into another tab's session.
 *
 * Contract enforced here:
 *  - is_primary is untouched by select-empresa; it only affects the default
 *    tenant of a brand-new login with no prior context.
 *  - select-empresa mints a new access+refresh token pair pinned to the
 *    target empresa, scoped to the calling session — it never revokes or
 *    mutates any other session's tokens.
 *  - GET /api/auth/empresas marks "current" from the JWT-pinned empresaId
 *    (c.get('empresaId')), not from is_primary.
 */
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

// Access tokens in this fixture are opaque strings of the form
// access|<sub>|<empresa_id>|<jti>|<ttl>, matching the mocked generateJWT
// below. Mocking the real auth() middleware to parse that same format lets
// this test exercise the actual route logic (select-empresa, /empresas,
// /refresh) end-to-end without needing to stub the full JWT/security-state
// machinery in middleware/auth.ts, which is unrelated to what's under test.
vi.mock('../../middleware/auth', () => ({
  auth:
    () =>
    async (c: any, next: () => Promise<void>) => {
      const header = c.req.header('Authorization');
      if (!header?.startsWith('Bearer ')) {
        return c.json({ success: false, error: 'Token de autenticação não fornecido' }, 401);
      }
      const token = header.slice('Bearer '.length);
      const [, subRaw, empresaIdRaw, jti] = token.split('|');
      if (!subRaw || !empresaIdRaw || !jti) {
        return c.json({ success: false, error: 'Token inválido' }, 401);
      }
      c.set('userId', Number(subRaw));
      c.set('empresaId', Number(empresaIdRaw));
      c.set('userRole', 'ADMINISTRADOR');
      await next();
    },
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
  verifyJWT: vi.fn(async () => null),
  verifyPassword: vi.fn(async (plain: string, hashed: string) => hashed === `hash:${plain}`),
  hashPassword: vi.fn(async (plain: string) => `hash:${plain}`),
  generateRefreshToken: vi.fn(() => {
    tokenCounter += 1;
    return `refresh-${tokenCounter}`;
  }),
  getRefreshTokenExpiry: vi.fn((days: number) => {
    const date = new Date('2026-08-17T12:00:00.000Z');
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

const NOW = '2026-08-17T12:00:00.000Z';

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
  empresasAtivas?: number[];
}) {
  const users = [...(options?.users || [])];
  const links = [...(options?.links || [])];
  const refreshTokens = [...(options?.refreshTokens || [])];
  const empresasAtivas = new Set(options?.empresasAtivas || [10, 20]);
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
          if (sql.includes('sqlite_master') && sql.includes("name = 'usuarios_empresas'")) {
            return { found: 1 } as T;
          }

          if (sql.includes('SELECT rt.user_id, rt.revoked_at, rt.expires_at, rt.empresa_id')) {
            const token = String(statement.params[0] || '');
            const row = refreshTokens.find((item) => item.token === token) || null;
            return (row
              ? {
                  user_id: row.user_id,
                  revoked_at: row.revoked_at,
                  expires_at: row.expires_at,
                  empresa_id: row.empresa_id,
                }
              : null) as T;
          }

          if (sql.includes('CASE WHEN datetime(?) <= datetime')) {
            const value = String(statement.params[0] || '');
            return { expired: value <= NOW ? 1 : 0 } as T;
          }

          // verifyUserEmpresaMembership (refresh)
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

          // resolveUserEmpresaId (default tenant on fresh login)
          if (sql.includes('SELECT ue.empresa_id') && sql.includes('FROM usuarios_empresas ue')) {
            const userId = Number(statement.params[0]);
            const primaryLink = [...links]
              .filter((item) => item.usuario_id === userId && empresasAtivas.has(item.empresa_id))
              .sort((a, b) => b.is_primary - a.is_primary || a.empresa_id - b.empresa_id)[0];
            return (primaryLink ? { empresa_id: primaryLink.empresa_id } : null) as T;
          }

          // resolveAuthRoleForUser
          if (sql.includes('SELECT ue.role') && sql.includes('FROM usuarios_empresas ue')) {
            const userId = Number(statement.params[0]);
            const empresaId = Number(statement.params[1]);
            const link = links.find(
              (item) => item.usuario_id === userId && item.empresa_id === empresaId,
            );
            return (link ? { role: link.role } : null) as T;
          }

          // select-empresa: vinculo query
          if (
            sql.includes('SELECT ue.role, e.id as empresa_id, e.nome as empresa_nome') &&
            sql.includes('FROM usuarios_empresas ue')
          ) {
            const userId = Number(statement.params[0]);
            const empresaId = Number(statement.params[1]);
            const link = links.find(
              (item) => item.usuario_id === userId && item.empresa_id === empresaId,
            );
            if (!link || !empresasAtivas.has(empresaId)) return null as T;
            return {
              role: link.role,
              empresa_id: empresaId,
              empresa_nome: `Empresa ${empresaId}`,
              empresa_codigo: `empresa-${empresaId}`,
            } as T;
          }

          // login: lookup by email
          if (
            sql.includes('SELECT id, email, nome, perfil, password_hash') &&
            sql.includes('WHERE email = ?')
          ) {
            const email = String(statement.params[0] || '').toLowerCase();
            const user =
              users.find(
                (item) => item.email === email && item.deleted_at === null && item.active === 1,
              ) || null;
            return user as T;
          }

          if (sql.includes('SELECT funcionario_id FROM usuarios WHERE id = ?')) {
            const userId = Number(statement.params[0]);
            const user = users.find((item) => item.id === userId) || null;
            return (user ? { funcionario_id: user.funcionario_id } : null) as T;
          }

          // select-empresa: user lookup by id
          if (
            sql.includes('SELECT id, email, perfil, nome') &&
            sql.includes('FROM usuarios') &&
            sql.includes('WHERE id = ?')
          ) {
            const userId = Number(statement.params[0]);
            const user =
              users.find(
                (item) => item.id === userId && item.deleted_at === null && item.active === 1,
              ) || null;
            return (user
              ? { id: user.id, email: user.email, perfil: user.perfil, nome: user.nome }
              : null) as T;
          }

          // refresh: joined token+user record
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

          return null as T;
        },
        async all<T>() {
          if (sql.includes("PRAGMA table_info('usuarios')")) {
            return { results: [{ name: 'active' }] } as T;
          }

          if (sql.includes("PRAGMA table_info('refresh_tokens')")) {
            return { results: [{ name: 'empresa_id' }] } as T;
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

          // GET /empresas (non-platform-admin listing)
          if (sql.includes('FROM usuarios_empresas ue') && sql.includes('is_current')) {
            const empresaIdAtual = Number(statement.params[0]);
            const userId = Number(statement.params[1]);
            const results = links
              .filter((l) => l.usuario_id === userId && empresasAtivas.has(l.empresa_id))
              .map((l) => ({
                id: l.empresa_id,
                nome: `Empresa ${l.empresa_id}`,
                codigo: `empresa-${l.empresa_id}`,
                logo_url: null,
                modulos_ativos: null,
                role: l.role,
                is_primary: l.is_primary,
                is_current: l.empresa_id === empresaIdAtual ? 1 : 0,
              }));
            return { results } as T;
          }

          return { results: [] } as T;
        },
        async run() {
          if (
            sql.includes('UPDATE refresh_tokens') &&
            sql.includes("SET revoked_at = datetime('now')") &&
            sql.includes('AND revoked_at IS NULL') &&
            sql.includes("AND expires_at > datetime('now')")
          ) {
            const token = String(statement.params[0] || '');
            const row = refreshTokens.find((item) => item.token === token) || null;
            const isEligible = row !== null && row.revoked_at === null && row.expires_at > NOW;
            if (isEligible && row) {
              row.revoked_at = NOW;
              return { meta: { changes: 1 } };
            }
            return { meta: { changes: 0 } };
          }

          // Guard: fail loudly if select-empresa (or anything else) still tries
          // to write is_primary globally — this is exactly the regression this
          // test suite exists to prevent.
          if (sql.includes('UPDATE usuarios_empresas') && sql.includes('is_primary')) {
            throw new Error(
              `Unexpected global is_primary mutation attempted by SQL: ${sql}`,
            );
          }

          if (sql.includes('DELETE FROM refresh_tokens')) {
            const remaining = refreshTokens.filter((item) => item.expires_at > NOW);
            refreshTokens.splice(0, refreshTokens.length, ...remaining);
            return { meta: { changes: 1 } };
          }

          if (sql.includes('INSERT INTO refresh_tokens') && sql.includes('empresa_id')) {
            const [userIdRaw, tokenRaw, expiresAtRaw, jtiRaw, empresaIdRaw] = statement.params;
            refreshTokens.push({
              id: nextRefreshId,
              user_id: Number(userIdRaw),
              token: String(tokenRaw),
              expires_at: String(expiresAtRaw),
              revoked_at: null,
              access_token_jti: typeof jtiRaw === 'string' ? jtiRaw : null,
              empresa_id: typeof empresaIdRaw === 'number' ? empresaIdRaw : null,
              created_at: `2026-08-17T12:00:${String(nextRefreshId).padStart(2, '0')}.000Z`,
            });
            nextRefreshId += 1;
            return { meta: { changes: 1 } };
          }

          if (sql.includes('INSERT INTO refresh_tokens')) {
            const [userIdRaw, tokenRaw, expiresAtRaw, jtiRaw] = statement.params;
            refreshTokens.push({
              id: nextRefreshId,
              user_id: Number(userIdRaw),
              token: String(tokenRaw),
              expires_at: String(expiresAtRaw),
              revoked_at: null,
              access_token_jti: typeof jtiRaw === 'string' ? jtiRaw : null,
              empresa_id: null,
              created_at: `2026-08-17T12:00:${String(nextRefreshId).padStart(2, '0')}.000Z`,
            });
            nextRefreshId += 1;
            return { meta: { changes: 1 } };
          }

          return { meta: { changes: 0 } };
        },
      };

      return statement;
    },
  } as unknown as D1Database;

  return { db, refreshTokens, links };
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
    email: 'user@airtrust.com',
    nome: 'User',
    perfil: 'ADMIN',
    password_hash: 'hash:senha-segura',
    funcionario_id: null,
    active: 1,
    deleted_at: null,
  },
];

describe('P0-AUTH-001 follow-up: select-empresa is session-scoped, not global', () => {
  beforeEach(() => {
    tokenCounter = 0;
    resetSchemaCache();
  });

  it('7-step scenario: tab1 stays on A, tab2 switches to B, is_primary untouched, new login still defaults from is_primary', async () => {
    const links: MockLink[] = [
      { usuario_id: 1, empresa_id: 10, role: 'admin', is_primary: 1 }, // A is default
      { usuario_id: 1, empresa_id: 20, role: 'manager', is_primary: 0 }, // B
    ];
    const { db, refreshTokens } = createDb({ users: baseUsers, links });

    // Snapshot is_primary before anything happens, to diff against later.
    const isPrimaryBefore = links.map((l) => ({ empresa_id: l.empresa_id, is_primary: l.is_primary }));

    // Step 2: tab1 logs in — no prior session, defaults to A via is_primary.
    const tab1Login = await hit(db, '/api/auth/login', {
      method: 'POST',
      body: { email: 'user@airtrust.com', senha: 'senha-segura' },
    });
    const tab1LoginJson = (await tab1Login.json()) as Record<string, unknown>;
    expect(tab1Login.status).toBe(200);
    const tab1Data = tab1LoginJson.data as Record<string, unknown>;
    expect(tab1Data.accessToken).toContain('|1|10|');
    let tab1RefreshToken = String(tab1Data.refreshToken);

    // tab2 also starts from a session already active on A (e.g. same user,
    // another device/tab that logged in earlier) — simulate by minting a
    // second independent session pinned to A as well, then switching it.
    const tab2Login = await hit(db, '/api/auth/login', {
      method: 'POST',
      body: { email: 'user@airtrust.com', senha: 'senha-segura' },
    });
    const tab2LoginJson = (await tab2Login.json()) as Record<string, unknown>;
    const tab2Data = tab2LoginJson.data as Record<string, unknown>;
    const tab2AccessTokenBeforeSwitch = String(tab2Data.accessToken);

    // Step 3: tab2 calls select-empresa(B).
    const tab2Select = await hit(db, '/api/auth/select-empresa', {
      method: 'POST',
      body: { empresaId: 20 },
      headers: { Authorization: `Bearer ${tab2AccessTokenBeforeSwitch}` },
    });
    const tab2SelectJson = (await tab2Select.json()) as Record<string, unknown>;
    expect(tab2Select.status).toBe(200);
    const tab2SelectData = tab2SelectJson.data as Record<string, unknown>;
    expect(tab2SelectData.accessToken).toContain('|1|20|');
    expect(typeof tab2SelectData.refreshToken).toBe('string');
    const tab2RefreshToken = String(tab2SelectData.refreshToken);

    // Step 4: tab1 refreshes — must still resolve to A, unaffected by tab2.
    const tab1Refresh = await hit(db, '/api/auth/refresh', {
      method: 'POST',
      body: { refreshToken: tab1RefreshToken },
    });
    const tab1RefreshJson = (await tab1Refresh.json()) as Record<string, unknown>;
    expect(tab1Refresh.status).toBe(200);
    expect((tab1RefreshJson.data as Record<string, unknown>).accessToken).toContain('|1|10|');

    // Step 5: tab2 refreshes — must still resolve to B.
    const tab2Refresh = await hit(db, '/api/auth/refresh', {
      method: 'POST',
      body: { refreshToken: tab2RefreshToken },
    });
    const tab2RefreshJson = (await tab2Refresh.json()) as Record<string, unknown>;
    expect(tab2Refresh.status).toBe(200);
    expect((tab2RefreshJson.data as Record<string, unknown>).accessToken).toContain('|1|20|');

    // Step 6: is_primary was NOT changed by select-empresa.
    const isPrimaryAfter = links.map((l) => ({ empresa_id: l.empresa_id, is_primary: l.is_primary }));
    expect(isPrimaryAfter).toEqual(isPrimaryBefore);

    // Step 7: a brand-new login (fresh session) still defaults per is_primary.
    const freshLogin = await hit(db, '/api/auth/login', {
      method: 'POST',
      body: { email: 'user@airtrust.com', senha: 'senha-segura' },
    });
    const freshLoginJson = (await freshLogin.json()) as Record<string, unknown>;
    expect(freshLogin.status).toBe(200);
    expect((freshLoginJson.data as Record<string, unknown>).accessToken).toContain('|1|10|');

    // Sanity: tab1's original refresh token was revoked by rotation (step 4),
    // but tab2's tenant-B session and its rotation are entirely independent
    // token rows — never touched tab1's, never revoked by select-empresa.
    const tab1OriginalRow = refreshTokens.find((t) => t.token === tab1RefreshToken);
    expect(tab1OriginalRow?.revoked_at).not.toBeNull();
    const tab2PreSwitchRow = refreshTokens.find((t) => t.token === String(tab2Data.refreshToken));
    // tab2's pre-switch refresh token was never used against /refresh nor
    // revoked by select-empresa (select-empresa only had the access token).
    expect(tab2PreSwitchRow?.revoked_at).toBeNull();
  });

  it('GET /api/auth/empresas marks "current" from the JWT-pinned empresaId, not is_primary', async () => {
    const links: MockLink[] = [
      { usuario_id: 1, empresa_id: 10, role: 'admin', is_primary: 1 },
      { usuario_id: 1, empresa_id: 20, role: 'manager', is_primary: 0 },
    ];
    const { db } = createDb({ users: baseUsers, links });

    // Access token pinned to 20 even though is_primary still points at 10 —
    // this only happens once select-empresa stops flipping is_primary, which
    // is exactly the scenario we need /empresas to handle correctly.
    const accessTokenForB = 'access|1|20|jti-b|1800';

    const response = await hit(db, '/api/auth/empresas', {
      headers: { Authorization: `Bearer ${accessTokenForB}` },
    });
    const json = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    const data = json.data as Record<string, unknown>;
    expect(data.empresaAtualId).toBe(20);
    const empresas = data.empresas as Array<Record<string, unknown>>;
    const empresaB = empresas.find((e) => e.id === 20);
    const empresaA = empresas.find((e) => e.id === 10);
    expect(empresaB?.is_current).toBe(1);
    expect(empresaA?.is_current).toBe(0);
    // is_primary still reflects the DB default (unrelated to "current").
    expect(empresaA?.is_primary).toBe(1);
    expect(empresaB?.is_primary).toBe(0);
  });
});

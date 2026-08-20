/**
 * P0-AUTH-001 / P1-AUTH-002 — refresh-token tenant pinning + CAS rotation.
 *
 * P0-AUTH-001: once a refresh token is issued for empresa A, refreshing it
 * must always resolve back to empresa A, even if the user's is_primary
 * empresa (or other tenant memberships) change afterward (e.g. via a
 * concurrent POST /api/auth/select-empresa from another session).
 *
 * P1-AUTH-002: refresh-token rotation must use CAS semantics so two
 * near-simultaneous refresh requests with the same token cannot both
 * succeed (double-spend).
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
    const date = new Date('2026-06-29T12:00:00.000Z');
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

const NOW = '2026-06-29T12:00:00.000Z';

function createAuthApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.onError(errorHandler);
  app.route('/api/auth', authRoutes);
  return app;
}

/**
 * D1 stub that models refresh_tokens WITH the empresa_id column
 * (post migration 0461), and usuarios_empresas as the source of truth
 * for tenant membership / is_primary.
 */
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
          if (sql.includes("sqlite_master") && sql.includes("name = 'usuarios_empresas'")) {
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

          // verifyUserEmpresaMembership
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
            // Simulates migration 0461 already applied.
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

          if (sql.includes('DELETE FROM refresh_tokens')) {
            const remaining = refreshTokens.filter((item) => item.expires_at > NOW);
            refreshTokens.splice(0, refreshTokens.length, ...remaining);
            return { meta: { changes: 1 } };
          }

          if (sql.includes('INSERT INTO refresh_tokens') && sql.includes('empresa_id')) {
            const userIdRaw = statement.params[0];
            const tokenRaw = statement.params[1];
            const expiresAtRaw = statement.params[2];
            const empresaIdRaw = statement.params.length >= 5 ? statement.params[4] : statement.params[3];
            const jtiRaw = statement.params.length >= 5 ? statement.params[3] : null;
            refreshTokens.push({
              id: nextRefreshId,
              user_id: Number(userIdRaw),
              token: String(tokenRaw),
              expires_at: String(expiresAtRaw),
              revoked_at: null,
              access_token_jti: typeof jtiRaw === 'string' ? jtiRaw : null,
              empresa_id: typeof empresaIdRaw === 'number' ? empresaIdRaw : null,
              created_at: `2026-06-29T12:00:${String(nextRefreshId).padStart(2, '0')}.000Z`,
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
              created_at: `2026-06-29T12:00:${String(nextRefreshId).padStart(2, '0')}.000Z`,
            });
            nextRefreshId += 1;
            return { meta: { changes: 1 } };
          }

          if (sql.includes('UPDATE refresh_tokens SET revoked_at = datetime("now") WHERE token = ?')) {
            const token = String(statement.params[0] || '');
            refreshTokens.forEach((item) => {
              if (item.token === token) {
                item.revoked_at = NOW;
              }
            });
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

describe('P0-AUTH-001: refresh-token tenant pinning', () => {
  beforeEach(() => {
    tokenCounter = 0;
    resetSchemaCache();
  });

  it('mantém sessão da empresa A pinada mesmo se is_primary mudar para B depois', async () => {
    const links: MockLink[] = [
      { usuario_id: 1, empresa_id: 10, role: 'admin', is_primary: 1 },
      { usuario_id: 1, empresa_id: 20, role: 'manager', is_primary: 0 },
    ];
    const { db, refreshTokens } = createDb({
      users: baseUsers,
      links,
      refreshTokens: [
        {
          id: 1,
          user_id: 1,
          token: 'refresh-empresa-a',
          expires_at: '2026-09-27T12:00:00.000Z',
          revoked_at: null,
          access_token_jti: 'jti-a',
          empresa_id: 10,
          created_at: '2026-06-29T11:00:00.000Z',
        },
      ],
    });

    // Simula outra sessão chamando select-empresa e mudando o default global.
    links[0].is_primary = 0;
    links[1].is_primary = 1;

    const response = await hit(db, '/api/auth/refresh', {
      method: 'POST',
      body: { refreshToken: 'refresh-empresa-a' },
    });
    const json = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    const data = json.data as Record<string, unknown>;
    expect(data.accessToken).toContain('|1|10|'); // ainda empresa 10, não 20
    expect(refreshTokens.find((t) => t.token === data.refreshToken)?.empresa_id).toBe(10);
  });

  it('mantém sessão independente da empresa B, não afetada pela sessão A / mudança de is_primary', async () => {
    const links: MockLink[] = [
      { usuario_id: 1, empresa_id: 10, role: 'admin', is_primary: 0 },
      { usuario_id: 1, empresa_id: 20, role: 'manager', is_primary: 1 },
    ];
    const { db } = createDb({
      users: baseUsers,
      links,
      refreshTokens: [
        {
          id: 1,
          user_id: 1,
          token: 'refresh-empresa-a',
          expires_at: '2026-09-27T12:00:00.000Z',
          revoked_at: null,
          access_token_jti: 'jti-a',
          empresa_id: 10,
          created_at: '2026-06-29T11:00:00.000Z',
        },
        {
          id: 2,
          user_id: 1,
          token: 'refresh-empresa-b',
          expires_at: '2026-09-27T12:00:00.000Z',
          revoked_at: null,
          access_token_jti: 'jti-b',
          empresa_id: 20,
          created_at: '2026-06-29T11:00:00.000Z',
        },
      ],
    });

    const responseA = await hit(db, '/api/auth/refresh', {
      method: 'POST',
      body: { refreshToken: 'refresh-empresa-a' },
    });
    const jsonA = (await responseA.json()) as Record<string, unknown>;
    expect(response_ok(responseA)).toBe(true);
    expect((jsonA.data as Record<string, unknown>).accessToken).toContain('|1|10|');

    const responseB = await hit(db, '/api/auth/refresh', {
      method: 'POST',
      body: { refreshToken: 'refresh-empresa-b' },
    });
    const jsonB = (await responseB.json()) as Record<string, unknown>;
    expect(response_ok(responseB)).toBe(true);
    expect((jsonB.data as Record<string, unknown>).accessToken).toContain('|1|20|');
  });

  it('falha de forma limpa se o acesso à empresa A foi revogado', async () => {
    const links: MockLink[] = [{ usuario_id: 1, empresa_id: 20, role: 'manager', is_primary: 1 }];
    // Usuário não tem mais vínculo com empresa 10 (removido após emissão do token).
    const { db, refreshTokens } = createDb({
      users: baseUsers,
      links,
      refreshTokens: [
        {
          id: 1,
          user_id: 1,
          token: 'refresh-empresa-a-revogada',
          expires_at: '2026-09-27T12:00:00.000Z',
          revoked_at: null,
          access_token_jti: 'jti-a',
          empresa_id: 10,
          created_at: '2026-06-29T11:00:00.000Z',
        },
      ],
    });

    const response = await hit(db, '/api/auth/refresh', {
      method: 'POST',
      body: { refreshToken: 'refresh-empresa-a-revogada' },
    });
    const json = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(401);
    expect(json.code).toBe('TENANT_ACCESS_REVOKED');
    expect(refreshTokens[0].revoked_at).not.toBeNull();
  });

  it('força novo login para token legado sem empresa_id', async () => {
    const links: MockLink[] = [{ usuario_id: 1, empresa_id: 10, role: 'admin', is_primary: 1 }];
    const { db, refreshTokens } = createDb({
      users: baseUsers,
      links,
      refreshTokens: [
        {
          id: 1,
          user_id: 1,
          token: 'refresh-legado',
          expires_at: '2026-09-27T12:00:00.000Z',
          revoked_at: null,
          access_token_jti: 'jti-legado',
          empresa_id: null, // emitido antes da migration 0461
          created_at: '2026-06-01T11:00:00.000Z',
        },
      ],
    });

    const response = await hit(db, '/api/auth/refresh', {
      method: 'POST',
      body: { refreshToken: 'refresh-legado' },
    });
    const json = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(401);
    expect(json.code).toBe('LEGACY_TOKEN_REQUIRES_REAUTH');
    expect(refreshTokens[0].revoked_at).not.toBeNull();
  });

  it('não permite usar token da empresa A para renovar como empresa B (empresa_id sempre vem do token, nunca do body)', async () => {
    const links: MockLink[] = [
      { usuario_id: 1, empresa_id: 10, role: 'admin', is_primary: 1 },
      { usuario_id: 1, empresa_id: 20, role: 'manager', is_primary: 0 },
    ];
    const { db } = createDb({
      users: baseUsers,
      links,
      refreshTokens: [
        {
          id: 1,
          user_id: 1,
          token: 'refresh-empresa-a',
          expires_at: '2026-09-27T12:00:00.000Z',
          revoked_at: null,
          access_token_jti: 'jti-a',
          empresa_id: 10,
          created_at: '2026-06-29T11:00:00.000Z',
        },
      ],
    });

    // O endpoint não aceita empresaId no body — mesmo se um atacante tentasse
    // injetar um empresaId=20, a resolução ignora o body e usa o valor pinado.
    const response = await hit(db, '/api/auth/refresh', {
      method: 'POST',
      body: { refreshToken: 'refresh-empresa-a', empresaId: 20 },
    });
    const json = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect((json.data as Record<string, unknown>).accessToken).toContain('|1|10|');
  });
});

describe('P1-AUTH-002: refresh-token rotation CAS / replay protection', () => {
  beforeEach(() => {
    tokenCounter = 0;
    resetSchemaCache();
  });

  it('rejeita a segunda de duas requisições de refresh concorrentes com o mesmo token', async () => {
    const links: MockLink[] = [{ usuario_id: 1, empresa_id: 10, role: 'admin', is_primary: 1 }];
    const { db } = createDb({
      users: baseUsers,
      links,
      refreshTokens: [
        {
          id: 1,
          user_id: 1,
          token: 'refresh-concorrente',
          expires_at: '2026-09-27T12:00:00.000Z',
          revoked_at: null,
          access_token_jti: 'jti-concorrente',
          empresa_id: 10,
          created_at: '2026-06-29T11:00:00.000Z',
        },
      ],
    });

    // Duas requisições "simultâneas" usando o mesmo token — sequenciadas aqui
    // porque o stub de DB é síncrono em memória, mas exercitam exatamente a
    // semântica de CAS que protege contra a corrida real: a primeira UPDATE
    // com WHERE revoked_at IS NULL casa (changes:1), a segunda não (changes:0).
    const [first, second] = await Promise.all([
      hit(db, '/api/auth/refresh', {
        method: 'POST',
        body: { refreshToken: 'refresh-concorrente' },
      }),
      hit(db, '/api/auth/refresh', {
        method: 'POST',
        body: { refreshToken: 'refresh-concorrente' },
      }),
    ]);

    const results = await Promise.all([first.json(), second.json()]);
    const statuses = [first.status, second.status].sort();
    const codes = results
      .map((r) => (r as Record<string, unknown>).code)
      .filter((c) => c !== undefined);

    expect(statuses).toEqual([200, 401]);
    expect(codes).toContain('REFRESH_TOKEN_REPLAYED');
  });
});

function response_ok(response: Response): boolean {
  return response.status === 200;
}

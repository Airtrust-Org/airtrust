import { Hono } from 'hono';
import type { Context } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';
import { auth, optionalAuth } from '../../middleware/auth';
import { errorHandler } from '../../middleware/error-handler';
import { generateJWT } from '../../utils/security';
import type { Env, Variables } from '../../types';
import { resetSchemaCache } from '../../utils/db-schema';

const JWT_SECRET = 'test-secret-256-bit-key-for-testing-only-not-production';

type UsuarioRow = {
  id: number;
  perfil: string;
  active: number;
  role?: string | null;
};

function createDb(options: {
  usuarios?: UsuarioRow[];
  memberships?: Array<{ usuarioId: number; empresaId: number; role: string }>;
  blocklisted?: string[];
  expiredBlocklisted?: string[];
  blocklistReadThrows?: boolean;
} = {}) {
  const usuarios = options.usuarios || [];
  const memberships = options.memberships || [];
  const blocklisted = new Set(options.blocklisted || []);
  const expiredBlocklisted = new Set(options.expiredBlocklisted || []);

  return {
    prepare: (sql: string) => {
      const statement = {
        params: [] as unknown[],
        bind(...params: unknown[]) {
          statement.params = params;
          return statement;
        },
        async first<T>() {
          if (sql.includes("name = 'usuarios_empresas'")) return { found: 1 } as T;
          if (sql.includes('PRAGMA table_info')) return null as T;

          if (sql.includes('FROM token_blocklist')) {
            if (options.blocklistReadThrows) {
              throw new Error('simulated D1 outage reading token_blocklist');
            }
            const jti = String(statement.params[0]);
            if (blocklisted.has(jti)) return { 1: 1 } as T;
            if (expiredBlocklisted.has(jti)) return null as T; // expires_at > now() filters it out
            return null as T;
          }

          if (sql.includes('LEFT JOIN usuarios_empresas ue')) {
            const empresaId = Number(statement.params[0]);
            const userId = Number(statement.params[1]);
            const usuario = usuarios.find((u) => u.id === userId);
            if (!usuario || !usuario.active) return null as T;
            const link = memberships.find((m) => m.usuarioId === userId && m.empresaId === empresaId);
            return { id: usuario.id, perfil: usuario.perfil, role: link?.role ?? null } as T;
          }

          if (sql.includes('FROM usuarios WHERE id')) {
            const userId = Number(statement.params[0]);
            const usuario = usuarios.find((u) => u.id === userId);
            if (!usuario || !usuario.active) return null as T;
            return { id: usuario.id, perfil: usuario.perfil, role: null } as T;
          }

          return null as T;
        },
        async run() {
          return { success: true, meta: { changes: 0 } };
        },
        async all<T>() {
          return { results: [] } as T;
        },
      };
      return statement;
    },
  } as unknown as D1Database;
}

async function makeToken(sub: number, empresaId: number, role = 'USUARIO') {
  return generateJWT({ sub, email: `user${sub}@test.invalid`, role, empresa_id: empresaId }, JWT_SECRET, 3600);
}

function buildApp(db: D1Database, guard: 'auth' | 'optionalAuth') {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();
  app.onError(errorHandler);
  const middleware = guard === 'auth' ? auth() : optionalAuth();
  app.get('/probe', middleware, (c) =>
    c.json({
      success: true,
      userId: c.get('userId') ?? null,
      userRole: c.get('userRole') ?? null,
    }),
  );
  return (init: RequestInit = {}) =>
    app.request(
      '/probe',
      init,
      { DB: db, JWT_SECRET, ENVIRONMENT: 'production' } as unknown as Env,
    );
}

beforeEach(() => {
  resetSchemaCache();
});

describe('auth() — blocklist fail-closed', () => {
  it('rejects a token whose jti is in the blocklist with 401 TOKEN_REVOKED', async () => {
    const usuarios: UsuarioRow[] = [{ id: 7, perfil: 'ALUNO', active: 1 }];
    const memberships = [{ usuarioId: 7, empresaId: 999002, role: 'viewer' }];
    const { token, jti } = await makeToken(7, 999002);

    const response = await buildApp(createDb({ usuarios, memberships, blocklisted: [jti] }), 'auth')({
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = (await response.json()) as { code?: string };

    expect(response.status).toBe(401);
    expect(payload.code).toBe('TOKEN_REVOKED');
  });

  it('allows a token whose jti is only in the (expired) blocklist window', async () => {
    const usuarios: UsuarioRow[] = [{ id: 7, perfil: 'ALUNO', active: 1 }];
    const memberships = [{ usuarioId: 7, empresaId: 999002, role: 'viewer' }];
    const { token, jti } = await makeToken(7, 999002);

    const response = await buildApp(
      createDb({ usuarios, memberships, expiredBlocklisted: [jti] }),
      'auth',
    )({ headers: { Authorization: `Bearer ${token}` } });

    expect(response.status).toBe(200);
  });

  it('fails closed (503) when the blocklist read itself errors, instead of treating it as not-blocked', async () => {
    const usuarios: UsuarioRow[] = [{ id: 7, perfil: 'ALUNO', active: 1 }];
    const memberships = [{ usuarioId: 7, empresaId: 999002, role: 'viewer' }];
    const { token } = await makeToken(7, 999002);

    const response = await buildApp(
      createDb({ usuarios, memberships, blocklistReadThrows: true }),
      'auth',
    )({ headers: { Authorization: `Bearer ${token}` } });
    const payload = (await response.json()) as { code?: string };

    expect(response.status).toBe(503);
    expect(payload.code).toBe('AUTH_REVOCATION_CHECK_UNAVAILABLE');
  });
});

describe('auth() — usuário inativo e membership', () => {
  it('rejects a valid JWT for a deactivated user with 401 USER_INACTIVE', async () => {
    const usuarios: UsuarioRow[] = [{ id: 5, perfil: 'ADMIN', active: 0 }];
    const { token } = await makeToken(5, 999002);

    const response = await buildApp(createDb({ usuarios }), 'auth')({
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = (await response.json()) as { code?: string };

    expect(response.status).toBe(401);
    expect(payload.code).toBe('USER_INACTIVE');
  });

  it('rejects a valid JWT whose tenant membership no longer exists, without falling back to the JWT role', async () => {
    const usuarios: UsuarioRow[] = [{ id: 7, perfil: 'ALUNO', active: 1 }];
    const { token } = await makeToken(7, 999002, 'ADMIN'); // JWT claims a stale/forged role

    const response = await buildApp(createDb({ usuarios, memberships: [] }), 'auth')({
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = (await response.json()) as { code?: string };

    expect(response.status).toBe(401);
    expect(payload.code).toBe('TENANT_MEMBERSHIP_INVALID');
  });

  it('allows the canonical viewer smoke account to authenticate normally', async () => {
    const usuarios: UsuarioRow[] = [{ id: 7, perfil: 'ALUNO', active: 1 }];
    const memberships = [{ usuarioId: 7, empresaId: 999002, role: 'viewer' }];
    const { token } = await makeToken(7, 999002, 'USUARIO');

    const response = await buildApp(createDb({ usuarios, memberships }), 'auth')({
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = (await response.json()) as { userId?: number | string; userRole?: string };

    expect(response.status).toBe(200);
    expect(Number(payload.userId)).toBe(7);
    expect(payload.userRole).toBe('USUARIO');
  });
});

describe('optionalAuth() — revoked token never authenticates silently', () => {
  it('proceeds without identity (never blocks) when the token jti is blocklisted', async () => {
    const usuarios: UsuarioRow[] = [{ id: 7, perfil: 'ALUNO', active: 1 }];
    const { token, jti } = await makeToken(7, 999002);

    const response = await buildApp(createDb({ usuarios, blocklisted: [jti] }), 'optionalAuth')({
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = (await response.json()) as { userId?: number | null };

    expect(response.status).toBe(200);
    expect(payload.userId).toBeNull();
  });

  it('proceeds without identity (never blocks) when the blocklist read errors, instead of authenticating silently', async () => {
    const usuarios: UsuarioRow[] = [{ id: 7, perfil: 'ALUNO', active: 1 }];
    const { token } = await makeToken(7, 999002);

    const response = await buildApp(
      createDb({ usuarios, blocklistReadThrows: true }),
      'optionalAuth',
    )({ headers: { Authorization: `Bearer ${token}` } });
    const payload = (await response.json()) as { userId?: number | null };

    expect(response.status).toBe(200);
    expect(payload.userId).toBeNull();
  });

  it('proceeds without identity when no Authorization header is sent (existing optional behavior preserved)', async () => {
    const response = await buildApp(createDb(), 'optionalAuth')({});
    const payload = (await response.json()) as { userId?: number | null };

    expect(response.status).toBe(200);
    expect(payload.userId).toBeNull();
  });
});

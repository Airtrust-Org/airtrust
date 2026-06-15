import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';
import { resetSchemaCache } from '../../utils/db-schema';

vi.mock('../../middleware/rate-limit', () => ({
  rateLimiter:
    () =>
    async (_c: any, next: () => Promise<void>) => {
      await next();
    },
}));

vi.mock('../../utils/security', () => ({
  generateJWT: vi.fn(async (payload: Record<string, unknown>) => ({
    token: `token-for-${String(payload.role || 'unknown').toLowerCase()}`,
    jti: 'test-jti',
  })),
  verifyPassword: vi.fn(async () => false),
  hashPassword: vi.fn(async () => 'hashed-password'),
  generateRefreshToken: vi.fn(() => 'refresh-token-dev'),
  getRefreshTokenExpiry: vi.fn(() => '2099-01-01T00:00:00.000Z'),
}));

import { authRoutes } from '../../routes/auth';
import { errorHandler } from '../../middleware/error-handler';

type MockUser = {
  id: number;
  email: string;
  nome: string;
  perfil: string;
  password_hash: string;
  funcionario_id?: number | null;
  active?: number;
};

type MockLink = {
  usuario_id: number;
  empresa_id: number;
  role: string;
  is_primary: number;
};

type LoginResponse = {
  success: boolean;
  data: {
    accessToken: string;
    user: {
      email: string;
      role: string;
    };
  };
};

function createAuthApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.onError(errorHandler);
  app.route('/api/auth', authRoutes);
  return app;
}

function createDb(initialUsers: MockUser[] = [], initialLinks: MockLink[] = []) {
  const users: MockUser[] = initialUsers.map((user) => ({ ...user }));
  const links: MockLink[] = initialLinks.map((link) => ({ ...link }));
  let nextUserId = users.reduce((maxId, user) => Math.max(maxId, user.id), 0) + 1;

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

          if (sql.includes('SELECT id, email, nome, perfil, password_hash') && sql.includes('WHERE email = ?')) {
            const email = String(statement.params[0] || '').toLowerCase();
            const ignoreActiveFilter =
              sql.includes('LIMIT 1') && !sql.includes('deleted_at IS NULL') && !sql.includes('active = 1');
            const user = users.find((item) =>
              ignoreActiveFilter
                ? item.email === email
                : item.email === email && item.active !== 0,
            );
            return (user || null) as T;
          }

          if (sql.includes('SELECT id FROM empresas WHERE deleted_at IS NULL AND ativo = 1')) {
            return { id: 1 } as T;
          }

          if (sql.includes('SELECT ue.empresa_id') && sql.includes('FROM usuarios_empresas ue')) {
            const userId = Number(statement.params[0]);
            const link = links.find((item) => item.usuario_id === userId && item.is_primary === 1);
            return (link ? { empresa_id: link.empresa_id } : null) as T;
          }

          if (sql.includes('SELECT ue.role') && sql.includes('FROM usuarios_empresas ue')) {
            const userId = Number(statement.params[0]);
            const empresaId = Number(statement.params[1]);
            const link = links.find(
              (item) => item.usuario_id === userId && item.empresa_id === empresaId,
            );
            return (link ? { role: link.role } : null) as T;
          }

          if (sql.includes('SELECT funcionario_id FROM usuarios WHERE id = ?')) {
            const userId = Number(statement.params[0]);
            const user = users.find((item) => item.id === userId);
            return (user ? { funcionario_id: user.funcionario_id ?? null } : null) as T;
          }

          return null as T;
        },
        async all<T>() {
          if (sql.includes("PRAGMA table_info('usuarios')")) {
            return {
              results: [{ name: 'active' }],
            } as T;
          }

          if (sql.includes('SELECT permissao, tipo FROM usuario_permissoes')) {
            return {
              results: [],
            } as T;
          }

          return { results: [] } as T;
        },
        async run() {
          if (
            sql.includes('INSERT OR IGNORE INTO usuarios (email, password_hash, nome, perfil, deleted_at,')
          ) {
            const [emailRaw, passwordHashRaw, nomeRaw, perfilRaw] = statement.params;
            const email = String(emailRaw || '').toLowerCase();
            const exists = users.some((item) => item.email === email);

            if (!exists) {
              users.push({
                id: nextUserId++,
                email,
                password_hash: String(passwordHashRaw || ''),
                nome: String(nomeRaw || ''),
                perfil: String(perfilRaw || ''),
                active: 1,
              });
            }

            return { meta: { changes: exists ? 0 : 1 } };
          }

          if (
            sql.includes('UPDATE usuarios') &&
            sql.includes('SET password_hash = ?, nome = ?, perfil = ?, deleted_at = NULL')
          ) {
            const [passwordHashRaw, nomeRaw, perfilRaw, userIdRaw] = statement.params;
            const userId = Number(userIdRaw);
            const user = users.find((item) => item.id === userId);
            if (user) {
              user.password_hash = String(passwordHashRaw || '');
              user.nome = String(nomeRaw || '');
              user.perfil = String(perfilRaw || '');
              user.active = 1;
            }
            return { meta: { changes: user ? 1 : 0 } };
          }

          if (sql.includes('INSERT OR IGNORE INTO usuarios_empresas')) {
            const [usuarioIdRaw, empresaIdRaw, roleRaw] = statement.params;
            const usuario_id = Number(usuarioIdRaw);
            const empresa_id = Number(empresaIdRaw);
            const role = String(roleRaw || 'member');
            const exists = links.some(
              (item) => item.usuario_id === usuario_id && item.empresa_id === empresa_id,
            );

            if (!exists) {
              links.push({
                usuario_id,
                empresa_id,
                role,
                is_primary: 1,
              });
            }

            return { meta: { changes: exists ? 0 : 1 } };
          }

          if (sql.includes('UPDATE usuarios_empresas') && sql.includes('SET role = ?')) {
            const [roleRaw, empresaIdRaw, usuarioIdRaw, targetEmpresaIdRaw] = statement.params;
            const role = String(roleRaw || 'member');
            const empresaId = Number(empresaIdRaw);
            const usuarioId = Number(usuarioIdRaw);
            const targetEmpresaId = Number(targetEmpresaIdRaw);
            const link = links.find(
              (item) => item.usuario_id === usuarioId && item.empresa_id === targetEmpresaId,
            );

            if (link) {
              link.role = role;
              if (link.empresa_id === empresaId) {
                link.is_primary = 1;
              }
            }

            return { meta: { changes: link ? 1 : 0 } };
          }

          if (sql.includes('INSERT INTO refresh_tokens')) {
            return { meta: { changes: 1 } };
          }

          return { meta: { changes: 0 } };
        },
      };

      return statement;
    },
  } as unknown as D1Database;

  return { db, users, links };
}

async function loginWithBypass(
  email: string,
  initialUsers: MockUser[] = [],
  initialLinks: MockLink[] = [],
) {
  const { db, users, links } = createDb(initialUsers, initialLinks);
  const app = createAuthApp();

  const response = await app.fetch(
    new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        senha: 'qualquer-senha-dev',
      }),
    }),
    {
      DB: db,
      JWT_SECRET: 'test-secret',
      ENVIRONMENT: 'development',
      ENABLE_DEV_AUTH_BYPASS: 'true',
    } as unknown as Env,
    {} as ExecutionContext,
  );

  return { response, users, links };
}

describe('POST /api/auth/login dev bypass', () => {
  beforeEach(() => {
    resetSchemaCache();
  });

  it.each([
    ['admin@airtrust.com', 'ADMINISTRADOR', 'admin'],
    ['manager@airtrust.com', 'GESTOR', 'manager'],
    ['test.instrutor@airtrust.com', 'INSTRUTOR', 'instructor'],
    ['test.aluno@airtrust.com', 'ALUNO', 'student'],
  ])(
    'auto-provisiona %s com o perfil %s no ambiente local',
    async (email, expectedRole, expectedEmpresaRole) => {
      const { response, users, links } = await loginWithBypass(email);
      const json = (await response.json()) as LoginResponse;

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.user.email).toBe(email);
      expect(json.data.user.role).toBe(expectedRole);
      expect(json.data.accessToken).toBe(`token-for-${expectedRole.toLowerCase()}`);
      expect(users).toContainEqual(
        expect.objectContaining({
          email,
          perfil:
            expectedRole === 'ADMINISTRADOR'
              ? 'ADMIN'
              : expectedRole === 'GESTOR'
                ? 'GESTOR'
                : 'USUARIO',
          password_hash: 'dev-local-bypass',
        }),
      );
      expect(links).toContainEqual(
        expect.objectContaining({
          role: expectedEmpresaRole,
          is_primary: 1,
        }),
      );
    },
  );

  it('bloqueia login sem senha valida fora do ambiente dev (producao)', async () => {
    const { db } = createDb();
    const app = createAuthApp();

    const response = await app.fetch(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@airtrust.com', senha: 'qualquer-senha' }),
      }),
      {
        DB: db,
        JWT_SECRET: 'test-secret',
        ENVIRONMENT: 'production',
        ENABLE_DEV_AUTH_BYPASS: 'false',
      } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(401);
    const json = (await response.json()) as { success: boolean };
    expect(json.success).toBe(false);
  });

  it('bloqueia bypass quando ENABLE_DEV_AUTH_BYPASS ausente mesmo em ENVIRONMENT=development', async () => {
    const { db } = createDb();
    const app = createAuthApp();

    const response = await app.fetch(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@airtrust.com', senha: 'qualquer-senha' }),
      }),
      {
        DB: db,
        JWT_SECRET: 'test-secret',
        ENVIRONMENT: 'development',
        ENABLE_DEV_AUTH_BYPASS: 'false',
      } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(401);
  });

  it('normaliza usuario legado de perfil rapido para bypass local deterministico', async () => {
    const { response, users, links } = await loginWithBypass(
      'test.aluno@airtrust.com',
      [
        {
          id: 99,
          email: 'test.aluno@airtrust.com',
          nome: 'Aluno Antigo',
          perfil: 'USUARIO',
          password_hash: 'hash-legado',
          active: 0,
        },
      ],
      [{ usuario_id: 99, empresa_id: 1, role: 'member', is_primary: 1 }],
    );
    const json = (await response.json()) as LoginResponse;

    expect(response.status).toBe(200);
    expect(json.data.user.role).toBe('ALUNO');
    expect(users).toContainEqual(
      expect.objectContaining({
        id: 99,
        email: 'test.aluno@airtrust.com',
        perfil: 'USUARIO',
        password_hash: 'dev-local-bypass',
        active: 1,
      }),
    );
    expect(links).toContainEqual(
      expect.objectContaining({
        usuario_id: 99,
        empresa_id: 1,
        role: 'student',
        is_primary: 1,
      }),
    );
  });
});

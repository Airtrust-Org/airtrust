import { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';
import { auth, optionalAuth } from '../../middleware/auth';
import { errorHandler } from '../../middleware/error-handler';
import { generateJWT } from '../../utils/security';
import {
  SESSION_ROLE_COOKIE,
  resolveAvailableSessionRoles,
} from '../../services/auth-session-roles';
import type { Env, Variables } from '../../types';
import { resetSchemaCache } from '../../utils/db-schema';

const JWT_SECRET = 'test-secret-256-bit-key-for-testing-only-not-production';

type Fixture = {
  userId: number;
  empresaId: number;
  perfil: string;
  membershipRole: string | null;
  funcionarioId?: number | null;
  funcionarioEmpresaId?: number | null;
  instrutor?: boolean;
  aluno?: boolean;
  active?: boolean;
  sessionRoleQueryThrows?: boolean;
};

function createDb(fx: Fixture) {
  const active = fx.active ?? true;
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
          if (sql.includes('FROM token_blocklist')) return null as T;

          // resolveAvailableSessionRoles main lookup
          if (sql.includes('LEFT JOIN funcionarios f')) {
            if (fx.sessionRoleQueryThrows) {
              throw new Error('simulated D1 outage reading session roles');
            }
            if (!active) return null as T;
            return {
              perfil: fx.perfil,
              funcionario_id: fx.funcionarioId ?? null,
              empresa_role: fx.membershipRole,
              funcionario_empresa_id: fx.funcionarioEmpresaId ?? null,
            } as T;
          }

          if (sql.includes('FROM instrutores_simulador')) {
            return fx.instrutor ? ({ found: 1 } as T) : (null as T);
          }
          if (sql.includes('FROM lms_matriculas')) {
            return fx.aluno ? ({ found: 1 } as T) : (null as T);
          }

          // resolveUserSecurityState (canonical auth.ts)
          if (sql.includes('LEFT JOIN usuarios_empresas ue')) {
            if (!active) return null as T;
            return {
              id: fx.userId,
              perfil: fx.perfil,
              role: fx.membershipRole,
            } as T;
          }
          if (sql.includes('FROM usuarios WHERE id')) {
            if (!active) return null as T;
            return { id: fx.userId, perfil: fx.perfil, role: null } as T;
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
  return generateJWT(
    { sub, email: `user${sub}@test.invalid`, role, empresa_id: empresaId },
    JWT_SECRET,
    3600,
  );
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
    app.request('/probe', init, {
      DB: db,
      JWT_SECRET,
      ENVIRONMENT: 'production',
    } as unknown as Env);
}

function withCookie(role: string): RequestInit['headers'] {
  return { Cookie: `${SESSION_ROLE_COOKIE}=${encodeURIComponent(role)}` };
}

beforeEach(() => {
  resetSchemaCache();
});

describe('resolveAvailableSessionRoles — backend é a fonte de verdade', () => {
  const base = {
    userId: 10,
    empresaId: 500,
    funcionarioId: 77,
    funcionarioEmpresaId: 500,
  };

  it('GESTOR único: retorna apenas o perfil canônico', async () => {
    const db = createDb({ ...base, perfil: 'gestor', membershipRole: 'manager' });
    expect(await resolveAvailableSessionRoles(db, 10, 500)).toEqual(['GESTOR']);
  });

  it('INSTRUTOR + perfil base: INSTRUTOR aparece como opção selecionável', async () => {
    const db = createDb({
      ...base,
      perfil: 'student',
      membershipRole: 'viewer',
      instrutor: true,
    });
    const roles = await resolveAvailableSessionRoles(db, 10, 500);
    expect(roles).toContain('INSTRUTOR');
    expect(roles).toEqual(['INSTRUTOR', 'USUARIO']);
  });

  it('GESTOR + INSTRUTOR: retorna as duas opções na ordem canônica', async () => {
    const db = createDb({
      ...base,
      perfil: 'gestor',
      membershipRole: 'manager',
      instrutor: true,
    });
    expect(await resolveAvailableSessionRoles(db, 10, 500)).toEqual(['GESTOR', 'INSTRUTOR']);
  });

  it('GESTOR + ALUNO: retorna as duas opções', async () => {
    const db = createDb({
      ...base,
      perfil: 'gestor',
      membershipRole: 'manager',
      aluno: true,
    });
    expect(await resolveAvailableSessionRoles(db, 10, 500)).toEqual(['GESTOR', 'ALUNO']);
  });

  it('GESTOR + INSTRUTOR + ALUNO: retorna as três opções', async () => {
    const db = createDb({
      ...base,
      perfil: 'gestor',
      membershipRole: 'manager',
      instrutor: true,
      aluno: true,
    });
    expect(await resolveAvailableSessionRoles(db, 10, 500)).toEqual([
      'GESTOR',
      'INSTRUTOR',
      'ALUNO',
    ]);
  });

  it('ignora vínculos de instrutor/aluno quando o funcionário pertence a outro tenant', async () => {
    const db = createDb({
      userId: 10,
      empresaId: 500,
      perfil: 'gestor',
      membershipRole: 'manager',
      funcionarioId: 77,
      funcionarioEmpresaId: 999, // outro tenant
      instrutor: true,
      aluno: true,
    });
    expect(await resolveAvailableSessionRoles(db, 10, 500)).toEqual(['GESTOR']);
  });
});

describe('auth() — perfil ativo de sessão (multi-perfil)', () => {
  it('sem cookie de seleção: usa a role canônica sem alteração', async () => {
    const db = createDb({
      userId: 7,
      empresaId: 500,
      perfil: 'gestor',
      membershipRole: 'manager',
    });
    const { token } = await makeToken(7, 500, 'GESTOR');
    const res = await buildApp(db, 'auth')({ headers: { Authorization: `Bearer ${token}` } });
    const body = (await res.json()) as { userRole?: string };
    expect(res.status).toBe(200);
    expect(body.userRole).toBe('GESTOR');
  });

  it('seleciona INSTRUTOR com vínculo real: userRole efetivo vira INSTRUTOR', async () => {
    const db = createDb({
      userId: 7,
      empresaId: 500,
      perfil: 'gestor',
      membershipRole: 'manager',
      funcionarioId: 77,
      funcionarioEmpresaId: 500,
      instrutor: true,
    });
    const { token } = await makeToken(7, 500, 'GESTOR');
    const res = await buildApp(db, 'auth')({
      headers: { Authorization: `Bearer ${token}`, ...withCookie('INSTRUTOR') },
    });
    const body = (await res.json()) as { userRole?: string };
    expect(res.status).toBe(200);
    expect(body.userRole).toBe('INSTRUTOR');
  });

  it('seleciona ALUNO com matrícula LMS real: userRole efetivo vira ALUNO', async () => {
    const db = createDb({
      userId: 7,
      empresaId: 500,
      perfil: 'gestor',
      membershipRole: 'manager',
      funcionarioId: 77,
      funcionarioEmpresaId: 500,
      aluno: true,
    });
    const { token } = await makeToken(7, 500, 'GESTOR');
    const res = await buildApp(db, 'auth')({
      headers: { Authorization: `Bearer ${token}`, ...withCookie('ALUNO') },
    });
    const body = (await res.json()) as { userRole?: string };
    expect(res.status).toBe(200);
    expect(body.userRole).toBe('ALUNO');
  });

  it('seleciona GESTOR: userRole efetivo permanece GESTOR (role canônica)', async () => {
    const db = createDb({
      userId: 7,
      empresaId: 500,
      perfil: 'gestor',
      membershipRole: 'manager',
      funcionarioId: 77,
      funcionarioEmpresaId: 500,
      instrutor: true,
    });
    const { token } = await makeToken(7, 500, 'GESTOR');
    const res = await buildApp(db, 'auth')({
      headers: { Authorization: `Bearer ${token}`, ...withCookie('GESTOR') },
    });
    const body = (await res.json()) as { userRole?: string };
    expect(res.status).toBe(200);
    expect(body.userRole).toBe('GESTOR');
  });

  it('solicita perfil sem vínculo comprovado: 401 SESSION_ROLE_INVALID, nunca elevação', async () => {
    const db = createDb({
      userId: 7,
      empresaId: 500,
      perfil: 'student',
      membershipRole: 'viewer',
      funcionarioId: 77,
      funcionarioEmpresaId: 500,
      // sem instrutor, sem aluno
    });
    const { token } = await makeToken(7, 500, 'USUARIO');
    const res = await buildApp(db, 'auth')({
      headers: { Authorization: `Bearer ${token}`, ...withCookie('GESTOR') },
    });
    const body = (await res.json()) as { code?: string };
    expect(res.status).toBe(401);
    expect(body.code).toBe('SESSION_ROLE_INVALID');
  });

  it('falha de infraestrutura ao validar o perfil: fail-closed 503', async () => {
    const db = createDb({
      userId: 7,
      empresaId: 500,
      perfil: 'gestor',
      membershipRole: 'manager',
      sessionRoleQueryThrows: true,
    });
    const { token } = await makeToken(7, 500, 'GESTOR');
    const res = await buildApp(db, 'auth')({
      headers: { Authorization: `Bearer ${token}`, ...withCookie('INSTRUTOR') },
    });
    const body = (await res.json()) as { code?: string };
    expect(res.status).toBe(503);
    expect(body.code).toBe('AUTH_SESSION_ROLE_CHECK_UNAVAILABLE');
  });

  it('membership removido: rejeita mesmo com cookie de perfil selecionado', async () => {
    const db = createDb({
      userId: 7,
      empresaId: 500,
      perfil: 'gestor',
      membershipRole: null, // sem vínculo com o tenant
    });
    const { token } = await makeToken(7, 500, 'GESTOR');
    const res = await buildApp(db, 'auth')({
      headers: { Authorization: `Bearer ${token}`, ...withCookie('INSTRUTOR') },
    });
    const body = (await res.json()) as { code?: string };
    expect(res.status).toBe(401);
    expect(body.code).toBe('TENANT_MEMBERSHIP_INVALID');
  });
});

describe('optionalAuth() — perfil ativo de sessão nunca bloqueia', () => {
  it('cookie inválido: mantém a role canônica, sem erro', async () => {
    const db = createDb({
      userId: 7,
      empresaId: 500,
      perfil: 'gestor',
      membershipRole: 'manager',
      funcionarioId: 77,
      funcionarioEmpresaId: 500,
    });
    const { token } = await makeToken(7, 500, 'GESTOR');
    const res = await buildApp(db, 'optionalAuth')({
      headers: { Authorization: `Bearer ${token}`, ...withCookie('INSTRUTOR') },
    });
    const body = (await res.json()) as { userRole?: string; userId?: number | null };
    expect(res.status).toBe(200);
    expect(Number(body.userId)).toBe(7);
    expect(body.userRole).toBe('GESTOR');
  });

  it('cookie válido: aplica o perfil selecionado', async () => {
    const db = createDb({
      userId: 7,
      empresaId: 500,
      perfil: 'gestor',
      membershipRole: 'manager',
      funcionarioId: 77,
      funcionarioEmpresaId: 500,
      instrutor: true,
    });
    const { token } = await makeToken(7, 500, 'GESTOR');
    const res = await buildApp(db, 'optionalAuth')({
      headers: { Authorization: `Bearer ${token}`, ...withCookie('INSTRUTOR') },
    });
    const body = (await res.json()) as { userRole?: string };
    expect(res.status).toBe(200);
    expect(body.userRole).toBe('INSTRUTOR');
  });
});

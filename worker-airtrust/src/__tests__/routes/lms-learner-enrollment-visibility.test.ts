/**
 * Matrículas administrativas devem aparecer ao aluno vinculado.
 * Regressões: JWT de vínculo antigo, vínculo ausente/cross-tenant e corte de 50.
 * Fixture sintética, sem dados pessoais nem acesso a D1 remoto.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';
import { errorHandler } from '../../middleware/error-handler';

const state = vi.hoisted(() => ({
  tokenFuncionarioId: 999,
  dbFuncionarioId: 77 as number | null,
  empresaId: 6,
  queries: [] as Array<{ sql: string; binds: unknown[] }>,
}));

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: { set: (key: string, value: unknown) => void }, next: () => Promise<void>) => {
    c.set('userId', 42);
    c.set('funcionarioId', state.tokenFuncionarioId);
    c.set('userRole', 'student');
    c.set('empresaId', state.empresaId);
    await next();
  },
}));
vi.mock('../../middleware/rbac', () => ({
  requirePermission: () => async (_c: unknown, next: () => Promise<void>) => next(),
  hasRole: () => false,
  requireRole: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));
vi.mock('../../routes/escalas-shared', () => ({ getEmpresaIdSafe: () => state.empresaId }));

import lmsMatriculasRoutes from '../../routes/lms-matriculas';

const syntheticRows = Array.from({ length: 60 }, (_, index) => ({
  id: index === 0 ? 859 : 1000 + index,
  curso_id: index === 0 ? 67 : 100 + index,
  funcionario_id: 77,
  status: 'NAO_INICIADO',
  progresso_pct: 0,
  titulo: 'Treinamento sintético',
  qualification_link_state: 'LINK_PENDING',
  data_vencimento_qualificacao: null,
}));

function makeApp() {
  const db = {
    prepare: vi.fn((sql: string) => ({
      bind: (...binds: unknown[]) => {
        state.queries.push({ sql, binds });
        return {
          first: async () => {
            if (sql.includes('SELECT f.id AS funcionario_id')) {
              return state.dbFuncionarioId == null ? null : { funcionario_id: state.dbFuncionarioId };
            }
            if (sql.includes('COUNT(*)')) return { n: 60 };
            throw new Error('Unexpected first query');
          },
          all: async () => ({ results: syntheticRows }),
        };
      },
    })),
  } as unknown as D1Database;
  const app = new Hono<{ Bindings: Env }>();
  app.onError(errorHandler);
  app.route('/', lmsMatriculasRoutes);
  return { app, db };
}

async function get(app: ReturnType<typeof makeApp>['app'], path: string, db: D1Database) {
  return app.fetch(new Request('http://localhost' + path), { DB: db, ENVIRONMENT: 'test' } as unknown as Env, {} as ExecutionContext);
}

describe('LMS learner enrollment visibility', () => {
  beforeEach(() => {
    state.dbFuncionarioId = 77;
    state.tokenFuncionarioId = 999;
    state.empresaId = 6;
    state.queries = [];
    vi.clearAllMocks();
  });

  it('GET /minhas-ead uses the current DB link rather than a stale signed JWT and returns all 60 enrollments', async () => {
    const { app, db } = makeApp();
    const response = await get(app, '/minhas-ead', db);
    expect(response.status).toBe(200);
    const body = await response.json() as { data: Array<{ id: number; curso_id: number }> };
    expect(body.data).toHaveLength(60);
    expect(body.data[0]).toMatchObject({ id: 859, curso_id: 67 });
    expect(state.queries[0].binds).toEqual([6, 42]);
    const enrollment = state.queries.find((query) => query.sql.includes('FROM lms_matriculas m'));
    expect(enrollment?.binds).toEqual([77, 6]);
    expect(enrollment?.sql).not.toContain('LIMIT 50');
  });

  it('GET /minhas also uses the persisted tenant-scoped employee identity', async () => {
    const { app, db } = makeApp();
    const response = await get(app, '/minhas', db);
    expect(response.status).toBe(200);
    const body = await response.json() as { pagination: { total: number } };
    expect(body.pagination.total).toBe(60);
    const ownQueries = state.queries.filter(q => q.sql.includes('FROM lms_matriculas m'));
    expect(ownQueries.length).toBeGreaterThanOrEqual(2);
    expect(ownQueries[0].binds).toEqual([77, 6]);
  });

  it.each(['/minhas', '/minhas-ead'])('returns an explicit conflict instead of a false empty success when link is missing: %s', async (path) => {
    state.dbFuncionarioId = null;
    const { app, db } = makeApp();
    const response = await get(app, path, db);
    expect(response.status).toBe(409);
    const body = await response.json() as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(body.error).toContain('vínculo');
    expect(state.queries.some(q => q.sql.includes('FROM lms_matriculas m'))).toBe(false);
  });

  it('scopes the identity lookup to the authenticated tenant, never the token employee ID', async () => {
    state.dbFuncionarioId = null;
    const { app, db } = makeApp();
    await get(app, '/minhas-ead', db);
    const lookup = state.queries[0];
    expect(lookup.sql).toContain('f.empresa_id = ?');
    expect(lookup.sql).toContain('f.deleted_at IS NULL');
    expect(lookup.sql).toContain('u.deleted_at IS NULL');
    expect(lookup.binds).toEqual([6, 42]);
  });
});

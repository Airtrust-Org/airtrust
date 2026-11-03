import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';

const { state, sectorAccessMock } = vi.hoisted(() => ({
  state: { role: 'manager' },
  sectorAccessMock: vi.fn(),
}));

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('userId', 11);
    c.set('userRole', state.role);
    c.set('empresaId', 7);
    c.set('funcionarioId', 70);
    await next();
  },
}));
vi.mock('../../middleware/tenant', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../middleware/tenant')>()),
  getEmpresaId: (c: any) => Number(c.get('empresaId') || 0),
}));
vi.mock('../../middleware/rbac', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../middleware/rbac')>()),
  requirePermission: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));

vi.mock('../../middleware/frms-access', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../middleware/frms-access')>()),
  canSeeFrmsTeamScopeForContext: async () => state.role !== 'tripulante',
}));
vi.mock('../../middleware/employee-sector-access', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../middleware/employee-sector-access')>()),
  getEmployeeSectorAccess: (...args: unknown[]) => sectorAccessMock(...args),
}));

import frmsRoutes from '../../routes/frms-fadiga-checkin';

type RecordedSql = { sql: string; binds: unknown[] };

function createDb() {
  const statements: RecordedSql[] = [];
  const db = {
    prepare: vi.fn((sql: string) => {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      let binds: unknown[] = [];
      const stmt = {
        bind(...values: unknown[]) {
          binds = values;
          return stmt;
        },
        async first() {
          statements.push({ sql: normalized, binds });
          if (normalized.includes('SELECT f.id FROM funcionarios f')) return null;
          if (normalized.includes('FROM frms_fadiga_checkin') && normalized.includes('WHERE id = ?')) {
            return { id: 'checkin-other-sector', funcionario_id: 99 };
          }
          if (normalized.includes('FROM funcionarios') && normalized.includes('WHERE id = ?')) {
            return { id: 70 };
          }
          if (normalized.includes('COUNT(*) AS total')) return { total: 0 };
          if (normalized.includes('AVG(kss_score)')) return { total_checkins: 0 };
          throw new Error('Unexpected first SQL: ' + normalized);
        },
        async all() {
          statements.push({ sql: normalized, binds });
          if (normalized.includes('SELECT ch.*')) return { results: [] };
          throw new Error('Unexpected all SQL: ' + normalized);
        },
      };
      return stmt;
    }),
  } as unknown as D1Database;
  return { db, statements };
}

const historyUrl =
  'http://localhost/fadiga-checkin/historico?data_inicio=2026-10-01&data_fim=2026-10-31&funcionario_id=99';

describe('FRMS — histórico de fadiga com RBAC setorial', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.role = 'manager';
    sectorAccessMock.mockResolvedValue({
      mode: 'restricted', setorIds: [3], funcionarioId: null,
    });
  });

  it('gestor só consulta o próprio setor, inclusive na contagem e nas médias', async () => {
    const { db, statements } = createDb();
    const response = await frmsRoutes.fetch(new Request(historyUrl), { DB: db } as Env, {} as ExecutionContext);
    expect(response.status).toBe(200);
    const queries = statements.filter((query) => query.sql.includes('frms_fadiga_checkin ch'));
    expect(queries).toHaveLength(3);
    for (const query of queries) {
      expect(query.sql).toContain('f.empresa_id = ch.empresa_id');
      expect(query.sql).toContain('f.setor_id IN (?)');
      expect(query.sql).toContain('ch.funcionario_id = ?');
      expect(query.binds.slice(0, 5)).toEqual([7, '2026-10-01', '2026-10-31', 3, 99]);
    }
    expect(sectorAccessMock).toHaveBeenCalledOnce();
  });

  it('gestor sem setor associado falha fechado em todas as três consultas', async () => {
    sectorAccessMock.mockResolvedValue({
      mode: 'restricted', setorIds: [], funcionarioId: null,
    });
    const { db, statements } = createDb();
    const response = await frmsRoutes.fetch(new Request(historyUrl), { DB: db } as Env, {} as ExecutionContext);
    expect(response.status).toBe(200);
    const queries = statements.filter((query) => query.sql.includes('frms_fadiga_checkin ch'));
    expect(queries).toHaveLength(3);
    expect(queries.every((query) => query.sql.includes('AND 1 = 0'))).toBe(true);
  });

  it('tripulante não consulta o FRAT pré-preenchido de outro funcionário', async () => {
    state.role = 'tripulante';
    sectorAccessMock.mockResolvedValue({ mode: 'self', setorIds: [], funcionarioId: 70 });
    const { db, statements } = createDb();
    const response = await frmsRoutes.fetch(
      new Request('http://localhost/fadiga-checkin/frat-prefill?funcionario_id=99&date=2026-10-03'),
      { DB: db } as Env, {} as ExecutionContext,
    );
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: 'FRMS_INDIVIDUAL_SCOPE_DENIED' });
    expect(statements.every((q) => !q.sql.includes('FROM frms_fadiga_checkin'))).toBe(true);
  });

  it('gestor de outro setor não consulta FRAT nem responde ao check-in', async () => {
    const { db, statements } = createDb();
    const prefill = await frmsRoutes.fetch(
      new Request('http://localhost/fadiga-checkin/frat-prefill?funcionario_id=99&date=2026-10-03'),
      { DB: db } as Env, {} as ExecutionContext,
    );
    expect(prefill.status).toBe(403);

    const answer = await frmsRoutes.fetch(
      new Request('http://localhost/fadiga-checkin/checkin-other-sector/resposta-gestor', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resposta: 'Revisar condições operacionais' }),
      }),
      { DB: db } as Env, {} as ExecutionContext,
    );
    expect(answer.status).toBe(403);
    await expect(answer.json()).resolves.toMatchObject({ code: 'FRMS_INDIVIDUAL_SCOPE_DENIED' });
    const scopeQueries = statements.filter((q) => q.sql.includes('SELECT f.id FROM funcionarios f'));
    expect(scopeQueries).toHaveLength(2);
    expect(scopeQueries.every((q) => q.sql.includes('f.setor_id IN (?)'))).toBe(true);
    expect(scopeQueries.every((q) => q.binds.join(',') === '99,7,3')).toBe(true);
    expect(statements.every((q) => !q.sql.includes('INSERT INTO frms_fadiga_evento'))).toBe(true);
  });

  it('administrador tem acesso à empresa inteira sem escopo setorial', async () => {
    state.role = 'admin';
    sectorAccessMock.mockResolvedValue({ mode: 'all', setorIds: [], funcionarioId: null });
    const { db, statements } = createDb();
    const response = await frmsRoutes.fetch(new Request(historyUrl), { DB: db } as Env, {} as ExecutionContext);
    expect(response.status).toBe(200);
    const queries = statements.filter((query) => query.sql.includes('frms_fadiga_checkin ch'));
    expect(queries).toHaveLength(3);
    expect(queries.every((query) =>
      query.sql.includes('f.empresa_id = ch.empresa_id') && !query.sql.includes('f.setor_id IN')),
    ).toBe(true);
  });

  it('tripulante recebe apenas o próprio histórico, ainda que peça outro funcionário', async () => {
    state.role = 'tripulante';
    const { db, statements } = createDb();
    const response = await frmsRoutes.fetch(new Request(historyUrl), { DB: db } as Env, {} as ExecutionContext);
    expect(response.status).toBe(200);
    const queries = statements.filter((query) => query.sql.includes('frms_fadiga_checkin ch'));
    expect(queries).toHaveLength(3);
    expect(queries.every((query) => query.sql.includes('ch.funcionario_id = ?'))).toBe(true);
    expect(queries.every((query) => query.binds.slice(0, 4).join(',') === '7,2026-10-01,2026-10-31,70')).toBe(true);
    expect(sectorAccessMock).not.toHaveBeenCalled();
  });
});

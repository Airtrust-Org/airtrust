import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));
vi.mock('../../middleware/rbac', () => ({
  requirePermission: () => async (_c: unknown, next: () => Promise<void>) => next(),
  requireRole: () => async (_c: unknown, next: () => Promise<void>) => next(),
  hasRole: () => true,
}));
vi.mock('../../routes/escalas-shared', () => ({
  getEmpresaIdSafe: () => 6,
}));
vi.mock('../../services/employee-sector-access', () => ({
  getEmployeeSectorAccess: vi.fn(async () => ({ mode: 'all', setorIds: [] })),
  employeeSectorSql: () => ({ clause: '1 = 1', bindings: [] }),
}));

import routes from '../../routes/lms-matriculas';
import { errorHandler } from '../../middleware/error-handler';

const enrollments = [
  { id: 11, curso_id: 56, funcionario_id: 101, status: 'NAO_INICIADO', progresso_pct: 0, funcionario_nome: 'Pessoa A' },
  { id: 12, curso_id: 56, funcionario_id: 102, status: 'CONCLUIDO', progresso_pct: 100, funcionario_nome: 'Pessoa B' },
  // Legacy cleanup only changed status, leaving deleted_at NULL.
  { id: 13, curso_id: 56, funcionario_id: 103, status: 'CANCELADO', progresso_pct: 0, funcionario_nome: 'Pessoa C' },
];

function mockDb() {
  const queries: string[] = [];
  const db = {
    prepare: vi.fn((sql: string) => {
      queries.push(sql);
      const excluded = sql.includes("NOT IN ('CANCELADO','CANCELADA')");
      const cancelledOnly = !excluded && sql.includes("IN ('CANCELADO','CANCELADA')");
      const filtered = enrollments.filter((row) => cancelledOnly
        ? row.status === 'CANCELADO'
        : excluded && row.status !== 'CANCELADO');
      return {
        bind: (..._args: unknown[]) => ({
          first: async () => ({ n: filtered.length }),
          all: async () => ({ results: filtered }),
        }),
      };
    }),
  } as unknown as D1Database;
  return { db, queries };
}

function app() {
  const api = new Hono<{ Bindings: Env }>();
  api.route('/', routes);
  api.onError(errorHandler);
  return api;
}

describe('LMS course roster — cancelled legacy enrollments', () => {
  it('excludes CANCELADO from both the default rows and total', async () => {
    const { db, queries } = mockDb();
    const response = await app().fetch(
      new Request('http://localhost/curso/56'),
      { DB: db } as Env,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(200);
    const body = await response.json() as {
      data: Array<{ id: number }>;
      pagination: { total: number };
    };
    expect(body.data.map((row) => row.id)).toEqual([11, 12]);
    expect(body.pagination.total).toBe(2);
    expect(queries.filter((sql) => sql.includes('FROM lms_matriculas m')))
      .toEqual(expect.arrayContaining([expect.stringContaining("NOT IN ('CANCELADO','CANCELADA')")]));
  });

  it('keeps the cancelled audit history available only via explicit status filter', async () => {
    const { db, queries } = mockDb();
    const response = await app().fetch(
      new Request('http://localhost/curso/56?status=CANCELADO'),
      { DB: db } as Env,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(200);
    const body = await response.json() as {
      data: Array<{ id: number }>;
      pagination: { total: number };
    };
    expect(body.data.map((row) => row.id)).toEqual([13]);
    expect(body.pagination.total).toBe(1);
    expect(queries.filter((sql) => sql.includes('FROM lms_matriculas m')))
      .toEqual(expect.arrayContaining([expect.stringContaining("IN ('CANCELADO','CANCELADA')")]));
  });
});

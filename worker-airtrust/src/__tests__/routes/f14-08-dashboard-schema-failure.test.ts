import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));
vi.mock('../../middleware/tenant', () => ({
  getTenantContext: () => ({
    empresaId: 6, empresaCodigo: 'tenant-6', empresaNome: 'Tenant',
    role: 'admin', plano: 'pro', permissions: ['read'],
  }),
}));
vi.mock('../../middleware/employee-sector-access', () => ({
  getEmployeeSectorAccess: vi.fn(async () => ({ mode: 'unrestricted', setorIds: [], funcionarioId: null })),
  buildFuncionarioScopeWhere: vi.fn(() => ({ clause: '1=1', bindings: [] })),
}));
vi.mock('../../utils/qualificacoes-alerta-config', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../utils/qualificacoes-alerta-config')>();
  return {
    ...original,
    getQualificacoesAlertaDias: vi.fn(async () => 30),
    getTodayIsoSaoPaulo: vi.fn(() => '2026-11-14'),
  };
});
vi.mock('../../utils/db-schema', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/db-schema')>()),
  getSchemaColumns: vi.fn(async () => { throw new Error('D1_ERROR: schema read overloaded'); }),
}));

import dashboardRoutes from '../../routes/dashboard';

describe('F14-08 — sondagem de schema não deve assumir ausência de renovacao_de', () => {
  it('falha 503 explicitamente, sem emitir métricas usando regra legada', async () => {
    const queries: string[] = [];
    const db = {
      prepare: (sql: string) => {
        queries.push(sql);
        throw new Error('Não deveria executar estatística após falha do schema');
      },
    };
    const app = new Hono<{ Bindings: Env }>();
    app.route('/dashboard', dashboardRoutes);
    const response = await app.fetch(
      new Request('http://localhost/dashboard/qualificacoes'),
      { DB: db } as unknown as Env,
      {} as ExecutionContext,
    );
    const body = await response.json() as Record<string, unknown>;
    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      success: false,
      code: 'QUALIFICATIONS_SCHEMA_UNAVAILABLE',
      verificacao_indisponivel: true,
    });
    expect(body).not.toHaveProperty('data.total_ativas');
    expect(queries).toEqual([]);
  });
});

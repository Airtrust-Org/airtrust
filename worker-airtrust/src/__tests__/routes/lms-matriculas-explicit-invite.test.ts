import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

const { sendEmailMock, logAuditMock } = vi.hoisted(() => ({
  sendEmailMock: vi.fn(),
  logAuditMock: vi.fn(),
}));

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('userId', 42);
    c.set('userRole', 'admin');
    await next();
  },
}));
vi.mock('../../middleware/rbac', () => ({
  hasRole: () => true,
  requireRole: () => async (_c: unknown, next: () => Promise<void>) => next(),
  requirePermission: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));
vi.mock('../../routes/escalas-shared', () => ({ getEmpresaIdSafe: () => 1 }));
vi.mock('../../services/lms-matricula-cycle', () => ({
  ensureMatriculaCycle: vi.fn(),
  hasActiveMatriculaCycle: () => false,
  syncMatriculaCycleFromMatricula: vi.fn(),
}));
vi.mock('../../services/employee-sector-access', () => ({
  assertFuncionarioInScope: vi.fn(),
  employeeSectorSql: () => ({ clause: '1 = 1', bindings: [] }),
  getEmployeeSectorAccess: vi.fn(async () => ({ mode: 'all', setorIds: [] })),
}));
vi.mock('../../utils/db', () => ({ logAudit: logAuditMock }));
vi.mock('../../lib/email', () => ({ sendEmail: sendEmailMock }));

import lmsMatriculasRoutes from '../../routes/lms-matriculas';

type Row = {
  id: number;
  funcionario_id: number;
  curso_id: number;
  data_expiracao: string | null;
  curso_titulo: string;
};
function createDb(rows: Row[], email: string | null) {
  return {
    prepare: vi.fn((query: string) => ({
      bind: (..._args: unknown[]) => ({
        all: async () =>
          query.includes('SELECT m.id,m.funcionario_id,m.curso_id') ? { results: rows } : { results: [] },
        first: async () =>
          query.includes('SELECT nome, email FROM funcionarios')
            ? { nome: 'Pessoa QA', email }
            : null,
        run: async () => ({ meta: { changes: 1, last_row_id: 0 } }),
      }),
    })),
  } as unknown as D1Database;
}

function makeApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route('/', lmsMatriculasRoutes);
  return app;
}

describe('LMS matrícula explicit invitation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    logAuditMock.mockResolvedValue(undefined);
    sendEmailMock.mockResolvedValue(true);
  });
  it('sends enrollment email only when explicitly requested', async () => {
    const db = createDb(
      [{ id: 501, funcionario_id: 77, curso_id: 9, data_expiracao: null, curso_titulo: 'CRM EAD' }],
      'qa@example.invalid',
    );
    const response = await makeApp().fetch(
      new Request('http://localhost/convites/lote', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ matricula_ids: [501] }),
      }),
      { DB: db, FRONTEND_URL: 'https://staging.airtrust.pages.dev' } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: { enviados: 1, sem_email: 0, falhas: 0, nao_encontradas: 0 },
    });
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ subject: 'Novo treinamento: CRM EAD' }),
    );
  });
  it('reports missing employee email without treating it as sent', async () => {
    const db = createDb(
      [{ id: 502, funcionario_id: 78, curso_id: 10, data_expiracao: null, curso_titulo: 'PBN EAD' }],
      null,
    );
    const response = await makeApp().fetch(
      new Request('http://localhost/convites/lote', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ matricula_ids: [502] }),
      }),
      { DB: db, FRONTEND_URL: 'https://staging.airtrust.pages.dev' } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: { enviados: 0, sem_email: 1, falhas: 0, nao_encontradas: 0 },
    });
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});

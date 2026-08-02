import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Env } from '../../types';
import { errorHandler } from '../../middleware/error-handler';

const { getScormRowsMock } = vi.hoisted(() => ({
  getScormRowsMock: vi.fn(),
}));

vi.mock('../../middleware/auth', () => ({
  auth:
    () =>
    async (c: any, next: () => Promise<void>) => {
      if (!c.req.header('Authorization')) {
        return c.json({ success: false, error: 'Token de autenticação não fornecido' }, 401);
      }
      c.set('empresaId', Number(c.req.header('x-test-empresa-id') || 0));
      c.set('userRole', 'admin');
      await next();
    },
}));

vi.mock('../../middleware/rbac', () => ({
  requireRole:
    () =>
    async (_c: any, next: () => Promise<void>) =>
      next(),
}));

vi.mock('../../routes/escalas-shared', () => ({
  getEmpresaIdSafe: (c: any) => Number(c.req.header('x-test-empresa-id') || c.get('empresaId') || 0),
}));

vi.mock('../../services/employee-sector-access', () => ({
  getEmployeeSectorAccess: vi.fn(async () => ({ mode: 'restricted', setorIds: [4, 9] })),
}));

vi.mock('../../repositories/lmsRelatoriosRepository', () => ({
  getConformidadeRows: vi.fn(),
  getCursosConformidadeRows: vi.fn(),
  getExpiracaoRows: vi.fn(),
  getScormConclusaoInconsistenteRows: getScormRowsMock,
}));

import lmsRelatoriosRoutes from '../../routes/lms-relatorios';

function createApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.onError(errorHandler);
  app.route('/api/lms', lmsRelatoriosRoutes);
  return app;
}

function createEnv() {
  return { DB: {}, ENVIRONMENT: 'production' } as unknown as Env;
}

function request(path: string) {
  return new Request(`http://localhost${path}`, {
    headers: {
      Authorization: 'Bearer test-token',
      'x-test-empresa-id': '77',
    },
  });
}

describe('LMS SCORM report cursor contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getScormRowsMock.mockResolvedValue({
      rows: [
        {
          matricula_id: 326,
          funcionario_id: 80,
          funcionario_nome: 'Aluno Teste',
          funcao: 'Manutencao',
          curso_id: 32,
          curso_titulo: 'AW139 - Manutencao',
          status: 'EM_ANDAMENTO',
          progresso_pct: 100,
          score_pct: 100,
          mastery_score: 70,
          location: '380/380',
          diagnostic_status: 'candidate',
          diagnostic_code: 'SCORM_COMPLETION_CANDIDATE',
          can_finalize: true,
          last_commit_at: '2026-06-24 09:30:00',
        },
      ],
      nextCursor: 'next-page-token',
    });
  });

  it('aceita limit/cursor, mantém o corpo HTTP e expõe próximo cursor por header', async () => {
    const env = createEnv();
    const response = await createApp().fetch(
      request(
        '/api/lms/relatorios/conclusoes-inconsistentes?setor_ids=4,99&limit=25&cursor=current-token',
      ),
      env,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('X-Next-Cursor')).toBe('next-page-token');
    expect(body).toEqual({
      success: true,
      data: [
        expect.objectContaining({
          matricula_id: 326,
          status: 'EM_ANDAMENTO',
          diagnostic_code: 'SCORM_COMPLETION_CANDIDATE',
        }),
      ],
    });
    expect(getScormRowsMock).toHaveBeenCalledWith(env.DB, 77, [4], {
      limit: 25,
      cursor: 'current-token',
    });
  });

  it('limita page size a 200 sem mudar o payload', async () => {
    const env = createEnv();
    const response = await createApp().fetch(
      request('/api/lms/relatorios/conclusoes-inconsistentes?limit=999'),
      env,
    );

    expect(response.status).toBe(200);
    expect(getScormRowsMock).toHaveBeenCalledWith(env.DB, 77, [4, 9], {
      limit: 200,
      cursor: undefined,
    });
  });

  it('rejeita limite e cursor inválidos sem vazar detalhes internos', async () => {
    const invalidLimit = await createApp().fetch(
      request('/api/lms/relatorios/conclusoes-inconsistentes?limit=abc'),
      createEnv(),
    );
    expect(invalidLimit.status).toBe(400);
    expect(await invalidLimit.json()).toMatchObject({ success: false });

    getScormRowsMock.mockRejectedValueOnce(
      Object.assign(new Error('raw cursor parser detail'), { code: 'INVALID_SCORM_CURSOR' }),
    );
    const invalidCursor = await createApp().fetch(
      request('/api/lms/relatorios/conclusoes-inconsistentes?cursor=bad'),
      createEnv(),
    );
    const body = await invalidCursor.json();
    expect(invalidCursor.status).toBe(400);
    expect(body).toMatchObject({ success: false, error: 'Cursor de paginação inválido' });
    expect(JSON.stringify(body)).not.toContain('raw cursor parser detail');
  });
});

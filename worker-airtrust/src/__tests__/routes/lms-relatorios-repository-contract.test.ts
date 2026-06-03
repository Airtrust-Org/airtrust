import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Env } from '../../types';
import { errorHandler } from '../../middleware/error-handler';

const {
  getConformidadeRowsMock,
  getCursosConformidadeRowsMock,
  getExpiracaoRowsMock,
} = vi.hoisted(() => ({
  getConformidadeRowsMock: vi.fn(),
  getCursosConformidadeRowsMock: vi.fn(),
  getExpiracaoRowsMock: vi.fn(),
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

vi.mock('../../repositories/lmsRelatoriosRepository', () => ({
  getConformidadeRows: getConformidadeRowsMock,
  getCursosConformidadeRows: getCursosConformidadeRowsMock,
  getExpiracaoRows: getExpiracaoRowsMock,
}));

import lmsRelatoriosRoutes from '../../routes/lms-relatorios';

function createApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.onError(errorHandler);
  app.route('/api/lms', lmsRelatoriosRoutes);
  return app;
}

function createEnv() {
  return {
    DB: {
      prepare: vi.fn(() => {
        throw new Error('route should delegate report queries to lmsRelatoriosRepository');
      }),
    },
    ENVIRONMENT: 'production',
  } as unknown as Env;
}

function authenticatedRequest(path: string, empresaId = 77) {
  return new Request(`http://localhost${path}`, {
    headers: {
      Authorization: 'Bearer test-token',
      'x-test-empresa-id': String(empresaId),
    },
  });
}

describe('lms relatorios repository contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    getConformidadeRowsMock.mockResolvedValue([
      {
        funcao: 'Piloto',
        total_funcionarios: 3,
        matriculados: 2,
        concluidos: 1,
        em_andamento: 1,
        nao_iniciados: 0,
        reprovados: 0,
        taxa_conclusao_pct: 50,
      },
    ]);
    getCursosConformidadeRowsMock.mockResolvedValue([
      {
        curso_id: 10,
        curso_titulo: 'CRM',
        tipo_conteudo: 'pdf',
        categoria: 'Operacional',
        funcao: 'Piloto',
        matriculados: 2,
        concluidos: 1,
        taxa_pct: 50,
      },
    ]);
    getExpiracaoRowsMock.mockResolvedValue([
      {
        matricula_id: 100,
        funcionario_id: 20,
        funcionario_nome: 'Tripulante Teste',
        funcao: 'Piloto',
        base: 'SBSP',
        curso_id: 10,
        curso_titulo: 'CRM',
        status: 'EM_ANDAMENTO',
        data_expiracao: '2026-07-01',
        progresso_pct: 40,
        dias_restantes: 28,
      },
    ]);
  });

  it('GET /relatorios/conformidade delega para repository com empresaId explicito e preserva payload', async () => {
    const app = createApp();
    const env = createEnv();

    const response = await app.fetch(
      authenticatedRequest('/api/lms/relatorios/conformidade', 77),
      env,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: [
        {
          funcao: 'Piloto',
          total_funcionarios: 3,
          matriculados: 2,
          concluidos: 1,
          em_andamento: 1,
          nao_iniciados: 0,
          reprovados: 0,
          taxa_conclusao_pct: 50,
        },
      ],
    });
    expect(getConformidadeRowsMock).toHaveBeenCalledWith(env.DB, 77);
    expect((env.DB.prepare as unknown as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it('GET /relatorios/cursos-conformidade preserva contrato publico da lista por curso', async () => {
    const app = createApp();
    const env = createEnv();

    const response = await app.fetch(
      authenticatedRequest('/api/lms/relatorios/cursos-conformidade', 88),
      env,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: [
        {
          curso_id: 10,
          curso_titulo: 'CRM',
          tipo_conteudo: 'pdf',
          categoria: 'Operacional',
          funcao: 'Piloto',
          matriculados: 2,
          concluidos: 1,
          taxa_pct: 50,
        },
      ],
    });
    expect(getCursosConformidadeRowsMock).toHaveBeenCalledWith(env.DB, 88);
  });

  it('GET /relatorios/expiracoes repassa filtro dias para repository', async () => {
    const app = createApp();
    const env = createEnv();

    const response = await app.fetch(
      authenticatedRequest('/api/lms/relatorios/expiracoes?dias=45', 77),
      env,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual([
      {
        matricula_id: 100,
        funcionario_id: 20,
        funcionario_nome: 'Tripulante Teste',
        funcao: 'Piloto',
        base: 'SBSP',
        curso_id: 10,
        curso_titulo: 'CRM',
        status: 'EM_ANDAMENTO',
        data_expiracao: '2026-07-01',
        progresso_pct: 40,
        dias_restantes: 28,
      },
    ]);
    expect(getExpiracaoRowsMock).toHaveBeenCalledWith(env.DB, 77, 45);
  });

  it('limita dias em 180 antes de chamar repository, preservando comportamento da rota', async () => {
    const app = createApp();
    const env = createEnv();

    const response = await app.fetch(
      authenticatedRequest('/api/lms/relatorios/expiracoes?dias=999', 77),
      env,
    );

    expect(response.status).toBe(200);
    expect(getExpiracaoRowsMock).toHaveBeenCalledWith(env.DB, 77, 180);
  });

  it('sem Authorization retorna 401 antes de chamar repository', async () => {
    const app = createApp();
    const env = createEnv();

    const response = await app.fetch(
      new Request('http://localhost/api/lms/relatorios/conformidade'),
      env,
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toMatchObject({ success: false });
    expect(getConformidadeRowsMock).not.toHaveBeenCalled();
    expect(getCursosConformidadeRowsMock).not.toHaveBeenCalled();
    expect(getExpiracaoRowsMock).not.toHaveBeenCalled();
  });

  it('empresaId invalido falha fechado sem payload de dados', async () => {
    getConformidadeRowsMock.mockRejectedValueOnce(
      new Error('lms relatorios repository requires explicit empresaId'),
    );
    const app = createApp();
    const env = createEnv();

    const response = await app.fetch(
      authenticatedRequest('/api/lms/relatorios/conformidade', 0),
      env,
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toMatchObject({
      success: false,
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR',
    });
    expect(body.data).toBeUndefined();
    expect(getConformidadeRowsMock).toHaveBeenCalledWith(env.DB, 0);
  });

  it('erro do repository vira resposta segura conforme errorHandler de producao', async () => {
    getExpiracaoRowsMock.mockRejectedValueOnce(new Error('db detail should not leak'));
    const app = createApp();
    const env = createEnv();

    const response = await app.fetch(
      authenticatedRequest('/api/lms/relatorios/expiracoes', 77),
      env,
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toMatchObject({
      success: false,
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR',
    });
    expect(JSON.stringify(body)).not.toContain('db detail should not leak');
  });
});

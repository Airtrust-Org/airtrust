import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

/**
 * `lms_matriculas.data_expiracao` é o prazo de conclusão do curso (ver
 * migration 0336, comentário "prazo para conclusão (opcional)" — também
 * exposto como `prazo_conclusao` em ficha360.ts/funcionarios.ts/dashboardService.ts).
 * Antes desta correção, uma matrícula EM_ANDAMENTO/NAO_INICIADO era sempre
 * reportada como 'risco' em Compliance, mesmo com o prazo de conclusão já
 * vencido há meses — mascarando um gap real como um simples alerta.
 */

vi.mock('../../middleware/auth', () => ({
  auth: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));

vi.mock('../../middleware/tenant', () => ({
  getEmpresaId: () => 6,
}));

vi.mock('../../services/employee-sector-access', () => ({
  appendEmployeeSectorFilter: vi.fn(),
  assertFuncionarioInScope: vi.fn(async () => undefined),
  getEmployeeSectorAccess: vi.fn(async () => ({ mode: 'all', setorIds: [], funcionarioId: null })),
}));

import complianceRouter from '../../routes/compliance';

function createApp(db: D1Database) {
  const app = new Hono<{ Bindings: Env }>();
  app.route('/', complianceRouter);
  return {
    request: (path: string) => app.request(path, undefined, { DB: db } as Env),
  };
}

function createMockDb(options: { status: string; dataExpiracao: string | null }) {
  const prepare = vi.fn((query: string) => {
    const normalized = query.replace(/\s+/g, ' ').trim();

    const exec = async (_args: unknown[], method: 'all' | 'first') => {
      if (normalized.startsWith("PRAGMA table_info('qualificacoes_historico')")) {
        return { results: [{ name: 'funcionario_id' }, { name: 'status' }, { name: 'deleted_at' }] };
      }

      if (normalized.startsWith("PRAGMA table_info('licencas')")) {
        return { results: [] };
      }

      if (normalized.includes('FROM funcionarios WHERE deleted_at IS NULL AND ativo = 1')) {
        return {
          success: true,
          results: [
            {
              id: 42,
              nome: 'Piloto Teste',
              matricula: 'PT-42',
              funcao: 'Piloto',
            },
          ],
        };
      }

      if (normalized.includes('WITH qualificacoes_ativas AS')) {
        return { results: [] };
      }

      if (normalized.includes('FROM requisitos_compliance')) {
        return {
          results: [
            {
              id: 1,
              funcao: 'Piloto',
              tipo_recurso: 'curso_lms',
              referencia: '55',
              descricao: 'Curso obrigatorio de seguranca',
            },
          ],
        };
      }

      if (normalized.includes('FROM lms_matriculas')) {
        return {
          results: [
            {
              funcionario_id: 42,
              curso_id: 55,
              status: options.status,
              data_expiracao: options.dataExpiracao,
            },
          ],
        };
      }

      return method === 'all' ? { results: [] } : null;
    };

    return {
      all: async () => exec([], 'all'),
      first: async () => exec([], 'first'),
      bind: (...args: unknown[]) => ({
        all: async () => exec(args, 'all'),
        first: async () => exec(args, 'first'),
      }),
    };
  });

  return { prepare } as unknown as D1Database;
}

describe('compliance lms prazo de conclusao', () => {
  it('marca faltando (nao risco) quando o prazo de conclusao do curso LMS ja passou', async () => {
    const app = createApp(
      createMockDb({ status: 'EM_ANDAMENTO', dataExpiracao: '2020-01-01' }),
    );

    const response = await app.request('/compliance/funcionarios');
    const body = (await response.json()) as {
      data: Array<{ status: string }>;
    };

    expect(response.status).toBe(200);
    expect(body.data).toEqual([expect.objectContaining({ status: 'nao_conforme' })]);
  });

  it('marca risco (nao gap) quando o curso LMS esta em andamento dentro do prazo', async () => {
    const app = createApp(
      createMockDb({ status: 'EM_ANDAMENTO', dataExpiracao: '2099-12-31' }),
    );

    const response = await app.request('/compliance/funcionarios');
    const body = (await response.json()) as {
      data: Array<{ status: string }>;
    };

    expect(response.status).toBe(200);
    expect(body.data).toEqual([expect.objectContaining({ status: 'em_risco' })]);
  });

  it('marca risco quando o curso LMS esta em andamento sem prazo definido', async () => {
    const app = createApp(createMockDb({ status: 'NAO_INICIADO', dataExpiracao: null }));

    const response = await app.request('/compliance/funcionarios');
    const body = (await response.json()) as {
      data: Array<{ status: string }>;
    };

    expect(response.status).toBe(200);
    expect(body.data).toEqual([expect.objectContaining({ status: 'em_risco' })]);
  });

  it('marca conforme quando o curso LMS esta concluido, mesmo com prazo passado', async () => {
    const app = createApp(
      createMockDb({ status: 'CONCLUIDO', dataExpiracao: '2020-01-01' }),
    );

    const response = await app.request('/compliance/funcionarios');
    const body = (await response.json()) as {
      data: Array<{ status: string }>;
    };

    expect(response.status).toBe(200);
    expect(body.data).toEqual([expect.objectContaining({ status: 'conforme' })]);
  });

  it('marca faltando quando o curso LMS foi reprovado', async () => {
    const app = createApp(
      createMockDb({ status: 'REPROVADO', dataExpiracao: '2099-12-31' }),
    );

    const response = await app.request('/compliance/funcionarios');
    const body = (await response.json()) as {
      data: Array<{ status: string }>;
    };

    expect(response.status).toBe(200);
    expect(body.data).toEqual([expect.objectContaining({ status: 'nao_conforme' })]);
  });
});

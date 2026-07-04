import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

/**
 * Completa a matriz mínima de consistência cross-module (Tarefa 5, Pack 2):
 * VALIDA e VENCIDA, para o mesmo funcionário/requisito, em Compliance e
 * Matriz de Treinamento. RENOVADA vigente e VENCENDO_30 já têm testes
 * dedicados (Pack 1 e Pack 2, respectivamente).
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

function createComplianceMockDb(dataVencimento: string) {
  const prepare = vi.fn((query: string) => {
    const normalized = query.replace(/\s+/g, ' ').trim();

    const exec = async (_args: unknown[], method: 'all' | 'first') => {
      if (normalized.startsWith("PRAGMA table_info('qualificacoes_historico')")) {
        return {
          results: [
            { name: 'funcionario_id' },
            { name: 'tipo_qualificacao_id' },
            { name: 'data_realizacao' },
            { name: 'data_vencimento' },
            { name: 'status' },
            { name: 'renovada' },
            { name: 'deleted_at' },
          ],
        };
      }

      if (normalized.startsWith("PRAGMA table_info('licencas')")) {
        return { results: [] };
      }

      if (normalized.includes('FROM funcionarios WHERE deleted_at IS NULL AND ativo = 1')) {
        return {
          success: true,
          results: [{ id: 42, nome: 'Piloto Base', matricula: 'PB-42', funcao: 'Piloto' }],
        };
      }

      if (normalized.includes('WITH qualificacoes_ativas AS')) {
        return { results: [{ funcionario_id: 42, codigo: 'CMA', data_vencimento: dataVencimento }] };
      }

      if (normalized.includes('FROM requisitos_compliance')) {
        return {
          results: [
            { id: 1, funcao: 'Piloto', tipo_recurso: 'qualificacao', referencia: 'CMA', descricao: 'CMA' },
          ],
        };
      }

      if (normalized.includes('FROM lms_matriculas')) {
        return { results: [] };
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

function createMatrizMockDb(dataVencimento: string) {
  const prepare = vi.fn((query: string) => {
    const normalized = query.replace(/\s+/g, ' ').trim();

    const exec = async (_args: unknown[]) => {
      if (normalized.startsWith("PRAGMA table_info('funcionarios')")) {
        return {
          results: [
            { name: 'id' },
            { name: 'nome' },
            { name: 'funcao_id' },
            { name: 'funcao' },
            { name: 'empresa_id' },
            { name: 'deleted_at' },
          ],
        };
      }

      if (normalized.startsWith("PRAGMA table_info('qualificacoes_historico')")) {
        return {
          results: [
            { name: 'funcionario_id' },
            { name: 'tipo_qualificacao_id' },
            { name: 'data_realizacao' },
            { name: 'data_vencimento' },
            { name: 'status' },
            { name: 'renovada' },
            { name: 'empresa_id' },
            { name: 'updated_at' },
            { name: 'created_at' },
            { name: 'deleted_at' },
          ],
        };
      }

      if (normalized.includes('FROM funcionarios') && normalized.includes('WHERE id = ?')) {
        return { id: 42, nome: 'Piloto Base', funcao_id: 5, funcao: null };
      }

      if (
        normalized.includes('FROM matriz_treinamento_funcao m') &&
        normalized.includes('LEFT JOIN qualificacoes_tipos')
      ) {
        return {
          results: [
            {
              matriz_id: 1,
              qualificacao_tipo_id: 50,
              qualificacao_tipo_nome: 'CMA',
              qualificacao_tipo_codigo: 'CMA',
              validade_meses: 12,
              obrigatoriedade: 'OBRIGATORIA',
              critico_operacional: 1,
              origem: 'MATRIZ',
              observacoes: null,
            },
          ],
        };
      }

      if (normalized.includes('WITH historico_ativo AS')) {
        return { results: [{ tipo_id: 50, ultima_data: '2025-01-10', data_vencimento: dataVencimento }] };
      }

      if (normalized.includes('FROM funcoes')) {
        return { nome: 'Piloto' };
      }

      return { results: [] };
    };

    return {
      all: async () => exec([]),
      first: async () => exec([]),
      bind: (...args: unknown[]) => ({
        all: async () => {
          const r = await exec(args);
          return 'results' in r ? r : { results: [] };
        },
        first: async () => {
          const r = await exec(args);
          return 'results' in r ? null : r;
        },
      }),
    };
  });

  return { prepare } as unknown as D1Database;
}

describe('VALIDA e VENCIDA consistencia cross-module', () => {
  it('VALIDA: compliance=conforme e matriz=EM_DIA para o mesmo funcionario', async () => {
    const complianceRouter = (await import('../../routes/compliance')).default;
    const complianceApp = new Hono<{ Bindings: Env }>();
    complianceApp.route('/', complianceRouter);
    const complianceResponse = await complianceApp.request(
      '/compliance/funcionarios',
      undefined,
      { DB: createComplianceMockDb('2099-12-31') } as Env,
    );
    const complianceBody = (await complianceResponse.json()) as { data: Array<{ status: string }> };
    expect(complianceBody.data).toEqual([expect.objectContaining({ status: 'conforme' })]);

    const matrizRouter = (await import('../../routes/matriz-treinamento')).default;
    const matrizApp = new Hono<{ Bindings: Env }>();
    matrizApp.route('/', matrizRouter);
    const matrizResponse = await matrizApp.request(
      '/requisitos/42',
      undefined,
      { DB: createMatrizMockDb('2099-12-31') } as Env,
    );
    const matrizBody = (await matrizResponse.json()) as {
      data: Array<{ qualificacao_tipo_id: number; status: string }>;
    };
    expect(matrizBody.data).toEqual([
      expect.objectContaining({ qualificacao_tipo_id: 50, status: 'EM_DIA' }),
    ]);
  });

  it('VENCIDA: compliance=nao_conforme e matriz=VENCIDO para o mesmo funcionario', async () => {
    const complianceRouter = (await import('../../routes/compliance')).default;
    const complianceApp = new Hono<{ Bindings: Env }>();
    complianceApp.route('/', complianceRouter);
    const complianceResponse = await complianceApp.request(
      '/compliance/funcionarios',
      undefined,
      { DB: createComplianceMockDb('2020-01-01') } as Env,
    );
    const complianceBody = (await complianceResponse.json()) as { data: Array<{ status: string }> };
    expect(complianceBody.data).toEqual([expect.objectContaining({ status: 'nao_conforme' })]);

    const matrizRouter = (await import('../../routes/matriz-treinamento')).default;
    const matrizApp = new Hono<{ Bindings: Env }>();
    matrizApp.route('/', matrizRouter);
    const matrizResponse = await matrizApp.request(
      '/requisitos/42',
      undefined,
      { DB: createMatrizMockDb('2020-01-01') } as Env,
    );
    const matrizBody = (await matrizResponse.json()) as {
      data: Array<{ qualificacao_tipo_id: number; status: string }>;
    };
    expect(matrizBody.data).toEqual([
      expect.objectContaining({ qualificacao_tipo_id: 50, status: 'VENCIDO' }),
    ]);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

/**
 * VENCENDO_30 (qualificação a vencer dentro da janela de alerta) deve ser
 * tratado como conforme-em-alerta, nunca como gap, em qualquer rota que
 * decida conformidade. Este teste fixa data_vencimento a 15 dias no futuro
 * (dentro da janela padrão de 30 dias) e confirma que Compliance e Matriz
 * de Treinamento concordam: nenhuma delas reporta o funcionário como
 * faltando/em falta.
 *
 * Matriz de Treinamento hoje não expõe um status "vencendo" distinto de
 * "válido" (contrato atual é binário EM_DIA/VENCIDO/EM_FALTA, consumido por
 * src/react-app/pages/funcionarios/AbaTreinamentos.tsx com union estrita) —
 * por isso o teste verifica apenas que a Matriz NÃO gera falso gap, não que
 * ela distinga VENCENDO_30 de VALIDA. Expandir o contrato da Matriz para
 * expor um status "em alerta" próprio requer também atualizar o frontend
 * (union type + contadores) e fica registrado como candidato a Pack 3.
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

function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const VENCIMENTO_EM_15_DIAS = daysFromNow(15);

function createComplianceMockDb() {
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
          results: [{ id: 42, nome: 'Piloto Vencendo', matricula: 'PV-42', funcao: 'Piloto' }],
        };
      }

      if (normalized.includes('WITH qualificacoes_ativas AS')) {
        return {
          results: [
            { funcionario_id: 42, codigo: 'LIC-CAT-C', data_vencimento: VENCIMENTO_EM_15_DIAS },
          ],
        };
      }

      if (normalized.includes('FROM requisitos_compliance')) {
        return {
          results: [
            {
              id: 1,
              funcao: 'Piloto',
              tipo_recurso: 'qualificacao',
              referencia: 'LIC-CAT-C',
              descricao: 'Licenca categoria C',
            },
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

function createMatrizMockDb() {
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
        return { id: 42, nome: 'Piloto Vencendo', funcao_id: 5, funcao: null };
      }

      if (
        normalized.includes('FROM matriz_treinamento_funcao m') &&
        normalized.includes('LEFT JOIN qualificacoes_tipos')
      ) {
        return {
          results: [
            {
              matriz_id: 1,
              qualificacao_tipo_id: 30,
              qualificacao_tipo_nome: 'Licenca categoria C',
              qualificacao_tipo_codigo: 'LIC-CAT-C',
              validade_meses: 12,
              obrigatoriedade: 'OBRIGATORIA',
              critico_operacional: 0,
              origem: 'MATRIZ',
              observacoes: null,
            },
          ],
        };
      }

      if (normalized.includes('WITH historico_ativo AS')) {
        return {
          results: [
            { tipo_id: 30, ultima_data: '2025-06-01', data_vencimento: VENCIMENTO_EM_15_DIAS },
          ],
        };
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

describe('VENCENDO_30 consistencia cross-module', () => {
  it('compliance reporta em_risco (nao nao_conforme) para qualificacao vencendo em 15 dias', async () => {
    const complianceRouter = (await import('../../routes/compliance')).default;
    const app = new Hono<{ Bindings: Env }>();
    app.route('/', complianceRouter);

    const response = await app.request(
      '/compliance/funcionarios',
      undefined,
      { DB: createComplianceMockDb() } as Env,
    );
    const body = (await response.json()) as { data: Array<{ status: string }> };

    expect(response.status).toBe(200);
    expect(body.data).toEqual([expect.objectContaining({ status: 'em_risco' })]);
  });

  it('matriz de treinamento nao aponta gap (EM_DIA, nao EM_FALTA) para o mesmo cenario', async () => {
    const matrizRouter = (await import('../../routes/matriz-treinamento')).default;
    const app = new Hono<{ Bindings: Env }>();
    app.route('/', matrizRouter);

    const response = await app.request(
      '/requisitos/42',
      undefined,
      { DB: createMatrizMockDb() } as Env,
    );
    const body = (await response.json()) as {
      data: Array<{ qualificacao_tipo_id: number; status: string }>;
    };

    expect(response.status).toBe(200);
    expect(body.data).toEqual([
      expect.objectContaining({ qualificacao_tipo_id: 30, status: 'EM_DIA' }),
    ]);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));

vi.mock('../../middleware/tenant', () => ({
  getEmpresaId: () => 6,
}));

import matrizTreinamentoRouter from '../../routes/matriz-treinamento';

function createApp(db: D1Database) {
  const app = new Hono<{ Bindings: Env }>();
  app.route('/', matrizTreinamentoRouter);
  return {
    request: (path: string) =>
      app.request(
        path,
        undefined,
        {
          DB: db,
        } as Env,
      ),
  };
}

function createMockDb() {
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
        return {
          id: 42,
          nome: 'Tecnico Manutencao',
          funcao_id: 5,
          funcao: null,
        };
      }

      if (normalized.includes('FROM matriz_treinamento_funcao m') && normalized.includes('LEFT JOIN qualificacoes_tipos')) {
        return {
          results: [
            {
              matriz_id: 1,
              qualificacao_tipo_id: 10,
              qualificacao_tipo_nome: 'NR-12',
              qualificacao_tipo_codigo: 'NR-12',
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
        // Simulates the real SQL: the buggy version excludes RENOVADA/renovada=1
        // BEFORE electing the vigente record (ROW_NUMBER), so the only
        // historico row (marked renovada, but with no successor) never
        // reaches rn=1 and the requisito is reported as EM_FALTA.
        if (normalized.includes("NOT IN ('CANCELADA', 'RENOVADA')") || normalized.includes('renovada, 0) = 0')) {
          return { results: [] };
        }

        return {
          results: [
            {
              tipo_id: 10,
              ultima_data: '2024-01-10',
              data_vencimento: '2099-12-31',
            },
          ],
        };
      }

      if (normalized.includes('FROM funcoes')) {
        return { nome: 'Tecnico de Manutencao' };
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

describe('matriz-treinamento renovada operacional', () => {
  it('nao marca EM_FALTA quando a unica qualificacao vigente foi persistida como renovada', async () => {
    const app = createApp(createMockDb());

    const response = await app.request('/requisitos/42');
    const body = (await response.json()) as {
      success: boolean;
      data: Array<{ qualificacao_tipo_id: number; status: string }>;
    };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual([
      expect.objectContaining({
        qualificacao_tipo_id: 10,
        status: 'EM_DIA',
      }),
    ]);
  });
});

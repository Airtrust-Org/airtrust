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
    request: (path: string) => app.request(path, undefined, { DB: db } as Env),
  };
}

function createLegacyTiposDb(): D1Database {
  return {
    prepare: vi.fn((query: string) => {
      const normalized = query.replace(/\s+/g, ' ').trim();
      const result = async () => {
        if (normalized.startsWith("PRAGMA table_info('funcionarios')")) {
          return {
            results: [{ name: 'id' }, { name: 'nome' }, { name: 'funcao_id' }, { name: 'funcao' }],
          };
        }
        if (normalized.includes('FROM funcionarios') && normalized.includes('WHERE id = ?')) {
          return { id: 100, nome: 'Funcionario QA', funcao_id: 7, funcao: null };
        }
        if (normalized.includes('FROM matriz_treinamento_funcao m')) {
          if (normalized.includes('qt.validade_meses')) {
            throw new Error('D1_ERROR: no such column: qt.validade_meses');
          }
          return {
            results: [
              {
                matriz_id: 1,
                qualificacao_tipo_id: 11,
                qualificacao_tipo_nome: 'Qualificacao QA',
                qualificacao_tipo_codigo: 'QA',
                validade_meses: null,
                obrigatoriedade: 'OBRIGATORIA',
                critico_operacional: 0,
                origem: 'REGULATORIO',
                observacoes: null,
              },
            ],
          };
        }
        if (normalized.startsWith("PRAGMA table_info('qualificacoes_historico')")) {
          return {
            results: [
              { name: 'funcionario_id' },
              { name: 'qualificacao_id' },
              { name: 'data_conclusao' },
              { name: 'data_vencimento' },
              { name: 'status' },
              { name: 'empresa_id' },
              { name: 'updated_at' },
              { name: 'created_at' },
              { name: 'deleted_at' },
            ],
          };
        }
        if (normalized.includes('WITH historico_ativo AS')) return { results: [] };
        if (normalized.includes('SELECT nome FROM funcoes')) return { nome: 'Funcao QA' };
        return { results: [] };
      };

      return {
        all: async () => {
          const value = await result();
          return 'results' in value ? value : { results: [] };
        },
        bind: () => ({
          all: async () => {
            const value = await result();
            return 'results' in value ? value : { results: [] };
          },
          first: async () => {
            const value = await result();
            return 'results' in value ? null : value;
          },
        }),
      };
    }),
  } as unknown as D1Database;
}

describe('matriz-treinamento schema compatibility', () => {
  it('degrada a validade para null quando o schema legado não possui qt.validade_meses', async () => {
    const response = await createApp(createLegacyTiposDb()).request('/requisitos/100');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: [expect.objectContaining({ qualificacao_tipo_id: 11, status: 'EM_FALTA' })],
    });
  });
});

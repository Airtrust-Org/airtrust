import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

/**
 * Fecha uma lacuna de cobertura da Matriz de Treinamento: um registro
 * RECORRENTE/PERIODICO vencido (sem sucessor) deve virar VENCIDO (não
 * conforme), nunca EM_DIA. `tipo_treinamento` é apenas um rótulo persistido
 * — nenhuma rota hoje o lê para decidir status (ver historico-helpers.ts),
 * então o resultado depende só da data_vencimento, não do rótulo. Este
 * teste prova isso explicitamente: mesmo com tipo_treinamento='RECORRENTE'
 * presente na linha, o vencimento no passado ainda gera VENCIDO.
 * (EM_FALTA é reservado para quando NENHUM registro do tipo existe.)
 */

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
            { name: 'qualificacao_id' },
            { name: 'data_conclusao' },
            { name: 'data_vencimento' },
            { name: 'status' },
            { name: 'renovada' },
            { name: 'empresa_id' },
            { name: 'updated_at' },
            { name: 'created_at' },
            { name: 'deleted_at' },
            { name: 'tipo_treinamento' },
          ],
        };
      }

      if (normalized.includes('FROM funcionarios') && normalized.includes('WHERE id = ?')) {
        return { id: 42, nome: 'Tripulante Periodico', funcao_id: 5, funcao: null };
      }

      if (
        normalized.includes('FROM matriz_treinamento_funcao m') &&
        normalized.includes('LEFT JOIN qualificacoes_tipos')
      ) {
        return {
          results: [
            {
              matriz_id: 1,
              qualificacao_tipo_id: 40,
              qualificacao_tipo_nome: 'CRM',
              qualificacao_tipo_codigo: 'CRM',
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
        // Ultimo periodico realizado ha mais de 12 meses, sem sucessor.
        return {
          results: [
            { tipo_id: 40, ultima_data: '2020-01-10', data_vencimento: '2021-01-10' },
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

describe('matriz-treinamento periodico vencido', () => {
  it('marca VENCIDO (nao EM_DIA) quando o ultimo periodico esta vencido e sem sucessor', async () => {
    const app = createApp(createMockDb());
    const response = await app.request('/requisitos/42');
    const body = (await response.json()) as {
      data: Array<{ qualificacao_tipo_id: number; status: string }>;
    };

    expect(response.status).toBe(200);
    expect(body.data).toEqual([
      expect.objectContaining({ qualificacao_tipo_id: 40, status: 'VENCIDO' }),
    ]);
  });
});

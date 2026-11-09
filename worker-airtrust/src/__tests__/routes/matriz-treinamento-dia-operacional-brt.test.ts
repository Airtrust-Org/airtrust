import { afterEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

/**
 * P03-03: a Matriz classificava VENCIDO pela data UTC. Entre 21h e 24h BRT o dia UTC ja e o
 * seguinte, e uma qualificacao que vence HOJE (dia de Sao Paulo) aparecia VENCIDA tres horas
 * antes, divergindo do Compliance (que usa o dia operacional de Sao Paulo).
 */

vi.mock('../../middleware/auth', () => ({
  auth: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));

vi.mock('../../middleware/tenant', () => ({
  getEmpresaId: () => 6,
}));

const VENCIMENTO = vi.hoisted(() => ({ value: '2026-11-08' }));
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

    const exec = async () => {
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
            { tipo_id: 40, ultima_data: '2025-11-08', data_vencimento: VENCIMENTO.value },
          ],
        };
      }

      if (normalized.includes('FROM funcoes')) {
        return { nome: 'Piloto' };
      }

      return { results: [] };
    };

    return {
      all: async () => exec(),
      first: async () => exec(),
      bind: () => ({
        all: async () => {
          const r = await exec();
          return 'results' in r ? r : { results: [] };
        },
        first: async () => {
          const r = await exec();
          return 'results' in r ? null : r;
        },
      }),
    };
  });

  return { prepare } as unknown as D1Database;
}

afterEach(() => {
  vi.useRealTimers();
});

async function statusEm(isoInstant: string, vencimento: string) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(isoInstant));
  VENCIMENTO.value = vencimento;
  const app = createApp(createMockDb());
  const response = await app.request('/requisitos/42');
  const json = (await response.json()) as { data: Array<{ status: string; dias_para_vencer: number | null }> };
  expect(response.status).toBe(200);
  return json.data[0];
}

describe('matriz-treinamento: dia operacional de Sao Paulo', () => {
  it('22:30 BRT do dia 08 (01:30Z do dia 09): vence hoje => EM_DIA, nao VENCIDO', async () => {
    const row = await statusEm('2026-11-09T01:30:00Z', '2026-11-08');
    expect(row.status).toBe('EM_DIA');
    expect(row.dias_para_vencer).toBe(0);
  });

  it('00:00 BRT do dia 09 (03:00Z): vencimento de ontem => VENCIDO', async () => {
    expect((await statusEm('2026-11-09T03:00:00Z', '2026-11-08')).status).toBe('VENCIDO');
  });
});

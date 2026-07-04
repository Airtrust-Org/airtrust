import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

/**
 * Quando um curso LMS gera qualificação automaticamente ao concluir
 * (lms_cursos.gerar_qualificacao_ao_concluir=1 + qualificacao_tipo_id setado),
 * o serviço `createLmsQualificationOnCompletion` insere um registro comum em
 * `qualificacoes_historico` com `origem_tipo='LMS'` e `lms_matricula_id`
 * preenchido (ver worker-airtrust/src/services/lms-qualification.ts).
 *
 * A Matriz de Treinamento lê apenas `qualificacoes_historico` — não sabe
 * nada sobre `lms_matriculas` diretamente. Este teste prova que, para esse
 * caminho (o único hoje em que LMS pode satisfazer um requisito de Matriz),
 * o registro de origem LMS é tratado exatamente como qualquer outro
 * histórico: conta como vigente e não gera falso gap.
 *
 * NOTA: cursos LMS puramente "compliance" (tipo_recurso='curso_lms' em
 * requisitos_compliance, sem gerar_qualificacao_ao_concluir) não têm
 * NENHUMA representação possível em matriz_treinamento_funcao hoje — essa
 * tabela só aceita qualificacao_tipo_id (NOT NULL, sem discriminador de
 * tipo_recurso). Fechar esse gap exigiria uma migration (fora de escopo
 * deste pack) — ver NO-GO parcial no relatório do Pack 2.
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
            { name: 'origem_tipo' },
            { name: 'lms_matricula_id' },
          ],
        };
      }

      if (normalized.includes('FROM funcionarios') && normalized.includes('WHERE id = ?')) {
        return { id: 42, nome: 'Tripulante LMS', funcao_id: 5, funcao: null };
      }

      if (
        normalized.includes('FROM matriz_treinamento_funcao m') &&
        normalized.includes('LEFT JOIN qualificacoes_tipos')
      ) {
        return {
          results: [
            {
              matriz_id: 1,
              qualificacao_tipo_id: 20,
              qualificacao_tipo_nome: 'Seguranca em Voo',
              qualificacao_tipo_codigo: 'SEG-VOO',
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
        // Registro inserido por createLmsQualificationOnCompletion:
        // origem_tipo='LMS', lms_matricula_id preenchido. A query da Matriz
        // nao filtra por origem_tipo -- trata identico a um lancamento manual.
        return {
          results: [
            {
              tipo_id: 20,
              ultima_data: '2026-06-01',
              data_vencimento: '2027-06-01',
            },
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

describe('matriz-treinamento reconhece qualificacao gerada por LMS', () => {
  it('nao aponta gap quando o unico registro do tipo veio com origem_tipo=LMS', async () => {
    const app = createApp(createMockDb());
    const response = await app.request('/requisitos/42');
    const body = (await response.json()) as {
      data: Array<{ qualificacao_tipo_id: number; status: string }>;
    };

    expect(response.status).toBe(200);
    expect(body.data).toEqual([
      expect.objectContaining({ qualificacao_tipo_id: 20, status: 'EM_DIA' }),
    ]);
  });
});

/**
 * completeLmsMatricula — orquestração e contrato de retorno discriminado.
 * A prova de atomicidade real (SQLite) está em lms-completion.rollback.test.ts;
 * aqui testamos apenas o fluxo de controle (outcomes, retry, rejeição).
 */
import { describe, expect, it, vi } from 'vitest';
import { completeLmsMatricula, LmsCompletionRejectedError } from '../../services/lms-completion';

function makeFakeDb(options: {
  historicoLookup?: () => { id: number } | null;
  cycleLookup?: () => { id: number } | null;
  maxCiclo?: number;
  categoryLookup?: () => Record<string, unknown> | null;
  batchImpl?: (statements: unknown[]) => Promise<unknown>;
}) {
  const batchCalls: unknown[][] = [];
  const runCalls: string[] = [];

  const db = {
    prepare: vi.fn((sql: string) => ({
      bind: (...args: unknown[]) => ({
        first: async () => {
          if (sql.includes('FROM qualificacoes_tipos qt')) {
            return options.categoryLookup
              ? options.categoryLookup()
              : {
                  tipo_categoria: 'EAD',
                  categoria_id: 13,
                  categoria_nome: 'EAD',
                  categoria_empresa_id: 6,
                  categoria_ativo: 1,
                  categoria_deleted_at: null,
                };
          }
          if (sql.includes('FROM qualificacoes_historico') && sql.includes('data_conclusao = ?')) {
            return options.historicoLookup ? options.historicoLookup() : null;
          }
          if (sql.includes('FROM lms_matricula_ciclos') && sql.includes('ciclo_atual = 1')) {
            return options.cycleLookup ? options.cycleLookup() : null;
          }
          if (sql.includes('MAX(numero_ciclo)')) {
            return { max_numero: options.maxCiclo ?? 0 };
          }
          if (sql.includes('COALESCE(renovada, 0) = 0')) {
            return null;
          }
          return null;
        },
        run: async () => {
          runCalls.push(sql);
          return { meta: { changes: 1 } };
        },
      }),
      __sql: sql,
    })),
    batch: vi.fn(async (statements: unknown[]) => {
      batchCalls.push(statements);
      if (options.batchImpl) return options.batchImpl(statements);
      return statements.map(() => ({ meta: { changes: 1 } }));
    }),
  } as unknown as D1Database & { __batchCalls: unknown[][]; __runCalls: string[] };

  (db as unknown as { __batchCalls: unknown[][] }).__batchCalls = batchCalls;
  (db as unknown as { __runCalls: string[] }).__runCalls = runCalls;
  return db;
}

function baseParams(db: D1Database, overrides: Record<string, unknown> = {}) {
  return {
    db,
    empresaId: 6,
    matriculaId: 1,
    funcionarioId: 77,
    cursoTitulo: 'Curso',
    gerarQualificacaoAoConcluir: true,
    qualificacaoTipoId: 55,
    qualificacaoCodigo: 'QUAL-X',
    qualificacaoNome: 'Qualificação X',
    qualificacaoCategoriaId: 13,
    qualificacaoCategoria: 'EAD',
    validade: 12,
    dataConclusao: '2026-07-30',
    existingHistoricoId: null,
    action: 'LMS_MATRICULA_CONCLUIDA',
    actorUserId: 42,
    ...overrides,
  };
}

describe('completeLmsMatricula', () => {
  it('curso sem qualificação exigida: outcome qualification_not_required, um único batch', async () => {
    const db = makeFakeDb({});
    const result = await completeLmsMatricula(
      baseParams(db, { gerarQualificacaoAoConcluir: false, qualificacaoTipoId: null }) as never,
    );

    expect(result.outcome).toBe('qualification_not_required');
    expect(result.qualificacaoHistoricoId).toBeNull();
    expect((db as unknown as { __batchCalls: unknown[][] }).__batchCalls).toHaveLength(1);
  });

  it('Histórico novo: outcome qualification_created', async () => {
    let lookupCount = 0;
    const db = makeFakeDb({
      historicoLookup: () => {
        lookupCount += 1;
        // Antes do batch: não existe. Depois do batch (leitura final): existe.
        return lookupCount === 1 ? null : { id: 900 };
      },
    });

    const result = await completeLmsMatricula(baseParams(db) as never);

    expect(result.outcome).toBe('qualification_created');
    expect(result.qualificacaoHistoricoId).toBe(900);
  });

  it('Histórico já vinculado (existingHistoricoId): outcome qualification_reused, sem novo lookup pré-batch', async () => {
    const db = makeFakeDb({ historicoLookup: () => ({ id: 777 }) });

    const result = await completeLmsMatricula(
      baseParams(db, { existingHistoricoId: 777 }) as never,
    );

    expect(result.outcome).toBe('qualification_reused');
    expect(result.qualificacaoHistoricoId).toBe(777);
  });

  it('falha no batch (causa inesperada): lança LmsCompletionRejectedError, NUNCA retorna 200 com qualification_failed:true', async () => {
    const db = makeFakeDb({
      historicoLookup: () => null,
      batchImpl: async () => {
        throw new Error('D1_ERROR: disk I/O error');
      },
    });

    await expect(completeLmsMatricula(baseParams(db) as never)).rejects.toBeInstanceOf(
      LmsCompletionRejectedError,
    );
  });

  it('corrida concorrente (UNIQUE constraint): primeiro batch falha, retry único reconcilia como reuso', async () => {
    let batchAttempt = 0;
    let lookupCount = 0;
    const db = makeFakeDb({
      historicoLookup: () => {
        lookupCount += 1;
        // 1ª leitura (pré-batch da 1ª tentativa): ainda não existe.
        // 2ª leitura (pré-batch do retry): a concorrente já inseriu.
        return lookupCount === 1 ? null : { id: 999 };
      },
      batchImpl: async () => {
        batchAttempt += 1;
        if (batchAttempt === 1) {
          throw new Error(
            'D1_ERROR: UNIQUE constraint failed: qualificacoes_historico.funcionario_id, qualificacoes_historico.qualificacao_codigo, qualificacoes_historico.data_conclusao',
          );
        }
        return [];
      },
    });

    const result = await completeLmsMatricula(baseParams(db) as never);

    expect(result.outcome).toBe('qualification_reused');
    expect(result.qualificacaoHistoricoId).toBe(999);
    expect(batchAttempt).toBe(2);
  });

  it('falha por causa diferente da corrida esperada: não tenta retry, rejeita', async () => {
    let batchAttempt = 0;
    const db = makeFakeDb({
      historicoLookup: () => null,
      batchImpl: async () => {
        batchAttempt += 1;
        throw new Error('D1_ERROR: UNIQUE constraint failed: other_table.foreign_key');
      },
    });

    await expect(completeLmsMatricula(baseParams(db) as never)).rejects.toBeInstanceOf(
      LmsCompletionRejectedError,
    );
    expect(batchAttempt).toBe(1);
  });

  it.each([
    [
      'categoria Teórico',
      {
        categoria_id: 3,
        categoria_nome: 'Treinamento Teórico',
        categoria_ativo: 1,
        categoria_empresa_id: 6,
        categoria_deleted_at: null,
      },
    ],
    [
      'categoria ausente',
      {
        categoria_id: null,
        categoria_nome: null,
        categoria_ativo: null,
        categoria_empresa_id: null,
        categoria_deleted_at: null,
      },
    ],
    [
      'categoria inativa',
      {
        categoria_id: 13,
        categoria_nome: 'EAD',
        categoria_ativo: 0,
        categoria_empresa_id: 6,
        categoria_deleted_at: null,
      },
    ],
    [
      'categoria de outro tenant',
      {
        categoria_id: 13,
        categoria_nome: 'EAD',
        categoria_ativo: 1,
        categoria_empresa_id: 7,
        categoria_deleted_at: null,
      },
    ],
  ])('rejeita conclusão EAD com %s', async (_scenario, category) => {
    const db = makeFakeDb({
      categoryLookup: () => ({ tipo_categoria: 'EAD', ...category }),
    });

    await expect(completeLmsMatricula(baseParams(db) as never)).rejects.toMatchObject({
      code: 'LMS_EAD_CATEGORY_MAPPING_INVALID',
    });
    expect((db as unknown as { __batchCalls: unknown[][] }).__batchCalls).toHaveLength(0);
  });
});

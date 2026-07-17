import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createLmsQualificationOnCompletion } from '../../services/lms-qualification';

const { syncMatriculaCycleHistoricoLinkMock } = vi.hoisted(() => ({
  syncMatriculaCycleHistoricoLinkMock: vi.fn(),
}));

vi.mock('../../services/lms-matricula-cycle', () => ({
  syncMatriculaCycleHistoricoLink: syncMatriculaCycleHistoricoLinkMock,
}));

function createMockDb() {
  const calls: Array<{ query: string; args: unknown[]; method: 'first' | 'run' }> = [];
  const db = {
    prepare: vi.fn((query: string) => ({
      bind: (...args: unknown[]) => ({
        first: async () => {
          calls.push({ query, args, method: 'first' });
          if (query.includes('AND data_conclusao = ?')) return null;
          if (query.includes('COALESCE(renovada, 0) = 0')) return null;
          return null;
        },
        run: async () => {
          calls.push({ query, args, method: 'run' });
          if (query.includes('INSERT INTO qualificacoes_historico')) {
            return { meta: { last_row_id: 321, changes: 1 } };
          }
          return { meta: { changes: 1 } };
        },
      }),
    })),
  } as unknown as D1Database;

  return { db, calls };
}

describe('lms qualification completion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    syncMatriculaCycleHistoricoLinkMock.mockResolvedValue(undefined);
  });

  it('grava histórico LMS sem vencimento quando o modelo não possui validade', async () => {
    const { db, calls } = createMockDb();

    const historicoId = await createLmsQualificationOnCompletion({
      db,
      matriculaId: 55,
      empresaId: 6,
      funcionarioId: 77,
      cursoTitulo: 'Curso interno sem validade',
      qualificacaoTipoId: 99,
      qualificacaoCodigo: 'CIG',
      qualificacaoNome: 'Curso Interno Geral',
      qualificacaoCategoria: 'EAD',
      validade: null,
      vencimentoFimMes: 1,
      dataConclusao: '2026-06-30',
      existingHistoricoId: null,
    });

    expect(historicoId).toBe(321);

    const insertCall = calls.find(
      (call) =>
        call.method === 'run' && call.query.includes('INSERT INTO qualificacoes_historico'),
    );
    expect(insertCall).toBeDefined();
    expect(insertCall?.args[7]).toBeNull();
    expect(insertCall?.args[8]).toBeNull();
    expect(syncMatriculaCycleHistoricoLinkMock).toHaveBeenCalledWith(db, {
      matriculaId: 55,
      historicoId: 321,
      empresaId: 6,
    });
  });

  it('reconcilia sem duplicar quando o INSERT perde a corrida para a UNIQUE constraint', async () => {
    // Duas conclusoes concorrentes da mesma matricula/qualificacao podem
    // chegar ao mesmo tempo: a primeira insere, a segunda colide com a
    // UNIQUE constraint (funcionario_id, qualificacao_codigo, data_conclusao).
    // O catch deve religar a matricula ao registro ja inserido pela outra
    // requisicao, sem lancar erro e sem criar um segundo historico.
    let sameDateQueries = 0;
    const calls: Array<{ query: string; args: unknown[]; method: 'first' | 'run' }> = [];
    const db = {
      prepare: vi.fn((query: string) => ({
        bind: (...args: unknown[]) => ({
          first: async () => {
            calls.push({ query, args, method: 'first' });
            if (query.includes('AND data_conclusao = ?') && query.includes('ORDER BY id DESC')) {
              sameDateQueries += 1;
              // 1a chamada: verificacao "existingHistorico" antes do INSERT —
              // ainda nao existe do ponto de vista desta requisicao.
              if (sameDateQueries === 1) return null;
              // 2a chamada: dentro do catch, apos a UNIQUE constraint —
              // o registro concorrente ja foi inserido pela outra requisicao.
              return { id: 999 };
            }
            if (query.includes('COALESCE(renovada, 0) = 0')) return null;
            return null;
          },
          run: async () => {
            calls.push({ query, args, method: 'run' });
            if (query.includes('INSERT INTO qualificacoes_historico')) {
              throw new Error(
                'D1_ERROR: UNIQUE constraint failed: qualificacoes_historico.funcionario_id, qualificacoes_historico.qualificacao_codigo, qualificacoes_historico.data_conclusao',
              );
            }
            return { meta: { changes: 1 } };
          },
        }),
      })),
    } as unknown as D1Database;

    const historicoId = await createLmsQualificationOnCompletion({
      db,
      matriculaId: 55,
      empresaId: 6,
      funcionarioId: 77,
      cursoTitulo: 'Curso concorrente',
      qualificacaoTipoId: 99,
      qualificacaoCodigo: 'CIG',
      qualificacaoNome: 'Curso Interno Geral',
      qualificacaoCategoria: 'EAD',
      validade: null,
      vencimentoFimMes: 1,
      dataConclusao: '2026-06-30',
      existingHistoricoId: null,
    });

    expect(historicoId).toBe(999);
    expect(sameDateQueries).toBe(2);
    expect(
      calls.some(
        (call) => call.method === 'run' && call.query.includes('INSERT INTO qualificacoes_historico'),
      ),
    ).toBe(true);
    expect(syncMatriculaCycleHistoricoLinkMock).toHaveBeenCalledWith(db, {
      matriculaId: 55,
      historicoId: 999,
      empresaId: 6,
    });
  });

  it('propaga o erro quando o INSERT falha por uma constraint diferente da corrida esperada', async () => {
    const db = {
      prepare: vi.fn((query: string) => ({
        bind: (..._args: unknown[]) => ({
          first: async () => null,
          run: async () => {
            if (query.includes('INSERT INTO qualificacoes_historico')) {
              throw new Error('D1_ERROR: some other constraint violation');
            }
            return { meta: { changes: 1 } };
          },
        }),
      })),
    } as unknown as D1Database;

    await expect(
      createLmsQualificationOnCompletion({
        db,
        matriculaId: 55,
        empresaId: 6,
        funcionarioId: 77,
        cursoTitulo: 'Curso com erro inesperado',
        qualificacaoTipoId: 99,
        qualificacaoCodigo: 'CIG',
        qualificacaoNome: 'Curso Interno Geral',
        qualificacaoCategoria: 'EAD',
        validade: null,
        vencimentoFimMes: 1,
        dataConclusao: '2026-06-30',
        existingHistoricoId: null,
      }),
    ).rejects.toThrow('some other constraint violation');
  });
});

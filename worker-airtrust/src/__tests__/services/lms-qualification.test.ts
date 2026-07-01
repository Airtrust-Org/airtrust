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
});

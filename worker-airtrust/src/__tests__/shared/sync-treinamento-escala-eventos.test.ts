import { beforeEach, describe, expect, it } from 'vitest';
import { syncTreinamentoToEscalaEventos } from '../../shared/syncEscalaEventosExternos';

type MockRow = Record<string, unknown>;

function createMockDb(opts: {
  escalaId: string | null;
  insertSpy: (row: MockRow) => void;
  removeSpy: (args: unknown[]) => void;
}) {
  const queries: Array<{ query: string; args: unknown[] }> = [];

  const db = {
    prepare(query: string) {
      return {
        bind(...args: unknown[]) {
          queries.push({ query, args });
          return {
            run: async () => ({ meta: { changes: 0 } }),
            first: async <T>(): Promise<T | null> => {
              if (query.includes('FROM escalas_mensais')) {
                return opts.escalaId ? ({ id: opts.escalaId } as T) : null;
              }
              return null;
            },
          };
        },
      };
    },
  };

  // Override prepare to capture inserts and deletes
  const originalPrepare = db.prepare.bind(db);
  (db as any).prepare = (query: string) => {
    const stmt = originalPrepare(query);
    return {
      bind(...args: unknown[]) {
        const bound = stmt.bind(...args);
        return {
          run: async () => {
            if (query.includes('INSERT INTO escala_eventos')) {
              opts.insertSpy({ query, args });
            }
            if (query.includes('UPDATE escala_eventos') && query.includes('deleted_at')) {
              opts.removeSpy(args);
            }
            return { meta: { changes: 0 } };
          },
          first: bound.first,
        };
      },
    };
  };

  return db as unknown as D1Database;
}

describe('syncTreinamentoToEscalaEventos', () => {
  let inserts: MockRow[];
  let removes: unknown[][];

  beforeEach(() => {
    inserts = [];
    removes = [];
  });

  it('creates treinamento_solo events for each participant when escala exists', async () => {
    const db = createMockDb({
      escalaId: 'escala-julho-id',
      insertSpy: (row) => inserts.push(row),
      removeSpy: (args) => removes.push(args),
    });

    await syncTreinamentoToEscalaEventos({
      db,
      empresaId: 6,
      treinamentoId: 42,
      dataInicio: '2026-07-15',
      dataFim: '2026-07-15',
      status: 'PLANEJADO',
      titulo: 'CRM Básico',
      codigoTurma: 'CRM-001',
      participanteIds: [10, 20],
      createdBy: 'system',
    });

    expect(inserts).toHaveLength(2);
    const [ins0, ins1] = inserts;
    // Both inserts have treinamento:42 as tripulacao_id
    expect(String(ins0.args)).toContain('treinamento:42');
    expect(String(ins1.args)).toContain('treinamento:42');
    // Both inserts use treinamento_solo event type
    expect(String(ins0.args)).toContain('treinamento_solo');
    expect(String(ins1.args)).toContain('treinamento_solo');
    // Pending status for PLANEJADO
    expect(String(ins0.args)).toContain('pendente');
  });

  it('skips event creation when no escala exists for the training month', async () => {
    const db = createMockDb({
      escalaId: null,
      insertSpy: (row) => inserts.push(row),
      removeSpy: (args) => removes.push(args),
    });

    await syncTreinamentoToEscalaEventos({
      db,
      empresaId: 6,
      treinamentoId: 99,
      dataInicio: '2026-07-15',
      dataFim: '2026-07-15',
      status: 'PLANEJADO',
      titulo: 'Treinamento',
      codigoTurma: null,
      participanteIds: [10],
      createdBy: 'system',
    });

    expect(inserts).toHaveLength(0);
  });

  it('removes events for all participants when training is CANCELADO', async () => {
    const db = createMockDb({
      escalaId: 'escala-id',
      insertSpy: (row) => inserts.push(row),
      removeSpy: (args) => removes.push(args),
    });

    await syncTreinamentoToEscalaEventos({
      db,
      empresaId: 6,
      treinamentoId: 5,
      dataInicio: '2026-08-10',
      dataFim: '2026-08-10',
      status: 'CANCELADO',
      titulo: 'Cancelled Training',
      codigoTurma: null,
      participanteIds: [10, 20, 30],
      createdBy: 'system',
    });

    expect(inserts).toHaveLength(0);
    // 3 remove calls (one per participant)
    expect(removes).toHaveLength(3);
  });

  it('removes events for removed participants', async () => {
    const db = createMockDb({
      escalaId: 'escala-id',
      insertSpy: (row) => inserts.push(row),
      removeSpy: (args) => removes.push(args),
    });

    await syncTreinamentoToEscalaEventos({
      db,
      empresaId: 6,
      treinamentoId: 7,
      dataInicio: '2026-08-10',
      dataFim: '2026-08-10',
      status: 'PLANEJADO',
      titulo: 'Training',
      codigoTurma: null,
      participanteIds: [10],
      removedParticipantIds: [99],
      createdBy: 'system',
    });

    // 2 removals: 1 for removed participant + 1 for current participant via replaceManagedEscalaEvents
    expect(removes.length).toBeGreaterThanOrEqual(1);
    // 1 insert for the remaining participant
    expect(inserts).toHaveLength(1);
  });

  it('uses confirmado status for CONFIRMADO training', async () => {
    const db = createMockDb({
      escalaId: 'escala-id',
      insertSpy: (row) => inserts.push(row),
      removeSpy: (args) => removes.push(args),
    });

    await syncTreinamentoToEscalaEventos({
      db,
      empresaId: 6,
      treinamentoId: 11,
      dataInicio: '2026-08-10',
      dataFim: '2026-08-10',
      status: 'CONFIRMADO',
      titulo: 'Confirmed Training',
      codigoTurma: null,
      participanteIds: [10],
      createdBy: 'system',
    });

    expect(inserts).toHaveLength(1);
    expect(String(inserts[0].args)).toContain('confirmado');
  });

  it('uses treinamento as origem', async () => {
    const db = createMockDb({
      escalaId: 'escala-id',
      insertSpy: (row) => inserts.push(row),
      removeSpy: (args) => removes.push(args),
    });

    await syncTreinamentoToEscalaEventos({
      db,
      empresaId: 6,
      treinamentoId: 15,
      dataInicio: '2026-08-10',
      dataFim: '2026-08-10',
      status: 'PLANEJADO',
      titulo: 'Test',
      codigoTurma: 'T-001',
      participanteIds: [10],
      createdBy: 'user1',
    });

    expect(inserts).toHaveLength(1);
    expect(String(inserts[0].args)).toContain('treinamento');
  });
});

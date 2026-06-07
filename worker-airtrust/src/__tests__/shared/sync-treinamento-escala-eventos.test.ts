import { beforeEach, describe, expect, it } from 'vitest';
import { syncTreinamentoToEscalaEventos } from '../../shared/syncEscalaEventosExternos';

/**
 * Minimal D1Database mock.
 * - prepare().bind() returns a "bound statement" that carries { _query, _args }.
 * - batch() iterates over bound statements and dispatches to spies.
 * - run() on UPDATE statements dispatches to removeSpy (for non-batch removes).
 * - first() answers escala_mensais lookups.
 */
function createMockDb(opts: {
  escalaId: string | null;
  insertSpy: (q: string, args: unknown[]) => void;
  removeSpy: (q: string, args: unknown[]) => void;
}) {
  function makeBound(query: string, args: unknown[]) {
    return {
      _query: query,
      _args: args,
      run: async () => {
        if (query.includes('UPDATE escala_eventos') && query.includes('deleted_at')) {
          opts.removeSpy(query, args);
        }
        return { meta: { changes: 0 } };
      },
      first: async <T>(): Promise<T | null> => {
        if (query.includes('FROM escalas_mensais')) {
          return opts.escalaId ? ({ id: opts.escalaId } as T) : null;
        }
        return null;
      },
    };
  }

  return {
    prepare(query: string) {
      return {
        bind(...args: unknown[]) {
          return makeBound(query, args);
        },
      };
    },
    async batch(stmts: Array<{ _query?: string; _args?: unknown[] }>) {
      for (const stmt of stmts) {
        const q = stmt._query ?? '';
        const a = stmt._args ?? [];
        if (q.includes('INSERT INTO escala_eventos')) {
          opts.insertSpy(q, a);
        }
        if (q.includes('UPDATE escala_eventos') && q.includes('deleted_at')) {
          opts.removeSpy(q, a);
        }
      }
      return [];
    },
  } as unknown as D1Database;
}

describe('syncTreinamentoToEscalaEventos', () => {
  let inserts: Array<{ q: string; args: unknown[] }>;
  let removes: Array<{ q: string; args: unknown[] }>;

  beforeEach(() => {
    inserts = [];
    removes = [];
  });

  // ─── R1: Instructors included in sync ──────────────────────────────────────

  it('creates events for participants AND instructors (Fix R1)', async () => {
    const db = createMockDb({
      escalaId: 'escala-id',
      insertSpy: (q, args) => inserts.push({ q, args }),
      removeSpy: (q, args) => removes.push({ q, args }),
    });

    await syncTreinamentoToEscalaEventos({
      db,
      empresaId: 6,
      treinamentoId: 42,
      dataInicio: '2026-08-10',
      dataFim: '2026-08-10',
      status: 'PLANEJADO',
      titulo: 'CRM',
      codigoTurma: null,
      participanteIds: [10, 20],
      instrutorIds: [33],
      createdBy: 'system',
    });

    // 2 participants + 1 instructor = 3 inserts
    expect(inserts).toHaveLength(3);
    const funcIds = inserts.map((s) => s.args[3]); // funcionario_id is 4th bind
    expect(funcIds).toContain('10');
    expect(funcIds).toContain('20');
    expect(funcIds).toContain('33');
  });

  it('deduplicates when a person is both participant and instructor (Fix R1)', async () => {
    const db = createMockDb({
      escalaId: 'escala-id',
      insertSpy: (q, args) => inserts.push({ q, args }),
      removeSpy: (q, args) => removes.push({ q, args }),
    });

    await syncTreinamentoToEscalaEventos({
      db,
      empresaId: 6,
      treinamentoId: 55,
      dataInicio: '2026-08-10',
      dataFim: '2026-08-10',
      status: 'PLANEJADO',
      titulo: 'Dual',
      codigoTurma: null,
      participanteIds: [10],
      instrutorIds: [10], // same person — deduplicated
      createdBy: 'system',
    });

    expect(inserts).toHaveLength(1);
  });

  it('removes events for removed instructors (Fix R1)', async () => {
    const db = createMockDb({
      escalaId: 'escala-id',
      insertSpy: (q, args) => inserts.push({ q, args }),
      removeSpy: (q, args) => removes.push({ q, args }),
    });

    await syncTreinamentoToEscalaEventos({
      db,
      empresaId: 6,
      treinamentoId: 7,
      dataInicio: '2026-08-10',
      dataFim: '2026-08-10',
      status: 'PLANEJADO',
      titulo: 'T',
      codigoTurma: null,
      participanteIds: [10],
      removedInstrutorIds: [99],
      createdBy: 'system',
    });

    // removedInstrutor 99 gets a removal (args[2] = funcionario_id in UPDATE)
    const removedFuncIds = removes.map((s) => s.args[2]);
    expect(removedFuncIds).toContain('99');
    expect(inserts).toHaveLength(1); // current participant 10
  });

  // ─── R2: Per-day events when diasEfetivos provided ─────────────────────────

  it('creates one event per day per person when diasEfetivos provided (Fix R2)', async () => {
    const db = createMockDb({
      escalaId: 'escala-id',
      insertSpy: (q, args) => inserts.push({ q, args }),
      removeSpy: (q, args) => removes.push({ q, args }),
    });

    await syncTreinamentoToEscalaEventos({
      db,
      empresaId: 6,
      treinamentoId: 100,
      dataInicio: '2026-08-11',
      dataFim: '2026-08-15',
      diasEfetivos: ['2026-08-11', '2026-08-13', '2026-08-15'], // Mon/Wed/Fri only
      status: 'PLANEJADO',
      titulo: 'Multi-day',
      codigoTurma: null,
      participanteIds: [10, 20],
      createdBy: 'system',
    });

    // 3 days × 2 participants = 6 inserts
    expect(inserts).toHaveLength(6);

    const datePairs = inserts.map((s) => ({ ini: s.args[5], fim: s.args[6] }));
    expect(datePairs.filter((p) => p.ini === '2026-08-11')).toHaveLength(2);
    expect(datePairs.filter((p) => p.ini === '2026-08-13')).toHaveLength(2);
    expect(datePairs.filter((p) => p.ini === '2026-08-15')).toHaveLength(2);
    // Tuesday and Thursday must NOT appear
    expect(datePairs.some((p) => p.ini === '2026-08-12')).toBe(false);
    expect(datePairs.some((p) => p.ini === '2026-08-14')).toBe(false);
  });

  it('falls back to range event when no diasEfetivos provided', async () => {
    const db = createMockDb({
      escalaId: 'escala-id',
      insertSpy: (q, args) => inserts.push({ q, args }),
      removeSpy: (q, args) => removes.push({ q, args }),
    });

    await syncTreinamentoToEscalaEventos({
      db,
      empresaId: 6,
      treinamentoId: 101,
      dataInicio: '2026-08-10',
      dataFim: '2026-08-10',
      status: 'PLANEJADO',
      titulo: 'Single day',
      codigoTurma: null,
      participanteIds: [10],
      createdBy: 'system',
    });

    expect(inserts).toHaveLength(1);
    expect(inserts[0].args[5]).toBe('2026-08-10'); // data_inicio
    expect(inserts[0].args[6]).toBe('2026-08-10'); // data_fim
  });

  // ─── R3: Batch inserts ─────────────────────────────────────────────────────

  it('uses db.batch() for all inserts (Fix R3)', async () => {
    let batchCalls = 0;
    const base = createMockDb({
      escalaId: 'escala-id',
      insertSpy: (q, args) => inserts.push({ q, args }),
      removeSpy: (q, args) => removes.push({ q, args }),
    });

    const db = {
      ...base,
      batch: async (stmts: unknown[]) => {
        batchCalls++;
        return (base as any).batch(stmts);
      },
    } as unknown as D1Database;

    await syncTreinamentoToEscalaEventos({
      db,
      empresaId: 6,
      treinamentoId: 200,
      dataInicio: '2026-08-10',
      dataFim: '2026-08-10',
      status: 'PLANEJADO',
      titulo: 'Batch',
      codigoTurma: null,
      participanteIds: [10, 20, 30],
      createdBy: 'system',
    });

    expect(batchCalls).toBe(1);
    expect(inserts).toHaveLength(3);
  });

  // ─── Regression guards ─────────────────────────────────────────────────────

  it('skips inserts when no escala exists for the training month', async () => {
    const db = createMockDb({
      escalaId: null,
      insertSpy: (q, args) => inserts.push({ q, args }),
      removeSpy: (q, args) => removes.push({ q, args }),
    });

    await syncTreinamentoToEscalaEventos({
      db,
      empresaId: 6,
      treinamentoId: 99,
      dataInicio: '2026-07-15',
      dataFim: '2026-07-15',
      status: 'PLANEJADO',
      titulo: 'No escala',
      codigoTurma: null,
      participanteIds: [10],
      createdBy: 'system',
    });

    expect(inserts).toHaveLength(0);
  });

  it('removes events for all people when CANCELADO', async () => {
    const db = createMockDb({
      escalaId: 'escala-id',
      insertSpy: (q, args) => inserts.push({ q, args }),
      removeSpy: (q, args) => removes.push({ q, args }),
    });

    await syncTreinamentoToEscalaEventos({
      db,
      empresaId: 6,
      treinamentoId: 5,
      dataInicio: '2026-08-10',
      dataFim: '2026-08-10',
      status: 'CANCELADO',
      titulo: 'Cancelled',
      codigoTurma: null,
      participanteIds: [10, 20, 30],
      instrutorIds: [33],
      createdBy: 'system',
    });

    expect(inserts).toHaveLength(0);
    // All 4 unique people (10,20,30,33) get removal calls
    expect(removes).toHaveLength(4);
  });

  it('uses confirmado status for CONFIRMADO training', async () => {
    const db = createMockDb({
      escalaId: 'escala-id',
      insertSpy: (q, args) => inserts.push({ q, args }),
      removeSpy: (q, args) => removes.push({ q, args }),
    });

    await syncTreinamentoToEscalaEventos({
      db,
      empresaId: 6,
      treinamentoId: 11,
      dataInicio: '2026-08-10',
      dataFim: '2026-08-10',
      status: 'CONFIRMADO',
      titulo: 'Confirmed',
      codigoTurma: null,
      participanteIds: [10],
      createdBy: 'system',
    });

    expect(inserts).toHaveLength(1);
    // status is bind index 11 (0-based): id,escala,linkId,funcId,tipo,ini,fim,[dia_todo],local,aeronave,sim,[1],motivo,status
    expect(inserts[0].args[11]).toBe('confirmado');
  });

  it('uses treinamento as origem (bind index 13)', async () => {
    const db = createMockDb({
      escalaId: 'escala-id',
      insertSpy: (q, args) => inserts.push({ q, args }),
      removeSpy: (q, args) => removes.push({ q, args }),
    });

    await syncTreinamentoToEscalaEventos({
      db,
      empresaId: 6,
      treinamentoId: 15,
      dataInicio: '2026-08-10',
      dataFim: '2026-08-10',
      status: 'PLANEJADO',
      titulo: 'Origem test',
      codigoTurma: 'T-001',
      participanteIds: [10],
      createdBy: 'user1',
    });

    expect(inserts).toHaveLength(1);
    // origem is bind index 12
    expect(inserts[0].args[12]).toBe('treinamento');
  });
});

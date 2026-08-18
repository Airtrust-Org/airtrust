/**
 * Real-SQL (node:sqlite) tests for settleQualificationHistoryAtomic — the
 * canonical qualification-writer-convergence primitive — and for the
 * renovacao_de gap fix in createQualificationHistoryAtomic's plain-create
 * path (the "creates a row but never links it into the chain" bug
 * identified by the overnight audit).
 *
 * Invariant under test throughout: successor.renovacao_de = predecessor.id
 * is the canonical relational chain — renovada/status=RENOVADA are legacy
 * auxiliary materializations, not the source of truth by themselves.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createQualificationHistoryAtomic,
  settleQualificationHistoryAtomic,
  type AtomicQualificationCreateInput,
  type SettleQualificationHistoryInput,
} from '../../services/qualification-history-atomic';
import { insertHistory, SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';

function settleInput(
  overrides: Partial<SettleQualificationHistoryInput> = {},
): SettleQualificationHistoryInput {
  return {
    empresaId: 1,
    funcionarioId: 1000,
    qualificationId: 100,
    qualificationCode: 'MNT-12',
    category: 'MANUTENCAO',
    completionDate: '2026-08-01',
    expiryDate: '2027-08-01',
    validityMonths: 12,
    instructor: 'INSTRUTOR',
    observations: null,
    workload: 4,
    trainingType: 'RECORRENTE',
    ...overrides,
  };
}

function createInput(
  overrides: Partial<AtomicQualificationCreateInput> = {},
): AtomicQualificationCreateInput {
  return {
    empresaId: 1,
    funcionarioId: 1000,
    qualificationId: 100,
    qualificationCode: 'MNT-12',
    category: 'MANUTENCAO',
    completionDate: '2026-08-01',
    expiryDate: '2027-08-01',
    validityMonths: 12,
    instructor: 'INSTRUTOR',
    observations: null,
    status: 'CONCLUIDA',
    workload: 4,
    trainingType: 'RECORRENTE',
    requiredRelation: null,
    ...overrides,
  };
}

async function readRow(db: SqliteD1Database, id: number) {
  return db.database
    .prepare(
      `SELECT id, status, renovada, renovacao_de, data_conclusao, empresa_id
         FROM qualificacoes_historico WHERE id = ?`,
    )
    .get(id) as
    | {
        id: number;
        status: string;
        renovada: number;
        renovacao_de: number | null;
        data_conclusao: string;
        empresa_id: number;
      }
    | undefined;
}

describe('settleQualificationHistoryAtomic', () => {
  let db: SqliteD1Database;

  beforeEach(() => {
    db = new SqliteD1Database();
  });

  afterEach(() => {
    db.close();
  });

  // A. single history — first realization has no predecessor.
  it('A. first realization: renovacao_de is NULL, no predecessor', async () => {
    const result = await settleQualificationHistoryAtomic(db.asD1(), settleInput());
    expect(result.action).toBe('created');
    expect(result.predecessorId).toBeNull();
    const row = await readRow(db, result.id);
    expect(row?.status).toBe('CONCLUIDA');
    expect(row?.renovacao_de).toBeNull();
  });

  // B. predecessor + successor — settling a second, later realization links back.
  it('B. second realization: renovacao_de points at the first, predecessor materialized RENOVADA', async () => {
    const first = await settleQualificationHistoryAtomic(
      db.asD1(),
      settleInput({ completionDate: '2025-08-01' }),
    );
    const second = await settleQualificationHistoryAtomic(
      db.asD1(),
      settleInput({ completionDate: '2026-08-01' }),
    );

    expect(second.predecessorId).toBe(first.id);
    const predecessorRow = await readRow(db, first.id);
    expect(predecessorRow?.renovada).toBe(1);
    expect(predecessorRow?.status).toBe('RENOVADA');
  });

  // C. multiple legacy active predecessors — all get materialized RENOVADA,
  // but renovacao_de points only at the chronologically immediate one.
  it('C. multiple legacy predecessors: all marked RENOVADA, renovacao_de points at the most recent only', async () => {
    const oldest = insertHistory(db.database, {
      completionDate: '2023-08-01',
      status: 'CONCLUIDA',
    });
    const middle = insertHistory(db.database, {
      completionDate: '2024-08-01',
      status: 'CONCLUIDA',
    });
    const recent = insertHistory(db.database, {
      completionDate: '2025-08-01',
      status: 'CONCLUIDA',
    });

    const target = await settleQualificationHistoryAtomic(
      db.asD1(),
      settleInput({ completionDate: '2026-08-01' }),
    );

    expect(target.predecessorId).toBe(recent);
    for (const id of [oldest, middle, recent]) {
      const row = await readRow(db, id);
      expect(row?.status).toBe('RENOVADA');
      expect(row?.renovada).toBe(1);
    }
  });

  // D. retroactive completion — settling a PAST date must not disturb a
  // chronologically FUTURE record; renovacao_de must never point forward.
  it('D. retroactive completion: future record is untouched, not selected as predecessor', async () => {
    const future = insertHistory(db.database, {
      completionDate: '2027-08-01',
      status: 'CONCLUIDA',
    });

    const retroactive = await settleQualificationHistoryAtomic(
      db.asD1(),
      settleInput({ completionDate: '2026-01-01' }),
    );

    expect(retroactive.predecessorId).toBeNull();
    const futureRow = await readRow(db, future);
    expect(futureRow?.status).toBe('CONCLUIDA');
    expect(futureRow?.renovada).toBe(0);
    expect(futureRow?.renovacao_de).toBeNull();
  });

  // E. future record settled after — the earlier "retroactive" row becomes
  // its predecessor once the future one is itself settled.
  it('E. settling the future row afterward correctly picks up the earlier one as predecessor', async () => {
    const earlier = await settleQualificationHistoryAtomic(
      db.asD1(),
      settleInput({ completionDate: '2026-01-01' }),
    );
    const later = await settleQualificationHistoryAtomic(
      db.asD1(),
      settleInput({ completionDate: '2027-08-01', expiryDate: '2028-08-01' }),
    );
    expect(later.predecessorId).toBe(earlier.id);
  });

  // F. retry after intermediate failure — a row created by a prior faulted
  // attempt (renovacao_de still NULL) converges when settle is retried.
  it('F. retry from intermediate state: pre-existing row missing renovacao_de gets repaired', async () => {
    insertHistory(db.database, { completionDate: '2025-08-01', status: 'CONCLUIDA' });
    // Simulates a prior partial write: row exists but was never linked.
    const preExisting = insertHistory(db.database, {
      completionDate: '2026-08-01',
      status: 'CONCLUIDA',
    });
    expect((await readRow(db, preExisting))?.renovacao_de).toBeNull();

    const result = await settleQualificationHistoryAtomic(db.asD1(), settleInput());
    expect(result.id).toBe(preExisting);
    expect(result.action).toBe('idempotent');
    const repaired = await readRow(db, preExisting);
    expect(repaired?.renovacao_de).not.toBeNull();
  });

  // G. N retries converge to the same final state (idempotency).
  it('G. retrying settle N times converges to the identical final state', async () => {
    insertHistory(db.database, { completionDate: '2025-08-01', status: 'CONCLUIDA' });
    let last;
    for (let i = 0; i < 4; i += 1) {
      last = await settleQualificationHistoryAtomic(db.asD1(), settleInput());
    }
    const row = await readRow(db, last!.id);
    const countAll = db.database
      .prepare(
        `SELECT COUNT(*) AS n FROM qualificacoes_historico
          WHERE funcionario_id = ? AND qualificacao_codigo = ? AND data_conclusao = ? AND deleted_at IS NULL`,
      )
      .get(1000, 'MNT-12', '2026-08-01') as { n: number };
    expect(countAll.n).toBe(1); // no duplicates across 4 calls
    expect(row?.renovacao_de).not.toBeNull();
  });

  // H. tenant A/B: same code/date, different tenant — never cross-linked.
  it('H. tenant isolation: settling for tenant B never links to tenant A predecessor', async () => {
    // Tenant A predecessor.
    const a = await settleQualificationHistoryAtomic(
      db.asD1(),
      settleInput({ empresaId: 1, funcionarioId: 1000, completionDate: '2025-08-01' }),
    );
    // Tenant B target, homonymous code/funcionario id space collision guarded
    // by empresa_id — funcionario 2000 and qualificacao_tipo 200 (MNT-12) are
    // both seeded under empresa 2 in the fixture.
    const b = await settleQualificationHistoryAtomic(
      db.asD1(),
      settleInput({
        empresaId: 2,
        funcionarioId: 2000,
        qualificationId: 200,
        completionDate: '2026-08-01',
      }),
    );
    expect(b.predecessorId).toBeNull();
    expect(b.predecessorId).not.toBe(a.id);
  });

  // I. wrong legacy RENOVADA flags do not by themselves determine current-
  // state/predecessor selection — a row incorrectly flagged renovada=1 with
  // no real successor (renovacao_de pointing at it) must still be eligible
  // as a predecessor candidate for a new settlement (flags are auxiliary).
  it('I. a row with an incorrect legacy renovada=1 flag (no real successor) is still usable as a predecessor', async () => {
    const wronglyFlagged = insertHistory(db.database, {
      completionDate: '2025-08-01',
      status: 'CONCLUIDA',
      renewed: 1, // legacy flag says renewed, but no successor.renovacao_de points at it
    });

    const target = await settleQualificationHistoryAtomic(
      db.asD1(),
      settleInput({ completionDate: '2026-08-01' }),
    );

    expect(target.predecessorId).toBe(wronglyFlagged);
  });

  // K. renovar_anterior=false-style scenario: settle must never silently
  // create two CONCLUIDA rows that both claim to be "current" for the same
  // lineage without one pointing at the other — verified indirectly: two
  // settles for two different but adjacent dates always chain.
  it('K. two settles for adjacent dates always chain (no orphaned concurrent-current rows)', async () => {
    const first = await settleQualificationHistoryAtomic(
      db.asD1(),
      settleInput({ completionDate: '2026-01-01' }),
    );
    const second = await settleQualificationHistoryAtomic(
      db.asD1(),
      settleInput({ completionDate: '2026-06-01' }),
    );
    expect(second.predecessorId).toBe(first.id);
    const firstRow = await readRow(db, first.id);
    expect(firstRow?.status).toBe('RENOVADA');
  });
});

describe('createQualificationHistoryAtomic — renovacao_de gap fix', () => {
  let db: SqliteD1Database;

  beforeEach(() => {
    db = new SqliteD1Database();
  });

  afterEach(() => {
    db.close();
  });

  it('CONCLUIDA create now sets renovacao_de to the immediate predecessor (previously always NULL)', async () => {
    const predecessor = insertHistory(db.database, {
      completionDate: '2025-08-01',
      status: 'CONCLUIDA',
    });

    const result = await createQualificationHistoryAtomic(
      db.asD1(),
      createInput({ completionDate: '2026-08-01', status: 'CONCLUIDA' }),
    );

    expect(result.previousHistoryId).toBe(predecessor);
    const row = await readRow(db, result.id);
    expect(row?.renovacao_de).toBe(predecessor); // the fix: this used to be NULL
  });

  it('PLANEJADA create does not set renovacao_de (not yet a real realization)', async () => {
    insertHistory(db.database, { completionDate: '2025-08-01', status: 'CONCLUIDA' });

    const result = await createQualificationHistoryAtomic(
      db.asD1(),
      createInput({ completionDate: '2026-08-01', status: 'PLANEJADA' }),
    );

    const row = await readRow(db, result.id);
    expect(row?.status).toBe('PLANEJADA');
    expect(row?.renovacao_de).toBeNull();
  });

  it('first-ever CONCLUIDA create (no predecessor) leaves renovacao_de NULL, not an error', async () => {
    const result = await createQualificationHistoryAtomic(db.asD1(), createInput());
    const row = await readRow(db, result.id);
    expect(row?.renovacao_de).toBeNull();
    expect(result.previousHistoryId).toBeNull();
  });
});

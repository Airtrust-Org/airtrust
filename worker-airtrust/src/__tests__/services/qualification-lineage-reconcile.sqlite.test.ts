/**
 * Real-SQL (node:sqlite) tests for reconcileQualificationLineageAtomic —
 * the shared repair primitive used after any structural mutation to a
 * qualification lineage (delete a row, edit data_conclusao). Covers
 * Fase 3 (delete successor) and Fase 4 (edit data_conclusao) scenarios
 * from the writer-convergence audit.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { reconcileQualificationLineageAtomic } from '../../services/qualification-history-atomic';
import { insertHistory, SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';

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
      }
    | undefined;
}

function softDelete(db: SqliteD1Database, id: number): void {
  db.database
    .prepare(`UPDATE qualificacoes_historico SET deleted_at = datetime('now') WHERE id = ?`)
    .run(id);
}

function editDate(db: SqliteD1Database, id: number, newDate: string): void {
  db.database
    .prepare(`UPDATE qualificacoes_historico SET data_conclusao = ? WHERE id = ?`)
    .run(newDate, id);
}

describe('reconcileQualificationLineageAtomic', () => {
  let db: SqliteD1Database;

  beforeEach(() => {
    db = new SqliteD1Database();
  });

  afterEach(() => {
    db.close();
  });

  it('A <- B <- C: deleting B leaves A <- C, not A <- B(gone)', async () => {
    const a = insertHistory(db.database, { completionDate: '2024-01-01', status: 'CONCLUIDA' });
    const b = insertHistory(db.database, { completionDate: '2025-01-01', status: 'CONCLUIDA' });
    const c = insertHistory(db.database, { completionDate: '2026-01-01', status: 'CONCLUIDA' });

    await reconcileQualificationLineageAtomic(db.asD1(), {
      empresaId: 1,
      funcionarioId: 1000,
      qualificationCode: 'MNT-12',
    });
    expect((await readRow(db, b))?.renovacao_de).toBe(a);
    expect((await readRow(db, c))?.renovacao_de).toBe(b);

    softDelete(db, b);
    await reconcileQualificationLineageAtomic(db.asD1(), {
      empresaId: 1,
      funcionarioId: 1000,
      qualificationCode: 'MNT-12',
    });

    const cRow = await readRow(db, c);
    expect(cRow?.renovacao_de).toBe(a); // re-chained past the deleted B
    const aRow = await readRow(db, a);
    expect(aRow?.status).toBe('RENOVADA'); // still has a real successor (C)
  });

  it('A <- B: deleting B (the current/last) leaves A as current, not stuck RENOVADA', async () => {
    const a = insertHistory(db.database, { completionDate: '2024-01-01', status: 'CONCLUIDA' });
    const b = insertHistory(db.database, { completionDate: '2025-01-01', status: 'CONCLUIDA' });
    await reconcileQualificationLineageAtomic(db.asD1(), {
      empresaId: 1,
      funcionarioId: 1000,
      qualificationCode: 'MNT-12',
    });
    expect((await readRow(db, a))?.status).toBe('RENOVADA');

    softDelete(db, b);
    await reconcileQualificationLineageAtomic(db.asD1(), {
      empresaId: 1,
      funcionarioId: 1000,
      qualificationCode: 'MNT-12',
    });

    const aRow = await readRow(db, a);
    expect(aRow?.status).toBe('CONCLUIDA'); // no longer superseded — repaired
    expect(aRow?.renovada).toBe(0);
  });

  it('edit data_conclusao: moving B (originally between A and C) to before A re-chains correctly', async () => {
    const a = insertHistory(db.database, { completionDate: '2024-01-01', status: 'CONCLUIDA' });
    const b = insertHistory(db.database, { completionDate: '2025-01-01', status: 'CONCLUIDA' });
    const c = insertHistory(db.database, { completionDate: '2026-01-01', status: 'CONCLUIDA' });
    await reconcileQualificationLineageAtomic(db.asD1(), {
      empresaId: 1,
      funcionarioId: 1000,
      qualificationCode: 'MNT-12',
    });

    editDate(db, b, '2023-01-01'); // move B before A
    await reconcileQualificationLineageAtomic(db.asD1(), {
      empresaId: 1,
      funcionarioId: 1000,
      qualificationCode: 'MNT-12',
    });

    expect((await readRow(db, b))?.renovacao_de).toBeNull(); // B is now oldest
    expect((await readRow(db, a))?.renovacao_de).toBe(b); // A now follows B
    expect((await readRow(db, c))?.renovacao_de).toBe(a); // C still follows A
    expect((await readRow(db, c))?.status).toBe('CONCLUIDA'); // C still current
  });

  it('edit data_conclusao: moving B after C (the current row)', async () => {
    const a = insertHistory(db.database, { completionDate: '2024-01-01', status: 'CONCLUIDA' });
    const b = insertHistory(db.database, { completionDate: '2025-01-01', status: 'CONCLUIDA' });
    const c = insertHistory(db.database, { completionDate: '2026-01-01', status: 'CONCLUIDA' });
    await reconcileQualificationLineageAtomic(db.asD1(), {
      empresaId: 1,
      funcionarioId: 1000,
      qualificationCode: 'MNT-12',
    });

    editDate(db, b, '2027-01-01'); // move B to be the newest
    await reconcileQualificationLineageAtomic(db.asD1(), {
      empresaId: 1,
      funcionarioId: 1000,
      qualificationCode: 'MNT-12',
    });

    expect((await readRow(db, b))?.renovacao_de).toBe(c); // B now follows C
    expect((await readRow(db, b))?.status).toBe('CONCLUIDA'); // B is now current
    expect((await readRow(db, c))?.status).toBe('RENOVADA'); // C superseded by B
    expect((await readRow(db, a))?.renovacao_de).toBeNull(); // A untouched
  });

  // No dedicated "empate" (identical data_conclusao) test: the fixture's
  // real unique index (funcionario_id, qualificacao_codigo, data_conclusao)
  // WHERE deleted_at IS NULL structurally prevents two active rows from
  // sharing a date for the same lineage, so this scenario is unreachable
  // under the real schema. The `pred.id < qh.id` tie-break in the ORDER BY
  // remains a defensive fallback, not something exercisable here.

  it('tenant isolation: reconciling tenant 1 lineage never touches tenant 2 rows', async () => {
    insertHistory(db.database, { completionDate: '2024-01-01', status: 'CONCLUIDA', empresaId: 1 });
    const tenant2Row = insertHistory(db.database, {
      completionDate: '2024-01-01',
      status: 'CONCLUIDA',
      empresaId: 2,
      funcionarioId: 2000,
      qualificationId: 200,
    });

    await reconcileQualificationLineageAtomic(db.asD1(), {
      empresaId: 1,
      funcionarioId: 1000,
      qualificationCode: 'MNT-12',
    });

    const t2 = await readRow(db, tenant2Row);
    expect(t2?.renovada).toBe(0); // untouched, no cross-tenant materialization
  });

  it('idempotent: reconciling an already-correct lineage is a no-op (N retries converge)', async () => {
    insertHistory(db.database, { completionDate: '2024-01-01', status: 'CONCLUIDA' });
    insertHistory(db.database, { completionDate: '2025-01-01', status: 'CONCLUIDA' });
    for (let i = 0; i < 3; i += 1) {
      await reconcileQualificationLineageAtomic(db.asD1(), {
        empresaId: 1,
        funcionarioId: 1000,
        qualificationCode: 'MNT-12',
      });
    }
    const result = await reconcileQualificationLineageAtomic(db.asD1(), {
      empresaId: 1,
      funcionarioId: 1000,
      qualificationCode: 'MNT-12',
    });
    expect(result.chain).toHaveLength(2);
  });

  it('PLANEJADA and CANCELADA rows are excluded from the chain entirely', async () => {
    const a = insertHistory(db.database, { completionDate: '2024-01-01', status: 'CONCLUIDA' });
    insertHistory(db.database, {
      completionDate: '2025-01-01',
      status: 'PLANEJADA',
      qualificationCode: 'MNT-12',
    });
    insertHistory(db.database, {
      completionDate: '2025-06-01',
      status: 'CANCELADA',
      qualificationCode: 'MNT-12',
    });
    const c = insertHistory(db.database, { completionDate: '2026-01-01', status: 'CONCLUIDA' });

    const result = await reconcileQualificationLineageAtomic(db.asD1(), {
      empresaId: 1,
      funcionarioId: 1000,
      qualificationCode: 'MNT-12',
    });
    expect(result.chain.map((r) => r.id)).toEqual([a, c]);
  });
});

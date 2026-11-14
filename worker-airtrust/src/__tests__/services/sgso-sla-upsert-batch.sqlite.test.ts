import { afterEach, describe, expect, it, vi } from 'vitest';
import { SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';
import { upsertSgsoSlaBatch } from '../../services/sgso-sla-upsert-batch';

const opened: SqliteD1Database[] = [];
afterEach(() => { for (const db of opened.splice(0)) db.close(); });

function fixture() {
  const db = new SqliteD1Database();
  opened.push(db);
  db.database.exec(`CREATE TABLE sgso_sla_config (
    id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, fase TEXT NOT NULL,
    horas_prazo INTEGER NOT NULL CHECK (horas_prazo > 0),
    horas_alerta_previa INTEGER NOT NULL, ativo INTEGER NOT NULL,
    created_at TEXT, updated_at TEXT, UNIQUE(empresa_id, fase)
  );`);
  return db;
}

const row = (fase: string, horasPrazo: number, horasAlerta = 1) =>
  ({fase, horasPrazo, horasAlerta, ativo: 1});

describe('PERF-05: SGSO SLA batch persistence', () => {
  it('upserts all phases in one atomic D1 batch, preserving last duplicate', async () => {
    const db = fixture();
    const batch = vi.spyOn(db, 'batch');
    await upsertSgsoSlaBatch(db.asD1(), 1, [
      row('TRIAGEM', 4), row('INVESTIGACAO', 24), row('TRIAGEM', 8),
      row('RESOLUCAO', 48),
    ]);
    expect(batch).toHaveBeenCalledTimes(1);
    expect(batch.mock.calls[0][0]).toHaveLength(3);
    expect(db.database.prepare(`SELECT fase,horas_prazo FROM sgso_sla_config WHERE empresa_id=1 ORDER BY fase`).all())
      .toEqual([
        {fase:'INVESTIGACAO', horas_prazo:24},
        {fase:'RESOLUCAO', horas_prazo:48},
        {fase:'TRIAGEM', horas_prazo:8},
      ]);
  });

  it('does not overwrite SLA configuration for another company', async () => {
    const db = fixture();
    await upsertSgsoSlaBatch(db.asD1(), 2, [row('TRIAGEM', 7)]);
    await upsertSgsoSlaBatch(db.asD1(), 1, [row('TRIAGEM', 9)]);
    await upsertSgsoSlaBatch(db.asD1(), 2, [row('TRIAGEM', 5)]);
    const values = db.database.prepare(
      'SELECT empresa_id, horas_prazo FROM sgso_sla_config ORDER BY empresa_id',
    ).all();
    expect(values).toEqual([{empresa_id:1, horas_prazo:9}, {empresa_id:2, horas_prazo:5}]);
  });

  it('rolls back the whole batch when a statement violates the DB constraint', async () => {
    const db = fixture();
    await expect(upsertSgsoSlaBatch(db.asD1(), 1, [row('TRIAGEM', 9), row('RESOLUCAO', 0)]))
      .rejects.toThrow();
    const count = db.database.prepare('SELECT COUNT(*) total FROM sgso_sla_config').get() as {total:number};
    expect(count.total).toBe(0);
  });

  it('makes no D1 calls for empty request', async () => {
    const db = fixture();
    const batch = vi.spyOn(db, 'batch');
    await upsertSgsoSlaBatch(db.asD1(), 1, []);
    expect(batch).not.toHaveBeenCalled();
  });
});

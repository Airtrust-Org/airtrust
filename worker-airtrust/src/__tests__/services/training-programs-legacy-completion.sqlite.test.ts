import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { employeeHasCompletedQualification } from '../../services/training-programs';
import { insertHistory, SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';

describe('training program legacy completion resolution', () => {
  let db: SqliteD1Database;
  beforeEach(() => { db = new SqliteD1Database(); });
  afterEach(() => db.close());

  async function completed() {
    return employeeHasCompletedQualification({ db: db.asD1(), empresaId: 1, employeeId: 1000, qualificationTypeId: 100 });
  }

  it('treats legacy blank status with a past completion date as a real prior completion', async () => {
    const id = insertHistory(db.database, { status: 'CONCLUIDA', completionDate: '2025-08-01' });
    db.database.prepare('UPDATE qualificacoes_historico SET status=NULL WHERE id=?').run(id);
    await expect(completed()).resolves.toBe(true);
  });

  it('treats an expired historical realization as prior completion', async () => {
    insertHistory(db.database, { status: 'VENCIDA', completionDate: '2025-08-01' });
    await expect(completed()).resolves.toBe(true);
  });

  it('treats a near-expiry historical realization as prior completion', async () => {
    insertHistory(db.database, { status: 'PROXIMA_VENCIMENTO', completionDate: '2025-08-01' });
    await expect(completed()).resolves.toBe(true);
  });

  it.each(['PLANEJADA','PLANEJADO','CANCELADA','CANCELADO'])(
    'does not treat %s as prior completion', async (status) => {
      insertHistory(db.database, { status, completionDate: '2025-08-01' });
      await expect(completed()).resolves.toBe(false);
    },
  );

  it('does not treat a future legacy completion date as already completed', async () => {
    const id = insertHistory(db.database, { status: 'CONCLUIDA', completionDate: '2099-08-01' });
    db.database.prepare('UPDATE qualificacoes_historico SET status=NULL WHERE id=?').run(id);
    await expect(completed()).resolves.toBe(false);
  });
});

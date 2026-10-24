import { afterEach, describe, expect, it } from 'vitest';
import { SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';
import { assertScormCommitCycle } from '../../services/lms-scorm-cycle-guard';

const opened: SqliteD1Database[] = [];
afterEach(() => { for (const db of opened.splice(0)) db.close(); });

function fixture() {
  const db = new SqliteD1Database();
  opened.push(db);
  db.database.exec(`
    CREATE TABLE lms_matricula_ciclos (
      id INTEGER PRIMARY KEY,
      matricula_id INTEGER NOT NULL,
      empresa_id INTEGER NOT NULL,
      ciclo_atual INTEGER NOT NULL,
      deleted_at TEXT
    );
    INSERT INTO lms_matricula_ciclos VALUES
      (201, 901, 6, 0, NULL),
      (202, 901, 6, 1, NULL),
      (203, 901, 7, 1, NULL),
      (204, 902, 6, 1, NULL),
      (205, 903, 6, 1, '2026-10-01T00:00:00Z');
  `);
  return db;
}

describe('SCORM stale commit cycle guard with SQLite/D1', () => {
  it('accepts only the persisted active cycle and rejects delayed, foreign, or deleted-cycle commits', async () => {
    const db = fixture();
    const before = db.database.prepare(
      'SELECT id, matricula_id, empresa_id, ciclo_atual, deleted_at FROM lms_matricula_ciclos ORDER BY id',
    ).all();

    await expect(assertScormCommitCycle(db.asD1(), 6, 901, 202)).resolves.toBeUndefined();
    for (const [empresaId, matriculaId, claimedCycleId] of [
      [6, 901, 201], // delayed iframe from the archived cycle
      [7, 901, 202], // same enrollment ID under a different tenant
      [6, 902, 202], // same tenant, different enrollment
      [6, 903, 205], // deleted cycle must not authorize a commit
    ]) {
      await expect(assertScormCommitCycle(
        db.asD1(), empresaId, matriculaId, claimedCycleId,
      )).rejects.toMatchObject({ code: 'LMS_SCORM_CYCLE_MISMATCH', statusCode: 409 });
    }

    expect(db.database.prepare(
      'SELECT id, matricula_id, empresa_id, ciclo_atual, deleted_at FROM lms_matricula_ciclos ORDER BY id',
    ).all()).toEqual(before);
  });
});

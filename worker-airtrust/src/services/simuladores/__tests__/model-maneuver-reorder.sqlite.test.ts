import { afterEach, describe, expect, it } from 'vitest';
import { SqliteD1Database } from '../../../__tests__/helpers/qualification-history-sqlite-d1';
import { reorderModelManeuversAtomically } from '../model-maneuver-reorder';

const opened: SqliteD1Database[] = [];
afterEach(() => { for (const db of opened.splice(0)) db.close(); });

function fixture(): SqliteD1Database {
  const db = new SqliteD1Database();
  opened.push(db);
  db.database.exec(`
    CREATE TABLE modelos_sessao (id TEXT PRIMARY KEY, empresa_id INTEGER NOT NULL, deleted_at TEXT);
    CREATE TABLE modelos_sessao_manobras (
      id INTEGER PRIMARY KEY, modelo_id TEXT NOT NULL, ordem INTEGER NOT NULL,
      deleted_at TEXT, updated_at TEXT
    );
    INSERT INTO modelos_sessao(id, empresa_id, deleted_at) VALUES
      ('a',6,NULL),('b',7,NULL),('deleted',6,'2026-01-01');
    INSERT INTO modelos_sessao_manobras(id,modelo_id,ordem,deleted_at) VALUES
      (1,'a',1,NULL),(2,'a',2,NULL),(3,'b',3,NULL),(4,'deleted',4,NULL);
  `);
  return db;
}

describe('simulator maneuver batch SQL tenant isolation', () => {
  it('reorders only maneuvers belonging to the authenticated company', async () => {
    const db = fixture();
    await reorderModelManeuversAtomically(db.asD1(), 'a', 6, [
      {id:1,ordem:9},{id:2,ordem:8},{id:3,ordem:99},
    ]);
    expect(db.database.prepare('SELECT id,ordem FROM modelos_sessao_manobras ORDER BY id').all())
      .toEqual([{id:1,ordem:9},{id:2,ordem:8},{id:3,ordem:3},{id:4,ordem:4}]);
  });

  it('refuses cross-company model or a soft-deleted model even if called directly', async () => {
    const db = fixture();
    await reorderModelManeuversAtomically(db.asD1(),'b',6,[{id:3,ordem:55}]);
    await reorderModelManeuversAtomically(db.asD1(),'deleted',6,[{id:4,ordem:55}]);
    expect(db.database.prepare('SELECT id,ordem FROM modelos_sessao_manobras WHERE id IN (3,4) ORDER BY id').all())
      .toEqual([{id:3,ordem:3},{id:4,ordem:4}]);
  });

  it('rolls back all statements on a DB error', async () => {
    const db = fixture();
    db.database.exec(`CREATE TRIGGER fail_order BEFORE UPDATE ON modelos_sessao_manobras
      WHEN NEW.id = 2 BEGIN SELECT RAISE(ABORT,'induced failure'); END;`);
    await expect(reorderModelManeuversAtomically(db.asD1(),'a',6,[
      {id:1,ordem:55},{id:2,ordem:66},
    ])).rejects.toThrow();
    expect(db.database.prepare('SELECT ordem FROM modelos_sessao_manobras WHERE id IN (1,2) ORDER BY id').all())
      .toEqual([{ordem:1},{ordem:2}]);
  });
});

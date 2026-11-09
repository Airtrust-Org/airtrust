/** N-03: ultimo acesso gravado em melhor esforco, contra SQLite com schema real. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';
import { recordSuccessfulLogin } from '../../services/auth-last-login';

const opened: SqliteD1Database[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});

function fixture(withColumn: boolean) {
  const db = new SqliteD1Database();
  opened.push(db);
  db.database.exec(`
    CREATE TABLE usuarios (
      id INTEGER PRIMARY KEY, email TEXT, deleted_at TEXT${withColumn ? ', last_login TEXT' : ''}
    );
    INSERT INTO usuarios (id, email, deleted_at) VALUES (1,'a@x.invalid',NULL),(2,'b@x.invalid','2026-01-01');
  `);
  return db;
}

describe('N-03 last_login', () => {
  it('grava o instante do login apenas para o usuario autenticado', async () => {
    const db = fixture(true);
    expect(await recordSuccessfulLogin(db as unknown as D1Database, 1)).toBe(true);
    const rows = db.database.prepare('SELECT id, last_login FROM usuarios ORDER BY id').all() as Array<{
      id: number;
      last_login: string | null;
    }>;
    expect(rows[0].last_login).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(rows[1].last_login).toBeNull();
  });

  it('nao atualiza usuario removido nem id invalido', async () => {
    const db = fixture(true);
    expect(await recordSuccessfulLogin(db as unknown as D1Database, 2)).toBe(false);
    expect(await recordSuccessfulLogin(db as unknown as D1Database, 0)).toBe(false);
    expect(await recordSuccessfulLogin(db as unknown as D1Database, Number.NaN)).toBe(false);
  });

  it('schema sem a coluna: nao lanca e reporta o erro ao chamador', async () => {
    const db = fixture(false);
    const onError = vi.fn();
    await expect(recordSuccessfulLogin(db as unknown as D1Database, 1, onError)).resolves.toBe(false);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});

import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { validateSessionParticipantTenant } from '../../services/simuladores/session-participant-tenant';

const Sqlite = createRequire(import.meta.url)('node:sqlite').DatabaseSync as { new (source: string): DatabaseSync };
const opened: DatabaseSync[] = [];

function fixture() {
  const sqlite = new Sqlite(':memory:');
  opened.push(sqlite);
  sqlite.exec(`
    CREATE TABLE funcionarios (id INTEGER PRIMARY KEY, empresa_id INTEGER, deleted_at TEXT);
    INSERT INTO funcionarios (id, empresa_id, deleted_at) VALUES
      (101, 6, NULL), (102, 6, NULL), (201, 7, NULL), (103, 6, '2026-01-01');
  `);
  const statements: string[] = [];
  const bindCounts: number[] = [];
  const db = {
    prepare(sql: string) {
      statements.push(sql);
      return {
        bind(...args: unknown[]) {
          bindCounts.push(args.length);
          if (args.length > 100) throw new RangeError('D1_BIND_PARAMETER_LIMIT_EXCEEDED');
          return {
            async all<T>() {
              return { success: true, results: sqlite.prepare(sql).all(...(args as [])) as T[] };
            },
          };
        },
      };
    },
  } as unknown as D1Database;
  return { sqlite, db, statements, bindCounts };
}

afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});

describe('simulator session participant tenant guard', () => {
  it('accepts own-company identifiers and preserves optional blank legacy entries', async () => {
    const { db, statements } = fixture();
    expect(await validateSessionParticipantTenant(db, 6, [
      { funcionario_id: 101 }, { funcionario_id: '102' }, { funcionario_id: '101' }, { funcao: 'OBS' },
    ])).toBe(true);
    expect(await validateSessionParticipantTenant(db, 6, [])).toBe(true);
    expect(statements.every((query) => /^SELECT id FROM funcionarios/i.test(query))).toBe(true);
    expect(statements.every((query) => query.includes('empresa_id = ? AND deleted_at IS NULL'))).toBe(true);
  });

  it('rejects foreign tenant, deleted and unknown employees without any write', async () => {
    const { db, statements } = fixture();
    for (const id of [201, 103, 9999]) {
      expect(await validateSessionParticipantTenant(db, 6, [
        { funcionario_id: 101 }, { funcionario_id: id },
      ])).toBe(false);
    }
    expect(statements.every((query) => /^SELECT/i.test(query))).toBe(true);
  });

  it('rejects invalid IDs and malformed payloads instead of making SQL', async () => {
    const { db, statements } = fixture();
    for (const item of [
      '201', null, {}, [null], [{ funcionario_id: -1 }],
      [{ funcionario_id: '1 OR 1=1' }], [{ funcionario_id: '2e2' }],
      [{ funcionario_id: 0 }], [{ funcionario_id: Number.MAX_SAFE_INTEGER + 1 }],
    ]) {
      expect(await validateSessionParticipantTenant(db, 6, item)).toBe(false);
    }
    expect(await validateSessionParticipantTenant(db, 0, [{ funcionario_id: 101 }])).toBe(false);
    expect(statements).toHaveLength(0);
  });

  it('respects the real D1 100-bind ceiling for 99, 100 and 260 employees', async () => {
    for (const count of [99, 100, 260]) {
      const { db, sqlite, statements, bindCounts } = fixture();
      const participants = [];
      for (let id = 1000; id < 1000 + count; id++) {
        sqlite.prepare('INSERT INTO funcionarios (id, empresa_id) VALUES (?, 6)').run(id);
        participants.push({ funcionario_id: id });
      }
      expect(await validateSessionParticipantTenant(db, 6, participants)).toBe(true);
      expect(statements).toHaveLength(Math.ceil(count / 90));
      expect(Math.max(...bindCounts)).toBeLessThanOrEqual(100);
      expect(bindCounts.every((value) => value <= 91)).toBe(true);
      const lastId = 1000 + count - 1;
      sqlite.prepare('UPDATE funcionarios SET empresa_id = 7 WHERE id = ?').run(lastId);
      expect(await validateSessionParticipantTenant(db, 6, participants)).toBe(false);
    }
  });

  it('is called before the first session UPDATE in the real route', () => {
    const source = readFileSync('src/routes/simuladores-sessoes-update.ts', 'utf8');
    const validation = source.indexOf('await validateSessionParticipantTenant(c.env.DB, empresaId, b.participantes)');
    const firstMutation = source.indexOf('UPDATE simulador_agendamentos SET examinador_id');
    expect(validation).toBeGreaterThan(0);
    expect(firstMutation).toBeGreaterThan(validation);
  });
});

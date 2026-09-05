import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  appendPersistedEdbAuditEvent,
  loadAndVerifyPersistedEdbAuditChain,
} from '../../repositories/edb/edb-audit-repository';

const ROOT = join(__dirname, '../../../..');
const MIGRATION_0483 = readFileSync(
  join(ROOT, 'worker-airtrust/migrations/0483_edb_diary_persistence_foundation.sql'),
  'utf8',
);
const MIGRATION_0484 = readFileSync(
  join(ROOT, 'worker-airtrust/migrations/0484_edb_audit_persistence.sql'),
  'utf8',
);
const tempDirs: string[] = [];

function sqlValue(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? '1' : '0';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function interpolate(sql: string, args: unknown[]): string {
  let index = 0;
  return sql.replace(/\?/g, () => sqlValue(args[index++]));
}

function sqlite(databasePath: string, sql: string, json = false): string {
  const args = json ? ['-json', databasePath] : [databasePath];
  const result = spawnSync('sqlite3', args, { input: sql, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'SQLITE_FAILED');
  return result.stdout.trim();
}

function makeD1(databasePath: string): D1Database {
  return {
    prepare(sql: string) {
      let binds: unknown[] = [];
      const statement = {
        bind(...args: unknown[]) {
          binds = args;
          return statement;
        },
        async first<T>() {
          const output = sqlite(databasePath, interpolate(sql, binds), true);
          if (!output) return null;
          const rows = JSON.parse(output) as T[];
          return rows[0] ?? null;
        },
        async all<T>() {
          const output = sqlite(databasePath, interpolate(sql, binds), true);
          const rows = output ? (JSON.parse(output) as T[]) : [];
          return { success: true, results: rows, meta: {} };
        },
        async run() {
          const body = interpolate(sql, binds).trim().replace(/;\s*$/, '');
          const output = sqlite(
            databasePath,
            `${body};\nSELECT changes() AS changes, last_insert_rowid() AS last_row_id;`,
            true,
          );
          const rows = output
            ? (JSON.parse(output) as Array<{ changes: number; last_row_id: number }>)
            : [];
          return {
            success: true,
            meta: {
              changes: rows[0]?.changes ?? 0,
              last_row_id: rows[0]?.last_row_id ?? 0,
            },
          };
        },
      };
      return statement;
    },
  } as unknown as D1Database;
}

function createDatabase() {
  const dir = mkdtempSync(join(tmpdir(), 'airtrust-edb-audit-replay-'));
  tempDirs.push(dir);
  const databasePath = join(dir, 'test.sqlite');

  sqlite(
    databasePath,
    `
      CREATE TABLE aeronaves (
        id INTEGER PRIMARY KEY,
        empresa_id INTEGER,
        codigo TEXT,
        prefixo TEXT,
        deleted_at TEXT
      );
      INSERT INTO aeronaves (id, empresa_id, codigo, prefixo)
      VALUES (10, 1, 'AW139-1', 'PR-AAA');

      ${MIGRATION_0483}
      INSERT INTO edb_diarios (id, empresa_id, aeronave_id)
      VALUES (1, 1, 10);

      ${MIGRATION_0484}
    `,
  );

  return { db: makeD1(databasePath) };
}

afterEach(() => {
  while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

const actor = { actorRef: 'employee:10', displayName: 'PIC' };
const scope = {
  diaryId: 1,
  sourceFlightId: 100,
  technicalSituationId: 'tech-1',
  revisionId: null,
};

describe('eDB audit repository replay isolation against 0483 + 0484', () => {
  it('leaves the chain unchanged after a duplicate event replay and resumes from the intact head', async () => {
    const { db } = createDatabase();

    const first = await appendPersistedEdbAuditEvent({
      db,
      empresaId: 1,
      draft: {
        eventId: 'evt-stable',
        scope,
        type: 'SOURCE_SNAPSHOT_CAPTURED',
        actor,
        occurredAt: '2026-09-05T10:00:00Z',
        payload: { snapshot: 'synthetic' },
      },
    });

    await expect(appendPersistedEdbAuditEvent({
      db,
      empresaId: 1,
      draft: {
        eventId: 'evt-stable',
        scope,
        type: 'PIC_TECHNICAL_ACK_SIGNED',
        actor,
        occurredAt: '2026-09-05T10:05:00Z',
        payload: { replay: true },
      },
    })).rejects.toThrow();

    expect(await loadAndVerifyPersistedEdbAuditChain({
      db,
      empresaId: 1,
      diaryId: 1,
    })).toEqual([first]);

    const resumed = await appendPersistedEdbAuditEvent({
      db,
      empresaId: 1,
      draft: {
        eventId: 'evt-after-replay',
        scope,
        type: 'PIC_TECHNICAL_ACK_SIGNED',
        actor,
        occurredAt: '2026-09-05T10:06:00Z',
        payload: { signatureId: 'sig-tech-1' },
      },
    });

    expect(resumed.previousEventHashSha256).toBe(first.eventHashSha256);
    expect(await loadAndVerifyPersistedEdbAuditChain({
      db,
      empresaId: 1,
      diaryId: 1,
    })).toEqual([first, resumed]);
  });
});

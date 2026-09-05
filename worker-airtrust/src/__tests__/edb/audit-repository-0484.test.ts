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
  const dir = mkdtempSync(join(tmpdir(), 'airtrust-edb-audit-repo-'));
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
      VALUES (10, 1, 'AW139-1', 'PR-AAA'), (20, 2, 'AW139-2', 'PR-BBB');

      ${MIGRATION_0483}
      INSERT INTO edb_diarios (id, empresa_id, aeronave_id)
      VALUES (1, 1, 10), (2, 2, 20);

      ${MIGRATION_0484}
    `,
  );

  return { db: makeD1(databasePath), databasePath };
}

afterEach(() => {
  while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

const actor = { actorRef: 'employee:10', displayName: 'PIC' };

describe('eDB audit repository against 0483 + 0484', () => {
  it('appends and cryptographically verifies a diary-scoped chain', async () => {
    const { db } = createDatabase();

    const first = await appendPersistedEdbAuditEvent({
      db,
      empresaId: 1,
      draft: {
        eventId: 'evt-1',
        scope: {
          diaryId: 1,
          sourceFlightId: 100,
          technicalSituationId: 'tech-1',
          revisionId: null,
        },
        type: 'SOURCE_SNAPSHOT_CAPTURED',
        actor,
        occurredAt: '2026-09-05T10:00:00Z',
        payload: { snapshot: 'synthetic' },
      },
    });

    const second = await appendPersistedEdbAuditEvent({
      db,
      empresaId: 1,
      draft: {
        eventId: 'evt-2',
        scope: {
          diaryId: 1,
          sourceFlightId: 100,
          technicalSituationId: 'tech-1',
          revisionId: null,
        },
        type: 'PIC_TECHNICAL_ACK_SIGNED',
        actor,
        occurredAt: '2026-09-05T10:05:00Z',
        payload: { signatureId: 'sig-tech-1' },
      },
    });

    expect(first.previousEventHashSha256).toBeNull();
    expect(second.previousEventHashSha256).toBe(first.eventHashSha256);

    const loaded = await loadAndVerifyPersistedEdbAuditChain({
      db,
      empresaId: 1,
      diaryId: 1,
    });
    expect(loaded).toEqual([first, second]);
  });

  it('does not cross tenant boundaries and DB guards reject a mismatched diary', async () => {
    const { db } = createDatabase();

    await appendPersistedEdbAuditEvent({
      db,
      empresaId: 1,
      draft: {
        eventId: 'evt-1',
        scope: {
          diaryId: 1,
          sourceFlightId: 100,
          technicalSituationId: 'tech-1',
          revisionId: null,
        },
        type: 'SOURCE_SNAPSHOT_CAPTURED',
        actor,
        occurredAt: '2026-09-05T10:00:00Z',
        payload: {},
      },
    });

    expect(await loadAndVerifyPersistedEdbAuditChain({
      db,
      empresaId: 2,
      diaryId: 1,
    })).toEqual([]);

    await expect(appendPersistedEdbAuditEvent({
      db,
      empresaId: 1,
      draft: {
        eventId: 'evt-cross',
        scope: {
          diaryId: 2,
          sourceFlightId: 100,
          technicalSituationId: 'tech-x',
          revisionId: null,
        },
        type: 'SOURCE_SNAPSHOT_CAPTURED',
        actor,
        occurredAt: '2026-09-05T10:00:00Z',
        payload: {},
      },
    })).rejects.toThrow('EDB_AUDIT_DIARY_SCOPE_MISMATCH');
  });

  it('rejects chronology regression before attempting persistence', async () => {
    const { db } = createDatabase();

    await appendPersistedEdbAuditEvent({
      db,
      empresaId: 1,
      draft: {
        eventId: 'evt-1',
        scope: {
          diaryId: 1,
          sourceFlightId: 100,
          technicalSituationId: 'tech-1',
          revisionId: null,
        },
        type: 'SOURCE_SNAPSHOT_CAPTURED',
        actor,
        occurredAt: '2026-09-05T10:00:00Z',
        payload: {},
      },
    });

    await expect(appendPersistedEdbAuditEvent({
      db,
      empresaId: 1,
      draft: {
        eventId: 'evt-backdated',
        scope: {
          diaryId: 1,
          sourceFlightId: 100,
          technicalSituationId: 'tech-1',
          revisionId: null,
        },
        type: 'PIC_TECHNICAL_ACK_SIGNED',
        actor,
        occurredAt: '2026-09-05T09:59:00Z',
        payload: {},
      },
    })).rejects.toThrow('EDB_AUDIT_EVENT_TIME_REGRESSION');
  });

  it('detects persisted sequence tampering even when hash linkage remains intact', async () => {
    const { db, databasePath } = createDatabase();

    const first = await appendPersistedEdbAuditEvent({
      db,
      empresaId: 1,
      draft: {
        eventId: 'evt-1',
        scope: {
          diaryId: 1,
          sourceFlightId: 100,
          technicalSituationId: 'tech-1',
          revisionId: null,
        },
        type: 'SOURCE_SNAPSHOT_CAPTURED',
        actor,
        occurredAt: '2026-09-05T10:00:00Z',
        payload: {},
      },
    });

    await appendPersistedEdbAuditEvent({
      db,
      empresaId: 1,
      draft: {
        eventId: 'evt-2',
        scope: {
          diaryId: 1,
          sourceFlightId: 100,
          technicalSituationId: 'tech-1',
          revisionId: null,
        },
        type: 'PIC_TECHNICAL_ACK_SIGNED',
        actor,
        occurredAt: '2026-09-05T10:05:00Z',
        payload: {},
      },
    });

    expect(first.eventHashSha256).toHaveLength(64);

    sqlite(
      databasePath,
      `
        DROP TRIGGER trg_edb_audit_no_update;
        UPDATE edb_audit_events
           SET sequence_no=3
         WHERE id='evt-2';
      `,
    );

    await expect(loadAndVerifyPersistedEdbAuditChain({
      db,
      empresaId: 1,
      diaryId: 1,
    })).rejects.toThrow('EDB_AUDIT_PERSISTED_SEQUENCE_INVALID');
  });

  it('detects payload tampering even if the database update guard is deliberately removed', async () => {
    const { db, databasePath } = createDatabase();

    await appendPersistedEdbAuditEvent({
      db,
      empresaId: 1,
      draft: {
        eventId: 'evt-1',
        scope: {
          diaryId: 1,
          sourceFlightId: 100,
          technicalSituationId: 'tech-1',
          revisionId: null,
        },
        type: 'SOURCE_SNAPSHOT_CAPTURED',
        actor,
        occurredAt: '2026-09-05T10:00:00Z',
        payload: { value: 1 },
      },
    });

    sqlite(
      databasePath,
      `
        DROP TRIGGER trg_edb_audit_no_update;
        UPDATE edb_audit_events
           SET payload_json=json_object('value',999)
         WHERE id='evt-1';
      `,
    );

    await expect(loadAndVerifyPersistedEdbAuditChain({
      db,
      empresaId: 1,
      diaryId: 1,
    })).rejects.toThrow('EDB_AUDIT_PERSISTED_CHAIN_INVALID:EVENT_HASH_MISMATCH');
  });
});

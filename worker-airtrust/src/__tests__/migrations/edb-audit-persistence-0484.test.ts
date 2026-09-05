import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { execSql, querySql } from '../helpers/sqlite-batch-runner';

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

function createDatabase() {
  const dir = mkdtempSync(join(tmpdir(), 'airtrust-edb-audit-0484-'));
  tempDirs.push(dir);
  const dbPath = join(dir, 'test.sqlite');

  const setup = execSql(
    dbPath,
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
  expect(setup.code, setup.stderr).toBe(0);
  return dbPath;
}

function insertEvent(dbPath: string, values: {
  id: string;
  empresaId?: number;
  diaryId?: number;
  sequence: number;
  type: string;
  sourceFlightId?: number | null;
  technicalSituationId?: string | null;
  revisionId?: string | null;
  occurredAt: string;
  previousHash?: string | null;
  hash: string;
}) {
  const {
    id,
    empresaId = 1,
    diaryId = 1,
    sequence,
    type,
    sourceFlightId = null,
    technicalSituationId = null,
    revisionId = null,
    occurredAt,
    previousHash = null,
    hash,
  } = values;

  return execSql(
    dbPath,
    `
      INSERT INTO edb_audit_events (
        id, empresa_id, diario_id, sequence_no,
        source_flight_id, technical_situation_id, revision_id,
        event_type, actor_json, occurred_at, payload_json,
        previous_event_hash_sha256, event_hash_sha256
      ) VALUES (
        '${id}', ${empresaId}, ${diaryId}, ${sequence},
        ${sourceFlightId === null ? 'NULL' : sourceFlightId},
        ${technicalSituationId === null ? 'NULL' : `'${technicalSituationId}'`},
        ${revisionId === null ? 'NULL' : `'${revisionId}'`},
        '${type}',
        json_object('actorRef','employee:10','displayName','PIC'),
        '${occurredAt}',
        json_object('synthetic',1),
        ${previousHash === null ? 'NULL' : `'${previousHash}'`},
        '${hash}'
      );
    `,
  );
}

afterEach(() => {
  while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

describe('0484 eDB audit persistence', () => {
  it('persists a linked, chronological same-diary chain', () => {
    const dbPath = createDatabase();
    const h1 = 'a'.repeat(64);
    const h2 = 'b'.repeat(64);

    const first = insertEvent(dbPath, {
      id: 'evt-1',
      sequence: 1,
      type: 'SOURCE_SNAPSHOT_CAPTURED',
      sourceFlightId: 100,
      technicalSituationId: 'tech-1',
      occurredAt: '2026-09-05T10:00:00Z',
      hash: h1,
    });
    expect(first.code, first.stderr).toBe(0);

    const second = insertEvent(dbPath, {
      id: 'evt-2',
      sequence: 2,
      type: 'PIC_TECHNICAL_ACK_SIGNED',
      sourceFlightId: 100,
      technicalSituationId: 'tech-1',
      occurredAt: '2026-09-05T10:05:00Z',
      previousHash: h1,
      hash: h2,
    });
    expect(second.code, second.stderr).toBe(0);

    const rows = querySql<{ sequence_no: number; previous_event_hash_sha256: string | null }>(
      dbPath,
      `SELECT sequence_no, previous_event_hash_sha256
         FROM edb_audit_events
        WHERE empresa_id=1 AND diario_id=1
        ORDER BY sequence_no;`,
    );
    expect(rows).toEqual([
      { sequence_no: 1, previous_event_hash_sha256: null },
      { sequence_no: 2, previous_event_hash_sha256: h1 },
    ]);
  });

  it('rejects cross-tenant diary scope and invalid first-link shape', () => {
    const dbPath = createDatabase();

    const crossTenant = insertEvent(dbPath, {
      id: 'evt-x',
      empresaId: 1,
      diaryId: 2,
      sequence: 1,
      type: 'SOURCE_SNAPSHOT_CAPTURED',
      sourceFlightId: 100,
      technicalSituationId: 'tech-1',
      occurredAt: '2026-09-05T10:00:00Z',
      hash: 'a'.repeat(64),
    });
    expect(crossTenant.code).not.toBe(0);
    expect(crossTenant.stderr).toContain('EDB_AUDIT_DIARY_SCOPE_MISMATCH');

    const linkedFirst = insertEvent(dbPath, {
      id: 'evt-bad-first',
      sequence: 1,
      type: 'SOURCE_SNAPSHOT_CAPTURED',
      sourceFlightId: 100,
      technicalSituationId: 'tech-1',
      occurredAt: '2026-09-05T10:00:00Z',
      previousHash: 'c'.repeat(64),
      hash: 'd'.repeat(64),
    });
    expect(linkedFirst.code).not.toBe(0);
    expect(linkedFirst.stderr).toContain('EDB_AUDIT_FIRST_PREVIOUS_HASH_MUST_BE_NULL');
  });

  it('rejects fractional sequence/source-flight identities and invalid timestamps', () => {
    const dbPath = createDatabase();

    const fractionalSequence = insertEvent(dbPath, {
      id: 'evt-frac-seq',
      sequence: 1.5,
      type: 'SOURCE_SNAPSHOT_CAPTURED',
      sourceFlightId: 100,
      technicalSituationId: 'tech-1',
      occurredAt: '2026-09-05T10:00:00Z',
      hash: 'a'.repeat(64),
    });
    expect(fractionalSequence.code).not.toBe(0);

    const fractionalFlight = insertEvent(dbPath, {
      id: 'evt-frac-flight',
      sequence: 1,
      type: 'SOURCE_SNAPSHOT_CAPTURED',
      sourceFlightId: 100.5,
      technicalSituationId: 'tech-1',
      occurredAt: '2026-09-05T10:00:00Z',
      hash: 'b'.repeat(64),
    });
    expect(fractionalFlight.code).not.toBe(0);

    const invalidTimestamp = insertEvent(dbPath, {
      id: 'evt-bad-time',
      sequence: 1,
      type: 'SOURCE_SNAPSHOT_CAPTURED',
      sourceFlightId: 100,
      technicalSituationId: 'tech-1',
      occurredAt: 'not-a-timestamp',
      hash: 'c'.repeat(64),
    });
    expect(invalidTimestamp.code).not.toBe(0);
  });

  it('rejects wrong previous hash, skipped sequence and time regression', () => {
    const dbPath = createDatabase();
    const h1 = 'a'.repeat(64);

    expect(insertEvent(dbPath, {
      id: 'evt-1',
      sequence: 1,
      type: 'SOURCE_SNAPSHOT_CAPTURED',
      sourceFlightId: 100,
      technicalSituationId: 'tech-1',
      occurredAt: '2026-09-05T10:00:00Z',
      hash: h1,
    }).code).toBe(0);

    const wrongHash = insertEvent(dbPath, {
      id: 'evt-2',
      sequence: 2,
      type: 'PIC_TECHNICAL_ACK_SIGNED',
      sourceFlightId: 100,
      technicalSituationId: 'tech-1',
      occurredAt: '2026-09-05T10:01:00Z',
      previousHash: 'f'.repeat(64),
      hash: 'b'.repeat(64),
    });
    expect(wrongHash.code).not.toBe(0);
    expect(wrongHash.stderr).toContain('EDB_AUDIT_PREVIOUS_HASH_MISMATCH');

    const skipped = insertEvent(dbPath, {
      id: 'evt-3',
      sequence: 3,
      type: 'PIC_TECHNICAL_ACK_SIGNED',
      sourceFlightId: 100,
      technicalSituationId: 'tech-1',
      occurredAt: '2026-09-05T10:02:00Z',
      previousHash: h1,
      hash: 'c'.repeat(64),
    });
    expect(skipped.code).not.toBe(0);
    expect(skipped.stderr).toContain('EDB_AUDIT_PREVIOUS_HASH_MISMATCH');

    const regression = insertEvent(dbPath, {
      id: 'evt-2b',
      sequence: 2,
      type: 'PIC_TECHNICAL_ACK_SIGNED',
      sourceFlightId: 100,
      technicalSituationId: 'tech-1',
      occurredAt: '2026-09-05T09:59:00Z',
      previousHash: h1,
      hash: 'd'.repeat(64),
    });
    expect(regression.code).not.toBe(0);
    expect(regression.stderr).toContain('EDB_AUDIT_EVENT_TIME_REGRESSION');
  });

  it('enforces event-specific preflight and revision scope', () => {
    const dbPath = createDatabase();

    const badPreflight = insertEvent(dbPath, {
      id: 'evt-pre',
      sequence: 1,
      type: 'SOURCE_SNAPSHOT_CAPTURED',
      sourceFlightId: 100,
      revisionId: 'rev-should-not-exist',
      occurredAt: '2026-09-05T10:00:00Z',
      hash: 'a'.repeat(64),
    });
    expect(badPreflight.code).not.toBe(0);

    const badRevision = insertEvent(dbPath, {
      id: 'evt-final',
      sequence: 1,
      type: 'RECORD_CREATED',
      occurredAt: '2026-09-05T10:00:00Z',
      hash: 'b'.repeat(64),
    });
    expect(badRevision.code).not.toBe(0);
  });

  it('rejects update/delete and introduces no ANAC transport lifecycle', () => {
    const dbPath = createDatabase();
    expect(insertEvent(dbPath, {
      id: 'evt-1',
      sequence: 1,
      type: 'RECORD_CREATED',
      revisionId: 'rev-1',
      occurredAt: '2026-09-05T10:00:00Z',
      hash: 'a'.repeat(64),
    }).code).toBe(0);

    const update = execSql(
      dbPath,
      `UPDATE edb_audit_events SET occurred_at='2026-09-06T00:00:00Z' WHERE id='evt-1';`,
    );
    expect(update.code).not.toBe(0);
    expect(update.stderr).toContain('EDB_AUDIT_UPDATE_FORBIDDEN');

    const deletion = execSql(dbPath, `DELETE FROM edb_audit_events WHERE id='evt-1';`);
    expect(deletion.code).not.toBe(0);
    expect(deletion.stderr).toContain('EDB_AUDIT_DELETE_FORBIDDEN');

    const sql = readFileSync(
      join(ROOT, 'worker-airtrust/migrations/0484_edb_audit_persistence.sql'),
      'utf8',
    );
    expect(sql).not.toMatch(/ANAC_PENDING|ANAC_SYNCED|edb_anac_/);
  });
});

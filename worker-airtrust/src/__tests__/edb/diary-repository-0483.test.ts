import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  closeEdbDiary,
  closePersistedEdbDiaryVolume,
  createEdbDiary,
  createEdbDiaryVolume,
  createEdbIntegrityIncident,
  getActiveEdbDiaryForAircraft,
  loadEdbDiaryVolume,
  loadEdbIntegrityIncident,
  recordPersistedEdbAnacNotificationEvidence,
  recordPersistedEdbImpossibleReconstitution,
  recordPersistedEdbPoliceOccurrence,
} from '../../repositories/edb/edb-diary-repository';

const ROOT = join(__dirname, '../../../..');
const MIGRATION = readFileSync(
  join(ROOT, 'worker-airtrust/migrations/0483_edb_diary_persistence_foundation.sql'),
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
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'SQLITE_FAILED');
  }
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
        async run() {
          const body = interpolate(sql, binds).trim().replace(/;\s*$/, '');
          const output = sqlite(
            databasePath,
            `${body};\nSELECT changes() AS changes, last_insert_rowid() AS last_row_id;`,
            true,
          );
          const rows = output ? (JSON.parse(output) as Array<{ changes: number; last_row_id: number }>) : [];
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
  const dir = mkdtempSync(join(tmpdir(), 'airtrust-edb-diary-repo-'));
  tempDirs.push(dir);
  const databasePath = join(dir, 'test.sqlite');

  sqlite(
    databasePath,
    `
      PRAGMA foreign_keys = ON;
      CREATE TABLE aeronaves (
        id INTEGER PRIMARY KEY,
        empresa_id INTEGER,
        codigo TEXT,
        prefixo TEXT,
        deleted_at TEXT
      );
      INSERT INTO aeronaves (id, empresa_id, codigo, prefixo, deleted_at) VALUES
        (10, 1, 'AW139-1', 'PR-AAA', NULL),
        (20, 2, 'AW139-2', 'PR-BBB', NULL),
        (30, 1, 'AW139-3', 'PR-DEL', '2026-09-01T00:00:00Z');
      ${MIGRATION}
    `,
  );

  return { db: makeD1(databasePath), databasePath };
}

afterEach(() => {
  while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

const actor = {
  actorRef: 'employee:10',
  displayName: 'Responsável Designado',
};

describe('eDB diary repository against migration 0483', () => {
  it('creates and reads only a same-tenant active diary', async () => {
    const { db } = createDatabase();

    const diary = await createEdbDiary({ db, empresaId: 1, aircraftId: 10 });
    expect(diary).toMatchObject({
      diaryId: 1,
      empresaId: 1,
      aircraftId: 10,
      contractVersion: 'edb.local.v1',
      status: 'ACTIVE',
    });

    expect(await getActiveEdbDiaryForAircraft({ db, empresaId: 1, aircraftId: 10 }))
      .toEqual(diary);
    expect(await getActiveEdbDiaryForAircraft({ db, empresaId: 2, aircraftId: 10 }))
      .toBeNull();

    await expect(createEdbDiary({ db, empresaId: 1, aircraftId: 20 }))
      .rejects.toThrow('EDB_DIARY_AIRCRAFT_SCOPE_MISMATCH');
    await expect(createEdbDiary({ db, empresaId: 1, aircraftId: 30 }))
      .rejects.toThrow('EDB_DIARY_AIRCRAFT_SCOPE_MISMATCH');
  });

  it('persists, hydrates and closes a volume before closing the diary', async () => {
    const { db } = createDatabase();
    const diary = await createEdbDiary({ db, empresaId: 1, aircraftId: 10 });

    const opened = await createEdbDiaryVolume({
      db,
      empresaId: 1,
      diaryId: diary.diaryId,
      volumeId: 'vol-1',
      sequence: 1,
      openedAt: '2026-09-05T10:00:00Z',
      openedBy: actor,
      observations: 'Abertura',
    });
    expect(opened.aircraftRegistration).toBe('PR-AAA');

    const hydrated = await loadEdbDiaryVolume({ db, empresaId: 1, volumeId: 'vol-1' });
    expect(hydrated).toEqual(opened);
    expect(await loadEdbDiaryVolume({ db, empresaId: 2, volumeId: 'vol-1' })).toBeNull();

    await expect(closeEdbDiary({ db, empresaId: 1, diaryId: diary.diaryId }))
      .rejects.toThrow('EDB_DIARY_OPEN_VOLUME_EXISTS');

    const closed = await closePersistedEdbDiaryVolume({
      db,
      empresaId: 1,
      volumeId: 'vol-1',
      closedAt: '2026-09-30T20:00:00Z',
      closedBy: actor,
      observations: 'Encerramento',
      retentionMinimumUntil: '2031-10-01',
    });
    expect(closed.status).toBe('CLOSED');

    await expect(
      closePersistedEdbDiaryVolume({
        db,
        empresaId: 1,
        volumeId: 'vol-1',
        closedAt: '2026-09-30T20:00:00Z',
        closedBy: actor,
        retentionMinimumUntil: '2031-02-30',
      }),
    ).rejects.toThrow('EDB_VOLUME_RETENTION_DATE_INVALID');

    await closeEdbDiary({ db, empresaId: 1, diaryId: diary.diaryId });
    expect(await getActiveEdbDiaryForAircraft({ db, empresaId: 1, aircraftId: 10 }))
      .toBeNull();
  });

  it('persists the integrity incident sequence without implying ANAC acceptance', async () => {
    const { db } = createDatabase();
    const diary = await createEdbDiary({ db, empresaId: 1, aircraftId: 10 });
    await createEdbDiaryVolume({
      db,
      empresaId: 1,
      diaryId: diary.diaryId,
      volumeId: 'vol-1',
      sequence: 1,
      openedAt: '2026-09-05T10:00:00Z',
      openedBy: actor,
    });

    const incident = await createEdbIntegrityIncident({
      db,
      empresaId: 1,
      incidentId: 'incident-1',
      diaryId: diary.diaryId,
      volumeId: 'vol-1',
      kind: 'CORRUPTION',
      detectedAt: '2026-09-05T12:00:00Z',
      description: 'Synthetic local integrity loss',
    });
    expect(incident.reconstitutionOutcome).toBe('PENDING');

    await recordPersistedEdbPoliceOccurrence({
      db,
      empresaId: 1,
      incidentId: 'incident-1',
      reference: 'BO-123',
      reportedAt: '2026-09-05T12:30:00Z',
    });
    await recordPersistedEdbAnacNotificationEvidence({
      db,
      empresaId: 1,
      incidentId: 'incident-1',
      reference: 'LOCAL-NOTIFICATION-EVIDENCE-1',
      notifiedAt: '2026-09-05T13:00:00Z',
    });
    await recordPersistedEdbImpossibleReconstitution({
      db,
      empresaId: 1,
      incidentId: 'incident-1',
      completedAt: '2026-09-06T10:00:00Z',
      newDiaryOpeningObservation: 'Não reconstituído; referência BO-123.',
    });

    const loaded = await loadEdbIntegrityIncident({
      db,
      empresaId: 1,
      incidentId: 'incident-1',
    });
    expect(loaded).toMatchObject({
      policeOccurrenceReference: 'BO-123',
      anacNotificationReference: 'LOCAL-NOTIFICATION-EVIDENCE-1',
      reconstitutionOutcome: 'IMPOSSIBLE',
    });
    expect(await loadEdbIntegrityIncident({ db, empresaId: 2, incidentId: 'incident-1' }))
      .toBeNull();
  });

  it('fails closed on tampered persisted chronology during hydration', async () => {
    const { db, databasePath } = createDatabase();
    const diary = await createEdbDiary({ db, empresaId: 1, aircraftId: 10 });

    await createEdbIntegrityIncident({
      db,
      empresaId: 1,
      incidentId: 'incident-1',
      diaryId: diary.diaryId,
      kind: 'LOSS',
      detectedAt: '2026-09-05T12:00:00Z',
      description: 'Chronology test',
    });

    sqlite(
      databasePath,
      `
        DROP TRIGGER trg_edb_incident_progress_guard;
        UPDATE edb_incidentes_integridade
           SET police_occurrence_reference='BO-TAMPER',
               police_reported_at='2026-09-05T11:59:00Z'
         WHERE id='incident-1';
      `,
    );

    await expect(loadEdbIntegrityIncident({ db, empresaId: 1, incidentId: 'incident-1' }))
      .rejects.toThrow('Police occurrence cannot predate incident detection');
  });
});

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { execSql, querySql } from '../helpers/sqlite-batch-runner';

const ROOT = join(__dirname, '../../../..');
const MIGRATION_PATH = join(
  ROOT,
  'worker-airtrust/migrations/0483_edb_diary_persistence_foundation.sql',
);
const tempDirs: string[] = [];

function createDatabase() {
  const dir = mkdtempSync(join(tmpdir(), 'airtrust-edb-0483-'));
  tempDirs.push(dir);
  const dbPath = join(dir, 'test.sqlite');

  const setup = execSql(
    dbPath,
    `
      CREATE TABLE aeronaves (
        id INTEGER PRIMARY KEY,
        empresa_id INTEGER,
        prefixo TEXT,
        deleted_at TEXT
      );
      INSERT INTO aeronaves (id, empresa_id, prefixo) VALUES
        (10, 1, 'PR-A'),
        (20, 2, 'PR-B');
    `,
  );
  expect(setup.code, setup.stderr).toBe(0);

  const migration = readFileSync(MIGRATION_PATH, 'utf8');
  const applied = execSql(dbPath, migration);
  expect(applied.code, applied.stderr).toBe(0);
  return dbPath;
}

function seedDiaryAndVolume(dbPath: string) {
  const result = execSql(
    dbPath,
    `
      INSERT INTO edb_diarios (empresa_id, aeronave_id)
      VALUES (1, 10);

      INSERT INTO edb_volumes (
        id, empresa_id, diario_id, numero_volume, opened_at, opening_act_json
      ) VALUES (
        'vol-1', 1, 1, 1, '2026-09-04T10:00:00Z',
        json_object('type', 'OPENING', 'actorRef', 'employee:1')
      );
    `,
  );
  expect(result.code, result.stderr).toBe(0);
}

afterEach(() => {
  while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

describe('0483 eDB diary persistence foundation', () => {
  it('rejects pre-finalized diary, volume and incident inserts', () => {
    const dbPath = createDatabase();

    const closedDiary = execSql(
      dbPath,
      `INSERT INTO edb_diarios (empresa_id, aeronave_id, status) VALUES (1, 10, 'CLOSED');`,
    );
    expect(closedDiary.code).not.toBe(0);
    expect(closedDiary.stderr).toContain('EDB_DIARY_MUST_START_ACTIVE');

    const diary = execSql(
      dbPath,
      `INSERT INTO edb_diarios (empresa_id, aeronave_id) VALUES (1, 10);`,
    );
    expect(diary.code, diary.stderr).toBe(0);

    const closedVolume = execSql(
      dbPath,
      `
        INSERT INTO edb_volumes (
          id, empresa_id, diario_id, numero_volume, status,
          opened_at, opening_act_json, closed_at, closing_act_json
        ) VALUES (
          'vol-closed', 1, 1, 1, 'CLOSED',
          '2026-09-04T10:00:00Z', json_object('type','OPENING'),
          '2026-09-04T11:00:00Z', json_object('type','CLOSING')
        );
      `,
    );
    expect(closedVolume.code).not.toBe(0);
    expect(closedVolume.stderr).toContain('EDB_VOLUME_MUST_START_OPEN');

    const finalizedIncident = execSql(
      dbPath,
      `
        INSERT INTO edb_incidentes_integridade (
          id, empresa_id, diario_id, tipo, detected_at, descricao,
          police_occurrence_reference, police_reported_at,
          reconstitution_outcome, reconstitution_completed_at
        ) VALUES (
          'inc-final', 1, 1, 'LOSS', '2026-09-04T12:00:00Z', 'invalid initial final state',
          'BO-X', '2026-09-04T12:10:00Z',
          'RECONSTITUTED', '2026-09-04T13:00:00Z'
        );
      `,
    );
    expect(finalizedIncident.code).not.toBe(0);
    expect(finalizedIncident.stderr).toContain('EDB_INCIDENT_MUST_START_PENDING');
  });

  it('enforces tenant aircraft scope and a single active diary per aircraft', () => {
    const dbPath = createDatabase();

    const crossTenant = execSql(
      dbPath,
      `INSERT INTO edb_diarios (empresa_id, aeronave_id) VALUES (1, 20);`,
    );
    expect(crossTenant.code).not.toBe(0);
    expect(crossTenant.stderr).toContain('EDB_DIARY_AIRCRAFT_SCOPE_MISMATCH');

    const first = execSql(
      dbPath,
      `INSERT INTO edb_diarios (empresa_id, aeronave_id) VALUES (1, 10);`,
    );
    expect(first.code, first.stderr).toBe(0);

    const duplicate = execSql(
      dbPath,
      `INSERT INTO edb_diarios (empresa_id, aeronave_id) VALUES (1, 10);`,
    );
    expect(duplicate.code).not.toBe(0);
    expect(duplicate.stderr).toMatch(/UNIQUE constraint failed/);
  });

  it('enforces one open volume, immutable opening identity and close-before-diary ordering', () => {
    const dbPath = createDatabase();
    seedDiaryAndVolume(dbPath);

    const secondOpen = execSql(
      dbPath,
      `
        INSERT INTO edb_volumes (
          id, empresa_id, diario_id, numero_volume, opened_at, opening_act_json
        ) VALUES (
          'vol-2', 1, 1, 2, '2026-09-05T10:00:00Z', json_object('type', 'OPENING')
        );
      `,
    );
    expect(secondOpen.code).not.toBe(0);

    const closeDiaryEarly = execSql(
      dbPath,
      `UPDATE edb_diarios SET status='CLOSED' WHERE id=1;`,
    );
    expect(closeDiaryEarly.code).not.toBe(0);
    expect(closeDiaryEarly.stderr).toContain('EDB_DIARY_OPEN_VOLUME_EXISTS');

    const mutateOpening = execSql(
      dbPath,
      `UPDATE edb_volumes SET numero_volume=9 WHERE id='vol-1';`,
    );
    expect(mutateOpening.code).not.toBe(0);
    expect(mutateOpening.stderr).toContain('EDB_VOLUME_IDENTITY_IMMUTABLE');

    const closeVolume = execSql(
      dbPath,
      `
        UPDATE edb_volumes
           SET status='CLOSED',
               closed_at='2026-09-30T12:00:00Z',
               closing_act_json=json_object('type', 'CLOSING'),
               retencao_minima_ate='2031-10-01'
         WHERE id='vol-1';
      `,
    );
    expect(closeVolume.code, closeVolume.stderr).toBe(0);

    const rewriteClose = execSql(
      dbPath,
      `UPDATE edb_volumes SET retencao_minima_ate='2040-01-01' WHERE id='vol-1';`,
    );
    expect(rewriteClose.code).not.toBe(0);
    expect(rewriteClose.stderr).toContain('EDB_VOLUME_CLOSED_EVIDENCE_IMMUTABLE');

    const closeDiary = execSql(
      dbPath,
      `UPDATE edb_diarios SET status='CLOSED' WHERE id=1;`,
    );
    expect(closeDiary.code, closeDiary.stderr).toBe(0);
  });

  it('rejects deletion of diary evidence', () => {
    const dbPath = createDatabase();
    seedDiaryAndVolume(dbPath);

    const deleteVolume = execSql(dbPath, `DELETE FROM edb_volumes WHERE id='vol-1';`);
    expect(deleteVolume.code).not.toBe(0);
    expect(deleteVolume.stderr).toContain('EDB_VOLUME_DELETE_FORBIDDEN');

    const deleteDiary = execSql(dbPath, `DELETE FROM edb_diarios WHERE id=1;`);
    expect(deleteDiary.code).not.toBe(0);
    expect(deleteDiary.stderr).toContain('EDB_DIARY_DELETE_FORBIDDEN');
  });

  it('enforces incident scope, chronology, write-once evidence and reconstitution reference', () => {
    const dbPath = createDatabase();
    seedDiaryAndVolume(dbPath);

    const crossScope = execSql(
      dbPath,
      `
        INSERT INTO edb_incidentes_integridade (
          id, empresa_id, diario_id, volume_id, tipo, detected_at, descricao
        ) VALUES ('inc-x', 2, 1, 'vol-1', 'LOSS', '2026-09-04T11:00:00Z', 'wrong tenant');
      `,
    );
    expect(crossScope.code).not.toBe(0);
    expect(crossScope.stderr).toContain('EDB_INCIDENT_DIARY_SCOPE_MISMATCH');

    const inserted = execSql(
      dbPath,
      `
        INSERT INTO edb_incidentes_integridade (
          id, empresa_id, diario_id, volume_id, tipo, detected_at, descricao
        ) VALUES (
          'inc-1', 1, 1, 'vol-1', 'CORRUPTION',
          '2026-09-04T11:00:00Z', 'synthetic corruption'
        );
      `,
    );
    expect(inserted.code, inserted.stderr).toBe(0);

    const anacBeforePolice = execSql(
      dbPath,
      `
        UPDATE edb_incidentes_integridade
           SET anac_notification_reference='local-ref',
               anac_notified_at='2026-09-04T12:00:00Z'
         WHERE id='inc-1';
      `,
    );
    expect(anacBeforePolice.code).not.toBe(0);
    expect(anacBeforePolice.stderr).toContain('EDB_INCIDENT_ANAC_NOTIFICATION_REQUIRES_POLICE');

    const policeBeforeDetection = execSql(
      dbPath,
      `
        UPDATE edb_incidentes_integridade
           SET police_occurrence_reference='BO-123',
               police_reported_at='2026-09-04T10:59:00Z'
         WHERE id='inc-1';
      `,
    );
    expect(policeBeforeDetection.code).not.toBe(0);
    expect(policeBeforeDetection.stderr).toContain('EDB_INCIDENT_POLICE_BEFORE_DETECTION');

    const police = execSql(
      dbPath,
      `
        UPDATE edb_incidentes_integridade
           SET police_occurrence_reference='BO-123',
               police_reported_at='2026-09-04T11:30:00Z'
         WHERE id='inc-1';
      `,
    );
    expect(police.code, police.stderr).toBe(0);

    const notify = execSql(
      dbPath,
      `
        UPDATE edb_incidentes_integridade
           SET anac_notification_reference='local-notification-evidence',
               anac_notified_at='2026-09-04T12:00:00Z'
         WHERE id='inc-1';
      `,
    );
    expect(notify.code, notify.stderr).toBe(0);

    const rewritePolice = execSql(
      dbPath,
      `UPDATE edb_incidentes_integridade SET police_occurrence_reference='BO-999' WHERE id='inc-1';`,
    );
    expect(rewritePolice.code).not.toBe(0);
    expect(rewritePolice.stderr).toContain('EDB_INCIDENT_POLICE_EVIDENCE_IMMUTABLE');

    const impossibleWithoutReference = execSql(
      dbPath,
      `
        UPDATE edb_incidentes_integridade
           SET reconstitution_outcome='IMPOSSIBLE',
               reconstitution_completed_at='2026-09-05T10:00:00Z',
               new_diary_opening_observation='Unable to reconstitute'
         WHERE id='inc-1';
      `,
    );
    expect(impossibleWithoutReference.code).not.toBe(0);
    expect(impossibleWithoutReference.stderr).toContain(
      'EDB_INCIDENT_IMPOSSIBLE_RECONSTITUTION_REFERENCE_REQUIRED',
    );

    const impossible = execSql(
      dbPath,
      `
        UPDATE edb_incidentes_integridade
           SET reconstitution_outcome='IMPOSSIBLE',
               reconstitution_completed_at='2026-09-05T10:00:00Z',
               new_diary_opening_observation='Unable to reconstitute; reference BO-123'
         WHERE id='inc-1';
      `,
    );
    expect(impossible.code, impossible.stderr).toBe(0);

    const reopen = execSql(
      dbPath,
      `UPDATE edb_incidentes_integridade SET reconstitution_outcome='PENDING' WHERE id='inc-1';`,
    );
    expect(reopen.code).not.toBe(0);
    expect(reopen.stderr).toContain('EDB_INCIDENT_RECONSTITUTION_EVIDENCE_IMMUTABLE');
  });

  it('contains no ANAC transport lifecycle and does not alter legacy operational tables', () => {
    const dbPath = createDatabase();
    const tableNames = querySql<{ name: string }>(
      dbPath,
      `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'edb_%' ORDER BY name;`,
    ).map((row) => row.name);

    expect(tableNames).toEqual([
      'edb_diarios',
      'edb_incidentes_integridade',
      'edb_volumes',
    ]);
    expect(tableNames.some((name) => name.startsWith('edb_anac_'))).toBe(false);

    const sql = readFileSync(MIGRATION_PATH, 'utf8');
    expect(sql).not.toContain('ANAC_PENDING');
    expect(sql).not.toContain('ANAC_SYNCED');
    expect(sql).not.toMatch(/CREATE TABLE IF NOT EXISTS edb_anac_/);
    expect(sql).not.toMatch(/ALTER TABLE\s+cv_voo_etapas/i);
    expect(sql).not.toMatch(/tempo_ifr_real_minutos|tempo_ifr_simulado_minutos/i);
  });
});

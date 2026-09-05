import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { execSql } from '../helpers/sqlite-batch-runner';

const ROOT = join(__dirname, '../../../..');
const MIGRATION_PATH = join(
  ROOT,
  'worker-airtrust/migrations/0483_edb_diary_persistence_foundation.sql',
);
const tempDirs: string[] = [];

function createDatabase() {
  const dir = mkdtempSync(join(tmpdir(), 'airtrust-edb-0483-isolation-'));
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

  const applied = execSql(dbPath, readFileSync(MIGRATION_PATH, 'utf8'));
  expect(applied.code, applied.stderr).toBe(0);

  const seed = execSql(
    dbPath,
    `
      INSERT INTO edb_diarios (empresa_id, aeronave_id) VALUES (1, 10);
      INSERT INTO edb_diarios (empresa_id, aeronave_id) VALUES (2, 20);
      INSERT INTO edb_volumes (
        id, empresa_id, diario_id, numero_volume, opened_at, opening_act_json
      ) VALUES (
        'tenant-1-volume', 1, 1, 1, '2026-09-05T00:00:00Z',
        json_object('type', 'OPENING', 'actorRef', 'employee:1')
      );
      INSERT INTO edb_incidentes_integridade (
        id, empresa_id, diario_id, volume_id, tipo, detected_at, descricao
      ) VALUES (
        'tenant-1-incident', 1, 1, 'tenant-1-volume', 'LOSS',
        '2026-09-05T01:00:00Z', 'synthetic isolation fixture'
      );
    `,
  );
  expect(seed.code, seed.stderr).toBe(0);

  return dbPath;
}

afterEach(() => {
  while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

describe('0483 regulated isolation regression coverage', () => {
  it('rejects cross-tenant volume attachment even when the target diary id exists', () => {
    const dbPath = createDatabase();

    const crossTenantVolume = execSql(
      dbPath,
      `
        INSERT INTO edb_volumes (
          id, empresa_id, diario_id, numero_volume, opened_at, opening_act_json
        ) VALUES (
          'cross-tenant-volume', 2, 1, 2, '2026-09-05T02:00:00Z',
          json_object('type', 'OPENING', 'actorRef', 'employee:2')
        );
      `,
    );

    expect(crossTenantVolume.code).not.toBe(0);
    expect(crossTenantVolume.stderr).toContain('EDB_VOLUME_DIARY_SCOPE_MISMATCH');
  });

  it('keeps incident tenant/scope identity immutable and append-only after insert', () => {
    const dbPath = createDatabase();

    const moveTenant = execSql(
      dbPath,
      `UPDATE edb_incidentes_integridade SET empresa_id=2 WHERE id='tenant-1-incident';`,
    );
    expect(moveTenant.code).not.toBe(0);
    expect(moveTenant.stderr).toContain('EDB_INCIDENT_IDENTITY_IMMUTABLE');

    const moveDiary = execSql(
      dbPath,
      `UPDATE edb_incidentes_integridade SET diario_id=2 WHERE id='tenant-1-incident';`,
    );
    expect(moveDiary.code).not.toBe(0);
    expect(moveDiary.stderr).toContain('EDB_INCIDENT_IDENTITY_IMMUTABLE');

    const detachVolume = execSql(
      dbPath,
      `UPDATE edb_incidentes_integridade SET volume_id=NULL WHERE id='tenant-1-incident';`,
    );
    expect(detachVolume.code).not.toBe(0);
    expect(detachVolume.stderr).toContain('EDB_INCIDENT_IDENTITY_IMMUTABLE');

    const removeIncident = execSql(
      dbPath,
      `DELETE FROM edb_incidentes_integridade WHERE id='tenant-1-incident';`,
    );
    expect(removeIncident.code).not.toBe(0);
    expect(removeIncident.stderr).toContain('EDB_INCIDENT_DELETE_FORBIDDEN');
  });
});

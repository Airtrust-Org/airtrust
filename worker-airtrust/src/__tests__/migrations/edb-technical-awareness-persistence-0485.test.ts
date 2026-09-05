import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { execSql, querySql } from '../helpers/sqlite-batch-runner';

const ROOT = join(__dirname, '../../../..');
const MIGRATION = join(ROOT, 'worker-airtrust/migrations/0485_edb_technical_awareness_persistence.sql');
const dirs: string[] = [];

function db() {
  const dir = mkdtempSync(join(tmpdir(), 'airtrust-edb-0485-'));
  dirs.push(dir);
  const path = join(dir, 'test.sqlite');
  expect(execSql(path, `
    CREATE TABLE cv_voos (
      id INTEGER PRIMARY KEY,
      empresa_id INTEGER NOT NULL,
      aeronave_id INTEGER,
      deleted_at TEXT
    );
    INSERT INTO cv_voos (id, empresa_id, aeronave_id) VALUES
      (100, 1, 10),
      (200, 2, 20);
  `).code).toBe(0);
  const applied = execSql(path, readFileSync(MIGRATION, 'utf8'));
  expect(applied.code, applied.stderr).toBe(0);
  return path;
}

function snapshotSql(overrides = '') {
  return `
    INSERT INTO edb_situacoes_tecnicas (
      id, empresa_id, voo_id, aeronave_id,
      aircraft_json, maintenance_json,
      technical_content_sha256, canonical_snapshot_sha256,
      captured_at
    ) VALUES (
      'snap-1', 1, 100, 10,
      json_object('aircraftId', 10), json_object('maintenance', 'ok'),
      '${'a'.repeat(64)}', '${'b'.repeat(64)}',
      '2026-09-05T10:00:00Z'
      ${overrides}
    );
  `;
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe('0485 eDB technical awareness persistence', () => {
  it('accepts an immutable same-tenant snapshot and forbids mutation/deletion', () => {
    const path = db();
    const inserted = execSql(path, snapshotSql());
    expect(inserted.code, inserted.stderr).toBe(0);

    const update = execSql(path, `UPDATE edb_situacoes_tecnicas SET captured_at='2026-09-05T11:00:00Z' WHERE id='snap-1';`);
    expect(update.code).not.toBe(0);
    expect(update.stderr).toContain('EDB_TECHNICAL_SNAPSHOT_UPDATE_FORBIDDEN');

    const del = execSql(path, `DELETE FROM edb_situacoes_tecnicas WHERE id='snap-1';`);
    expect(del.code).not.toBe(0);
    expect(del.stderr).toContain('EDB_TECHNICAL_SNAPSHOT_DELETE_FORBIDDEN');
  });

  it('rejects cross-tenant flight and aircraft mismatch', () => {
    const path = db();

    const crossTenant = execSql(path, `
      INSERT INTO edb_situacoes_tecnicas (
        id, empresa_id, voo_id, aeronave_id, aircraft_json, maintenance_json,
        technical_content_sha256, canonical_snapshot_sha256, captured_at
      ) VALUES (
        'snap-x', 1, 200, 20, '{}', '{}',
        '${'a'.repeat(64)}', '${'b'.repeat(64)}', '2026-09-05T10:00:00Z'
      );
    `);
    expect(crossTenant.code).not.toBe(0);
    expect(crossTenant.stderr).toContain('EDB_TECHNICAL_SNAPSHOT_FLIGHT_SCOPE_MISMATCH');

    const wrongAircraft = execSql(path, `
      INSERT INTO edb_situacoes_tecnicas (
        id, empresa_id, voo_id, aeronave_id, aircraft_json, maintenance_json,
        technical_content_sha256, canonical_snapshot_sha256, captured_at
      ) VALUES (
        'snap-y', 1, 100, 99, '{}', '{}',
        '${'a'.repeat(64)}', '${'b'.repeat(64)}', '2026-09-05T10:00:00Z'
      );
    `);
    expect(wrongAircraft.code).not.toBe(0);
    expect(wrongAircraft.stderr).toContain('EDB_TECHNICAL_SNAPSHOT_AIRCRAFT_SCOPE_MISMATCH');
  });

  it('allows explicit missing aircraft evidence without inventing an id', () => {
    const path = db();
    const inserted = execSql(path, `
      INSERT INTO edb_situacoes_tecnicas (
        id, empresa_id, voo_id, aeronave_id, aircraft_json, maintenance_json,
        technical_content_sha256, canonical_snapshot_sha256, captured_at
      ) VALUES (
        'snap-null', 1, 100, NULL, json_object('aircraftId', NULL), '{}',
        '${'a'.repeat(64)}', '${'c'.repeat(64)}', '2026-09-05T10:00:00Z'
      );
    `);
    expect(inserted.code, inserted.stderr).toBe(0);
  });

  it('binds one immutable PIC acknowledgement to the exact snapshot hash', () => {
    const path = db();
    expect(execSql(path, snapshotSql()).code).toBe(0);

    const badHash = execSql(path, `
      INSERT INTO edb_ciencias_tecnicas_pic (
        id, empresa_id, situacao_tecnica_id, voo_id, signer_nome,
        signed_at, canonical_snapshot_sha256, metodo, proof_reference
      ) VALUES (
        'sig-bad', 1, 'snap-1', 100, 'PIC',
        '2026-09-05T10:05:00Z', '${'d'.repeat(64)}',
        'ASYMMETRIC_DIGITAL_SIGNATURE', 'proof-1'
      );
    `);
    expect(badHash.code).not.toBe(0);
    expect(badHash.stderr).toContain('EDB_TECHNICAL_ACK_SNAPSHOT_BINDING_MISMATCH');

    const signed = execSql(path, `
      INSERT INTO edb_ciencias_tecnicas_pic (
        id, empresa_id, situacao_tecnica_id, voo_id, signer_nome,
        signed_at, canonical_snapshot_sha256, metodo, proof_reference
      ) VALUES (
        'sig-1', 1, 'snap-1', 100, 'PIC',
        '2026-09-05T10:05:00Z', '${'b'.repeat(64)}',
        'ASYMMETRIC_DIGITAL_SIGNATURE', 'proof-1'
      );
    `);
    expect(signed.code, signed.stderr).toBe(0);

    const second = execSql(path, `
      INSERT INTO edb_ciencias_tecnicas_pic (
        id, empresa_id, situacao_tecnica_id, voo_id, signer_nome,
        signed_at, canonical_snapshot_sha256, metodo, proof_reference
      ) VALUES (
        'sig-2', 1, 'snap-1', 100, 'PIC 2',
        '2026-09-05T10:06:00Z', '${'b'.repeat(64)}',
        'ASYMMETRIC_DIGITAL_SIGNATURE', 'proof-2'
      );
    `);
    expect(second.code).not.toBe(0);
    expect(second.stderr).toMatch(/UNIQUE constraint failed/);

    const update = execSql(path, `UPDATE edb_ciencias_tecnicas_pic SET signer_nome='Other' WHERE id='sig-1';`);
    expect(update.code).not.toBe(0);
    expect(update.stderr).toContain('EDB_TECHNICAL_ACK_UPDATE_FORBIDDEN');
  });

  it('rejects acknowledgement before snapshot capture and contains no ANAC transport schema', () => {
    const path = db();
    expect(execSql(path, snapshotSql()).code).toBe(0);

    const early = execSql(path, `
      INSERT INTO edb_ciencias_tecnicas_pic (
        id, empresa_id, situacao_tecnica_id, voo_id, signer_nome,
        signed_at, canonical_snapshot_sha256, metodo, proof_reference
      ) VALUES (
        'sig-early', 1, 'snap-1', 100, 'PIC',
        '2026-09-05T09:59:00Z', '${'b'.repeat(64)}',
        'ELECTRONIC_SIGNATURE_WITH_CERTIFICATE', 'proof'
      );
    `);
    expect(early.code).not.toBe(0);
    expect(early.stderr).toContain('EDB_TECHNICAL_ACK_PREDATES_SNAPSHOT');

    const names = querySql<{name:string}>(path, `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'edb_anac_%';`);
    expect(names).toEqual([]);

    const sql = readFileSync(MIGRATION, 'utf8');
    expect(sql).not.toMatch(/ANAC_PENDING|ANAC_SYNCED|edb_anac_/);
    expect(sql).not.toMatch(/tempo_ifr_real_minutos|tempo_ifr_simulado_minutos|\bciclos\b/i);
  });
});

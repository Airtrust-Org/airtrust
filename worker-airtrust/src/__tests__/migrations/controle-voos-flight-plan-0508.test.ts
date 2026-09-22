import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const changeSql = readFileSync(
  join(root, 'schema-v2/changes/0508_controle_voos_flight_plan.sql'),
  'utf8',
);
const migrationSql = readFileSync(
  join(root, 'migrations/0508_controle_voos_flight_plan.sql'),
  'utf8',
);
const tempDirs: string[] = [];

function run(db: string, sql: string, expectSuccess = true) {
  const result = spawnSync('sqlite3', [db], { input: sql, encoding: 'utf8' });
  if (expectSuccess) expect(result.status, result.stderr).toBe(0);
  return result;
}

function query<T>(db: string, sql: string): T[] {
  const result = spawnSync('sqlite3', ['-json', db, sql], { encoding: 'utf8' });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim() ? (JSON.parse(result.stdout) as T[]) : [];
}

function createDb() {
  const dir = mkdtempSync(join(tmpdir(), 'airtrust-flight-plan-0508-'));
  tempDirs.push(dir);
  const db = join(dir, 'db.sqlite');
  run(
    db,
    `
      PRAGMA foreign_keys = ON;
      CREATE TABLE cv_voos (
        id INTEGER PRIMARY KEY,
        empresa_id INTEGER NOT NULL,
        prefixo TEXT NOT NULL,
        deleted_at TEXT
      );
      INSERT INTO cv_voos(id,empresa_id,prefixo,deleted_at)
      VALUES (601,6,'PS-CDV',NULL), (701,7,'PS-XYZ',NULL), (602,6,'PS-OLD',datetime('now'));
    `,
  );
  run(db, changeSql);
  return db;
}

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

describe('schema-v2 0508 Controle de Voos flight plan', () => {
  it('keeps migration mirror byte-identical to reviewed Schema V2 SQL', () => {
    expect(migrationSql).toBe(changeSql);
  });

  it('creates tenant-scoped flight plan and append-only event tables', () => {
    const db = createDb();

    expect(
      query<{ count: number }>(
        db,
        "SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name IN ('cv_planos_voo','cv_plano_voo_eventos');",
      )[0].count,
    ).toBe(2);

    run(
      db,
      `
        INSERT INTO cv_planos_voo (
          empresa_id, voo_id, status, versao, provider, identificacao_aeronave,
          origem_icao, destino_icao, data_operacional, eobt_utc, payload_json
        ) VALUES (
          6, 601, 'rascunho', 1, 'MANUAL', 'PSCDV',
          'SBME', '9PGB', '2026-09-21', '2026-09-21T20:30:00Z', '{"regra_voo":"I"}'
        );
      `,
    );

    const plan = query<{
      empresa_id: number;
      voo_id: number;
      status: string;
      provider: string;
      payload_schema_version: number;
    }>(
      db,
      'SELECT empresa_id,voo_id,status,provider,payload_schema_version FROM cv_planos_voo;',
    )[0];

    expect(plan).toEqual({
      empresa_id: 6,
      voo_id: 601,
      status: 'rascunho',
      provider: 'MANUAL',
      payload_schema_version: 1,
    });

    run(
      db,
      `
        INSERT INTO cv_plano_voo_eventos (
          empresa_id, plano_voo_id, evento_tipo, mensagem_tipo, direcao, provider, status_provider
        ) VALUES (
          6, 1, 'MENSAGEM_ATS', 'FPL', 'OUTBOUND', 'MANUAL', 'PREPARADO'
        );
      `,
    );

    expect(
      query<{ count: number }>(db, 'SELECT COUNT(*) count FROM cv_plano_voo_eventos;')[0].count,
    ).toBe(1);
  });

  it('fails closed on cross-tenant, deleted-flight and duplicate active-plan links', () => {
    const db = createDb();

    expect(
      run(
        db,
        "INSERT INTO cv_planos_voo(empresa_id,voo_id) VALUES (6,701);",
        false,
      ).status,
    ).not.toBe(0);

    expect(
      run(
        db,
        "INSERT INTO cv_planos_voo(empresa_id,voo_id) VALUES (6,602);",
        false,
      ).status,
    ).not.toBe(0);

    run(db, "INSERT INTO cv_planos_voo(empresa_id,voo_id) VALUES (6,601);");

    expect(
      run(
        db,
        "INSERT INTO cv_planos_voo(empresa_id,voo_id) VALUES (6,601);",
        false,
      ).status,
    ).not.toBe(0);

    expect(
      run(
        db,
        "UPDATE cv_planos_voo SET empresa_id=7 WHERE empresa_id=6 AND voo_id=601;",
        false,
      ).status,
    ).not.toBe(0);
  });

  it('enforces closed workflow/provider/message domains and event tenant isolation', () => {
    const db = createDb();
    run(db, "INSERT INTO cv_planos_voo(empresa_id,voo_id) VALUES (6,601);");

    expect(
      run(
        db,
        "UPDATE cv_planos_voo SET status='qualquer', updated_at=datetime('now') WHERE id=1;",
        false,
      ).status,
    ).not.toBe(0);

    expect(
      run(
        db,
        "UPDATE cv_planos_voo SET provider='FPL_BR_SCRAPING', updated_at=datetime('now') WHERE id=1;",
        false,
      ).status,
    ).not.toBe(0);

    expect(
      run(
        db,
        "INSERT INTO cv_plano_voo_eventos(empresa_id,plano_voo_id,evento_tipo,mensagem_tipo) VALUES (7,1,'MENSAGEM_ATS','FPL');",
        false,
      ).status,
    ).not.toBe(0);

    expect(
      run(
        db,
        "INSERT INTO cv_plano_voo_eventos(empresa_id,plano_voo_id,evento_tipo,mensagem_tipo) VALUES (6,1,'MENSAGEM_ATS','XYZ');",
        false,
      ).status,
    ).not.toBe(0);
  });

  it('keeps provider event ledger append-only', () => {
    const db = createDb();
    run(db, "INSERT INTO cv_planos_voo(empresa_id,voo_id) VALUES (6,601);");
    run(
      db,
      "INSERT INTO cv_plano_voo_eventos(empresa_id,plano_voo_id,evento_tipo,mensagem_tipo,direcao) VALUES (6,1,'MENSAGEM_ATS','FPL','OUTBOUND');",
    );

    expect(
      run(
        db,
        "UPDATE cv_plano_voo_eventos SET resposta_codigo='ACK' WHERE id=1;",
        false,
      ).status,
    ).not.toBe(0);

    expect(
      run(db, 'DELETE FROM cv_plano_voo_eventos WHERE id=1;', false).status,
    ).not.toBe(0);
  });

  it('contains no DECEA credential columns in D1', () => {
    const db = createDb();
    const columns = query<{ name: string }>(db, "PRAGMA table_info('cv_planos_voo');").map(
      (row) => row.name.toLowerCase(),
    );
    expect(columns.some((name) => /senha|password|token|secret|cookie|credential/.test(name))).toBe(
      false,
    );
  });
});

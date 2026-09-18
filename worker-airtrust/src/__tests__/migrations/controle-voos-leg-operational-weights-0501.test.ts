import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const changeSql = readFileSync(
  join(root, 'schema-v2/changes/0501_controle_voos_leg_operational_weights.sql'),
  'utf8',
);
const migrationSql = readFileSync(
  join(root, 'migrations/0501_controle_voos_leg_operational_weights.sql'),
  'utf8',
);
const tempDirs: string[] = [];

function run(db: string, sql: string, expectSuccess = true) {
  const result = spawnSync('sqlite3', [db], { input: sql, encoding: 'utf8' });
  if (expectSuccess) expect(result.status, result.stderr).toBe(0);
  else expect(result.status).not.toBe(0);
}

function query<T>(db: string, sql: string): T[] {
  const result = spawnSync('sqlite3', ['-json', db, sql], { encoding: 'utf8' });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim() ? (JSON.parse(result.stdout) as T[]) : [];
}

function createDb() {
  const dir = mkdtempSync(join(tmpdir(), 'airtrust-rdv-weight-0501-'));
  tempDirs.push(dir);
  const db = join(dir, 'db.sqlite');
  run(
    db,
    `
      CREATE TABLE aeronaves (
        id INTEGER PRIMARY KEY,
        codigo TEXT NOT NULL,
        modelo TEXT NOT NULL,
        empresa_id INTEGER NOT NULL
      );
      CREATE TABLE cv_voo_etapas (
        id INTEGER PRIMARY KEY,
        empresa_id INTEGER NOT NULL,
        voo_id INTEGER NOT NULL,
        payload REAL,
        combustivel_inicio REAL,
        combustivel_fim REAL,
        unidade_combustivel TEXT
      );
      CREATE TABLE cv_naturezas_voo (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        empresa_id INTEGER NOT NULL,
        codigo TEXT NOT NULL,
        nome TEXT NOT NULL,
        descricao TEXT,
        ativo INTEGER NOT NULL DEFAULT 1,
        ordem INTEGER NOT NULL DEFAULT 0,
        created_at TEXT,
        updated_at TEXT,
        deleted_at TEXT
      );
      CREATE UNIQUE INDEX idx_cv_naturezas_voo_empresa_codigo
        ON cv_naturezas_voo(empresa_id, codigo)
        WHERE deleted_at IS NULL;

      INSERT INTO aeronaves(id,codigo,modelo,empresa_id)
      VALUES (1,'PR-TST','AW139',6);
      INSERT INTO cv_voo_etapas(id,empresa_id,voo_id,payload,combustivel_inicio,unidade_combustivel)
      VALUES (10,6,42,100,1800,'LB');
    `,
  );
  run(db, changeSql);
  return db;
}

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

describe('schema-v2 0501 Controle de Voos operational leg weights', () => {
  it('keeps migration mirror byte-identical to reviewed Schema V2 SQL', () => {
    expect(migrationSql).toBe(changeSql);
  });

  it('adds exact aircraft empty-weight and per-leg operational fields', () => {
    const db = createDb();
    const aircraftColumns = query<{ name: string }>(db, 'PRAGMA table_info(aeronaves);').map(
      (row) => row.name,
    );
    expect(aircraftColumns).toEqual(expect.arrayContaining(['peso_vazio', 'unidade_peso']));

    const stageColumns = query<{ name: string }>(db, 'PRAGMA table_info(cv_voo_etapas);').map(
      (row) => row.name,
    );
    expect(stageColumns).toEqual(
      expect.arrayContaining([
        'peso_passageiros',
        'peso_bagagem',
        'peso_tripulacao',
        'peso_vazio',
        'peso_total',
        'unidade_peso',
        'observacoes',
      ]),
    );
  });

  it('does not invent a weight for existing aircraft and enforces valid units/positive values', () => {
    const db = createDb();
    const row = query<{ peso_vazio: number | null; unidade_peso: string | null }>(
      db,
      'SELECT peso_vazio,unidade_peso FROM aeronaves WHERE id=1;',
    )[0];
    expect(row).toEqual({ peso_vazio: null, unidade_peso: null });

    run(db, "UPDATE aeronaves SET peso_vazio=9300,unidade_peso='LB' WHERE id=1;");
    run(db, "UPDATE aeronaves SET peso_vazio=-1 WHERE id=1;", false);
    run(db, "UPDATE aeronaves SET unidade_peso='TON' WHERE id=1;", false);
  });

  it('ensures the tenant-6 Petrobras nature exists without changing other tenants', () => {
    const db = createDb();
    expect(
      query<{ codigo: string; nome: string; ativo: number }>(
        db,
        "SELECT codigo,nome,ativo FROM cv_naturezas_voo WHERE empresa_id=6 AND codigo='PETROBRAS';",
      )[0],
    ).toEqual({ codigo: 'PETROBRAS', nome: 'Petrobras', ativo: 1 });
    expect(
      query<{ total: number }>(
        db,
        "SELECT COUNT(*) total FROM cv_naturezas_voo WHERE empresa_id<>6 AND codigo='PETROBRAS';",
      )[0].total,
    ).toBe(0);
  });
});

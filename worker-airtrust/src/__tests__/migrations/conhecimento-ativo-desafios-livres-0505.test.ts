import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { afterAll, describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const changeSql = readFileSync(
  join(root, 'schema-v2/changes/0505_conhecimento_ativo_desafios_livres.sql'),
  'utf8',
);
const migrationSql = readFileSync(
  join(root, 'migrations/0505_conhecimento_ativo_desafios_livres.sql'),
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
  const dir = mkdtempSync(join(tmpdir(), 'airtrust-ca-0505-'));
  tempDirs.push(dir);
  const db = join(dir, 'db.sqlite');
  run(
    db,
    `
    PRAGMA foreign_keys=ON;
    CREATE TABLE funcionarios(id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, deleted_at TEXT);
    INSERT INTO funcionarios(id,empresa_id) VALUES(10,63);

    CREATE TABLE conhecimento_ativo_desafios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      empresa_id INTEGER NOT NULL,
      funcionario_id INTEGER NOT NULL,
      aeronave_modelo TEXT NOT NULL,
      periodo_chave TEXT NOT NULL,
      numero_desafio INTEGER NOT NULL DEFAULT 1 CHECK(numero_desafio BETWEEN 1 AND 2),
      status TEXT NOT NULL DEFAULT 'DISPONIVEL' CHECK(status IN ('DISPONIVEL','EM_ANDAMENTO','CONCLUIDO','EXPIRADO')),
      disponivel_em TEXT NOT NULL DEFAULT(datetime('now')),
      expira_em TEXT,
      iniciado_em TEXT,
      concluido_em TEXT,
      xp_concedido INTEGER NOT NULL DEFAULT 0 CHECK(xp_concedido >= 0),
      created_at TEXT NOT NULL DEFAULT(datetime('now')),
      updated_at TEXT NOT NULL DEFAULT(datetime('now')),
      deleted_at TEXT,
      FOREIGN KEY(funcionario_id) REFERENCES funcionarios(id)
    );
    CREATE UNIQUE INDEX idx_ca_desafios_periodo_active
      ON conhecimento_ativo_desafios(empresa_id,funcionario_id,aeronave_modelo,periodo_chave,numero_desafio)
      WHERE deleted_at IS NULL;
    CREATE INDEX idx_ca_desafios_me
      ON conhecimento_ativo_desafios(empresa_id,funcionario_id,status,disponivel_em)
      WHERE deleted_at IS NULL;
    CREATE TRIGGER trg_ca_desafios_funcionario_tenant_insert
    BEFORE INSERT ON conhecimento_ativo_desafios BEGIN
      SELECT CASE WHEN NOT EXISTS(
        SELECT 1 FROM funcionarios f
        WHERE f.id=NEW.funcionario_id AND f.empresa_id=NEW.empresa_id AND f.deleted_at IS NULL
      ) THEN RAISE(ABORT,'conhecimento ativo challenge employee tenant mismatch') END;
    END;

    CREATE TABLE conhecimento_ativo_desafio_questoes(
      id INTEGER PRIMARY KEY,
      empresa_id INTEGER NOT NULL,
      desafio_id INTEGER NOT NULL,
      FOREIGN KEY(desafio_id) REFERENCES conhecimento_ativo_desafios(id)
    );
    CREATE TABLE conhecimento_ativo_xp_eventos(
      id INTEGER PRIMARY KEY,
      empresa_id INTEGER NOT NULL,
      desafio_id INTEGER,
      FOREIGN KEY(desafio_id) REFERENCES conhecimento_ativo_desafios(id)
    );

    INSERT INTO conhecimento_ativo_desafios(id,empresa_id,funcionario_id,aeronave_modelo,periodo_chave,numero_desafio,status)
    VALUES(101,63,10,'AW139','2026-09-Q2',1,'CONCLUIDO'),
          (102,63,10,'AW139','2026-09-Q2',2,'CONCLUIDO');
    INSERT INTO conhecimento_ativo_desafio_questoes(id,empresa_id,desafio_id) VALUES(1,63,101);
    INSERT INTO conhecimento_ativo_xp_eventos(id,empresa_id,desafio_id) VALUES(1,63,102);
    `,
  );
  return db;
}

afterAll(() => tempDirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

describe('Schema V2 0505 — Conhecimento Ativo desafios livres', () => {
  it('keeps migration mirror byte-identical to the reviewed Schema V2 SQL', () => {
    expect(migrationSql).toBe(changeSql);
  });

  it('preserves existing challenges and permits challenge number 3 and above', () => {
    const db = createDb();
    run(db, changeSql);

    const preserved = query<{ id: number; numero_desafio: number; numero_sequencial: number }>(
      db,
      'SELECT id,numero_desafio,numero_sequencial FROM conhecimento_ativo_desafios ORDER BY id',
    );
    expect(preserved).toEqual([
      { id: 101, numero_desafio: 1, numero_sequencial: 1 },
      { id: 102, numero_desafio: 2, numero_sequencial: 2 },
    ]);

    run(
      db,
      "INSERT INTO conhecimento_ativo_desafios(empresa_id,funcionario_id,aeronave_modelo,periodo_chave,numero_desafio,numero_sequencial) VALUES(63,10,'AW139','2026-09-Q2',2,3);",
    );
    run(
      db,
      "INSERT INTO conhecimento_ativo_desafios(empresa_id,funcionario_id,aeronave_modelo,periodo_chave,numero_desafio,numero_sequencial) VALUES(63,10,'AW139','2026-09-Q2',2,15);",
    );
    expect(
      query<{ total: number }>(db, 'SELECT COUNT(*) AS total FROM conhecimento_ativo_desafios')[0].total,
    ).toBe(4);

    run(
      db,
      "INSERT INTO conhecimento_ativo_desafios(empresa_id,funcionario_id,aeronave_modelo,periodo_chave,numero_desafio) VALUES(63,10,'AW139','2026-10-Q1',1);",
    );
    expect(
      query<{ numero_sequencial: number }>(
        db,
        "SELECT numero_sequencial FROM conhecimento_ativo_desafios WHERE periodo_chave='2026-10-Q1'",
      )[0].numero_sequencial,
    ).toBe(1);

    const fkErrors = query<Record<string, unknown>>(db, 'PRAGMA foreign_key_check;');
    expect(fkErrors).toEqual([]);
  });

  it('keeps tenant validation and rejects non-positive challenge numbers', () => {
    const db = createDb();
    run(db, changeSql);
    run(
      db,
      "INSERT INTO conhecimento_ativo_desafios(empresa_id,funcionario_id,aeronave_modelo,periodo_chave,numero_desafio,numero_sequencial) VALUES(64,10,'AW139','2026-09-Q2',2,3);",
      false,
    );
    run(
      db,
      "INSERT INTO conhecimento_ativo_desafios(empresa_id,funcionario_id,aeronave_modelo,periodo_chave,numero_desafio,numero_sequencial) VALUES(63,10,'AW139','2026-09-Q2',2,0);",
      false,
    );
  });
});

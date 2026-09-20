import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const changeSql = readFileSync(
  join(root, 'schema-v2/changes/0507_controle_voos_delay_justification_catalog.sql'),
  'utf8',
);
const migrationSql = readFileSync(
  join(root, 'migrations/0507_controle_voos_delay_justification_catalog.sql'),
  'utf8',
);
const tempDirs: string[] = [];

function run(db: string, sql: string) {
  const result = spawnSync('sqlite3', [db], { input: sql, encoding: 'utf8' });
  expect(result.status, result.stderr).toBe(0);
}

function query<T>(db: string, sql: string): T[] {
  const result = spawnSync('sqlite3', ['-json', db, sql], { encoding: 'utf8' });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim() ? (JSON.parse(result.stdout) as T[]) : [];
}

function createDb() {
  const dir = mkdtempSync(join(tmpdir(), 'airtrust-delay-catalog-0507-'));
  tempDirs.push(dir);
  const db = join(dir, 'db.sqlite');
  run(
    db,
    `
      CREATE TABLE empresas (id INTEGER PRIMARY KEY, nome TEXT NOT NULL);
      INSERT INTO empresas(id,nome) VALUES (6,'Costa do Sol Táxi Aéreo'), (7,'Outro Tenant');
      CREATE TABLE cv_justificativas_voo (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        empresa_id INTEGER NOT NULL,
        codigo TEXT NOT NULL,
        nome TEXT NOT NULL,
        descricao TEXT,
        ativo INTEGER NOT NULL DEFAULT 1,
        ordem INTEGER NOT NULL DEFAULT 0,
        created_by INTEGER,
        updated_by INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        deleted_at TEXT
      );
      CREATE UNIQUE INDEX idx_cv_justificativas_voo_empresa_codigo
        ON cv_justificativas_voo(empresa_id,codigo) WHERE deleted_at IS NULL;
      INSERT INTO cv_justificativas_voo(empresa_id,codigo,nome) VALUES (7,'OTHER','Outro motivo');
    `,
  );
  run(db, changeSql);
  return db;
}

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

describe('schema-v2 0507 Controle de Voos Petrobras delay catalog', () => {
  it('keeps migration mirror byte-identical to reviewed Schema V2 SQL', () => {
    expect(migrationSql).toBe(changeSql);
  });

  it('adds category and exactly 54 AA41-AA94 codes to tenant 6 only', () => {
    const db = createDb();
    expect(query<{ count: number }>(
      db,
      "SELECT COUNT(*) count FROM pragma_table_info('cv_justificativas_voo') WHERE name='categoria';",
    )[0].count).toBe(1);
    expect(query<{ count: number }>(
      db,
      "SELECT COUNT(*) count FROM cv_justificativas_voo WHERE empresa_id=6 AND codigo GLOB 'AA[4-9][0-9]';",
    )[0].count).toBe(54);
    expect(query<{ count: number }>(
      db,
      "SELECT COUNT(DISTINCT categoria) count FROM cv_justificativas_voo WHERE empresa_id=6;",
    )[0].count).toBe(5);
    expect(query<{ count: number }>(
      db,
      "SELECT COUNT(*) count FROM cv_justificativas_voo WHERE empresa_id=7;",
    )[0].count).toBe(1);
  });

  it('preserves source category/title/description for representative codes', () => {
    const db = createDb();
    const aa62 = query<{ nome: string; categoria: string; descricao: string }>(
      db,
      "SELECT nome,categoria,descricao FROM cv_justificativas_voo WHERE empresa_id=6 AND codigo='AA62';",
    )[0];
    expect(aa62.nome).toBe('TEMPO DE VOO MAIOR QUE O PROGRAMADO');
    expect(aa62.categoria).toBe('Necessidade Operacional');
    expect(aa62.descricao).toContain('tempo de voo no SITAER desatualizado');

    const aa93 = query<{ categoria: string; descricao: string }>(
      db,
      "SELECT categoria,descricao FROM cv_justificativas_voo WHERE empresa_id=6 AND codigo='AA93';",
    )[0];
    expect(aa93.categoria).toBe('Condições Meteorológicas');
    expect(aa93.descricao).toContain('aeroporto de origem');
  });
});

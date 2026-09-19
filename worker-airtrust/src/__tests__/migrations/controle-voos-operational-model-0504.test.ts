import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const changeSql = readFileSync(join(root, 'schema-v2/changes/0504_controle_voos_operational_model.sql'), 'utf8');
const migrationSql = readFileSync(join(root, 'migrations/0504_controle_voos_operational_model.sql'), 'utf8');
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
  const dir = mkdtempSync(join(tmpdir(), 'airtrust-operational-model-0504-'));
  tempDirs.push(dir);
  const db = join(dir, 'db.sqlite');
  run(db, `
    PRAGMA foreign_keys=ON;
    CREATE TABLE cv_aeroportos(id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, deleted_at TEXT);
    CREATE TABLE cv_tipos_voo(id INTEGER PRIMARY KEY AUTOINCREMENT, empresa_id INTEGER NOT NULL, codigo TEXT NOT NULL, nome TEXT NOT NULL, descricao TEXT, ativo INTEGER NOT NULL DEFAULT 1, ordem INTEGER NOT NULL DEFAULT 0, created_by INTEGER, updated_by INTEGER, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')), deleted_at TEXT);
    CREATE UNIQUE INDEX idx_cv_tipos_voo_empresa_codigo ON cv_tipos_voo(empresa_id,codigo) WHERE deleted_at IS NULL;
    CREATE TABLE cv_naturezas_voo(id INTEGER PRIMARY KEY AUTOINCREMENT, empresa_id INTEGER NOT NULL, codigo TEXT NOT NULL, nome TEXT NOT NULL, descricao TEXT, ativo INTEGER NOT NULL DEFAULT 1, ordem INTEGER NOT NULL DEFAULT 0, created_by INTEGER, updated_by INTEGER, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')), deleted_at TEXT);
    CREATE UNIQUE INDEX idx_cv_naturezas_voo_empresa_codigo ON cv_naturezas_voo(empresa_id,codigo) WHERE deleted_at IS NULL;
    CREATE TABLE cv_voos(id INTEGER PRIMARY KEY AUTOINCREMENT, empresa_id INTEGER NOT NULL, data_programacao TEXT NOT NULL, deleted_at TEXT);
    CREATE TABLE cv_voo_etapas(id INTEGER PRIMARY KEY AUTOINCREMENT, empresa_id INTEGER NOT NULL, voo_id INTEGER NOT NULL, deleted_at TEXT);
    CREATE TABLE cv_voo_tripulantes(id INTEGER PRIMARY KEY AUTOINCREMENT, empresa_id INTEGER NOT NULL, voo_id INTEGER NOT NULL, funcionario_id INTEGER NOT NULL, funcao TEXT NOT NULL, deleted_at TEXT);
    CREATE TABLE cv_voo_abastecimentos(id INTEGER PRIMARY KEY AUTOINCREMENT, empresa_id INTEGER NOT NULL, voo_id INTEGER NOT NULL, etapa_id INTEGER, deleted_at TEXT);
    INSERT INTO cv_aeroportos(id,empresa_id) VALUES (1,63),(2,64);
  `);
  run(db, changeSql);
  return db;
}

afterAll(() => tempDirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

describe('schema-v2 0504 Controle de Voos operational model', () => {
  it('keeps migration mirror byte-identical to reviewed Schema V2 SQL', () => {
    expect(migrationSql).toBe(changeSql);
  });

  it('creates tenant-scoped contract and onboard-role catalogs and additive flight/crew columns', () => {
    const db = createDb();
    expect(query<{ name: string }>(db, 'PRAGMA table_info(cv_contratos);').map((r) => r.name)).toEqual(expect.arrayContaining(['id','empresa_id','codigo','nome','ativo','ordem']));
    expect(query<{ name: string }>(db, 'PRAGMA table_info(cv_funcoes_bordo);').map((r) => r.name)).toEqual(expect.arrayContaining(['id','empresa_id','codigo','nome','ativo','ordem']));
    expect(query<{ name: string }>(db, 'PRAGMA table_info(cv_voos);').map((r) => r.name)).toEqual(expect.arrayContaining(['numero_voo','numero_db','contrato_id']));
    expect(query<{ name: string }>(db, 'PRAGMA table_info(cv_voo_tripulantes);').map((r) => r.name)).toContain('funcao_bordo_id');
  });

  it('seeds requested editable flight types and onboard roles per tenant without cross-tenant collisions', () => {
    const db = createDb();
    const types = query<{ empresa_id: number; codigo: string }>(db, "SELECT empresa_id,codigo FROM cv_tipos_voo ORDER BY empresa_id,codigo");
    expect(types.filter((r) => r.empresa_id === 63).map((r) => r.codigo)).toEqual(['AEROMEDICO','CONTRATO','MANUTENCAO','SPOT','TREINAMENTO']);
    expect(types.filter((r) => r.empresa_id === 64)).toHaveLength(5);
    const roles = query<{ codigo: string }>(db, "SELECT codigo FROM cv_funcoes_bordo WHERE empresa_id=63 ORDER BY codigo").map((r) => r.codigo);
    expect(roles).toEqual(['COMANDANTE','COPILOTO','EXAMINADOR','INSTRUTOR']);
    const nature = query<{ codigo: string }>(db, "SELECT codigo FROM cv_naturezas_voo WHERE empresa_id=63");
    expect(nature).toEqual([{ codigo: 'OPERACIONAL' }]);
  });

  it('enforces tenant-scoped catalog uniqueness', () => {
    const db = createDb();
    run(db, "INSERT INTO cv_contratos(empresa_id,codigo,nome) VALUES(63,'C-1','Contrato 1');");
    run(db, "INSERT INTO cv_contratos(empresa_id,codigo,nome) VALUES(64,'C-1','Contrato 1 outro tenant');");
    run(db, "INSERT INTO cv_contratos(empresa_id,codigo,nome) VALUES(63,'C-1','Duplicado');", false);
  });
});

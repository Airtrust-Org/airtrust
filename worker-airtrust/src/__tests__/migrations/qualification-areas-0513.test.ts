import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { execSql, querySql } from '../helpers/sqlite-batch-runner';

const ROOT = join(__dirname, '../../../..');
const migration = readFileSync(
  join(ROOT, 'worker-airtrust/schema-v2/changes/0513_qualification_areas.sql'),
  'utf8',
);
const tempDirs: string[] = [];

function createDatabase() {
  const dir = mkdtempSync(join(tmpdir(), 'airtrust-qualification-areas-0513-'));
  tempDirs.push(dir);
  const dbPath = join(dir, 'test.sqlite');
  const setup = execSql(dbPath, `
    PRAGMA foreign_keys=ON;
    CREATE TABLE empresas (id INTEGER PRIMARY KEY);
    CREATE TABLE qualificacoes_tipos (
      id INTEGER PRIMARY KEY,
      empresa_id INTEGER NOT NULL,
      updated_at TEXT,
      deleted_at TEXT
    );
    CREATE TABLE setores (
      id INTEGER PRIMARY KEY,
      empresa_id INTEGER NOT NULL,
      codigo TEXT,
      nome TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE TABLE qualificacoes_tipos_setores (
      id INTEGER PRIMARY KEY,
      tipo_id INTEGER NOT NULL,
      setor_id INTEGER NOT NULL,
      empresa_id INTEGER NOT NULL,
      deleted_at TEXT
    );
    INSERT INTO empresas(id) VALUES (6),(7);
    INSERT INTO qualificacoes_tipos(id,empresa_id) VALUES (1,6),(2,6),(3,6),(4,6),(5,6),(6,6),(20,7);
    INSERT INTO setores(id,empresa_id,codigo,nome) VALUES
      (10,6,'TRI','Tripulação'),
      (11,6,'CTM','CTM'),
      (12,6,'QUA','Qualidade'),
      (13,6,'SGSO','Segurança Operacional'),
      (14,6,'RH','Recursos Humanos');
    INSERT INTO qualificacoes_tipos_setores(id,tipo_id,setor_id,empresa_id) VALUES
      (1,1,10,6),(2,2,11,6),(3,3,12,6),(4,4,13,6),(5,5,10,6),(6,5,11,6),(7,6,10,6),(8,6,14,6);
  `);
  expect(setup.code, setup.stderr).toBe(0);
  return dbPath;
}

afterEach(() => {
  while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

describe('0513 qualification areas', () => {
  it('creates the four approved areas and migrates only unambiguous legacy classification', () => {
    const dbPath = createDatabase();
    const result = execSql(dbPath, migration);
    expect(result.code, result.stderr).toBe(0);

    const areas = querySql<Record<string, unknown>>(dbPath, `
      SELECT codigo,nome FROM qualificacoes_areas WHERE empresa_id=6 ORDER BY codigo;
    `);
    expect(areas).toEqual([
      { codigo: 'MANUTENCAO', nome: 'Manutenção' },
      { codigo: 'OPERACOES', nome: 'Operações' },
      { codigo: 'QSMS', nome: 'QSMS' },
      { codigo: 'SEGURANCA_OPERACIONAL', nome: 'Segurança Operacional' },
    ]);

    const models = querySql<Record<string, unknown>>(dbPath, `
      SELECT qt.id,qa.codigo AS area_codigo
      FROM qualificacoes_tipos qt
      LEFT JOIN qualificacoes_areas qa ON qa.id=qt.area_id
      WHERE qt.empresa_id=6 ORDER BY qt.id;
    `);
    expect(models).toEqual([
      { id: 1, area_codigo: 'OPERACOES' },
      { id: 2, area_codigo: 'MANUTENCAO' },
      { id: 3, area_codigo: 'QSMS' },
      { id: 4, area_codigo: 'SEGURANCA_OPERACIONAL' },
      { id: 5, area_codigo: null },
      { id: 6, area_codigo: null },
    ]);
  });

  it('rejects cross-tenant area assignment', () => {
    const dbPath = createDatabase();
    expect(execSql(dbPath, migration).code).toBe(0);
    expect(execSql(dbPath, `
      INSERT INTO qualificacoes_areas(empresa_id,codigo,nome) VALUES (7,'OPS7','Operações 7');
      UPDATE qualificacoes_tipos
         SET area_id=(SELECT id FROM qualificacoes_areas WHERE empresa_id=7 AND codigo='OPS7')
       WHERE id=1;
    `).code).not.toBe(0);
  });
});

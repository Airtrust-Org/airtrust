import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { execSql, querySql } from '../helpers/sqlite-batch-runner';

const ROOT = join(__dirname, '../../../..');
const migration = readFileSync(
  join(ROOT, 'worker-airtrust/migrations/0491_training_compliance_requirements.sql'),
  'utf8',
);
const tempDirs: string[] = [];

function createDatabase() {
  const dir = mkdtempSync(join(tmpdir(), 'airtrust-training-compliance-0491-'));
  tempDirs.push(dir);
  const dbPath = join(dir, 'test.sqlite');
  const setup = execSql(dbPath, `
    PRAGMA foreign_keys=ON;
    CREATE TABLE empresas (id INTEGER PRIMARY KEY);
    CREATE TABLE qualificacoes_tipos (id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL);
    CREATE TABLE setores (id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL);
    CREATE TABLE funcoes (id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL);
    CREATE TABLE funcionarios (id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL);
    CREATE TABLE matriz_treinamento_funcao (
      id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, funcao_id INTEGER NOT NULL,
      qualificacao_tipo_id INTEGER NOT NULL, obrigatoriedade TEXT NOT NULL,
      nivel_requerido INTEGER, critico_operacional INTEGER NOT NULL DEFAULT 0,
      origem TEXT NOT NULL, observacoes TEXT, ativo INTEGER NOT NULL DEFAULT 1,
      created_at TEXT, updated_at TEXT, deleted_at TEXT
    );
    INSERT INTO empresas VALUES (1),(2);
    INSERT INTO qualificacoes_tipos VALUES (10,1),(20,2);
    INSERT INTO setores VALUES (100,1),(200,2);
    INSERT INTO funcoes VALUES (1000,1),(2000,2);
    INSERT INTO funcionarios VALUES (10000,1),(20000,2);
    INSERT INTO matriz_treinamento_funcao VALUES
      (1,1,1000,10,'OBRIGATORIA',NULL,1,'REGULATORIO','legacy active',1,datetime('now'),datetime('now'),NULL),
      (2,1,1000,10,'RECOMENDADA',NULL,0,'RH','deleted',0,datetime('now'),datetime('now'),datetime('now'));
  `);
  expect(setup.code, setup.stderr).toBe(0);
  return dbPath;
}

afterEach(() => {
  while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

describe('0491 canonical training compliance requirements', () => {
  it('backfills only the active legacy function matrix and is idempotent', () => {
    const dbPath = createDatabase();
    expect(execSql(dbPath, migration).code).toBe(0);
    expect(execSql(dbPath, migration).code).toBe(0);
    const rows = querySql<Record<string, unknown>>(dbPath, `
      SELECT empresa_id, qualificacao_tipo_id, escopo, funcao_id, obrigatoriedade,
             critico_operacional, origem, observacoes
      FROM treinamento_requisitos ORDER BY id;
    `);
    expect(rows).toEqual([{
      empresa_id: 1, qualificacao_tipo_id: 10, escopo: 'FUNCAO', funcao_id: 1000,
      obrigatoriedade: 'OBRIGATORIA', critico_operacional: 1,
      origem: 'REGULATORIO', observacoes: 'legacy active',
    }]);
  });

  it('enforces scope shape, tenant foreign keys and active uniqueness', () => {
    const dbPath = createDatabase();
    expect(execSql(dbPath, migration).code).toBe(0);
    const invalidScope = execSql(dbPath, `
      INSERT INTO treinamento_requisitos
        (empresa_id,qualificacao_tipo_id,escopo,funcao_id,setor_id)
      VALUES (1,10,'FUNCAO',1000,100);
    `);
    expect(invalidScope.code).not.toBe(0);

    const crossTenant = execSql(dbPath, `
      INSERT INTO treinamento_requisitos
        (empresa_id,qualificacao_tipo_id,escopo,funcao_id)
      VALUES (1,20,'FUNCAO',1000);
    `);
    expect(crossTenant.code).not.toBe(0);

    const duplicate = execSql(dbPath, `
      INSERT INTO treinamento_requisitos
        (empresa_id,qualificacao_tipo_id,escopo,funcao_id)
      VALUES (1,10,'FUNCAO',1000);
    `);
    expect(duplicate.code).not.toBe(0);
  });
});

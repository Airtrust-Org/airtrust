import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { execSql, querySql } from '../helpers/sqlite-batch-runner';

const ROOT = join(__dirname, '../../../..');
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');
const base0491 = read('worker-airtrust/migrations/0491_training_compliance_requirements.sql');
const aircraft0497 = read('worker-airtrust/migrations/0497_training_compliance_aircraft_scope.sql');
const migrationPath = 'worker-airtrust/migrations/0517_training_compliance_conditions.sql';
const changePath = 'worker-airtrust/schema-v2/changes/0517_training_compliance_conditions.sql';
const planPath = 'worker-airtrust/schema-v2/plans/training-compliance-conditions-0517.md';
const manifestPath = 'worker-airtrust/schema-v2/training-compliance-conditions-0517.json';
const migration = read(migrationPath);
const tempDirs: string[] = [];
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

function createDatabase() {
  const dir = mkdtempSync(join(tmpdir(), 'airtrust-training-conditions-0517-'));
  tempDirs.push(dir);
  const db = join(dir, 'test.sqlite');
  expect(execSql(db, `
    PRAGMA foreign_keys=ON;
    CREATE TABLE empresas (id INTEGER PRIMARY KEY);
    CREATE TABLE qualificacoes_tipos (id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL);
    CREATE TABLE setores (id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL);
    CREATE TABLE funcoes (id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL);
    CREATE TABLE funcionarios (id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, deleted_at TEXT);
    CREATE TABLE matriz_treinamento_funcao (
      id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, funcao_id INTEGER NOT NULL,
      qualificacao_tipo_id INTEGER NOT NULL, obrigatoriedade TEXT NOT NULL,
      nivel_requerido INTEGER, critico_operacional INTEGER NOT NULL DEFAULT 0,
      origem TEXT NOT NULL, observacoes TEXT, ativo INTEGER NOT NULL DEFAULT 1,
      created_at TEXT, updated_at TEXT, deleted_at TEXT
    );
    INSERT INTO empresas VALUES (6),(7);
    INSERT INTO qualificacoes_tipos VALUES (100,6),(200,7);
    INSERT INTO setores VALUES (10,6),(20,7);
    INSERT INTO funcoes VALUES (1,6),(2,7);
    INSERT INTO funcionarios VALUES (1000,6,NULL),(2000,7,NULL);
  `).code).toBe(0);
  expect(execSql(db, base0491).code).toBe(0);
  expect(execSql(db, aircraft0497).code).toBe(0);
  return db;
}

afterEach(() => {
  while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

describe('0517 training compliance conditions', () => {
  it('pins Schema V2 change, migration and plan hashes', () => {
    const change = read(changePath);
    const plan = read(planPath);
    const manifest = JSON.parse(read(manifestPath)) as Record<string, string>;
    expect(change).toBe(migration);
    expect(manifest).toMatchObject({
      changeId: 'training-compliance-conditions-0517',
      baselineId: 'production-d1-baseline-v2-20260714',
      filePath: changePath,
      planPath,
    });
    expect(manifest.fileHash).toBe(sha256(change));
    expect(manifest.planHash).toBe(sha256(plan));
  });

  it('keeps the condition catalog compatible with the D1 compound-select ceiling', () => {
    expect(migration).not.toContain('UNION ALL SELECT');
    expect((migration.match(/INSERT OR IGNORE INTO compliance_condicoes/g) ?? []).length).toBe(24);
  });

  it('adds conditions, audited requirement metadata and Costa do Sol catalog without assignments', () => {
    const db = createDatabase();
    const applied = execSql(db, migration);
    expect(applied.code, applied.stderr).toBe(0);
    const columns = querySql<{ name: string }>(db, `PRAGMA table_info('treinamento_requisitos');`).map((r) => r.name);
    expect(columns).toEqual(expect.arrayContaining(['condicao_id','justificativa','perfil_competencia','modalidade_requerida','fundamento_tipo','fundamento_documento','fundamento_item','validade_fonte']));
    expect(querySql<{ total: number }>(db, `SELECT COUNT(*) total FROM compliance_condicoes WHERE empresa_id=6;`)[0].total).toBe(24);
    expect(querySql<{ total: number }>(db, `SELECT COUNT(*) total FROM compliance_condicoes WHERE empresa_id=7;`)[0].total).toBe(0);
    expect(querySql<{ total: number }>(db, `SELECT COUNT(*) total FROM funcionarios_compliance_condicoes;`)[0].total).toBe(0);
  });

  it('rejects cross-tenant assignments and condition links', () => {
    const db = createDatabase();
    expect(execSql(db, migration).code).toBe(0);
    const cond = querySql<{ id: number }>(db, `SELECT id FROM compliance_condicoes WHERE empresa_id=6 AND codigo='ARSO';`)[0].id;
    expect(execSql(db, `INSERT INTO funcionarios_compliance_condicoes(empresa_id,funcionario_id,condicao_id) VALUES(7,2000,${cond});`).code).not.toBe(0);
    expect(execSql(db, `INSERT INTO treinamento_requisitos(empresa_id,qualificacao_tipo_id,escopo,obrigatoriedade,origem,condicao_id) VALUES(7,200,'EMPRESA','OBRIGATORIA','REGULATORIO',${cond});`).code).not.toBe(0);
  });

  it('allows distinct active rules by condition or competency profile while preventing duplicates', () => {
    const db = createDatabase();
    expect(execSql(db, migration).code).toBe(0);
    const arso = querySql<{ id: number }>(db, `SELECT id FROM compliance_condicoes WHERE empresa_id=6 AND codigo='ARSO';`)[0].id;
    const supervisor = querySql<{ id: number }>(db, `SELECT id FROM compliance_condicoes WHERE empresa_id=6 AND codigo='SUPERVISOR_ARSO';`)[0].id;
    expect(execSql(db, `
      INSERT INTO treinamento_requisitos(empresa_id,qualificacao_tipo_id,escopo,obrigatoriedade,origem,condicao_id,perfil_competencia)
      VALUES(6,100,'EMPRESA','OBRIGATORIA','REGULATORIO',${arso},'PERFIL_A'),
            (6,100,'EMPRESA','OBRIGATORIA','REGULATORIO',${supervisor},'PERFIL_A'),
            (6,100,'EMPRESA','OBRIGATORIA','REGULATORIO',${arso},'PERFIL_B');
    `).code).toBe(0);
    const duplicate = execSql(db, `INSERT INTO treinamento_requisitos(empresa_id,qualificacao_tipo_id,escopo,obrigatoriedade,origem,condicao_id,perfil_competencia) VALUES(6,100,'EMPRESA','RECOMENDADA','EMPRESA',${arso},' perfil_a ');`);
    expect(duplicate.code).not.toBe(0);
  });

  it('keeps 0517 on both staging allowlists and validates staging postconditions', () => {
    const outer = read('scripts/staging/apply-approved-migrations.sh');
    const recovery = read('scripts/staging/apply-approved-migration-with-recovery-point.sh');
    const validator = read('scripts/staging/validate-0517-postconditions.sh');
    expect(outer).toContain('0517_training_compliance_conditions.sql');
    expect(recovery).toContain('0517_training_compliance_conditions.sql');
    expect(recovery).toContain('validate-0517-postconditions.sh');
    expect(validator).toContain('migration-ledger-0517');
    expect(validator).toContain('requirement-audit-columns');
    expect(validator).toContain('costa-do-sol-condition-catalog');
    expect(validator).toContain('no-inferred-employee-assignments');
    expect(spawnSync('bash', ['-n', 'scripts/staging/apply-approved-migration-with-recovery-point.sh'], { cwd: ROOT }).status).toBe(0);
    expect(spawnSync('bash', ['-n', 'scripts/staging/validate-0517-postconditions.sh'], { cwd: ROOT }).status).toBe(0);
  });

});

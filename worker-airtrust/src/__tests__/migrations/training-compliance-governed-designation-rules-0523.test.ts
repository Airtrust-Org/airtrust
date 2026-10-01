import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { execSql, querySql } from '../helpers/sqlite-batch-runner';

const ROOT = join(__dirname, '../../../..');
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');
const base0491 = read('worker-airtrust/migrations/0491_training_compliance_requirements.sql');
const aircraft0497 = read('worker-airtrust/migrations/0497_training_compliance_aircraft_scope.sql');
const conditions0517 = read('worker-airtrust/migrations/0517_training_compliance_conditions.sql');
const overrides0521 = read('worker-airtrust/migrations/0521_training_compliance_designation_overrides.sql');
const migrationPath = 'worker-airtrust/migrations/0523_training_compliance_governed_designation_rules.sql';
const changePath = 'worker-airtrust/schema-v2/changes/0523_training_compliance_governed_designation_rules.sql';
const planPath = 'worker-airtrust/schema-v2/plans/training-compliance-governed-designation-rules-0523.md';
const manifestPath = 'worker-airtrust/schema-v2/training-compliance-governed-designation-rules-0523.json';
const migration = read(migrationPath);
const tempDirs: string[] = [];
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

afterEach(() => {
  while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

function createDatabase() {
  const dir = mkdtempSync(join(tmpdir(), 'airtrust-training-governed-0523-'));
  tempDirs.push(dir);
  const db = join(dir, 'test.sqlite');
  const setup = execSql(db, `
    PRAGMA foreign_keys=ON;
    CREATE TABLE empresas (id INTEGER PRIMARY KEY);
    CREATE TABLE qualificacoes_tipos (
      id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, codigo TEXT,
      ativo INTEGER DEFAULT 1, deleted_at TEXT
    );
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
    INSERT INTO qualificacoes_tipos VALUES
      (187,6,'CRM_CORP',1,NULL),(520,6,'CRM_DIR_RBAC119',1,NULL),(700,7,'CRM_CORP',1,NULL);
    INSERT INTO setores VALUES (10,6),(20,7);
    INSERT INTO funcoes VALUES (1,6),(2,7);
    INSERT INTO funcionarios VALUES (1000,6,NULL),(2000,7,NULL);
  `);
  expect(setup.code, setup.stderr).toBe(0);
  for (const sql of [base0491, aircraft0497, conditions0517, overrides0521]) {
    const applied = execSql(db, sql);
    expect(applied.code, applied.stderr).toBe(0);
  }
  const drift = execSql(db, `
    UPDATE treinamento_requisitos
       SET ativo=0, deleted_at='2026-09-30 23:43:00'
     WHERE empresa_id=6
       AND qualificacao_tipo_id=187
       AND condicao_id IN (
         SELECT id FROM compliance_condicoes
          WHERE empresa_id=6 AND codigo IN (
            'RBAC119_GESTOR_RESPONSAVEL','RBAC119_GERENTE_OPERACOES',
            'RBAC119_PILOTO_CHEFE','RBAC119_GERENTE_SEGURANCA_OPERACIONAL'
          )
       );
    INSERT INTO funcionarios_compliance_condicoes
      (empresa_id,funcionario_id,condicao_id,origem,justificativa)
    SELECT 6,1000,id,'EMPRESA','Designação explícita de teste'
      FROM compliance_condicoes
     WHERE empresa_id=6 AND codigo='RBAC119_GERENTE_OPERACOES';
  `);
  expect(drift.code, drift.stderr).toBe(0);
  return db;
}

describe('0523 governed training compliance designation rules', () => {
  it('pins Schema V2 change, migration and plan hashes', () => {
    const change = read(changePath);
    const plan = read(planPath);
    const manifest = JSON.parse(read(manifestPath)) as Record<string, string>;
    expect(change).toBe(migration);
    expect(manifest).toMatchObject({
      changeId: 'training-compliance-governed-designation-rules-0523',
      baselineId: 'production-d1-baseline-v2-20260714',
      filePath: changePath,
      planPath,
    });
    expect(manifest.fileHash).toBe(sha256(change));
    expect(manifest.planHash).toBe(sha256(plan));
  });

  it('restores all five Corporate exclusions and preserves explicit employee assignments', () => {
    const db = createDatabase();
    expect(
      querySql<{ total: number }>(db, `SELECT COUNT(*) total FROM treinamento_requisitos WHERE empresa_id=6 AND qualificacao_tipo_id=187 AND obrigatoriedade='NAO_APLICA' AND ativo=1 AND deleted_at IS NULL;`)[0].total,
    ).toBe(1);
    const assignmentsBefore = querySql<{ total: number }>(
      db,
      'SELECT COUNT(*) total FROM funcionarios_compliance_condicoes WHERE empresa_id=6 AND ativo=1 AND deleted_at IS NULL;',
    )[0].total;
    expect(assignmentsBefore).toBe(1);

    const applied = execSql(db, migration);
    expect(applied.code, applied.stderr).toBe(0);
    expect(
      querySql<{ total: number }>(db, `SELECT COUNT(*) total FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id JOIN compliance_condicoes cc ON cc.id=tr.condicao_id WHERE tr.empresa_id=6 AND qt.codigo='CRM_CORP' AND cc.codigo LIKE 'RBAC119_%' AND tr.obrigatoriedade='NAO_APLICA' AND tr.origem='REGULATORIO' AND tr.fundamento_tipo='PADRAO_EXCLUSAO' AND tr.ativo=1 AND tr.deleted_at IS NULL;`)[0].total,
    ).toBe(5);
    expect(
      querySql<{ total: number }>(db, `SELECT COUNT(*) total FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id JOIN compliance_condicoes cc ON cc.id=tr.condicao_id WHERE tr.empresa_id=6 AND qt.codigo='CRM_DIR_RBAC119' AND cc.codigo LIKE 'RBAC119_%' AND tr.origem='REGULATORIO' AND tr.fundamento_tipo='DESIGNACAO' AND tr.ativo=1 AND tr.deleted_at IS NULL;`)[0].total,
    ).toBe(5);
    expect(
      querySql<{ total: number }>(db, 'SELECT COUNT(*) total FROM funcionarios_compliance_condicoes WHERE empresa_id=6 AND ativo=1 AND deleted_at IS NULL;')[0].total,
    ).toBe(assignmentsBefore);
  });

  it('is idempotent', () => {
    const db = createDatabase();
    expect(execSql(db, migration).code).toBe(0);
    expect(execSql(db, migration).code).toBe(0);
    expect(
      querySql<{ total: number }>(db, `SELECT COUNT(*) total FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id JOIN compliance_condicoes cc ON cc.id=tr.condicao_id WHERE tr.empresa_id=6 AND qt.codigo='CRM_CORP' AND cc.codigo LIKE 'RBAC119_%' AND tr.ativo=1 AND tr.deleted_at IS NULL;`)[0].total,
    ).toBe(5);
  });

  it('is wired through governed staging and production paths', () => {
    expect(read('scripts/staging/apply-approved-migrations.sh')).toContain('0523_training_compliance_governed_designation_rules.sql');
    const recovery = read('scripts/staging/apply-approved-migration-with-recovery-point.sh');
    expect(recovery).toContain('0523_training_compliance_governed_designation_rules.sql');
    expect(recovery).toContain('validate-0523-preflight.sh');
    expect(recovery).toContain('validate-0523-postconditions.sh');
    const workflow = read('.github/workflows/apply-schema-change-v2.yml');
    expect(workflow).toContain("inputs.change_id == 'training-compliance-governed-designation-rules-0523'");
    expect(read('.github/workflows/staging-d1-schema-change.yml')).toContain('0523_training_compliance_governed_designation_rules.sql');
    for (const file of [
      'scripts/schema-v2/validate-0523-production-preflight.sh',
      'scripts/schema-v2/validate-0523-production-postconditions.sh',
      'scripts/staging/validate-0523-preflight.sh',
      'scripts/staging/validate-0523-postconditions.sh',
    ]) expect(spawnSync('bash', ['-n', file], { cwd: ROOT }).status).toBe(0);
  });
});

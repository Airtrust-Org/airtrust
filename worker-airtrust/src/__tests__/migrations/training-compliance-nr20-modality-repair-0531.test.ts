import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { execSql, querySql } from '../helpers/sqlite-batch-runner';

const ROOT = join(__dirname, '../../../..');
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');
const migrationPath = 'worker-airtrust/migrations/0531_training_compliance_nr20_modality_repair.sql';
const changePath = 'worker-airtrust/schema-v2/changes/0531_training_compliance_nr20_modality_repair.sql';
const planPath = 'worker-airtrust/schema-v2/plans/training-compliance-nr20-modality-repair-0531.md';
const manifestPath = 'worker-airtrust/schema-v2/training-compliance-nr20-modality-repair-0531.json';
const productionWorkflowPath = '.github/workflows/apply-schema-change-v2.yml';
const productionPreflightPath = 'scripts/schema-v2/validate-0531-production-preflight.sh';
const productionPostconditionsPath = 'scripts/schema-v2/validate-0531-production-postconditions.sh';
const stagingWorkflowPath = '.github/workflows/staging-d1-schema-change.yml';
const stagingExecutorPath = 'scripts/staging/apply-approved-migration-with-recovery-point.sh';
const stagingPreflightPath = 'scripts/staging/validate-0531-preflight.sh';
const stagingPostconditionsPath = 'scripts/staging/validate-0531-postconditions.sh';
const migration = read(migrationPath);
const tempDirs: string[] = [];
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

afterEach(() => {
  while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

function createDatabase() {
  const dir = mkdtempSync(join(tmpdir(), 'airtrust-nr20-0531-'));
  tempDirs.push(dir);
  const db = join(dir, 'test.sqlite');
  expect(execSql(db, `
    CREATE TABLE qualificacoes_tipos (
      id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, codigo TEXT NOT NULL,
      ativo INTEGER NOT NULL DEFAULT 1, deleted_at TEXT
    );
    CREATE TABLE funcoes (
      id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, nome TEXT NOT NULL,
      ativo INTEGER NOT NULL DEFAULT 1, deleted_at TEXT
    );
    CREATE TABLE treinamento_requisitos (
      id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, qualificacao_tipo_id INTEGER NOT NULL,
      escopo TEXT NOT NULL, funcao_id INTEGER, modalidade_requerida TEXT,
      ativo INTEGER NOT NULL DEFAULT 1, updated_at TEXT, deleted_at TEXT
    );

    INSERT INTO qualificacoes_tipos(id,empresa_id,codigo,ativo,deleted_at) VALUES
      (20,6,'NR-20',1,NULL),(70,7,'NR-20',1,NULL);
    INSERT INTO funcoes(id,empresa_id,nome,ativo,deleted_at) VALUES
      (5,6,'Mecânico',1,NULL),
      (38,6,'Auxiliar de Manutenção',1,NULL),
      (34,6,'Auxiliar de Suprimentos',1,NULL),
      (36,6,'Supervisor de Suprimentos',1,NULL),
      (40,6,'Gerente de Manutenção',1,NULL),
      (75,7,'Mecânico',1,NULL);
    INSERT INTO treinamento_requisitos(
      id,empresa_id,qualificacao_tipo_id,escopo,funcao_id,modalidade_requerida,ativo,updated_at,deleted_at
    ) VALUES
      (423,6,20,'FUNCAO',5,NULL,1,'before',NULL),
      (424,6,20,'FUNCAO',38,NULL,1,'before',NULL),
      (425,6,20,'FUNCAO',34,NULL,1,'before',NULL),
      (426,6,20,'FUNCAO',36,NULL,1,'before',NULL),
      (427,6,20,'FUNCAO',40,NULL,1,'before',NULL),
      (701,7,70,'FUNCAO',75,NULL,1,'before',NULL);
  `).code).toBe(0);
  return db;
}

describe('0531 training compliance NR-20 modality repair', () => {
  it('pins reviewed manifest hashes and mirrors the canonical migration', () => {
    const change = read(changePath);
    const plan = read(planPath);
    const manifest = JSON.parse(read(manifestPath)) as Record<string, string>;
    expect(change).toBe(migration);
    expect(manifest).toMatchObject({
      changeId: 'training-compliance-nr20-modality-repair-0531',
      baselineId: 'production-d1-baseline-v2-20260714',
      filePath: changePath,
      planPath,
    });
    expect(manifest.fileHash).toBe(sha256(change));
    expect(manifest.planHash).toBe(sha256(plan));
  });

  it('wires specialized fail-closed validation into production and staging', () => {
    const productionWorkflow = read(productionWorkflowPath);
    const stagingWorkflow = read(stagingWorkflowPath);
    const stagingExecutor = read(stagingExecutorPath);
    const productionPreflight = read(productionPreflightPath);
    const productionPostconditions = read(productionPostconditionsPath);
    const stagingPreflight = read(stagingPreflightPath);
    const stagingPostconditions = read(stagingPostconditionsPath);

    expect(productionWorkflow).toContain("inputs.change_id == 'training-compliance-nr20-modality-repair-0531'");
    expect(productionWorkflow).toContain('bash scripts/schema-v2/validate-0531-production-preflight.sh --target=airtrust-db');
    expect(productionWorkflow).toContain('bash scripts/schema-v2/validate-0531-production-postconditions.sh --target=airtrust-db');
    expect(productionPreflight).toContain('target-nonhybrid 4');
    expect(productionPreflight).toContain('dependency-0526 1');
    expect(productionPostconditions).toContain('target-nonhybrid 0');
    expect(productionPostconditions).toContain('validate-0526-production-postconditions.sh');

    for (const value of [stagingWorkflow, stagingExecutor]) {
      expect(value).toContain('0531_training_compliance_nr20_modality_repair.sql');
    }
    expect(stagingPreflight).toContain('target-nonhybrid 0');
    expect(stagingPostconditions).toContain('validate-0526-postconditions.sh');
  });

  it('updates only the reviewed tenant-6 target requirements, preserves ids and is idempotent', () => {
    const db = createDatabase();
    expect(execSql(db, migration).code).toBe(0);
    expect(execSql(db, migration).code).toBe(0);

    const targetRows = querySql<{ id:number; modalidade_requerida:string }>(db, `
      SELECT tr.id,tr.modalidade_requerida
        FROM treinamento_requisitos tr
        JOIN funcoes f ON f.id=tr.funcao_id AND f.empresa_id=tr.empresa_id
       WHERE tr.empresa_id=6 AND tr.qualificacao_tipo_id=20
         AND f.nome IN ('Mecânico','Auxiliar de Manutenção','Auxiliar de Suprimentos','Supervisor de Suprimentos')
       ORDER BY tr.id;
    `);
    expect(targetRows.map((row) => row.id)).toEqual([423, 424, 425, 426]);
    expect(targetRows.every((row) => row.modalidade_requerida === 'HIBRIDO')).toBe(true);

    expect(querySql<{ modalidade_requerida:string|null }>(db,
      `SELECT modalidade_requerida FROM treinamento_requisitos WHERE id=427;`)[0].modalidade_requerida).toBeNull();
    expect(querySql<{ modalidade_requerida:string|null }>(db,
      `SELECT modalidade_requerida FROM treinamento_requisitos WHERE id=701;`)[0].modalidade_requerida).toBeNull();
    expect(querySql<{ total:number }>(db,
      `SELECT COUNT(*) total FROM treinamento_requisitos;`)[0].total).toBe(6);
  });
});

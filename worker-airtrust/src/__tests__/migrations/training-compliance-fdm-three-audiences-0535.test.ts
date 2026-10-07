import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(process.cwd(), '..');
const migrationPath = 'worker-airtrust/migrations/0535_training_compliance_fdm_three_audiences.sql';
const changePath = 'worker-airtrust/schema-v2/changes/0535_training_compliance_fdm_three_audiences.sql';
const planPath = 'worker-airtrust/schema-v2/plans/training-compliance-fdm-three-audiences-0535.md';
const manifestPath = 'worker-airtrust/schema-v2/training-compliance-fdm-three-audiences-0535.json';
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

describe('training compliance FDM three audiences 0535', () => {
  it('binds exact reviewed SQL and plan to the canonical Schema V2 manifest', () => {
    const sql = read(changePath);
    const plan = read(planPath);
    const manifest = JSON.parse(read(manifestPath)) as Record<string, string>;
    expect(read(migrationPath)).toBe(sql);
    expect(manifest).toMatchObject({
      changeId: 'training-compliance-fdm-three-audiences-0535',
      baselineId: 'production-d1-baseline-v2-20260714',
      filePath: changePath,
      fileHash: sha256(sql),
      planPath,
      planHash: sha256(plan),
    });
  });

  it('introduces exactly two new training models without inventing delivery or validity', () => {
    const sql = read(changePath);
    expect(sql).toContain("'FDM-TRIPULACAO','Treinamento de FDM - Tripulação'");
    expect(sql).toContain("'FDM-COMITE-GATEKEEPER','Treinamento de FDM - Comitê e Gatekeeper'");
    expect(sql).toContain("UPPER(TRIM(qc.codigo))='TREINAMENTO_OPERACIONAL'");
    expect(sql.split('qc.nome,qc.id,NULL,NULL,').length - 1).toBe(2);
    expect(sql).not.toContain('INSERT INTO lms_cursos');
    expect(sql).not.toContain('INSERT INTO lms_matriculas');
    expect(sql).not.toContain('INSERT INTO qualificacoes_historico');
  });

  it('preserves FDM mechanic identity and historical models', () => {
    const sql = read(changePath);
    expect(sql).toContain("SET nome='Treinamento de FDM - MNT'");
    expect(sql).toContain("UPPER(TRIM(codigo))='FDM-MECANICO'");
    expect(sql).not.toContain("SET codigo='FDM-MNT'");
    expect(sql).not.toContain('DELETE FROM qualificacoes_tipos');
    expect(sql).not.toContain('UPDATE qualificacoes_historico');
    expect(sql).not.toContain('UPDATE lms_cursos');
    expect(sql).not.toContain('UPDATE funcionarios_compliance_condicoes');
  });

  it('requires pilot and committee jobs without granting formal committee membership', () => {
    const sql = read(changePath);
    expect(sql).toContain("'COMANDANTE','COPILOTO'");
    for (const role of [
      'GERENTE DE SEGURANÇA OPERACIONAL',
      'GERENTE DE MANUTENÇÃO',
      'GERENTE DE OPERAÇÕES',
      'ANALISTA DE FDM',
      'COORDENADOR DE FDM',
      'COORDENADOR DE ENGENHARIA',
    ]) expect(sql).toContain(role);
    expect(sql).toContain("cc.codigo IN ('FDM_COMITE','GATEKEEPER')");
    expect(sql).toContain("'DESIGNACAO'");
    expect(sql).not.toContain('INSERT INTO funcionarios_compliance_condicoes');
    expect(sql).not.toContain('INSERT INTO compliance_condicoes');
  });

  it('enforces 0534 postconditions and both formal designation catalogs before any apply', () => {
    const staging = read('scripts/staging/validate-0535-preflight.sh');
    const prod = read('scripts/schema-v2/validate-0535-production-preflight.sh');
    for (const script of [staging, prod]) {
      expect(script).toContain('validate-0534-');
      expect(script).toContain('FDM_COMITE');
      expect(script).toContain('GATEKEEPER');
      expect(script).toContain('TREINAMENTO_OPERACIONAL');
      expect(script).toContain('FDM-MECANICO');
      expect(script).toContain('fdm-new-models-absent');
    }
  });

  it('wires the governed staging and production 0535 release path with scoped postconditions', () => {
    const runner = read('scripts/staging/apply-approved-migration-with-recovery-point.sh');
    const stagingWorkflow = read('.github/workflows/staging-d1-schema-change.yml');
    const productionWorkflow = read('.github/workflows/apply-schema-change-v2.yml');
    expect(runner).toContain('0535_training_compliance_fdm_three_audiences.sql');
    expect(runner).toContain('validate-0535-preflight.sh');
    expect(runner).toContain('validate-0535-postconditions.sh');
    expect(stagingWorkflow).toContain('0535_training_compliance_fdm_three_audiences.sql');
    expect(productionWorkflow).toContain('training-compliance-fdm-three-audiences-0535');
    expect(productionWorkflow).toContain('validate-0535-production-preflight.sh');
    expect(productionWorkflow).toContain('validate-0535-production-postconditions.sh');
    for (const validator of [
      'scripts/staging/validate-0535-postconditions.sh',
      'scripts/schema-v2/validate-0535-production-postconditions.sh',
    ]) {
      const script = read(validator);
      expect(script).toContain('two-formal-condition-rules');
      expect(script).toContain('pilot-function-rules');
      expect(script).toContain('comite-function-rules');
      expect(script).toContain('canonically-categorized-unspecified-models');
      expect(script).not.toContain('SELECT *');
    }
  });
});

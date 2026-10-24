import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(process.cwd(), '..');
const migrationPath = 'worker-airtrust/migrations/0535_training_compliance_integra_bootstrap.sql';
const changePath = 'worker-airtrust/schema-v2/changes/0535_training_compliance_integra_bootstrap.sql';
const planPath = 'worker-airtrust/schema-v2/plans/training-compliance-integra-bootstrap-0535.md';
const manifestPath = 'worker-airtrust/schema-v2/training-compliance-integra-bootstrap-0535.json';
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

describe('training compliance INTEGRA bootstrap 0535', () => {
  it('keeps migration/change immutable and manifest hashes exact', () => {
    const migration = read(migrationPath);
    const change = read(changePath);
    const plan = read(planPath);
    const manifest = JSON.parse(read(manifestPath)) as Record<string, string>;
    expect(change).toBe(migration);
    expect(manifest).toMatchObject({
      changeId: 'training-compliance-integra-bootstrap-0535',
      baselineId: 'production-d1-baseline-v2-20260714',
      filePath: changePath,
      fileHash: hash(change),
      planPath,
      planHash: hash(plan),
    });
  });

  it('creates or normalizes one canonical INTEGRA without touching evidence or LMS', () => {
    const sql = read(changePath);
    expect(sql).toContain("UPPER(TRIM(codigo))='INTEGRA'");
    expect(sql).toContain("'INTEGRA','Integração Corporativa'");
    expect(sql).toContain("UPPER(TRIM(codigo))='EAD'");
    expect(sql).toContain("validade=24");
    expect(sql).toContain("carga_horaria=2");
    expect(sql).toContain("carga_horaria_inicial=2");
    expect(sql).toContain("carga_horaria_recorrente=2");
    expect(sql).not.toContain('UPDATE qualificacoes_historico');
    expect(sql).not.toContain('INSERT INTO qualificacoes_historico');
    expect(sql).not.toContain('INSERT INTO lms_cursos');
    expect(sql).not.toContain('INSERT INTO lms_matriculas');
  });

  it('restores the company-wide final-matrix requirement only when absent', () => {
    const sql = read(changePath);
    expect(sql).toContain("'EMPRESA','OBRIGATORIA'");
    expect(sql).toContain('Matriz final QSMS/Segurança Operacional 2026-10-06');
    expect(sql).toContain('NOT EXISTS');
    expect(sql).not.toContain('funcionario_id');
    expect(sql).not.toContain('INSERT INTO funcionarios_compliance_condicoes');
  });

  it('requires applied 0534 and validates the full strict 0534 state after repair', () => {
    const stagingPre = read('scripts/staging/validate-0535-preflight.sh');
    const stagingPost = read('scripts/staging/validate-0535-postconditions.sh');
    const prodPre = read('scripts/schema-v2/validate-0535-production-preflight.sh');
    const prodPost = read('scripts/schema-v2/validate-0535-production-postconditions.sh');
    expect(stagingPre).toContain("0534_training_compliance_final_matrix.sql");
    expect(prodPre).toContain("training-compliance-final-matrix-0534");
    expect(stagingPost).toContain('validate-0534-postconditions.sh');
    expect(prodPost).toContain('validate-0534-production-postconditions.sh');
    for (const script of [stagingPre, stagingPost, prodPre, prodPost]) {
      expect(script).toContain('INTEGRA');
      expect(script).toContain('empresa_id=6');
      expect(script).not.toContain('SELECT *');
    }
  });

  it('wires 0535 through governed staging and production workflows', () => {
    const staging = read('.github/workflows/staging-d1-schema-change.yml');
    const runner = read('scripts/staging/apply-approved-migration-with-recovery-point.sh');
    const production = read('.github/workflows/apply-schema-change-v2.yml');
    expect(staging).toContain('0535_training_compliance_integra_bootstrap.sql');
    expect(runner).toContain('validate-0535-preflight.sh');
    expect(runner).toContain('validate-0535-postconditions.sh');
    expect(production).toContain('training-compliance-integra-bootstrap-0535');
    expect(production).toContain('validate-0535-production-preflight.sh');
    expect(production).toContain('validate-0535-production-postconditions.sh');
  });
});

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(process.cwd(), '..');
const migrationPath = 'worker-airtrust/migrations/0537_training_compliance_manager_designation_nr05.sql';
const changePath = 'worker-airtrust/schema-v2/changes/0537_training_compliance_manager_designation_nr05.sql';
const planPath = 'worker-airtrust/schema-v2/plans/training-compliance-manager-designation-nr05-0537.md';
const manifestPath = 'worker-airtrust/schema-v2/training-compliance-manager-designation-nr05-0537.json';
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

describe('training compliance Gestor designation + NR-05 0537', () => {
  it('keeps migration/change immutable and manifest hashes exact', () => {
    const migration = read(migrationPath);
    const change = read(changePath);
    const plan = read(planPath);
    const manifest = JSON.parse(read(manifestPath)) as Record<string, string>;
    expect(change).toBe(migration);
    expect(manifest).toMatchObject({
      changeId: 'training-compliance-manager-designation-nr05-0537',
      baselineId: 'production-d1-baseline-v2-20260714',
      filePath: changePath,
      fileHash: hash(change),
      planPath,
      planHash: hash(plan),
    });
  });

  it('uses the generic GESTOR designation rather than job-title inference', () => {
    const sql = read(changePath);
    expect(sql).toContain("'GESTOR','Gestor','DESIGNACAO'");
    expect(sql).toContain("qt.codigo IN ('PPSP_SUP','BOWTIEXP')");
    expect(sql).toContain("cc.codigo='GESTOR'");
    expect(sql).toContain("'MODELO',1,1");
    expect(sql).not.toContain('INSERT INTO funcionarios_compliance_condicoes');
    expect(sql).not.toContain("LIKE 'GERENTE %'");
    expect(sql).not.toContain('Gestor de Treinamento');
  });

  it('makes NR-05 EAD, 24 months, 2 hours and company-wide', () => {
    const sql = read(changePath);
    expect(sql).toContain("categoria='EAD'");
    expect(sql).toContain('validade=24');
    expect(sql).toContain('carga_horaria=2');
    expect(sql).toContain("'CLIENTE'");
    expect(sql).toContain('Requisito Petrobras');
  });

  it('does not write enrollments or completion evidence from schema', () => {
    const sql = read(changePath);
    expect(sql).not.toMatch(/(?:INSERT|DELETE)\s+(?:INTO\s+|FROM\s+)?lms_matriculas/i);
    expect(sql).not.toMatch(/(?:INSERT|UPDATE|DELETE)\s+(?:INTO\s+|FROM\s+)?qualificacoes_historico/i);
    expect(sql).not.toMatch(/(?:INSERT|UPDATE|DELETE)\s+(?:INTO\s+|FROM\s+)?certificados/i);
  });
});

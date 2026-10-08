import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(process.cwd(), '..');
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');
const hash = (data: string) => createHash('sha256').update(data).digest('hex');
const sqlPath = 'worker-airtrust/migrations/0541_training_operational_category_bootstrap.sql';
const changePath = 'worker-airtrust/schema-v2/changes/0541_training_operational_category_bootstrap.sql';
const planPath = 'worker-airtrust/schema-v2/plans/training-operational-category-bootstrap-0541.md';
const manifestPath = 'worker-airtrust/schema-v2/training-operational-category-bootstrap-0541.json';

describe('Schema V2 0541 operational training category prerequisite', () => {
  it('pins the immutable SQL and reviewed recovery plan', () => {
    const sql = read(sqlPath);
    const plan = read(planPath);
    const manifest = JSON.parse(read(manifestPath));
    expect(read(changePath)).toBe(sql);
    expect(manifest.changeId).toBe('training-operational-category-bootstrap-0541');
    expect(manifest.baselineId).toBe('production-d1-baseline-v2-20260714');
    expect(manifest.filePath).toBe(changePath);
    expect(manifest.fileHash).toBe(hash(sql));
    expect(manifest.planPath).toBe(planPath);
    expect(manifest.planHash).toBe(hash(plan));
  });

  it('creates only the missing same-tenant reference identity, without employee writes', () => {
    const sql = read(sqlPath);
    expect(sql).toContain('INSERT INTO qualificacoes_categorias');
    expect(sql).toContain("SELECT 6,'Treinamentos Operacionais','TREINAMENTO_OPERACIONAL'");
    expect(sql).toContain("WHERE empresa_id=6");
    expect(sql).toContain("UPPER(TRIM(codigo))='TREINAMENTO_OPERACIONAL'");
    expect(sql).toContain("UPPER(TRIM(nome))='TREINAMENTOS OPERACIONAIS'");
    expect(sql).toContain('NOT EXISTS');
    for (const unsafe of ['INSERT INTO lms_', 'UPDATE funcionarios', 'qualificacoes_historico SET', 'DELETE FROM', 'UPDATE treinamento_requisitos']) {
      expect(sql).not.toContain(unsafe);
    }
  });

  it('enforces distinct staging and production preflight and postconditions', () => {
    const production = read('scripts/schema-v2/validate-0541-production-preflight.sh');
    const staging = read('scripts/staging/validate-0541-preflight.sh');
    expect(production).toContain("change_id='training-compliance-integra-bootstrap-0535'");
    expect(production).toContain('category-identity-absent 0');
    expect(production).toContain('unapplied-0536 0');
    expect(staging).toContain('applied-0536 1');
    expect(staging).toContain('category-canonical 1');
    for (const path of [
      'scripts/schema-v2/validate-0541-production-postconditions.sh',
      'scripts/staging/validate-0541-postconditions.sh',
    ]) {
      const post = read(path);
      expect(post).toContain('category-canonical 1');
      expect(post).toContain('category-identity-total 1');
    }
  });

  it('wires the unchanged Schema V2 release guards', () => {
    const staging = read('.github/workflows/staging-d1-schema-change.yml');
    const runner = read('scripts/staging/apply-approved-migration-with-recovery-point.sh');
    const production = read('.github/workflows/apply-schema-change-v2.yml');
    expect(staging).toContain('0541_training_operational_category_bootstrap.sql');
    expect(runner).toContain('validate-0541-preflight.sh');
    expect(runner).toContain('validate-0541-postconditions.sh');
    expect(production).toContain('training-operational-category-bootstrap-0541');
    expect(production).toContain('validate-0541-production-preflight.sh');
    expect(production).toContain('validate-0541-production-postconditions.sh');
  });
});

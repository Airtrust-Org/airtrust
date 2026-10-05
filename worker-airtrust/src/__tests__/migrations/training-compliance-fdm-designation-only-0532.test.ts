import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(process.cwd(), '..');
const migrationPath =
  'worker-airtrust/migrations/0532_training_compliance_fdm_designation_only.sql';
const changePath =
  'worker-airtrust/schema-v2/changes/0532_training_compliance_fdm_designation_only.sql';
const planPath = 'worker-airtrust/schema-v2/plans/training-compliance-fdm-designation-only-0532.md';
const manifestPath = 'worker-airtrust/schema-v2/training-compliance-fdm-designation-only-0532.json';
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

describe('training compliance FDM designation-only 0532', () => {
  it('keeps canonical migration and reviewed Schema V2 change identical and hashed', () => {
    const migration = read(migrationPath);
    const change = read(changePath);
    const plan = read(planPath);
    const manifest = JSON.parse(read(manifestPath)) as Record<string, string>;

    expect(change).toBe(migration);
    expect(manifest).toMatchObject({
      changeId: 'training-compliance-fdm-designation-only-0532',
      baselineId: 'production-d1-baseline-v2-20260714',
      filePath: changePath,
      planPath,
      fileHash: hash(change),
      planHash: hash(plan),
    });
  });

  it('deactivates broad FDM rules and preserves only FDM_EQUIPE designation', () => {
    const sql = read(changePath);
    expect(sql).toContain("UPPER(codigo)='FDM-EAD'");
    expect(sql).toContain("UPPER(codigo)='FDM_EQUIPE'");
    expect(sql).toContain('condicao_id IS NULL');
    expect(sql).toContain("'DESIGNACAO','MNL-SSO-002'");
    expect(sql).toContain(
      "'Aplicável somente a integrante formalmente designado para a equipe FDM/HFDM.'",
    );
  });

  it('does not mutate LMS enrollments or completion evidence', () => {
    const sql = read(changePath);
    expect(sql).not.toMatch(/(?:INSERT|UPDATE|DELETE)\s+(?:INTO\s+|FROM\s+)?lms_matriculas/i);
    expect(sql).not.toMatch(
      /(?:INSERT|UPDATE|DELETE)\s+(?:INTO\s+|FROM\s+)?qualificacoes_historico/i,
    );
    expect(sql).not.toContain('auto_matricular_ead,1');
  });

  it('ships governed preflight and postcondition validators', () => {
    const prodPre = read('scripts/schema-v2/validate-0532-production-preflight.sh');
    const prodPost = read('scripts/schema-v2/validate-0532-production-postconditions.sh');
    const stagingPre = read('scripts/staging/validate-0532-preflight.sh');
    const stagingPost = read('scripts/staging/validate-0532-postconditions.sh');
    for (const source of [prodPre, prodPost, stagingPre, stagingPost]) {
      expect(source).toContain('FDM_EQUIPE');
      expect(source).toContain('FDM-EAD');
    }
    expect(prodPost).toContain('fdm-unconditioned-or-other-active');
    expect(stagingPost).toContain('fdm-unconditioned-or-other-active');
  });
});

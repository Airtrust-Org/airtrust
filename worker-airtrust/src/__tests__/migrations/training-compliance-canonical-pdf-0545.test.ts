import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(process.cwd(), '..');
const read = (file: string) => readFileSync(join(root, file), 'utf8');
const sqlPath = 'worker-airtrust/schema-v2/changes/0545_training_compliance_canonical_pdf_alignment.sql';
const planPath = 'worker-airtrust/schema-v2/plans/training-compliance-canonical-pdf-alignment-0545.md';
const manifestPath = 'worker-airtrust/schema-v2/training-compliance-canonical-pdf-alignment-0545.json';

describe('canonical QSMS/Safety Compliance PDF 0545', () => {
  it('pins a tenant-scoped reviewed Schema V2 SQL bundle and plan hashes', () => {
    const manifest = JSON.parse(read(manifestPath));
    const sha = (text: string) => createHash('sha256').update(text).digest('hex');
    expect(manifest.changeId).toBe('training-compliance-canonical-pdf-alignment-0545');
    expect(manifest.baselineId).toBe('production-d1-baseline-v2-20260714');
    expect(manifest.filePath).toBe(sqlPath);
    expect(manifest.fileHash).toBe(sha(read(sqlPath)));
    expect(manifest.planPath).toBe(planPath);
    expect(manifest.planHash).toBe(sha(read(planPath)));
    expect(read('worker-airtrust/migrations/0545_training_compliance_canonical_pdf_alignment.sql')).toBe(read(sqlPath));
  });

  it('applies the canonical 68 job links and keeps designation, history and other tenants unchanged', () => {
    const result = spawnSync('python3', [join(root, 'scripts/compliance/validate-0545-sqlite.py')], { encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('TRAINING_COMPLIANCE_0545_SQLITE_PASS');
  });

  it('restricts schema writes and enforces both workflow validators', () => {
    const sql = read(sqlPath).toUpperCase();
    expect(sql).toContain("EMPRESA_ID=6");
    expect(sql).toContain("MEMBRO_CIPA");
    expect(sql).not.toMatch(/(?:DELETE FROM|DROP TABLE|UPDATE\s+FUNCIONARIOS|UPDATE\s+LMS_|UPDATE\s+QUALIFICACOES_HISTORICO|INSERT INTO\s+LMS_)/);
    const prod = read('.github/workflows/apply-schema-change-v2.yml');
    expect(prod).toContain('Preflight Training Compliance canonical PDF 0545');
    expect(prod).toContain('Post-validate Training Compliance canonical PDF 0545');
    expect(read('scripts/schema-v2/validate-0545-production-preflight.sh')).toContain('nr05-universal');
    expect(read('scripts/schema-v2/validate-0545-production-postconditions.sh')).toContain('nr05-designated');
    expect(read('.github/workflows/staging-d1-schema-change.yml')).toContain('0545_training_compliance_canonical_pdf_alignment.sql');
    expect(read('scripts/staging/apply-approved-migration-with-recovery-point.sh')).toContain('SPECIALIZED_PREFLIGHT_0545');
  });
});

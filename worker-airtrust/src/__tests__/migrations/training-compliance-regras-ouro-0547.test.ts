import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(process.cwd(), '..');
const sqlPath = 'worker-airtrust/schema-v2/changes/0547_training_compliance_regras_ouro_corporate.sql';
const planPath = 'worker-airtrust/schema-v2/plans/training-compliance-regras-ouro-corporate-0547.md';
const manifestPath = 'worker-airtrust/schema-v2/training-compliance-regras-ouro-corporate-0547.json';
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const hash = (text: string) => createHash('sha256').update(text).digest('hex');

describe('corporate Regras de Ouro 0547', () => {
  it('pins exact source and safety plan hashes', () => {
    const manifest = JSON.parse(read(manifestPath)) as Record<string, string>;
    expect(manifest).toMatchObject({
      changeId: 'training-compliance-regras-ouro-corporate-0547',
      baselineId: 'production-d1-baseline-v2-20260714',
      filePath: sqlPath,
      planPath,
      fileHash: hash(read(sqlPath)),
      planHash: hash(read(planPath)),
    });
  });

  it('reinstates one universal mandatory rule without rewriting history or enrollment', () => {
    const sql = read(sqlPath);
    expect(sql).toContain("'EMPRESA','OBRIGATORIA'");
    expect(sql).toContain("qt.codigo='REGRAS_OURO_PETROBRAS'");
    expect(sql).toContain("'MODELO',1,1");
    expect(sql).not.toMatch(/\b(?:UPDATE|DELETE|INSERT INTO)\s+(?:lms_matriculas|qualificacoes_historico|lms_progresso_scorm)\b/i);
    expect(sql).toContain('NOT EXISTS');
  });

  it('requires official Schema V2 preflight and postconditions', () => {
    const workflow = read('.github/workflows/apply-schema-change-v2.yml');
    expect(workflow).toContain("inputs.change_id == 'training-compliance-regras-ouro-corporate-0547'");
    expect(workflow).toContain('validate-0547-production-preflight.sh');
    expect(workflow).toContain('validate-0547-production-postconditions.sh');
    const pre = read('scripts/schema-v2/validate-0547-production-preflight.sh');
    const post = read('scripts/schema-v2/validate-0547-production-postconditions.sh');
    expect(pre).toContain('training-compliance-canonical-category-repair-0546');
    expect(pre).toContain('assert_count inactive-obligation 0');
    expect(post).toContain('assert_count mandatory-all-roles 1');
  });
});

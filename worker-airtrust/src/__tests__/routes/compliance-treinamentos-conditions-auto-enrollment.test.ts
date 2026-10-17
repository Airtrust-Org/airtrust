import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/routes/compliance-treinamentos-conditions.ts'), 'utf8');

describe('Compliance designation auto-enrollment contract', () => {
  it('requires an explicit effective auto-enrollment designation rule', () => {
    expect(source).toContain('autoEnrollAssignedConditionRequirements');
    expect(source).toContain('tr_assigned.condicao_id=?');
    expect(source).toContain('COALESCE(tr_assigned.auto_matricular_ead,0)=1');
    expect(source).toContain('requireAutoEnrollment:true');
  });

  it('is tenant-scoped and fails closed when course mapping is not unique', () => {
    expect(source).toContain('f.id=? AND f.empresa_id=?');
    expect(source).toContain('lc.ativo=1 AND lc.publicado=1');
    expect(source).toContain('Number(row.course_count)!==1');
  });

  it('preserves valid evidence and active enrollment before creating a new cycle', () => {
    expect(source).toContain('skipped_valid_evidence');
    expect(source).toContain("date(qh.data_vencimento)>=date('now')");
    expect(source).toContain('hasActiveMatriculaCycle(existing)');
    expect(source).toContain("origin:'AUTO_DESIGNACAO'");
  });
});

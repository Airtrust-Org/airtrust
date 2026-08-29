import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url) as any);
const readRepoFile = (path: string) =>
  readFileSync(new URL(path, `file://${REPO_ROOT}/`) as any, 'utf8');

describe('compliance stats API contract', () => {
  it('keeps aggregate fields numeric when the tenant has no compliance rows', () => {
    const source = readRepoFile('worker-airtrust/src/routes/compliance-recalculate.ts');

    expect(source).toContain(
      "COALESCE(SUM(CASE WHEN status_compliance = 'CONFORME' THEN 1 ELSE 0 END), 0) as conformes",
    );
    expect(source).toContain(
      "COALESCE(SUM(CASE WHEN status_compliance = 'A_VENCER' THEN 1 ELSE 0 END), 0) as a_vencer",
    );
    expect(source).toContain(
      "COALESCE(SUM(CASE WHEN status_compliance = 'VENCIDO' THEN 1 ELSE 0 END), 0) as vencidos",
    );
    expect(source).toContain(
      "COALESCE(SUM(CASE WHEN status_compliance = 'PENDENTE' THEN 1 ELSE 0 END), 0) as pendentes",
    );
    expect(source).toContain(
      'COALESCE(ROUND(AVG(percentual_conformidade), 2), 0) as percentual_medio',
    );
  });
});

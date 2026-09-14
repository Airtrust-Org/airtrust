import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(__dirname, '../MatrizTreinamento.tsx'), 'utf8');

describe('MatrizTreinamento canonical compliance boundary', () => {
  it('edita a matriz canônica e não volta a gravar na API legada por função', () => {
    expect(source).toContain('TrainingComplianceApplicabilityEditor');
    expect(source).toContain('/compliance-treinamentos');
    expect(source).not.toContain('/api/matriz-treinamento/registros');
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(__dirname, '../MatrizTreinamento.tsx'), 'utf8');
const appSource = readFileSync(resolve(__dirname, '../../../App.tsx'), 'utf8');

describe('MatrizTreinamento canonical compliance boundary', () => {
  it('edita a matriz canônica e navega pela rota operacional canônica', () => {
    expect(source).toContain('TrainingComplianceApplicabilityEditor');
    expect(source).toContain('/treinamentos/compliance');
    expect(source).not.toContain('to="/compliance-treinamentos"');
    expect(source).not.toContain('/api/matriz-treinamento/registros');
  });

  it('mantém redirect compatível para a URL antiga já publicada', () => {
    expect(appSource).toContain('path="/treinamentos/compliance"');
    expect(appSource).toContain('path="/compliance-treinamentos"');
    expect(appSource).toContain('to="/treinamentos/compliance" replace');
  });
});

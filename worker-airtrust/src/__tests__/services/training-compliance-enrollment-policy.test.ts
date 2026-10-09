import { describe, expect, it } from 'vitest';
import {
  trainingComplianceNeedsImmediateEnrollmentOnRuleSave,
  trainingComplianceNeedsEnrollment,
} from '../../services/training-compliance-enrollment-policy';

describe('matrícula ao salvar requisitos de Compliance', () => {
  it('matricula somente quem nunca realizou ou tem treinamento vencido', () => {
    expect(trainingComplianceNeedsImmediateEnrollmentOnRuleSave('NAO_REALIZADO')).toBe(true);
    expect(trainingComplianceNeedsImmediateEnrollmentOnRuleSave('VENCIDO')).toBe(true);
    expect(trainingComplianceNeedsImmediateEnrollmentOnRuleSave('CONFORME')).toBe(false);
    expect(trainingComplianceNeedsImmediateEnrollmentOnRuleSave('VENCENDO')).toBe(false);
    expect(trainingComplianceNeedsImmediateEnrollmentOnRuleSave('EM_ANDAMENTO')).toBe(false);
  });

  it('não antecipa renovação ao alterar a matriz', () => {
    expect(trainingComplianceNeedsEnrollment('VENCENDO', 15)).toBe(true);
    expect(trainingComplianceNeedsImmediateEnrollmentOnRuleSave('VENCENDO')).toBe(false);
  });
});

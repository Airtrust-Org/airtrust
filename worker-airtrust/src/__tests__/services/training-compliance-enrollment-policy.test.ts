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

  it('abre o ciclo automático assim que o treinamento entra na janela de 30 dias', () => {
    expect(trainingComplianceNeedsEnrollment('VENCENDO', 30)).toBe(true);
    expect(trainingComplianceNeedsEnrollment('VENCENDO', 15)).toBe(true);
    expect(trainingComplianceNeedsEnrollment('VENCENDO', 0)).toBe(true);
    expect(trainingComplianceNeedsEnrollment('VENCENDO', 31)).toBe(false);
    // Salvar a matriz não duplica ciclo; o roster resiliente faz a reconciliação.
    expect(trainingComplianceNeedsImmediateEnrollmentOnRuleSave('VENCENDO')).toBe(false);
  });
});

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

import { complianceAllowsEadEnrollment } from '../../services/training-compliance-enrollment-policy';
test('only explicit tenant 6 EAD opt-in may have null historical modality',()=>{
  expect(complianceAllowsEadEnrollment(1,null,6)).toBe(true);
  expect(complianceAllowsEadEnrollment(0,null,6)).toBe(false);
  expect(complianceAllowsEadEnrollment(1,'PRESENCIAL',6)).toBe(false);
  expect(complianceAllowsEadEnrollment(1,null,7)).toBe(false);
  expect(complianceAllowsEadEnrollment(1,'EAD',7)).toBe(true);
});

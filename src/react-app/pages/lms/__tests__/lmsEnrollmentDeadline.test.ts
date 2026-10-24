import { describe, expect, it } from 'vitest';
import { shouldShowLmsEnrollmentDeadline } from '../lmsEnrollmentDeadline';

describe('prazo de matrícula LMS versus validade de qualificação', () => {
  const oldDeadline = '2026-06-19';

  it('não marca como vencido um curso concluído por prazo antigo da matrícula (EFB/PBN)', () => {
    expect(shouldShowLmsEnrollmentDeadline('CONCLUIDO', oldDeadline)).toBe(false);
  });

  it('mantém o alerta de prazo para matrícula ainda pendente ou em andamento', () => {
    expect(shouldShowLmsEnrollmentDeadline('NAO_INICIADO', oldDeadline)).toBe(true);
    expect(shouldShowLmsEnrollmentDeadline('EM_ANDAMENTO', oldDeadline)).toBe(true);
  });

  it('não trata matrícula cancelada ou reprovada como qualificação vencida', () => {
    expect(shouldShowLmsEnrollmentDeadline('CANCELADO', oldDeadline)).toBe(false);
    expect(shouldShowLmsEnrollmentDeadline('REPROVADO', oldDeadline)).toBe(false);
  });

  it('não mostra prazo inexistente nem altera o status da matrícula', () => {
    expect(shouldShowLmsEnrollmentDeadline('EM_ANDAMENTO', null)).toBe(false);
    expect(shouldShowLmsEnrollmentDeadline('NAO_INICIADO', '')).toBe(false);
  });
});

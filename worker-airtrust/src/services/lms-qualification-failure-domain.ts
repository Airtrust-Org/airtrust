import type { LmsCompletionRejectedError } from './lms-completion';

// Never ask the learner to keep retrying when the qualifying-course mapping
// needs administrative repair. This only classifies known internal error codes:
// provider exceptions, SQL text and personal information stay server-side.
export function describeLmsQualificationFailure(error: LmsCompletionRejectedError) {
  const configurationCodes = new Set([
    'LMS_QUALIFICATION_MAPPING_INVALID',
    'LMS_QUALIFICATION_CATEGORY_NOT_INTEGRATED',
    'LMS_QUALIFICATION_STATUS_INCOMPATIBLE',
  ]);
  const requiresAdministrator = configurationCodes.has(error.code);
  return {
    reasonCode: requiresAdministrator ? error.code : 'LMS_QUALIFICATION_COMPLETION_FAILED',
    message: requiresAdministrator
      ? 'O curso foi realizado, mas a configuração da qualificação precisa ser corrigida pela Gerência de Treinamento. Seu progresso foi preservado.'
      : 'Não foi possível confirmar a qualificação exigida por este curso. A matrícula não foi concluída — tente novamente.',
  };
}

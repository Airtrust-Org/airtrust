/**
 * Structured, side-effect-free explanation of WHY an enrollment cannot become
 * CONCLUIDO (report §3.3): which evidence is missing, in which cycle/edition,
 * who controls the fix and how to recover. Pure function — it never reads or
 * writes D1/R2 and never changes the verdict that produced the 409.
 */
import type { ScormClosureReadiness } from './lms-matricula-runtime-domain';

export const LMS_COMPLETION_BLOCKER_CONTRACT = 'AIRTRUST_LMS_COMPLETION_BLOCKER_V1' as const;

export type LmsCompletionBlockerCategory =
  | 'STUDY_EVIDENCE_MISSING'
  | 'TERMINAL_STATUS_MISSING'
  | 'ASSESSMENT_NOT_PASSED'
  | 'EDITION_MISMATCH'
  | 'CYCLE_INVALID'
  | 'ENROLLMENT_INACTIVE'
  | 'PACKAGE_UNAVAILABLE'
  | 'COURSE_POLICY_INVALID'
  | 'QUALIFICATION_CONFIGURATION'
  | 'SESSION_INVALID'
  | 'STATE_INCONSISTENT'
  | 'USER_CONFIRMATION_REQUIRED'
  | 'TRANSIENT_FAILURE'
  | 'UNCLASSIFIED';

export type LmsCompletionBlockerOwner =
  | 'LEARNER'
  | 'TRAINING_ADMIN'
  | 'CONTENT_TEAM'
  | 'SUPPORT';

export interface LmsCompletionBlocker {
  contract: typeof LMS_COMPLETION_BLOCKER_CONTRACT;
  code: string;
  category: LmsCompletionBlockerCategory;
  /** True = protection working as designed (old cycle, exam pending, ...). */
  expected_protection: boolean;
  missing_evidence: string[];
  owner: LmsCompletionBlockerOwner;
  recovery: { action: string; message: string };
  scope: {
    matricula_id: number;
    ciclo_id: number | null;
    package_version: string | null;
    study_coverage: ScormClosureReadiness['study_coverage'] | null;
    slide_coverage: { total: number; recorded: number; missing_count: number } | null;
  };
  side_effects: 'NONE';
  reference: string | null;
}

type Rule = {
  category: LmsCompletionBlockerCategory;
  expected: boolean;
  owner: LmsCompletionBlockerOwner;
  action: string;
  message: string;
  reference?: string;
};

const RULES: Record<string, Rule> = {
  PROGRESS_EVIDENCE_MISSING: {
    category: 'STUDY_EVIDENCE_MISSING', expected: true, owner: 'LEARNER',
    action: 'RESUME_AND_VISIT_MISSING_UNITS',
    message: 'Ainda há telas obrigatórias sem registro de visita. Reabra o curso e percorra as telas pendentes; o progresso já registrado foi preservado.',
  },
  COMPLETION_EVIDENCE_INSUFFICIENT: {
    category: 'TERMINAL_STATUS_MISSING', expected: true, owner: 'LEARNER',
    action: 'RESUME_AND_FINISH_PACKAGE',
    message: 'O pacote ainda não registrou o encerramento do conteúdo. Reabra o curso e conclua a última etapa do próprio conteúdo.',
  },
  COMPLETION_NOT_REQUESTED: {
    category: 'TERMINAL_STATUS_MISSING', expected: true, owner: 'LEARNER',
    action: 'RESUME_AND_FINISH_PACKAGE',
    message: 'Nenhum sinal de conclusão do conteúdo foi registrado ainda.',
  },
  SCORE_MISSING: {
    category: 'ASSESSMENT_NOT_PASSED', expected: true, owner: 'LEARNER',
    action: 'COMPLETE_IN_PACKAGE_ASSESSMENT',
    message: 'A avaliação do curso ainda não registrou nota. Conclua a avaliação dentro do conteúdo.',
  },
  SCORE_BELOW_MASTERY: {
    category: 'ASSESSMENT_NOT_PASSED', expected: true, owner: 'LEARNER',
    action: 'RETAKE_IN_PACKAGE_ASSESSMENT',
    message: 'A nota registrada está abaixo da nota mínima do curso.',
  },
  EXPLICIT_FAILURE: {
    category: 'ASSESSMENT_NOT_PASSED', expected: true, owner: 'LEARNER',
    action: 'RETAKE_IN_PACKAGE_ASSESSMENT',
    message: 'O conteúdo registrou reprovação. A conclusão não pode ser registrada a partir desta tentativa.',
  },
  MASTERY_SCORE_MISSING: {
    category: 'COURSE_POLICY_INVALID', expected: false, owner: 'TRAINING_ADMIN',
    action: 'FIX_COURSE_ASSESSMENT_POLICY',
    message: 'O curso exige avaliação, mas não tem nota mínima válida configurada. A Gerência de Treinamento precisa corrigir a configuração; seu progresso foi preservado.',
  },
  MASTERY_SCORE_INVALID: {
    category: 'COURSE_POLICY_INVALID', expected: false, owner: 'TRAINING_ADMIN',
    action: 'FIX_COURSE_ASSESSMENT_POLICY',
    message: 'A nota mínima configurada no curso é inválida.',
  },
  MASTERY_SCORE_ZERO_NOT_ALLOWED: {
    category: 'COURSE_POLICY_INVALID', expected: false, owner: 'TRAINING_ADMIN',
    action: 'FIX_COURSE_ASSESSMENT_POLICY',
    message: 'A nota mínima configurada no curso não pode ser zero para curso avaliado.',
  },
  SCORE_INVALID: {
    category: 'STATE_INCONSISTENT', expected: false, owner: 'SUPPORT',
    action: 'INSPECT_PACKAGE_SCORE_DATA',
    message: 'O pacote registrou uma nota fora do intervalo válido.',
  },
  STATE_INCONSISTENT: {
    category: 'STATE_INCONSISTENT', expected: true, owner: 'SUPPORT',
    action: 'INSPECT_CONFLICTING_STATUS',
    message: 'O conteúdo registrou estados contraditórios (conclusão e não conclusão).',
  },
  ENROLLMENT_INACTIVE: {
    category: 'ENROLLMENT_INACTIVE', expected: true, owner: 'TRAINING_ADMIN',
    action: 'REVIEW_ENROLLMENT_STATUS',
    message: 'A matrícula está cancelada e não aceita conclusão.',
  },
  COURSE_UNAVAILABLE: {
    category: 'PACKAGE_UNAVAILABLE', expected: true, owner: 'CONTENT_TEAM',
    action: 'PUBLISH_OR_ACTIVATE_COURSE',
    message: 'O curso está inativo ou não publicado.',
  },
  PACKAGE_BINDING_INVALID: {
    category: 'PACKAGE_UNAVAILABLE', expected: true, owner: 'CONTENT_TEAM',
    action: 'ACTIVATE_VALID_PACKAGE',
    message: 'O curso não possui pacote ativo válido.',
  },
  CONTENT_EVIDENCE_REQUIRED: {
    category: 'PACKAGE_UNAVAILABLE', expected: true, owner: 'CONTENT_TEAM',
    action: 'PROVIDE_SERVER_VALIDATED_CONTENT_CONTRACT',
    message: 'Este formato de conteúdo não possui evidência de conclusão validada pelo servidor.',
  },
  ASSET_SESSION_INVALID: {
    category: 'SESSION_INVALID', expected: true, owner: 'LEARNER',
    action: 'REOPEN_PLAYER',
    message: 'A sessão do player expirou. Reabra o curso para confirmar a conclusão.',
  },
  SCORM_USER_CONFIRMATION_REQUIRED: {
    category: 'USER_CONFIRMATION_REQUIRED', expected: true, owner: 'LEARNER',
    action: 'CONFIRM_COMPLETION',
    message: 'A confirmação de conclusão ainda não foi enviada.',
  },
  LMS_NEW_EDITION_REQUIRED: {
    category: 'EDITION_MISMATCH', expected: true, owner: 'TRAINING_ADMIN',
    action: 'EDITION_HANDOFF_OR_NEW_CYCLE',
    message: 'As evidências registradas pertencem a outra edição do treinamento. É necessário iniciar o ciclo na edição ativa.',
  },
  LMS_SCORM_CYCLE_MISMATCH: {
    category: 'CYCLE_INVALID', expected: true, owner: 'LEARNER',
    action: 'REOPEN_PLAYER',
    message: 'A sessão pertence a outro ciclo da matrícula. Reabra o treinamento.',
  },
  LMS_PERSISTED_PROGRESS_REQUIRED: {
    category: 'STUDY_EVIDENCE_MISSING', expected: true, owner: 'LEARNER',
    action: 'RESUME_AND_SAVE_PROGRESS',
    message: 'Não há progresso anterior registrado para esta matrícula.',
  },
  LMS_QUALIFICATION_MAPPING_INVALID: {
    category: 'QUALIFICATION_CONFIGURATION', expected: false, owner: 'TRAINING_ADMIN',
    action: 'FIX_QUALIFICATION_MAPPING',
    message: 'O curso foi realizado, mas a configuração da qualificação precisa ser corrigida pela Gerência de Treinamento.',
  },
  LMS_QUALIFICATION_CATEGORY_NOT_INTEGRATED: {
    category: 'QUALIFICATION_CONFIGURATION', expected: false, owner: 'TRAINING_ADMIN',
    action: 'FIX_QUALIFICATION_MAPPING',
    message: 'A categoria da qualificação não está integrada ao LMS.',
  },
  LMS_QUALIFICATION_STATUS_INCOMPATIBLE: {
    category: 'QUALIFICATION_CONFIGURATION', expected: true, owner: 'TRAINING_ADMIN',
    action: 'REVIEW_QUALIFICATION_HISTORY',
    message: 'Já existe registro de qualificação incompatível para esta data.',
  },
  LMS_QUALIFICATION_COMPLETION_FAILED: {
    category: 'TRANSIENT_FAILURE', expected: false, owner: 'SUPPORT',
    action: 'RETRY_FINALIZATION',
    message: 'A conclusão não pôde ser gravada. Nenhuma alteração parcial foi mantida; tente novamente.',
  },
};

const CLOSURE_TO_RULE: Record<string, string> = {
  SCORM_ASSESSMENT_POLICY_INVALID: 'MASTERY_SCORE_MISSING',
  SCORM_ALREADY_COMPLETED: 'COMPLETION_EVIDENCE_INSUFFICIENT',
  SCORM_READY_FOR_SERVER_VERIFICATION: 'COMPLETION_EVIDENCE_INSUFFICIENT',
};

export function describeLmsCompletionBlocker(input: {
  code: string;
  matriculaId: number;
  cicloId?: number | null;
  closure?: ScormClosureReadiness | null;
  packageVersion?: string | null;
}): LmsCompletionBlocker {
  const ruleKey = CLOSURE_TO_RULE[input.code] ?? input.code;
  const rule: Rule = RULES[ruleKey] ?? {
    category: 'UNCLASSIFIED', expected: false, owner: 'SUPPORT',
    action: 'CONTACT_SUPPORT', message: 'A conclusão foi recusada. Consulte o suporte com o código informado.',
  };
  const closure = input.closure ?? null;
  const slide = closure?.slide_coverage ?? null;
  return {
    contract: LMS_COMPLETION_BLOCKER_CONTRACT,
    code: input.code,
    category: rule.category,
    expected_protection: rule.expected,
    missing_evidence: closure?.missing ?? [],
    owner: rule.owner,
    recovery: { action: rule.action, message: rule.message },
    scope: {
      matricula_id: input.matriculaId,
      ciclo_id: input.cicloId ?? null,
      package_version: input.packageVersion ?? closure?.study_coverage?.package_version ?? null,
      study_coverage: closure?.study_coverage ?? null,
      slide_coverage: slide
        ? { total: slide.total, recorded: slide.recorded, missing_count: slide.missing_numbers.length }
        : null,
    },
    side_effects: 'NONE',
    reference: rule.reference ?? null,
  };
}

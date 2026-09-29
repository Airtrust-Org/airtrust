export const TRAINING_ALERT_DAILY_CRON = '0 8 * * *';

export type TrainingAlertStageCode =
  | 'QUALIFICACAO_45D'
  | 'QUALIFICACAO_30D'
  | 'QUALIFICACAO_15D'
  | 'QUALIFICACAO_7D'
  | 'QUALIFICACAO_VENCIDA';

export type TrainingAlertStage = {
  code: TrainingAlertStageCode;
  defaultDays: number;
  urgency: 'low' | 'medium' | 'high' | 'critical' | 'expired';
  employeeEmail: boolean;
  employeeWhatsapp: boolean;
  managerCheckEmail: boolean;
  expired: boolean;
};

export const TRAINING_ALERT_STAGES: readonly TrainingAlertStage[] = [
  {
    code: 'QUALIFICACAO_45D',
    defaultDays: 45,
    urgency: 'low',
    employeeEmail: false,
    employeeWhatsapp: false,
    managerCheckEmail: true,
    expired: false,
  },
  {
    code: 'QUALIFICACAO_30D',
    defaultDays: 30,
    urgency: 'medium',
    employeeEmail: true,
    employeeWhatsapp: true,
    managerCheckEmail: true,
    expired: false,
  },
  {
    code: 'QUALIFICACAO_15D',
    defaultDays: 15,
    urgency: 'high',
    employeeEmail: true,
    employeeWhatsapp: true,
    managerCheckEmail: true,
    expired: false,
  },
  {
    code: 'QUALIFICACAO_7D',
    defaultDays: 7,
    urgency: 'critical',
    employeeEmail: true,
    employeeWhatsapp: true,
    managerCheckEmail: true,
    expired: false,
  },
  {
    code: 'QUALIFICACAO_VENCIDA',
    defaultDays: 0,
    urgency: 'expired',
    employeeEmail: true,
    employeeWhatsapp: false,
    managerCheckEmail: false,
    expired: true,
  },
] as const;

export const AUTO_RENEWAL_EAD_OBSERVATION_PREFIX =
  'Matrícula automática: renovação de qualificação EAD';

export function getTrainingAlertStage(
  code: string | null | undefined,
): TrainingAlertStage | null {
  const normalized = String(code || '').trim().toUpperCase();
  return TRAINING_ALERT_STAGES.find((stage) => stage.code === normalized) || null;
}

export function inferTrainingAlertStageCode(config: {
  tipo?: string | null;
  codigo?: string | null;
  urgencia?: string | null;
  dias_antes?: number | null;
}): TrainingAlertStageCode | null {
  const explicit = getTrainingAlertStage(config.codigo);
  if (explicit) return explicit.code;

  const channel = String(config.tipo || '').trim().toUpperCase();
  if (channel !== 'WHATSAPP') return null;

  const urgency = String(config.urgencia || '').trim().toLowerCase();
  const days = Number(config.dias_antes);
  const legacy = TRAINING_ALERT_STAGES.find(
    (stage) =>
      stage.employeeWhatsapp && (stage.urgency === urgency || stage.defaultDays === days),
  );
  return legacy?.code || null;
}

export function trainingAlertAudience(
  stageCode: TrainingAlertStageCode | null,
  isCheck: boolean,
): { funcionario: boolean; gestores: boolean } {
  const stage = getTrainingAlertStage(stageCode);
  if (!stage) return { funcionario: false, gestores: false };
  return {
    funcionario: stage.employeeEmail,
    gestores: isCheck && stage.managerCheckEmail,
  };
}

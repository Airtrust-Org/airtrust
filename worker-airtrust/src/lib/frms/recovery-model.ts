export type RecoveryActivityType =
  | 'OFF_DUTY'
  | 'STANDBY_HOME_HOTEL'
  | 'STANDBY_ONSITE'
  | 'ADMIN_TRAINING'
  | 'DUTY_TRAVEL'
  | 'MIXED'
  | 'OTHER'
  | 'UNKNOWN';

export type RecoveryState = 'UNKNOWN' | 'LIMITED' | 'PARTIAL' | 'STRONG' | 'CONFIRMED';
export type RecoveryConfidence = 'LOW' | 'MEDIUM' | 'HIGH';

export interface RecoveryEvidenceInput {
  activityType: RecoveryActivityType;
  sleepHours24h: number | null;
  sleepTargetHours: number;
  consecutiveQualifyingNights: number;
  readinessClassification?:
    | 'baseline_building'
    | 'preserved'
    | 'attention'
    | 'operational_review'
    | null;
  immediateCalloutRequired?: boolean | null;
  activityKnown?: boolean;
}

export interface RecoveryEvidenceResult {
  state: RecoveryState;
  confidence: RecoveryConfidence;
  qualifyingRecoveryNight: boolean;
  reasons: string[];
  /**
   * Recovery V1 is evidence-only. It intentionally does not mint an
   * effectiveness bonus. Calibration against longitudinal sleep/KSS/PVT data
   * must precede any numerical modifier to the canonical FRMS score.
   */
  effectivenessDeltaPct: null;
}

const RECOVERY_FRIENDLY = new Set<RecoveryActivityType>([
  'OFF_DUTY',
  'STANDBY_HOME_HOTEL',
]);

const RECOVERY_RESTRICTIVE = new Set<RecoveryActivityType>([
  'STANDBY_ONSITE',
  'ADMIN_TRAINING',
  'DUTY_TRAVEL',
]);

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function deriveRecoveryEvidence(input: RecoveryEvidenceInput): RecoveryEvidenceResult {
  const reasons: string[] = [];
  const sleepHours = finiteOrNull(input.sleepHours24h);
  const target = finiteOrNull(input.sleepTargetHours);
  const activityKnown = input.activityKnown !== false && input.activityType !== 'UNKNOWN';

  if (!activityKnown) {
    return {
      state: 'UNKNOWN',
      confidence: 'LOW',
      qualifyingRecoveryNight: false,
      reasons: ['ATIVIDADE_NAO_CLASSIFICADA'],
      effectivenessDeltaPct: null,
    };
  }

  if (sleepHours == null || target == null || target <= 0) {
    return {
      state: 'UNKNOWN',
      confidence: 'LOW',
      qualifyingRecoveryNight: false,
      reasons: ['EVIDENCIA_DE_SONO_INSUFICIENTE'],
      effectivenessDeltaPct: null,
    };
  }

  if (RECOVERY_RESTRICTIVE.has(input.activityType)) {
    reasons.push('ATIVIDADE_RESTRINGIU_OPORTUNIDADE_DE_RECUPERACAO');
    return {
      state: 'LIMITED',
      confidence: 'HIGH',
      qualifyingRecoveryNight: false,
      reasons,
      effectivenessDeltaPct: null,
    };
  }

  if (input.activityType === 'MIXED' || input.activityType === 'OTHER') {
    reasons.push('ATIVIDADE_MISTA_OU_NAO_PADRONIZADA');
    return {
      state: sleepHours >= target ? 'PARTIAL' : 'LIMITED',
      confidence: 'MEDIUM',
      qualifyingRecoveryNight: false,
      reasons,
      effectivenessDeltaPct: null,
    };
  }

  if (input.activityType === 'STANDBY_HOME_HOTEL' && input.immediateCalloutRequired === true) {
    reasons.push('STANDBY_COM_ACIONAMENTO_IMEDIATO');
    return {
      state: sleepHours >= target ? 'PARTIAL' : 'LIMITED',
      confidence: 'MEDIUM',
      qualifyingRecoveryNight: false,
      reasons,
      effectivenessDeltaPct: null,
    };
  }

  if (!RECOVERY_FRIENDLY.has(input.activityType)) {
    return {
      state: 'UNKNOWN',
      confidence: 'LOW',
      qualifyingRecoveryNight: false,
      reasons: ['CLASSIFICACAO_SEM_REGRA_DE_RECUPERACAO'],
      effectivenessDeltaPct: null,
    };
  }

  if (sleepHours < target) {
    reasons.push('SONO_ABAIXO_DA_META_OPERACIONAL');
    return {
      state: 'LIMITED',
      confidence: 'HIGH',
      qualifyingRecoveryNight: false,
      reasons,
      effectivenessDeltaPct: null,
    };
  }

  const nights = Math.max(0, Math.floor(input.consecutiveQualifyingNights));
  reasons.push('OPORTUNIDADE_REAL_DE_RECUPERACAO');

  if (nights < 2) {
    return {
      state: 'PARTIAL',
      confidence: 'HIGH',
      qualifyingRecoveryNight: true,
      reasons: [...reasons, 'PRIMEIRA_NOITE_QUALIFICANTE'],
      effectivenessDeltaPct: null,
    };
  }

  if (input.readinessClassification === 'preserved') {
    return {
      state: 'CONFIRMED',
      confidence: 'HIGH',
      qualifyingRecoveryNight: true,
      reasons: [...reasons, 'DUAS_OU_MAIS_NOITES_QUALIFICANTES', 'READINESS_PRESERVADA_VS_BASELINE'],
      effectivenessDeltaPct: null,
    };
  }

  if (
    input.readinessClassification === 'attention' ||
    input.readinessClassification === 'operational_review'
  ) {
    return {
      state: 'PARTIAL',
      confidence: 'HIGH',
      qualifyingRecoveryNight: true,
      reasons: [...reasons, 'DUAS_OU_MAIS_NOITES_QUALIFICANTES', 'READINESS_AINDA_NAO_RECUPERADA'],
      effectivenessDeltaPct: null,
    };
  }

  return {
    state: 'STRONG',
    confidence: input.readinessClassification === 'baseline_building' ? 'MEDIUM' : 'HIGH',
    qualifyingRecoveryNight: true,
    reasons: [...reasons, 'DUAS_OU_MAIS_NOITES_QUALIFICANTES'],
    effectivenessDeltaPct: null,
  };
}

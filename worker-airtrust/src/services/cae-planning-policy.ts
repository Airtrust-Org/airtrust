export type SimulatorRosterPolicy = 'FOLGA' | 'TRABALHO' | 'AMBAS';
export type SimulatorRosterDayState =
  | 'FOLGA'
  | 'TRABALHO'
  | 'INDISPONIVEL'
  | 'DESCONHECIDO';

export type SimulatorPairingMode = 'NORMAL' | 'COMPARTILHADA';

export type SimulatorPlanningConfigRow = {
  planejamento_simulador_antecedencia_dias?: number | null;
  planejamento_simulador_regra_quinzena?: string | null;
  planejamento_simulador_preferencia_sessoes_por_dia?: number | null;
  planejamento_simulador_preferencia_minutos_por_dia?: number | null;
  planejamento_simulador_permitir_quebra_preferencia?: number | boolean | null;
  planejamento_simulador_permitir_sessao_compartilhada?: number | boolean | null;
  planejamento_simulador_preferir_mesmo_treinamento?: number | boolean | null;
  planejamento_simulador_preferir_mesma_sessao?: number | boolean | null;
  planejamento_simulador_aprovacao_obrigatoria?: number | boolean | null;
};

export type SimulatorPlanningConfig = {
  planning_horizon_days: number;
  roster_policy: SimulatorRosterPolicy;
  preferred_sessions_per_day: number;
  preferred_minutes_per_day: number;
  allow_preference_break: boolean;
  allow_shared_session: boolean;
  prefer_same_training: boolean;
  prefer_same_session: boolean;
  approval_required: boolean;
  source: 'DATABASE' | 'DATABASE_WITH_FALLBACKS' | 'FALLBACK';
  warnings: string[];
};

export const SIMULATOR_PLANNING_FALLBACKS = Object.freeze({
  planning_horizon_days: 90,
  roster_policy: 'AMBAS' as SimulatorRosterPolicy,
  preferred_sessions_per_day: 2,
  preferred_minutes_per_day: 240,
  allow_preference_break: true,
  allow_shared_session: true,
  prefer_same_training: true,
  prefer_same_session: true,
  approval_required: true,
});

function positiveIntegerOr(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  if (value === true || value === 1 || value === '1') return true;
  if (value === false || value === 0 || value === '0') return false;
  return fallback;
}

function rosterPolicyOr(value: unknown, fallback: SimulatorRosterPolicy): SimulatorRosterPolicy {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (normalized === 'FOLGA' || normalized === 'TRABALHO' || normalized === 'AMBAS') {
    return normalized;
  }
  return fallback;
}

export function resolveSimulatorPlanningConfig(
  row: SimulatorPlanningConfigRow | null | undefined,
): SimulatorPlanningConfig {
  const warnings: string[] = [];
  const missing: string[] = [];
  const sourceRow = row || {};

  const read = <K extends keyof SimulatorPlanningConfigRow>(key: K) => {
    const value = sourceRow[key];
    if (value === null || value === undefined || value === '') missing.push(String(key));
    return value;
  };

  const config: SimulatorPlanningConfig = {
    planning_horizon_days: positiveIntegerOr(
      read('planejamento_simulador_antecedencia_dias'),
      SIMULATOR_PLANNING_FALLBACKS.planning_horizon_days,
      1,
      365,
    ),
    roster_policy: rosterPolicyOr(
      read('planejamento_simulador_regra_quinzena'),
      SIMULATOR_PLANNING_FALLBACKS.roster_policy,
    ),
    preferred_sessions_per_day: positiveIntegerOr(
      read('planejamento_simulador_preferencia_sessoes_por_dia'),
      SIMULATOR_PLANNING_FALLBACKS.preferred_sessions_per_day,
      1,
      8,
    ),
    preferred_minutes_per_day: positiveIntegerOr(
      read('planejamento_simulador_preferencia_minutos_por_dia'),
      SIMULATOR_PLANNING_FALLBACKS.preferred_minutes_per_day,
      30,
      24 * 60,
    ),
    allow_preference_break: booleanOr(
      read('planejamento_simulador_permitir_quebra_preferencia'),
      SIMULATOR_PLANNING_FALLBACKS.allow_preference_break,
    ),
    allow_shared_session: booleanOr(
      read('planejamento_simulador_permitir_sessao_compartilhada'),
      SIMULATOR_PLANNING_FALLBACKS.allow_shared_session,
    ),
    prefer_same_training: booleanOr(
      read('planejamento_simulador_preferir_mesmo_treinamento'),
      SIMULATOR_PLANNING_FALLBACKS.prefer_same_training,
    ),
    prefer_same_session: booleanOr(
      read('planejamento_simulador_preferir_mesma_sessao'),
      SIMULATOR_PLANNING_FALLBACKS.prefer_same_session,
    ),
    approval_required: booleanOr(
      read('planejamento_simulador_aprovacao_obrigatoria'),
      SIMULATOR_PLANNING_FALLBACKS.approval_required,
    ),
    source: 'DATABASE',
    warnings,
  };

  if (!row) {
    config.source = 'FALLBACK';
    warnings.push('Configuração de planejamento de simulador ausente; fallbacks centrais aplicados.');
  } else if (missing.length > 0) {
    config.source = 'DATABASE_WITH_FALLBACKS';
    warnings.push(`Configuração incompleta; fallback aplicado em: ${missing.join(', ')}.`);
  }

  return config;
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function addDaysIso(value: string, days: number): string {
  if (!isIsoDate(value)) throw new Error(`Data ISO inválida: ${value}`);
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  if (!isIsoDate(from) || !isIsoDate(to)) throw new Error('Datas ISO inválidas');
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000,
  );
}

/**
 * Os 90 dias são horizonte de PLANEJAMENTO, não janela de realização.
 * O tripulante entra na fila a partir de expiry - planning_horizon_days.
 */
export function planningQueueStartDate(expiryDate: string, config: SimulatorPlanningConfig): string {
  return addDaysIso(expiryDate, -config.planning_horizon_days);
}

export function isInsidePlanningHorizon(params: {
  reference_date: string;
  expiry_date: string;
  config: SimulatorPlanningConfig;
}): boolean {
  const start = planningQueueStartDate(params.expiry_date, params.config);
  return params.reference_date >= start && params.reference_date <= params.expiry_date;
}

export type RosterEligibility = {
  eligible: boolean;
  reason: string;
};

/**
 * O estado da quinzena deve ser resolvido da fonte canônica da escala para a DATA candidata.
 * Este helper nunca persiste/infere quinzena por funcionário.
 */
export function evaluateRosterEligibility(
  policy: SimulatorRosterPolicy,
  liveDayState: SimulatorRosterDayState,
): RosterEligibility {
  if (liveDayState === 'INDISPONIVEL') {
    return { eligible: false, reason: 'Tripulante indisponível na escala vigente para a data.' };
  }
  if (liveDayState === 'DESCONHECIDO') {
    return { eligible: false, reason: 'Estado de escala/quinzena não pôde ser resolvido.' };
  }
  if (policy === 'AMBAS') {
    return { eligible: true, reason: `Política permite ${liveDayState.toLowerCase()}.` };
  }
  if (policy === liveDayState) {
    return { eligible: true, reason: `Data atende à política ${policy}.` };
  }
  return {
    eligible: false,
    reason: `Data está em ${liveDayState}, mas a empresa está configurada para ${policy}.`,
  };
}

export type CrewPairingInput = {
  same_equipment: boolean;
  same_training: boolean;
  same_session_model: boolean;
  canonical_shared_compatibility: boolean;
  config: SimulatorPlanningConfig;
};

export type CrewPairingEvaluation = {
  eligible: boolean;
  mode: SimulatorPairingMode | null;
  preference_penalty: number;
  reasons: string[];
};

/**
 * NÃO decide compatibilidade curricular por nome/código hardcoded.
 * canonical_shared_compatibility deve vir da regra canônica já existente no módulo Simulador.
 */
export function evaluateCrewPairing(input: CrewPairingInput): CrewPairingEvaluation {
  if (!input.same_equipment) {
    return {
      eligible: false,
      mode: null,
      preference_penalty: Number.POSITIVE_INFINITY,
      reasons: ['Equipamentos diferentes não podem compartilhar o mesmo bloco FFS.'],
    };
  }

  if (input.same_training && input.same_session_model) {
    return {
      eligible: true,
      mode: 'NORMAL',
      preference_penalty: 0,
      reasons: ['Mesma sessão/modelo: usar sessão normal.'],
    };
  }

  if (!input.config.allow_shared_session) {
    return {
      eligible: false,
      mode: null,
      preference_penalty: Number.POSITIVE_INFINITY,
      reasons: ['A empresa desabilitou sessão compartilhada.'],
    };
  }

  if (!input.canonical_shared_compatibility) {
    return {
      eligible: false,
      mode: null,
      preference_penalty: Number.POSITIVE_INFINITY,
      reasons: ['A regra canônica do módulo Simulador não permite este compartilhamento.'],
    };
  }

  let penalty = 0;
  const reasons = ['Sessão compartilhada permitida pela regra canônica do módulo Simulador.'];
  if (input.config.prefer_same_training && !input.same_training) {
    penalty += 200;
    reasons.push('Treinamentos diferentes: preferência reduzida, mas combinação permanece válida.');
  }
  if (input.config.prefer_same_session && !input.same_session_model) {
    penalty += 400;
    reasons.push('Modelos de sessão diferentes: preferência reduzida, mas combinação permanece válida.');
  }

  return {
    eligible: true,
    mode: 'COMPARTILHADA',
    preference_penalty: penalty,
    reasons,
  };
}

/**
 * Menor valor = melhor. Prefere concluir o treinamento o mais perto possível do vencimento,
 * sem transformar isso em permissão para ultrapassar a data limite.
 */
export function completionProximityPenalty(params: {
  completion_date: string;
  expiry_date: string;
  points_per_day?: number;
}): number {
  const days = daysBetween(params.completion_date, params.expiry_date);
  if (days < 0) return Number.POSITIVE_INFINITY;
  return days * (params.points_per_day ?? 100);
}

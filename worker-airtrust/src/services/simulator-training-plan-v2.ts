export type SimulatorTrainingPairingMode = 'NORMAL' | 'COMPARTILHADA' | 'SOLO';
export type SimulatorTrainingPairingScope = 'TREINAMENTO_COMPLETO' | 'SESSAO' | 'SOLO';

export type SimulatorTrainingSessionNeed = {
  session_id: string;
  model_id: number;
  code: string;
  name: string;
  order: number;
  duration_minutes: number;
  is_check?: boolean;
  /**
   * Chaves produzidas pela regra canônica de compatibilidade curricular.
   * O planejador nunca presume que sessões de treinamentos diferentes são
   * compatíveis apenas pelo nome.
   */
  shared_compatibility_keys?: string[];
};

export type SimulatorTrainingNeed = {
  need_id: string;
  employee_id: number;
  employee_name: string;
  employee_role?: string | null;
  qualification_type_id: number;
  training_code: string | null;
  training_name: string;
  training_kind?: string | null;
  equipment: string;
  expiry_date: string;
  earliest_date?: string | null;
  preferred_window_start?: string | null;
  preferred_window_end?: string | null;
  sessions: SimulatorTrainingSessionNeed[];
};

export type SimulatorTrainingPlanConfig = {
  reference_date: string;
  max_anticipation_days: number;
  allow_shared_session: boolean;
  allow_cross_training_pairing: boolean;
  prefer_same_training: boolean;
  prefer_same_session: boolean;
  prefer_complete_training_pair: boolean;
  prefer_complementary_roles: boolean;
};

export const SIMULATOR_TRAINING_PLAN_V2_DEFAULTS: Omit<
  SimulatorTrainingPlanConfig,
  'reference_date'
> = Object.freeze({
  max_anticipation_days: 90,
  allow_shared_session: true,
  allow_cross_training_pairing: true,
  prefer_same_training: true,
  prefer_same_session: true,
  prefer_complete_training_pair: true,
  prefer_complementary_roles: true,
});

export type PlannedSessionAssignment = {
  need_id: string;
  employee_id: number;
  employee_name: string;
  employee_role: string | null;
  qualification_type_id: number;
  training_code: string | null;
  training_name: string;
  training_kind: string | null;
  expiry_date: string;
  session_id: string;
  session_model_id: number;
  session_code: string;
  session_name: string;
  session_order: number;
  duration_minutes: number;
  is_check: boolean;
};

export type SimulatorTrainingBlock = {
  block_id: string;
  equipment: string;
  pairing_scope: SimulatorTrainingPairingScope;
  mode: SimulatorTrainingPairingMode;
  assignments: PlannedSessionAssignment[];
  required_minutes: number;
  allowed_start: string;
  allowed_end: string;
  preferred_window_start: string | null;
  preferred_window_end: string | null;
  score: number;
  reasons: string[];
};

export type SimulatorTrainingPlanProposal = {
  version: 'SIMULATOR_TRAINING_PLAN_V2';
  generated_for_date: string;
  needs: SimulatorTrainingNeed[];
  blocks: SimulatorTrainingBlock[];
  summary: {
    trainings: number;
    session_requirements: number;
    full_training_pairs: number;
    full_training_paired_needs: number;
    mixed_training_blocks: number;
    shared_blocks: number;
    solo_blocks: number;
  };
};

type SessionUnit = {
  need: SimulatorTrainingNeed;
  session: SimulatorTrainingSessionNeed;
};

type PairCandidate = {
  left: SessionUnit;
  right: SessionUnit;
  score: number;
  mode: Exclude<SimulatorTrainingPairingMode, 'SOLO'>;
  reasons: string[];
};

type FullTrainingPairCandidate = {
  left: SimulatorTrainingNeed;
  right: SimulatorTrainingNeed;
  score: number;
};

function isIsoDate(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function addDaysIso(value: string, days: number): string {
  if (!isIsoDate(value)) throw new Error(`Data ISO inválida: ${value}`);
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  if (!isIsoDate(from) || !isIsoDate(to)) throw new Error('Datas ISO inválidas');
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000,
  );
}

function maxDate(...values: string[]): string {
  return [...values].sort().at(-1) as string;
}

function minDate(...values: string[]): string {
  return [...values].sort()[0] as string;
}

function normalizeRole(value: string | null | undefined): 'PIC' | 'SIC' | 'OTHER' {
  const normalized = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
  if (normalized.includes('COMANDANTE') || normalized === 'PIC' || normalized.startsWith('PIC_')) {
    return 'PIC';
  }
  if (normalized.includes('COPILOTO') || normalized === 'SIC' || normalized.startsWith('SIC_')) {
    return 'SIC';
  }
  return 'OTHER';
}

function rolesAreComplementary(left: SimulatorTrainingNeed, right: SimulatorTrainingNeed): boolean {
  const a = normalizeRole(left.employee_role);
  const b = normalizeRole(right.employee_role);
  return (a === 'PIC' && b === 'SIC') || (a === 'SIC' && b === 'PIC');
}

function normalizeEquipment(value: string): string {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function validateSession(session: SimulatorTrainingSessionNeed): void {
  if (!session.session_id) throw new Error('session_id obrigatório');
  if (!Number.isInteger(session.model_id) || session.model_id <= 0) {
    throw new Error(`model_id inválido na sessão ${session.session_id}`);
  }
  if (!Number.isInteger(session.order) || session.order <= 0) {
    throw new Error(`order inválido na sessão ${session.session_id}`);
  }
  if (!Number.isInteger(session.duration_minutes) || session.duration_minutes <= 0) {
    throw new Error(`duration_minutes inválido na sessão ${session.session_id}`);
  }
}

function validateNeed(need: SimulatorTrainingNeed): void {
  if (!need.need_id) throw new Error('need_id obrigatório');
  if (!Number.isInteger(need.employee_id) || need.employee_id <= 0) {
    throw new Error(`employee_id inválido em ${need.need_id}`);
  }
  if (!Number.isInteger(need.qualification_type_id) || need.qualification_type_id <= 0) {
    throw new Error(`qualification_type_id inválido em ${need.need_id}`);
  }
  if (!normalizeEquipment(need.equipment)) throw new Error(`equipment obrigatório em ${need.need_id}`);
  if (!isIsoDate(need.expiry_date)) throw new Error(`expiry_date inválido em ${need.need_id}`);
  if (need.earliest_date && !isIsoDate(need.earliest_date)) {
    throw new Error(`earliest_date inválido em ${need.need_id}`);
  }
  if (need.preferred_window_start && !isIsoDate(need.preferred_window_start)) {
    throw new Error(`preferred_window_start inválido em ${need.need_id}`);
  }
  if (need.preferred_window_end && !isIsoDate(need.preferred_window_end)) {
    throw new Error(`preferred_window_end inválido em ${need.need_id}`);
  }
  if (
    need.preferred_window_start &&
    need.preferred_window_end &&
    need.preferred_window_start > need.preferred_window_end
  ) {
    throw new Error(`janela preferencial invertida em ${need.need_id}`);
  }
  if (!Array.isArray(need.sessions) || need.sessions.length === 0) {
    throw new Error(`treinamento sem sessões em ${need.need_id}`);
  }
  const seenIds = new Set<string>();
  const seenOrders = new Set<number>();
  for (const session of need.sessions) {
    validateSession(session);
    if (seenIds.has(session.session_id)) throw new Error(`session_id duplicado em ${need.need_id}`);
    if (seenOrders.has(session.order)) throw new Error(`order duplicado em ${need.need_id}`);
    seenIds.add(session.session_id);
    seenOrders.add(session.order);
  }
}

function validateConfig(config: SimulatorTrainingPlanConfig): void {
  if (!isIsoDate(config.reference_date)) throw new Error('reference_date inválido');
  if (
    !Number.isInteger(config.max_anticipation_days) ||
    config.max_anticipation_days < 0 ||
    config.max_anticipation_days > 365
  ) {
    throw new Error('max_anticipation_days deve estar entre 0 e 365');
  }
}

function allowedWindow(
  need: SimulatorTrainingNeed,
  config: SimulatorTrainingPlanConfig,
): { start: string; end: string } {
  const horizonStart = addDaysIso(need.expiry_date, -config.max_anticipation_days);
  const earliest = need.earliest_date && need.earliest_date > horizonStart ? need.earliest_date : horizonStart;
  const start = maxDate(config.reference_date, earliest);
  return { start, end: need.expiry_date };
}

function intersectAllowedWindows(
  left: SimulatorTrainingNeed,
  right: SimulatorTrainingNeed,
  config: SimulatorTrainingPlanConfig,
): { start: string; end: string } | null {
  const a = allowedWindow(left, config);
  const b = allowedWindow(right, config);
  const start = maxDate(a.start, b.start);
  const end = minDate(a.end, b.end);
  return start <= end ? { start, end } : null;
}

function preferredIntersection(needs: SimulatorTrainingNeed[]): {
  start: string | null;
  end: string | null;
} {
  if (needs.some((need) => !need.preferred_window_start || !need.preferred_window_end)) {
    return { start: null, end: null };
  }
  const starts = needs.map((need) => need.preferred_window_start as string);
  const ends = needs.map((need) => need.preferred_window_end as string);
  const start = maxDate(...starts);
  const end = minDate(...ends);
  return start <= end ? { start, end } : { start: null, end: null };
}

function sharedKeyIntersection(
  left: SimulatorTrainingSessionNeed,
  right: SimulatorTrainingSessionNeed,
): string[] {
  const a = new Set((left.shared_compatibility_keys || []).map(String));
  return (right.shared_compatibility_keys || []).map(String).filter((key) => a.has(key));
}

export function evaluateSessionCompatibility(params: {
  left_need: SimulatorTrainingNeed;
  left_session: SimulatorTrainingSessionNeed;
  right_need: SimulatorTrainingNeed;
  right_session: SimulatorTrainingSessionNeed;
  config: SimulatorTrainingPlanConfig;
}): {
  eligible: boolean;
  mode: Exclude<SimulatorTrainingPairingMode, 'SOLO'> | null;
  score: number;
  reasons: string[];
} {
  const { left_need, left_session, right_need, right_session, config } = params;
  if (left_need.employee_id === right_need.employee_id) {
    return { eligible: false, mode: null, score: Number.POSITIVE_INFINITY, reasons: ['Mesmo tripulante.'] };
  }
  if (normalizeEquipment(left_need.equipment) !== normalizeEquipment(right_need.equipment)) {
    return {
      eligible: false,
      mode: null,
      score: Number.POSITIVE_INFINITY,
      reasons: ['Equipamentos diferentes.'],
    };
  }
  const commonWindow = intersectAllowedWindows(left_need, right_need, config);
  if (!commonWindow) {
    return {
      eligible: false,
      mode: null,
      score: Number.POSITIVE_INFINITY,
      reasons: ['Não existe janela temporal comum antes dos vencimentos.'],
    };
  }

  const sameTraining = left_need.qualification_type_id === right_need.qualification_type_id;
  const sameSession = left_session.model_id === right_session.model_id;
  if (sameTraining && sameSession) {
    return {
      eligible: true,
      mode: 'NORMAL',
      score: Math.abs(daysBetween(left_need.expiry_date, right_need.expiry_date)),
      reasons: ['Mesmo treinamento e mesmo modelo de sessão.'],
    };
  }

  if (!config.allow_shared_session) {
    return {
      eligible: false,
      mode: null,
      score: Number.POSITIVE_INFINITY,
      reasons: ['Sessão compartilhada desabilitada.'],
    };
  }
  if (!sameTraining && !config.allow_cross_training_pairing) {
    return {
      eligible: false,
      mode: null,
      score: Number.POSITIVE_INFINITY,
      reasons: ['Pareamento entre treinamentos diferentes desabilitado.'],
    };
  }
  const sharedKeys = sharedKeyIntersection(left_session, right_session);
  if (sharedKeys.length === 0) {
    return {
      eligible: false,
      mode: null,
      score: Number.POSITIVE_INFINITY,
      reasons: ['Regra canônica não declarou compatibilidade entre as duas sessões.'],
    };
  }

  let score = Math.abs(daysBetween(left_need.expiry_date, right_need.expiry_date));
  const reasons = [`Compatibilidade curricular compartilhada: ${sharedKeys.join(', ')}.`];
  if (config.prefer_same_training && !sameTraining) {
    score += 200;
    reasons.push('Treinamentos diferentes: válido, mas menos preferido.');
  }
  if (config.prefer_same_session && !sameSession) {
    score += 400;
    reasons.push('Modelos de sessão diferentes: válido, mas menos preferido.');
  }
  if (config.prefer_complementary_roles && !rolesAreComplementary(left_need, right_need)) {
    score += 25;
    reasons.push('Funções não são a combinação PIC/SIC preferencial.');
  }

  return { eligible: true, mode: 'COMPARTILHADA', score, reasons };
}

function sessionsSorted(need: SimulatorTrainingNeed): SimulatorTrainingSessionNeed[] {
  return [...need.sessions].sort((a, b) => a.order - b.order || a.model_id - b.model_id);
}

function canPairWholeTraining(
  left: SimulatorTrainingNeed,
  right: SimulatorTrainingNeed,
  config: SimulatorTrainingPlanConfig,
): boolean {
  if (!config.prefer_complete_training_pair) return false;
  const leftSessions = sessionsSorted(left);
  const rightSessions = sessionsSorted(right);
  if (leftSessions.length !== rightSessions.length) return false;
  if (!intersectAllowedWindows(left, right, config)) return false;

  return leftSessions.every((session, index) =>
    evaluateSessionCompatibility({
      left_need: left,
      left_session: session,
      right_need: right,
      right_session: rightSessions[index],
      config,
    }).eligible,
  );
}

function fullTrainingPairScore(
  left: SimulatorTrainingNeed,
  right: SimulatorTrainingNeed,
  config: SimulatorTrainingPlanConfig,
): number {
  const leftSessions = sessionsSorted(left);
  const rightSessions = sessionsSorted(right);
  let score = Math.abs(daysBetween(left.expiry_date, right.expiry_date));
  if (left.qualification_type_id !== right.qualification_type_id && config.prefer_same_training) score += 500;
  if (config.prefer_complementary_roles && !rolesAreComplementary(left, right)) score += 25;
  for (let index = 0; index < leftSessions.length; index += 1) {
    score += evaluateSessionCompatibility({
      left_need: left,
      left_session: leftSessions[index],
      right_need: right,
      right_session: rightSessions[index],
      config,
    }).score;
  }
  return score;
}

function assignment(need: SimulatorTrainingNeed, session: SimulatorTrainingSessionNeed): PlannedSessionAssignment {
  return {
    need_id: need.need_id,
    employee_id: need.employee_id,
    employee_name: need.employee_name,
    employee_role: need.employee_role ?? null,
    qualification_type_id: need.qualification_type_id,
    training_code: need.training_code,
    training_name: need.training_name,
    training_kind: need.training_kind ?? null,
    expiry_date: need.expiry_date,
    session_id: session.session_id,
    session_model_id: session.model_id,
    session_code: session.code,
    session_name: session.name,
    session_order: session.order,
    duration_minutes: session.duration_minutes,
    is_check: session.is_check === true,
  };
}

function blockId(assignments: PlannedSessionAssignment[]): string {
  return assignments
    .map((item) => `${item.need_id}:${item.session_id}`)
    .sort()
    .join('|');
}

function createPairedBlock(params: {
  left: SessionUnit;
  right: SessionUnit;
  scope: Exclude<SimulatorTrainingPairingScope, 'SOLO'>;
  config: SimulatorTrainingPlanConfig;
}): SimulatorTrainingBlock {
  const evaluation = evaluateSessionCompatibility({
    left_need: params.left.need,
    left_session: params.left.session,
    right_need: params.right.need,
    right_session: params.right.session,
    config: params.config,
  });
  if (!evaluation.eligible || !evaluation.mode) {
    throw new Error('Tentativa de criar bloco com sessões incompatíveis');
  }
  const common = intersectAllowedWindows(params.left.need, params.right.need, params.config);
  if (!common) throw new Error('Bloco pareado sem janela comum');
  const preferred = preferredIntersection([params.left.need, params.right.need]);
  const assignments = [
    assignment(params.left.need, params.left.session),
    assignment(params.right.need, params.right.session),
  ];
  return {
    block_id: blockId(assignments),
    equipment: normalizeEquipment(params.left.need.equipment),
    pairing_scope: params.scope,
    mode: evaluation.mode,
    assignments,
    required_minutes: Math.max(...assignments.map((item) => item.duration_minutes)),
    allowed_start: common.start,
    allowed_end: common.end,
    preferred_window_start: preferred.start,
    preferred_window_end: preferred.end,
    score: evaluation.score,
    reasons: evaluation.reasons,
  };
}

function createSoloBlock(
  unit: SessionUnit,
  config: SimulatorTrainingPlanConfig,
): SimulatorTrainingBlock {
  const window = allowedWindow(unit.need, config);
  const preferred = preferredIntersection([unit.need]);
  const assignments = [assignment(unit.need, unit.session)];
  return {
    block_id: blockId(assignments),
    equipment: normalizeEquipment(unit.need.equipment),
    pairing_scope: 'SOLO',
    mode: 'SOLO',
    assignments,
    required_minutes: unit.session.duration_minutes,
    allowed_start: window.start,
    allowed_end: window.end,
    preferred_window_start: preferred.start,
    preferred_window_end: preferred.end,
    score: 10_000,
    reasons: ['Sem parceiro curricular compatível no conjunto atual; manter como pendência de pareamento.'],
  };
}

function sessionPairCandidates(
  source: SessionUnit,
  remaining: SessionUnit[],
  config: SimulatorTrainingPlanConfig,
): PairCandidate[] {
  return remaining
    .map((partner) => {
      const evaluation = evaluateSessionCompatibility({
        left_need: source.need,
        left_session: source.session,
        right_need: partner.need,
        right_session: partner.session,
        config,
      });
      return {
        left: source,
        right: partner,
        score: evaluation.score,
        mode: evaluation.mode || 'COMPARTILHADA',
        reasons: evaluation.reasons,
        eligible: evaluation.eligible,
      };
    })
    .filter((item) => item.eligible)
    .map(({ eligible: _eligible, ...item }) => item)
    .sort(
      (a, b) =>
        a.score - b.score ||
        a.right.need.expiry_date.localeCompare(b.right.need.expiry_date) ||
        a.right.need.employee_id - b.right.need.employee_id ||
        a.right.session.order - b.right.session.order,
    );
}

function assertEverySessionPlannedExactlyOnce(
  needs: SimulatorTrainingNeed[],
  blocks: SimulatorTrainingBlock[],
): void {
  const expected = new Set<string>();
  for (const need of needs) {
    for (const session of need.sessions) expected.add(`${need.need_id}:${session.session_id}`);
  }
  const actual = new Map<string, number>();
  for (const block of blocks) {
    for (const item of block.assignments) {
      const key = `${item.need_id}:${item.session_id}`;
      actual.set(key, (actual.get(key) || 0) + 1);
    }
  }
  for (const key of expected) {
    if (actual.get(key) !== 1) throw new Error(`Sessão não planejada exatamente uma vez: ${key}`);
  }
  for (const key of actual.keys()) {
    if (!expected.has(key)) throw new Error(`Sessão inesperada no plano: ${key}`);
  }
}

/**
 * Planeja o TREINAMENTO COMPLETO de cada necessidade. O algoritmo tenta primeiro
 * manter uma dupla estável durante todo o treinamento. Quando isso não é
 * possível, decompõe apenas o pareamento (não o treinamento) e procura parceiro
 * sessão a sessão, inclusive entre Periódico/Semestral ou outros currículos,
 * desde que a compatibilidade canônica tenha sido declarada.
 */
export function buildSimulatorTrainingPlanV2(params: {
  needs: SimulatorTrainingNeed[];
  config: SimulatorTrainingPlanConfig;
}): SimulatorTrainingPlanProposal {
  validateConfig(params.config);
  const needs = params.needs.map((need) => ({
    ...need,
    equipment: normalizeEquipment(need.equipment),
    sessions: sessionsSorted(need),
  }));
  const needIds = new Set<string>();
  for (const need of needs) {
    validateNeed(need);
    if (needIds.has(need.need_id)) throw new Error(`need_id duplicado: ${need.need_id}`);
    needIds.add(need.need_id);
  }

  const orderedNeeds = [...needs].sort(
    (a, b) =>
      a.expiry_date.localeCompare(b.expiry_date) ||
      a.employee_id - b.employee_id ||
      a.need_id.localeCompare(b.need_id),
  );
  const fullPairedNeedIds = new Set<string>();
  const blocks: SimulatorTrainingBlock[] = [];
  let fullTrainingPairs = 0;

  for (const need of orderedNeeds) {
    if (fullPairedNeedIds.has(need.need_id)) continue;
    const candidates: FullTrainingPairCandidate[] = orderedNeeds
      .filter(
        (partner) =>
          partner.need_id !== need.need_id &&
          !fullPairedNeedIds.has(partner.need_id) &&
          canPairWholeTraining(need, partner, params.config),
      )
      .map((partner) => ({
        left: need,
        right: partner,
        score: fullTrainingPairScore(need, partner, params.config),
      }))
      .sort(
        (a, b) =>
          a.score - b.score ||
          a.right.expiry_date.localeCompare(b.right.expiry_date) ||
          a.right.employee_id - b.right.employee_id,
      );

    const best = candidates[0];
    if (!best) continue;
    fullPairedNeedIds.add(best.left.need_id);
    fullPairedNeedIds.add(best.right.need_id);
    fullTrainingPairs += 1;
    const leftSessions = sessionsSorted(best.left);
    const rightSessions = sessionsSorted(best.right);
    for (let index = 0; index < leftSessions.length; index += 1) {
      blocks.push(
        createPairedBlock({
          left: { need: best.left, session: leftSessions[index] },
          right: { need: best.right, session: rightSessions[index] },
          scope: 'TREINAMENTO_COMPLETO',
          config: params.config,
        }),
      );
    }
  }

  const sessionUnits: SessionUnit[] = orderedNeeds
    .filter((need) => !fullPairedNeedIds.has(need.need_id))
    .flatMap((need) => sessionsSorted(need).map((session) => ({ need, session })))
    .sort(
      (a, b) =>
        a.need.expiry_date.localeCompare(b.need.expiry_date) ||
        a.session.order - b.session.order ||
        a.need.employee_id - b.need.employee_id,
    );

  const remaining = [...sessionUnits];
  while (remaining.length > 0) {
    const source = remaining.shift() as SessionUnit;
    const candidates = sessionPairCandidates(source, remaining, params.config);
    const best = candidates[0];
    if (!best) {
      blocks.push(createSoloBlock(source, params.config));
      continue;
    }
    const partnerIndex = remaining.findIndex(
      (unit) =>
        unit.need.need_id === best.right.need.need_id &&
        unit.session.session_id === best.right.session.session_id,
    );
    if (partnerIndex < 0) {
      blocks.push(createSoloBlock(source, params.config));
      continue;
    }
    const partner = remaining.splice(partnerIndex, 1)[0];
    blocks.push(
      createPairedBlock({
        left: source,
        right: partner,
        scope: 'SESSAO',
        config: params.config,
      }),
    );
  }

  assertEverySessionPlannedExactlyOnce(needs, blocks);

  const sortedBlocks = blocks.sort(
    (a, b) =>
      a.allowed_end.localeCompare(b.allowed_end) ||
      a.allowed_start.localeCompare(b.allowed_start) ||
      a.block_id.localeCompare(b.block_id),
  );

  return {
    version: 'SIMULATOR_TRAINING_PLAN_V2',
    generated_for_date: params.config.reference_date,
    needs,
    blocks: sortedBlocks,
    summary: {
      trainings: needs.length,
      session_requirements: needs.reduce((sum, need) => sum + need.sessions.length, 0),
      full_training_pairs: fullTrainingPairs,
      full_training_paired_needs: fullPairedNeedIds.size,
      mixed_training_blocks: sortedBlocks.filter(
        (block) =>
          block.assignments.length === 2 &&
          block.assignments[0].qualification_type_id !== block.assignments[1].qualification_type_id,
      ).length,
      shared_blocks: sortedBlocks.filter((block) => block.mode === 'COMPARTILHADA').length,
      solo_blocks: sortedBlocks.filter((block) => block.mode === 'SOLO').length,
    },
  };
}

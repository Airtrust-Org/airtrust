export const SIMULATOR_PLANNING_STATUSES = [
  'PROPOSTO',
  'PLANEJADO',
  'AGUARDANDO_DISPONIBILIDADE',
  'CONFIRMADO',
  'AGENDADO',
  'REALIZADO',
  'REPLANEJAR',
  'CANCELADO',
] as const;

export type SimulatorPlanningStatus = (typeof SIMULATOR_PLANNING_STATUSES)[number];

export const SIMULATOR_PLANNING_WINDOW_POLICIES = ['FOLGA', 'QUINZENA_ATIVA', 'AMBOS'] as const;
export type SimulatorPlanningWindowPolicy = (typeof SIMULATOR_PLANNING_WINDOW_POLICIES)[number];
export type SimulatorPlanningWindowType = 'FOLGA' | 'QUINZENA_ATIVA';

export type LegacyTrainingStatus =
  'PLANEJADO' | 'CONFIRMADO' | 'EM_ANDAMENTO' | 'CONCLUIDO' | 'CANCELADO';

export type QuinzenaWindow = {
  id: number;
  numero: 1 | 2;
  data_inicio: string;
  data_fim: string;
};

export type SimulatorPlanningCandidate = {
  funcionarioId: number;
  funcionarioNome: string;
  funcao: string | null;
  qualificacaoTipoId: number;
  qualificacaoCodigo: string | null;
  qualificacaoNome: string;
  vencimento: string;
  modeloAeronave: string;
  quinzenaNumero: 1 | 2 | null;
  politicaJanela: SimulatorPlanningWindowPolicy;
  janelaTipo: SimulatorPlanningWindowType | null;
  janelaInicio: string | null;
  janelaFim: string | null;
  cargaHoras: number | null;
  cargaAtual: number;
  snapshot: unknown;
};

export type SimulatorPlanningPair = {
  left: SimulatorPlanningCandidate;
  right: SimulatorPlanningCandidate;
};

function isoDate(value: string): string {
  return String(value || '').slice(0, 10);
}

export function subtractDaysIso(value: string, days: number): string {
  const [year, month, day] = isoDate(value).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - Math.max(0, Math.trunc(days)));
  return date.toISOString().slice(0, 10);
}

export function mapPlanningStatusToLegacy(status: SimulatorPlanningStatus): LegacyTrainingStatus {
  if (status === 'CONFIRMADO' || status === 'AGENDADO') return 'CONFIRMADO';
  if (status === 'REALIZADO') return 'CONCLUIDO';
  if (status === 'CANCELADO') return 'CANCELADO';
  return 'PLANEJADO';
}

export function resolveQuinzenaNumero(value: unknown): 1 | 2 | null {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  if (normalized === 'primeira') return 1;
  if (normalized === 'segunda') return 2;
  return null;
}

function oppositeQuinzena(quinzenaNumero: 1 | 2): 1 | 2 {
  return quinzenaNumero === 1 ? 2 : 1;
}

export function selectPriorPlanningWindow(
  windows: QuinzenaWindow[],
  quinzenaNumero: 1 | 2 | null,
  vencimento: string,
  margemDias: number | null,
  policy: SimulatorPlanningWindowPolicy,
): { window: QuinzenaWindow; type: SimulatorPlanningWindowType } | null {
  if (!quinzenaNumero) return null;
  const target = margemDias == null ? isoDate(vencimento) : subtractDaysIso(vencimento, margemDias);
  const activeNumber = quinzenaNumero;
  const folgaNumber = oppositeQuinzena(quinzenaNumero);

  const candidates = windows
    .filter(
      (window) =>
        isoDate(window.data_fim) <= target && isoDate(window.data_fim) < isoDate(vencimento),
    )
    .map((window) => ({
      window,
      type: window.numero === activeNumber ? ('QUINZENA_ATIVA' as const) : ('FOLGA' as const),
    }))
    .filter(({ window, type }) => {
      if (window.numero !== activeNumber && window.numero !== folgaNumber) return false;
      if (policy === 'AMBOS') return true;
      return type === policy;
    })
    .sort((left, right) =>
      isoDate(right.window.data_fim).localeCompare(isoDate(left.window.data_fim)),
    );

  return candidates[0] || null;
}

export function selectPriorQuinzenaWindow(
  windows: QuinzenaWindow[],
  quinzenaNumero: 1 | 2 | null,
  vencimento: string,
  margemDias: number | null,
): QuinzenaWindow | null {
  return (
    selectPriorPlanningWindow(windows, quinzenaNumero, vencimento, margemDias, 'QUINZENA_ATIVA')
      ?.window || null
  );
}

export function estimateSessionCount(
  recurringHours: number | null,
  modelDurationsMinutes: number[],
): {
  totalMinutes: number | null;
  sessionCount: number | null;
  typicalSessionMinutes: number | null;
} {
  const rawDurations = modelDurationsMinutes.map((value) => Number(value));
  const durations = rawDurations.filter((value) => Number.isFinite(value) && value > 0);
  const recurringMinutes =
    recurringHours != null && recurringHours > 0 ? recurringHours * 60 : null;

  if (rawDurations.length === 0) {
    return {
      totalMinutes: recurringMinutes,
      sessionCount: null,
      typicalSessionMinutes: null,
    };
  }

  const frequency = new Map<number, number>();
  for (const duration of durations) frequency.set(duration, (frequency.get(duration) || 0) + 1);
  const typicalSessionMinutes =
    durations.length > 0
      ? [...frequency.entries()].sort(
          ([leftDuration, leftCount], [rightDuration, rightCount]) =>
            rightCount - leftCount || leftDuration - rightDuration,
        )[0][0]
      : null;
  const allDurationsKnown = durations.length === rawDurations.length;

  return {
    totalMinutes: allDurationsKnown
      ? durations.reduce((sum, value) => sum + value, 0)
      : recurringMinutes,
    sessionCount: rawDurations.length,
    typicalSessionMinutes,
  };
}

export function hasCompleteSimulatorSessionSchedule(
  expectedSessionCount: number | null,
  scheduledSessionCount: number,
): boolean {
  return (
    Number.isInteger(expectedSessionCount) &&
    Number(expectedSessionCount) > 0 &&
    Number.isInteger(scheduledSessionCount) &&
    scheduledSessionCount === Number(expectedSessionCount)
  );
}

function normalizeFunctionRole(value: string | null): 'PIC' | 'SIC' | 'OTHER' {
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

export function arePlanningCandidatesCompatible(
  left: SimulatorPlanningCandidate,
  right: SimulatorPlanningCandidate,
): boolean {
  return (
    left.funcionarioId !== right.funcionarioId &&
    left.qualificacaoTipoId === right.qualificacaoTipoId &&
    left.modeloAeronave === right.modeloAeronave &&
    Boolean(left.janelaInicio) &&
    left.janelaInicio === right.janelaInicio &&
    left.janelaFim === right.janelaFim
  );
}

function partnerScore(
  candidate: SimulatorPlanningCandidate,
  partner: SimulatorPlanningCandidate,
): [number, number, string, number] {
  const candidateRole = normalizeFunctionRole(candidate.funcao);
  const partnerRole = normalizeFunctionRole(partner.funcao);
  const complementary =
    (candidateRole === 'PIC' && partnerRole === 'SIC') ||
    (candidateRole === 'SIC' && partnerRole === 'PIC');
  const expiryDistance = Math.abs(
    Date.parse(`${isoDate(candidate.vencimento)}T00:00:00Z`) -
      Date.parse(`${isoDate(partner.vencimento)}T00:00:00Z`),
  );
  return [
    complementary ? 0 : 1,
    partner.cargaAtual,
    String(expiryDistance).padStart(18, '0'),
    partner.funcionarioId,
  ];
}

function compareTuple(left: Array<string | number>, right: Array<string | number>): number {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const a = left[index];
    const b = right[index];
    if (a === b) continue;
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a).localeCompare(String(b));
  }
  return 0;
}

export function pairSimulatorPlanningCandidates(candidates: SimulatorPlanningCandidate[]): {
  pairs: SimulatorPlanningPair[];
  unmatched: SimulatorPlanningCandidate[];
} {
  const remaining = [...candidates].sort(
    (left, right) =>
      isoDate(left.vencimento).localeCompare(isoDate(right.vencimento)) ||
      left.cargaAtual - right.cargaAtual ||
      left.funcionarioId - right.funcionarioId,
  );
  const pairs: SimulatorPlanningPair[] = [];
  const unmatched: SimulatorPlanningCandidate[] = [];

  while (remaining.length > 0) {
    const candidate = remaining.shift() as SimulatorPlanningCandidate;
    const compatibleIndexes = remaining
      .map((partner, index) => ({ partner, index }))
      .filter(({ partner }) => arePlanningCandidatesCompatible(candidate, partner))
      .sort((left, right) =>
        compareTuple(partnerScore(candidate, left.partner), partnerScore(candidate, right.partner)),
      );

    const best = compatibleIndexes[0];
    if (!best) {
      unmatched.push(candidate);
      continue;
    }

    const partner = remaining.splice(best.index, 1)[0];
    pairs.push({ left: candidate, right: partner });
  }

  return { pairs, unmatched };
}

export function buildPlanningKey(params: {
  qualificacaoTipoId: number;
  modeloAeronave: string;
  janelaInicio: string | null;
  janelaFim: string | null;
  funcionarioIds: number[];
}): string {
  const participants = [...params.funcionarioIds].sort((a, b) => a - b).join('-');
  return [
    'SIM',
    params.qualificacaoTipoId,
    params.modeloAeronave || 'UNIVERSAL',
    params.janelaInicio || 'SEM-JANELA',
    params.janelaFim || 'SEM-JANELA',
    participants,
  ].join(':');
}

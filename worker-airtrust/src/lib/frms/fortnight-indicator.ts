export type FrmsFortnightDataSource =
  | 'REAL'
  | 'DERIVADO'
  | 'ESTIMADO'
  | 'AUSENTE'
  | 'INCOMPLETO';

export type FrmsFortnightStatus = 'OK' | 'ATENCAO' | 'CRITICO' | 'INCOMPLETO';

export type FrmsFortnightTendencia =
  | 'ESTAVEL'
  | 'CRESCENTE'
  | 'REDUZINDO'
  | 'INDETERMINADA';

export type FrmsFortnightFreshness = 'COMPLETO' | 'PARCIAL' | 'ESTIMADO' | 'AUSENTE';

export type FrmsFortnightNaturezaDado =
  | 'PROJECAO'
  | 'CHECKIN_SUBJETIVO'
  | 'JORNADA_PLANEJADA'
  | 'JORNADA_REALIZADA'
  | 'ACUMULADO_LEGAL';

export type FrmsFortnightDecisaoCodigo =
  | 'INFORMA'
  | 'ALERTA'
  | 'EXIGE_OVERRIDE'
  | 'BLOQUEIA';

export type FrmsFortnightMitigacaoRecomendada =
  | 'TROCAR_TRIPULANTE'
  | 'REDUZIR_JORNADA'
  | 'INSERIR_REPOUSO'
  | 'REVISAR_CHECKIN'
  | 'AGUARDAR_SIGVOOS'
  | 'ACEITAR_COM_RESSALVA'
  | 'SEM_ACAO';

export interface FrmsFortnightModifier {
  codigo: string;
  descricao: string;
  impacto_score: number;
}

export interface FrmsFortnightLimiteReferencia {
  tipo: 'QUINZENA_DUTY' | 'DUTY_168H' | 'VOO_168H';
  valor_atual: number;
  valor_limite: number;
  pct_atingido: number;
}

export interface FrmsFortnightIndicator {
  periodo_inicio: string | null;
  periodo_fim: string | null;
  dia_periodo: number | null;
  total_dias_periodo: number | null;
  dias_consecutivos_com_jornada: number | null;
  dias_com_checkin_pendente: number | null;
  dias_com_dado_estimado: number | null;
  duty_time_periodo_min: number | null;
  duty_time_168h_min: number | null;
  horas_voo_periodo_min: number | null;
  horas_voo_168h_min: number | null;
  jornadas_periodo: number | null;
  apresentacoes_antes_0600: number | null;
  apresentacoes_antes_0700: number | null;
  menor_descanso_entre_jornadas_min: number | null;
  setores_periodo: number | null;
  sit_periods_estimados: number | null;
  fonte_periodo: FrmsFortnightDataSource;
  freshness_dado: FrmsFortnightFreshness;
  status_quinzena: FrmsFortnightStatus;
  score_acumulado: number | null;
  tendencia: FrmsFortnightTendencia;
  atenuadores_aplicados: FrmsFortnightModifier[];
  agravantes_aplicados: FrmsFortnightModifier[];
  natureza_dado: FrmsFortnightNaturezaDado;
  explicacao_operacional: string;
  mitigacao_recomendada: FrmsFortnightMitigacaoRecomendada;
  decisao: FrmsFortnightDecisaoCodigo;
  limite_referencia: FrmsFortnightLimiteReferencia | null;
  alertas_quinzena: string[];
  limitation_notes: string[];
}

export interface FrmsFortnightIndicatorItemSeed {
  data_operacional: string;
  funcionario_id: number;
  snapshot_status: 'OK' | 'ATENCAO' | 'CRITICO' | 'INCOMPLETO';
  checkin_status: 'RECEBIDO' | 'PENDENTE' | 'AUSENTE' | 'NAO_APLICAVEL';
  sleep_data_source: 'REAL' | 'ESTIMADO' | 'AUSENTE';
  wake_data_source: 'REAL' | 'ESTIMADO' | 'AUSENTE';
  jornada_data_source: 'REAL' | 'MANUAL' | 'ESTIMADO' | 'AUSENTE' | 'INCONSISTENTE';
  hora_apresentacao: string | null;
  hora_termino: string | null;
  duracao_jornada_minutos: number;
  horas_voo_minutos: number;
  teve_jornada: boolean;
  horas_sono?: number | null;
  kss_score?: number | null;
  effectiveness_pct?: number | null;
  dia_periodo_embarcado: number | null;
  total_dias_periodo: number | null;
}

export interface BuildFrmsFortnightIndicatorInput {
  items: FrmsFortnightIndicatorItemSeed[];
  windowStart: string;
  windowEnd: string;
}

interface PeriodAnchor {
  funcionario_id: number;
  periodo_inicio: string;
  periodo_fim: string;
  dia_periodo: number;
  total_dias_periodo: number;
}

const TECHNICAL_DEFAULT_DAILY_DUTY_LIMIT_MINUTES = 11 * 60;
const TECHNICAL_DEFAULT_DAILY_FLIGHT_LIMIT_MINUTES = 8 * 60;
const TECHNICAL_DEFAULT_168H_DUTY_LIMIT_MINUTES = 7 * TECHNICAL_DEFAULT_DAILY_DUTY_LIMIT_MINUTES;
const TECHNICAL_DEFAULT_168H_FLIGHT_LIMIT_MINUTES = 7 * TECHNICAL_DEFAULT_DAILY_FLIGHT_LIMIT_MINUTES;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function parseDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, (month || 1) - 1, day || 1));
}

function formatDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(iso: string, days: number): string {
  const date = parseDate(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDate(date);
}

function dayDiff(startIso: string, endIso: string): number {
  const start = parseDate(startIso).getTime();
  const end = parseDate(endIso).getTime();
  return Math.floor((end - start) / 86400000);
}

function parseTimeToMinutes(value: string | null): number | null {
  if (!value) return null;
  const match = /^(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function isTimeBefore(value: string | null, threshold: string): boolean {
  const time = parseTimeToMinutes(value);
  const thresholdMinutes = parseTimeToMinutes(threshold);
  if (time == null || thresholdMinutes == null) return false;
  return time < thresholdMinutes;
}

function resolvePeriodAnchor(item: FrmsFortnightIndicatorItemSeed): PeriodAnchor | null {
  const dia = item.dia_periodo_embarcado;
  const total = item.total_dias_periodo;
  if (!dia || !total || dia <= 0 || total <= 0 || dia > total) return null;

  const periodo_inicio = addDays(item.data_operacional, -(dia - 1));
  const periodo_fim = addDays(periodo_inicio, total - 1);
  return {
    funcionario_id: item.funcionario_id,
    periodo_inicio,
    periodo_fim,
    dia_periodo: dia,
    total_dias_periodo: total,
  };
}

function countMaxConsecutiveDays(items: FrmsFortnightIndicatorItemSeed[]): number {
  const dias = items
    .filter((item) => item.teve_jornada)
    .map((item) => item.data_operacional)
    .sort();
  if (dias.length === 0) return 0;

  let max = 1;
  let current = 1;
  for (let i = 1; i < dias.length; i += 1) {
    const delta = dayDiff(dias[i - 1], dias[i]);
    if (delta === 1) {
      current += 1;
    } else if (delta > 1) {
      current = 1;
    }
    if (current > max) max = current;
  }
  return max;
}

function resolveMinRestBetweenJornadas(items: FrmsFortnightIndicatorItemSeed[]): number | null {
  const jornadas = items
    .filter((item) => item.teve_jornada)
    .sort((a, b) => (a.data_operacional < b.data_operacional ? -1 : a.data_operacional > b.data_operacional ? 1 : 0));

  let minRest: number | null = null;
  for (let i = 1; i < jornadas.length; i += 1) {
    const prev = jornadas[i - 1];
    const curr = jornadas[i];
    const prevEnd = parseTimeToMinutes(prev.hora_termino);
    const currStart = parseTimeToMinutes(curr.hora_apresentacao);
    if (prevEnd == null || currStart == null) continue;

    const deltaDays = dayDiff(prev.data_operacional, curr.data_operacional);
    if (deltaDays < 0) continue;
    let rest = deltaDays * 1440 + currStart - prevEnd;
    if (rest < 0) rest += 1440;
    if (minRest == null || rest < minRest) minRest = rest;
  }

  return minRest;
}

function buildLimitReference(input: {
  dutyTimePeriodoMin: number;
  totalDiasPeriodo: number;
  rolling168h: { dutyMin: number; vooMin: number };
}): FrmsFortnightLimiteReferencia {
  const periodLimit = input.totalDiasPeriodo * TECHNICAL_DEFAULT_DAILY_DUTY_LIMIT_MINUTES;
  const references: FrmsFortnightLimiteReferencia[] = [
    {
      tipo: 'QUINZENA_DUTY',
      valor_atual: input.dutyTimePeriodoMin,
      valor_limite: periodLimit,
      pct_atingido: periodLimit > 0 ? round1((input.dutyTimePeriodoMin / periodLimit) * 100) : 0,
    },
    {
      tipo: 'DUTY_168H',
      valor_atual: input.rolling168h.dutyMin,
      valor_limite: TECHNICAL_DEFAULT_168H_DUTY_LIMIT_MINUTES,
      pct_atingido: round1((input.rolling168h.dutyMin / TECHNICAL_DEFAULT_168H_DUTY_LIMIT_MINUTES) * 100),
    },
    {
      tipo: 'VOO_168H',
      valor_atual: input.rolling168h.vooMin,
      valor_limite: TECHNICAL_DEFAULT_168H_FLIGHT_LIMIT_MINUTES,
      pct_atingido: round1((input.rolling168h.vooMin / TECHNICAL_DEFAULT_168H_FLIGHT_LIMIT_MINUTES) * 100),
    },
  ];

  return references.sort((a, b) => b.pct_atingido - a.pct_atingido)[0];
}

function resolveTendencia(
  scoped: FrmsFortnightIndicatorItemSeed[],
  currentDate: string,
  diasConsecutivosComJornada: number,
): FrmsFortnightTendencia {
  const sorted = [...scoped].sort((a, b) =>
    a.data_operacional < b.data_operacional ? -1 : a.data_operacional > b.data_operacional ? 1 : 0,
  );
  const currentIndex = sorted.findIndex((entry) => entry.data_operacional === currentDate);
  if (currentIndex < 0) return 'INDETERMINADA';

  const current = sorted[currentIndex];
  const previousJornadas = sorted.slice(0, currentIndex).filter((entry) => entry.teve_jornada);
  const previous = previousJornadas.length > 0 ? previousJornadas[previousJornadas.length - 1] : null;
  if (!current.teve_jornada && previous) return 'REDUZINDO';
  if (diasConsecutivosComJornada >= 4) return 'CRESCENTE';
  if (!previous) return current.teve_jornada ? 'ESTAVEL' : 'INDETERMINADA';

  const currentDuty = current.teve_jornada ? Math.max(0, current.duracao_jornada_minutos || 0) : 0;
  const previousDuty = Math.max(0, previous.duracao_jornada_minutos || 0);
  if (currentDuty >= previousDuty + 120) return 'CRESCENTE';
  if (currentDuty <= Math.max(0, previousDuty - 120)) return 'REDUZINDO';
  return 'ESTAVEL';
}

function resolveNaturezaDado(
  item: FrmsFortnightIndicatorItemSeed,
  periodFullyCoveredByQuery: boolean,
): FrmsFortnightNaturezaDado {
  if (!periodFullyCoveredByQuery) return 'PROJECAO';
  if (item.checkin_status === 'RECEBIDO' && !item.teve_jornada) return 'CHECKIN_SUBJETIVO';
  if (item.jornada_data_source === 'REAL') return 'JORNADA_REALIZADA';
  if (
    item.jornada_data_source === 'MANUAL' ||
    item.jornada_data_source === 'ESTIMADO' ||
    item.jornada_data_source === 'AUSENTE' ||
    item.jornada_data_source === 'INCONSISTENTE'
  ) {
    return 'JORNADA_PLANEJADA';
  }
  return 'ACUMULADO_LEGAL';
}

function buildModifiers(input: {
  scoped: FrmsFortnightIndicatorItemSeed[];
  totalDiasPeriodo: number;
  diasConsecutivosComJornada: number;
  diasComCheckinPendente: number;
  diasComDadoEstimado: number;
  apresentacoesAntes0600: number;
  apresentacoesAntes0700: number;
  menorDescansoEntreJornadasMin: number | null;
  jornadasPeriodo: number;
  dutyTimePeriodoMin: number;
  rolling168h: { dutyMin: number; vooMin: number };
  periodHasCritical: boolean;
  periodHasAttention: boolean;
}): { atenuadores: FrmsFortnightModifier[]; agravantes: FrmsFortnightModifier[] } {
  const atenuadores: FrmsFortnightModifier[] = [];
  const agravantes: FrmsFortnightModifier[] = [];
  const diasSemJornada = Math.max(0, input.totalDiasPeriodo - input.jornadasPeriodo);
  const avgDuty =
    input.jornadasPeriodo > 0 ? input.dutyTimePeriodoMin / input.jornadasPeriodo : 0;
  const lowSleepDays = input.scoped.filter(
    (entry) => entry.horas_sono != null && entry.horas_sono > 0 && entry.horas_sono < 6,
  ).length;
  const highKssDays = input.scoped.filter(
    (entry) => entry.kss_score != null && entry.kss_score >= 7,
  ).length;
  const lowEffectivenessDays = input.scoped.filter(
    (entry) => entry.effectiveness_pct != null && entry.effectiveness_pct < 70,
  ).length;

  if (diasSemJornada >= 2) {
    atenuadores.push({
      codigo: 'DIAS_SEM_JORNADA_NO_PERIODO',
      descricao: `${diasSemJornada} dia(s) sem jornada registrada na quinzena.`,
      impacto_score: -8,
    });
  }
  if (input.menorDescansoEntreJornadasMin != null && input.menorDescansoEntreJornadasMin >= 13 * 60) {
    atenuadores.push({
      codigo: 'REPOUSO_ENTRE_JORNADAS_MAIOR_13H',
      descricao: 'Menor descanso entre jornadas igual ou superior a 13h.',
      impacto_score: -6,
    });
  }
  if (input.jornadasPeriodo > 0 && avgDuty <= 6 * 60) {
    atenuadores.push({
      codigo: 'JORNADA_MEDIA_CURTA',
      descricao: 'Duty time medio da quinzena em ate 6h por jornada.',
      impacto_score: -5,
    });
  }
  if (input.apresentacoesAntes0700 === 0 && input.jornadasPeriodo > 0) {
    atenuadores.push({
      codigo: 'SEM_APRESENTACAO_CEDO',
      descricao: 'Sem apresentacoes antes de 07:00 no periodo analisado.',
      impacto_score: -3,
    });
  }
  if (input.diasComCheckinPendente === 0 && input.diasComDadoEstimado === 0) {
    atenuadores.push({
      codigo: 'DADOS_COMPLETOS_DO_PERIODO',
      descricao: 'Periodo sem check-in pendente e sem dado estimado no acumulado visivel.',
      impacto_score: -4,
    });
  }

  if (input.diasConsecutivosComJornada >= 5) {
    agravantes.push({
      codigo: 'SEQUENCIA_5_DIAS_OU_MAIS',
      descricao: `${input.diasConsecutivosComJornada} dia(s) consecutivos com jornada.`,
      impacto_score: 14,
    });
  } else if (input.diasConsecutivosComJornada >= 4) {
    agravantes.push({
      codigo: 'SEQUENCIA_4_DIAS',
      descricao: 'Quatro dias consecutivos com jornada.',
      impacto_score: 8,
    });
  }
  if (input.diasComCheckinPendente > 0) {
    agravantes.push({
      codigo: 'CHECKIN_PENDENTE_NO_PERIODO',
      descricao: `${input.diasComCheckinPendente} dia(s) com check-in pendente ou ausente.`,
      impacto_score: 10,
    });
  }
  if (input.diasComDadoEstimado > 0) {
    agravantes.push({
      codigo: 'DADO_ESTIMADO_NO_PERIODO',
      descricao: `${input.diasComDadoEstimado} dia(s) com sono, despertar ou jornada estimada/inconsistente.`,
      impacto_score: 7,
    });
  }
  if (input.apresentacoesAntes0600 > 0) {
    agravantes.push({
      codigo: 'APRESENTACAO_ANTES_0600',
      descricao: `${input.apresentacoesAntes0600} apresentacao(oes) antes de 06:00.`,
      impacto_score: 8,
    });
  } else if (input.apresentacoesAntes0700 >= 2) {
    agravantes.push({
      codigo: 'APRESENTACOES_CEDO_RECORRENTES',
      descricao: `${input.apresentacoesAntes0700} apresentacao(oes) antes de 07:00.`,
      impacto_score: 5,
    });
  }
  if (input.menorDescansoEntreJornadasMin != null && input.menorDescansoEntreJornadasMin < 10 * 60) {
    agravantes.push({
      codigo: 'REPOUSO_ENTRE_JORNADAS_MENOR_10H',
      descricao: 'Menor descanso entre jornadas abaixo de 10h.',
      impacto_score: 16,
    });
  }
  if (lowSleepDays > 0) {
    agravantes.push({
      codigo: 'SONO_INSUFICIENTE_NO_PERIODO',
      descricao: `${lowSleepDays} dia(s) com sono informado abaixo de 6h.`,
      impacto_score: 12,
    });
  }
  if (highKssDays > 0) {
    agravantes.push({
      codigo: 'KSS_ALTO_NO_PERIODO',
      descricao: `${highKssDays} dia(s) com KSS maior ou igual a 7.`,
      impacto_score: 12,
    });
  }
  if (lowEffectivenessDays > 0) {
    agravantes.push({
      codigo: 'EFETIVIDADE_BAIXA_NO_PERIODO',
      descricao: `${lowEffectivenessDays} dia(s) com efetividade calculada abaixo de 70%.`,
      impacto_score: 14,
    });
  }
  if (input.rolling168h.dutyMin >= TECHNICAL_DEFAULT_168H_DUTY_LIMIT_MINUTES * 0.8) {
    agravantes.push({
      codigo: 'DUTY_168H_ELEVADO',
      descricao: 'Duty time acumulado em 168h acima de 80% da referencia tecnica.',
      impacto_score: 10,
    });
  }
  if (input.periodHasCritical) {
    agravantes.push({
      codigo: 'RISCO_DIARIO_CRITICO_NO_PERIODO',
      descricao: 'Ao menos um dia da quinzena foi classificado como critico.',
      impacto_score: 18,
    });
  } else if (input.periodHasAttention) {
    agravantes.push({
      codigo: 'RISCO_DIARIO_ATENCAO_NO_PERIODO',
      descricao: 'Ao menos um dia da quinzena demanda atencao ou esta incompleto.',
      impacto_score: 7,
    });
  }

  return { atenuadores, agravantes };
}

function resolveStatusFromScore(input: {
  fontePeriodo: FrmsFortnightDataSource;
  score: number;
  periodHasCritical: boolean;
  periodHasAttention: boolean;
  diasComCheckinPendente: number;
  diasComDadoEstimado: number;
}): FrmsFortnightStatus {
  if (input.fontePeriodo === 'INCOMPLETO') return 'INCOMPLETO';
  if (input.periodHasCritical || input.score >= 75) return 'CRITICO';
  if (
    input.periodHasAttention ||
    input.diasComCheckinPendente > 0 ||
    input.diasComDadoEstimado > 0 ||
    input.score >= 45
  ) {
    return 'ATENCAO';
  }
  return 'OK';
}

function resolveDecisaoFromStatus(
  status: FrmsFortnightStatus,
  natureza: FrmsFortnightNaturezaDado,
): FrmsFortnightDecisaoCodigo {
  if (status === 'OK') return 'INFORMA';
  if (natureza === 'PROJECAO' || natureza === 'CHECKIN_SUBJETIVO') return 'ALERTA';
  if (status === 'CRITICO') return 'EXIGE_OVERRIDE';
  return 'ALERTA';
}

function resolveMitigacaoFromStatus(input: {
  status: FrmsFortnightStatus;
  aggravants: FrmsFortnightModifier[];
  diasComCheckinPendente: number;
  fontePeriodo: FrmsFortnightDataSource;
}): FrmsFortnightMitigacaoRecomendada {
  if (input.fontePeriodo === 'INCOMPLETO') return 'AGUARDAR_SIGVOOS';
  if (input.diasComCheckinPendente > 0) return 'REVISAR_CHECKIN';
  if (
    input.aggravants.some((modifier) =>
      ['REPOUSO_ENTRE_JORNADAS_MENOR_10H', 'SONO_INSUFICIENTE_NO_PERIODO'].includes(modifier.codigo),
    )
  ) {
    return 'INSERIR_REPOUSO';
  }
  if (
    input.aggravants.some((modifier) =>
      ['EFETIVIDADE_BAIXA_NO_PERIODO', 'RISCO_DIARIO_CRITICO_NO_PERIODO'].includes(modifier.codigo),
    )
  ) {
    return 'REDUZIR_JORNADA';
  }
  if (input.status === 'OK') return 'SEM_ACAO';
  return 'ACEITAR_COM_RESSALVA';
}

function buildExplanation(input: {
  status: FrmsFortnightStatus;
  score: number;
  limitReference: FrmsFortnightLimiteReferencia;
  atenuadores: FrmsFortnightModifier[];
  agravantes: FrmsFortnightModifier[];
  tendencia: FrmsFortnightTendencia;
}): string {
  const leadingAggravant = input.agravantes[0]?.codigo ?? 'SEM_AGRAVANTE_RELEVANTE';
  const leadingAttenuator = input.atenuadores[0]?.codigo ?? 'SEM_ATENUADOR_RELEVANTE';
  return [
    `Quinzena ${input.status} com score acumulado ${input.score}.`,
    `Referencia predominante: ${input.limitReference.tipo} em ${input.limitReference.pct_atingido}% do limite tecnico.`,
    `Tendencia ${input.tendencia}; principal agravante ${leadingAggravant}; principal atenuador ${leadingAttenuator}.`,
  ].join(' ');
}

function buildEmptyIndicator(): FrmsFortnightIndicator {
  return {
    periodo_inicio: null,
    periodo_fim: null,
    dia_periodo: null,
    total_dias_periodo: null,
    dias_consecutivos_com_jornada: null,
    dias_com_checkin_pendente: null,
    dias_com_dado_estimado: null,
    duty_time_periodo_min: null,
    duty_time_168h_min: null,
    horas_voo_periodo_min: null,
    horas_voo_168h_min: null,
    jornadas_periodo: null,
    apresentacoes_antes_0600: null,
    apresentacoes_antes_0700: null,
    menor_descanso_entre_jornadas_min: null,
    setores_periodo: null,
    sit_periods_estimados: null,
    fonte_periodo: 'AUSENTE',
    freshness_dado: 'AUSENTE',
    status_quinzena: 'INCOMPLETO',
    score_acumulado: null,
    tendencia: 'INDETERMINADA',
    atenuadores_aplicados: [],
    agravantes_aplicados: [],
    natureza_dado: 'PROJECAO',
    explicacao_operacional:
      'Periodo quinzenal ausente; acumulado nao foi calculado por falta de dia/total embarcado.',
    mitigacao_recomendada: 'AGUARDAR_SIGVOOS',
    decisao: 'ALERTA',
    limite_referencia: null,
    alertas_quinzena: [],
    limitation_notes: [],
  };
}

function buildRolling168h(
  employeeItems: FrmsFortnightIndicatorItemSeed[],
  anchorDate: string,
): { dutyMin: number; vooMin: number } {
  const startDate = addDays(anchorDate, -6);
  const relevant = employeeItems.filter(
    (item) =>
      item.teve_jornada &&
      item.data_operacional >= startDate &&
      item.data_operacional <= anchorDate,
  );

  return {
    dutyMin: relevant.reduce((sum, item) => sum + Math.max(0, item.duracao_jornada_minutos || 0), 0),
    vooMin: relevant.reduce((sum, item) => sum + Math.max(0, item.horas_voo_minutos || 0), 0),
  };
}

export function buildFrmsFortnightIndicatorMap(
  input: BuildFrmsFortnightIndicatorInput,
): Map<string, FrmsFortnightIndicator> {
  const result = new Map<string, FrmsFortnightIndicator>();
  const employeeMap = new Map<number, FrmsFortnightIndicatorItemSeed[]>();

  for (const item of input.items) {
    if (!employeeMap.has(item.funcionario_id)) {
      employeeMap.set(item.funcionario_id, []);
    }
    employeeMap.get(item.funcionario_id)!.push(item);
  }

  const periodItems = new Map<string, FrmsFortnightIndicatorItemSeed[]>();
  const periodAnchorsByEmployee = new Map<number, PeriodAnchor[]>();

  for (const item of input.items) {
    const anchor = resolvePeriodAnchor(item);
    if (!anchor) continue;
    const periodKey = `${anchor.funcionario_id}::${anchor.periodo_inicio}::${anchor.periodo_fim}`;
    if (!periodItems.has(periodKey)) {
      periodItems.set(periodKey, []);
    }
    periodItems.get(periodKey)!.push(item);
    if (!periodAnchorsByEmployee.has(anchor.funcionario_id)) {
      periodAnchorsByEmployee.set(anchor.funcionario_id, []);
    }
    periodAnchorsByEmployee.get(anchor.funcionario_id)!.push(anchor);
  }

  for (const item of input.items) {
    const itemKey = `${item.data_operacional}::${item.funcionario_id}`;
    const directAnchor = resolvePeriodAnchor(item);
    const fallbackAnchor =
      directAnchor == null
        ? (periodAnchorsByEmployee.get(item.funcionario_id) || []).find(
            (candidate) =>
              item.data_operacional >= candidate.periodo_inicio &&
              item.data_operacional <= candidate.periodo_fim,
          ) ?? null
        : null;
    const anchor = directAnchor ?? fallbackAnchor;
    if (!anchor) {
      const empty = buildEmptyIndicator();
      empty.alertas_quinzena = ['PERIODO_QUINZENA_AUSENTE'];
      empty.limitation_notes = [
        'Dia/total de período embarcado ausente para esta jornada.',
        'Sem quinzena explícita não é possível acumular o período com segurança.',
      ];
      result.set(itemKey, empty);
      continue;
    }

    const periodKey = `${anchor.funcionario_id}::${anchor.periodo_inicio}::${anchor.periodo_fim}`;
    const scoped =
      periodItems.get(periodKey)?.filter(
        (entry) =>
          entry.data_operacional >= anchor.periodo_inicio &&
          entry.data_operacional <= anchor.periodo_fim,
      ) ?? [];

    const dutyTimePeriodoMin = scoped.reduce(
      (sum, entry) => sum + (entry.teve_jornada ? Math.max(0, entry.duracao_jornada_minutos || 0) : 0),
      0,
    );
    const horasVooPeriodoMin = scoped.reduce(
      (sum, entry) => sum + (entry.teve_jornada ? Math.max(0, entry.horas_voo_minutos || 0) : 0),
      0,
    );
    const jornadasPeriodo = scoped.filter((entry) => entry.teve_jornada).length;
    const diasComCheckinPendente = scoped.filter(
      (entry) => entry.checkin_status === 'PENDENTE' || entry.checkin_status === 'AUSENTE',
    ).length;
    const diasComDadoEstimado = scoped.filter(
      (entry) =>
        entry.sleep_data_source === 'ESTIMADO' ||
        entry.wake_data_source === 'ESTIMADO' ||
        entry.jornada_data_source === 'ESTIMADO' ||
        entry.jornada_data_source === 'INCONSISTENTE',
    ).length;
    const apresentacoesAntes0600 = scoped.filter((entry) => isTimeBefore(entry.hora_apresentacao, '06:00')).length;
    const apresentacoesAntes0700 = scoped.filter((entry) => isTimeBefore(entry.hora_apresentacao, '07:00')).length;
    const diasConsecutivosComJornada = countMaxConsecutiveDays(scoped);
    const menorDescansoEntreJornadasMin = resolveMinRestBetweenJornadas(scoped);

    const employeeItems = employeeMap.get(item.funcionario_id) ?? [];
    const rolling168h = buildRolling168h(employeeItems, item.data_operacional);

    const periodFullyCoveredByQuery =
      input.windowStart <= anchor.periodo_inicio && input.windowEnd >= anchor.periodo_fim;

    const periodHasCritical = scoped.some((entry) => entry.snapshot_status === 'CRITICO');
    const periodHasAttention = scoped.some(
      (entry) => entry.snapshot_status === 'ATENCAO' || entry.snapshot_status === 'INCOMPLETO',
    );

    const alertasQuinzena: string[] = [];
    if (!periodFullyCoveredByQuery) alertasQuinzena.push('PERIODO_PARCIAL_NA_CONSULTA');
    if (diasComCheckinPendente > 0) alertasQuinzena.push('CHECKIN_PENDENTE_NO_PERIODO');
    if (diasComDadoEstimado > 0) alertasQuinzena.push('DADOS_ESTIMADOS_NO_PERIODO');
    if (periodHasCritical) alertasQuinzena.push('RISCO_DIARIO_CRITICO_NO_PERIODO');

    const limitReference = buildLimitReference({
      dutyTimePeriodoMin,
      totalDiasPeriodo: anchor.total_dias_periodo,
      rolling168h,
    });
    const tendencia = resolveTendencia(scoped, item.data_operacional, diasConsecutivosComJornada);
    const { atenuadores, agravantes } = buildModifiers({
      scoped,
      totalDiasPeriodo: anchor.total_dias_periodo,
      diasConsecutivosComJornada,
      diasComCheckinPendente,
      diasComDadoEstimado,
      apresentacoesAntes0600,
      apresentacoesAntes0700,
      menorDescansoEntreJornadasMin,
      jornadasPeriodo,
      dutyTimePeriodoMin,
      rolling168h,
      periodHasCritical,
      periodHasAttention,
    });
    const modifierImpact =
      agravantes.reduce((sum, modifier) => sum + modifier.impacto_score, 0) +
      atenuadores.reduce((sum, modifier) => sum + modifier.impacto_score, 0);
    const tendencyImpact = tendencia === 'CRESCENTE' ? 6 : tendencia === 'REDUZINDO' ? -4 : 0;
    const scoreAcumulado = round1(
      clamp(limitReference.pct_atingido * 0.65 + modifierImpact + tendencyImpact, 0, 100),
    );

    const limitationNotes: string[] = [
      'Indicador descritivo operacional; não é diagnóstico de fadiga fisiológica.',
      'Setores/trechos e sit periods ainda não entram de forma robusta neste cálculo.',
    ];
    if (!directAnchor && fallbackAnchor) {
      limitationNotes.push(
        'Dia/total do período não veio na linha atual; período inferido por jornadas vizinhas do mesmo tripulante.',
      );
    }
    if (!periodFullyCoveredByQuery) {
      limitationNotes.push(
        'Janela consultada não cobre toda a quinzena; os acumulados refletem apenas os dados visíveis na consulta.',
      );
    }

    const fontePeriodo: FrmsFortnightDataSource = periodFullyCoveredByQuery
      ? 'DERIVADO'
      : 'INCOMPLETO';
    const statusQuinzena = resolveStatusFromScore({
      fontePeriodo,
      score: scoreAcumulado,
      periodHasCritical,
      periodHasAttention,
      diasComCheckinPendente,
      diasComDadoEstimado,
    });
    const naturezaDado = resolveNaturezaDado(item, periodFullyCoveredByQuery);
    const decisao = resolveDecisaoFromStatus(statusQuinzena, naturezaDado);
    const mitigacaoRecomendada = resolveMitigacaoFromStatus({
      status: statusQuinzena,
      aggravants: agravantes,
      diasComCheckinPendente,
      fontePeriodo,
    });
    const freshnessDado: FrmsFortnightFreshness =
      fontePeriodo === 'INCOMPLETO'
        ? 'PARCIAL'
        : diasComDadoEstimado > 0
          ? 'ESTIMADO'
          : 'COMPLETO';

    if (scoreAcumulado >= 75) alertasQuinzena.push('SCORE_QUINZENAL_CRITICO');
    else if (scoreAcumulado >= 45) alertasQuinzena.push('SCORE_QUINZENAL_ATENCAO');
    for (const modifier of agravantes) {
      if (!alertasQuinzena.includes(modifier.codigo)) alertasQuinzena.push(modifier.codigo);
    }

    result.set(itemKey, {
      periodo_inicio: anchor.periodo_inicio,
      periodo_fim: anchor.periodo_fim,
      dia_periodo: anchor.dia_periodo,
      total_dias_periodo: anchor.total_dias_periodo,
      dias_consecutivos_com_jornada: diasConsecutivosComJornada,
      dias_com_checkin_pendente: diasComCheckinPendente,
      dias_com_dado_estimado: diasComDadoEstimado,
      duty_time_periodo_min: dutyTimePeriodoMin,
      duty_time_168h_min: rolling168h.dutyMin,
      horas_voo_periodo_min: horasVooPeriodoMin,
      horas_voo_168h_min: rolling168h.vooMin,
      jornadas_periodo: jornadasPeriodo,
      apresentacoes_antes_0600: apresentacoesAntes0600,
      apresentacoes_antes_0700: apresentacoesAntes0700,
      menor_descanso_entre_jornadas_min: menorDescansoEntreJornadasMin,
      setores_periodo: null,
      sit_periods_estimados: null,
      fonte_periodo: fontePeriodo,
      freshness_dado: freshnessDado,
      status_quinzena: statusQuinzena,
      score_acumulado: scoreAcumulado,
      tendencia,
      atenuadores_aplicados: atenuadores,
      agravantes_aplicados: agravantes,
      natureza_dado: naturezaDado,
      explicacao_operacional: buildExplanation({
        status: statusQuinzena,
        score: scoreAcumulado,
        limitReference,
        atenuadores,
        agravantes,
        tendencia,
      }),
      mitigacao_recomendada: mitigacaoRecomendada,
      decisao,
      limite_referencia: limitReference,
      alertas_quinzena: alertasQuinzena,
      limitation_notes: limitationNotes,
    });
  }

  return result;
}

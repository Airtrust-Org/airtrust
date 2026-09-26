import type { Origem, FrmsJornada, LimitesMap } from './types';
import { calcularDiaDoCiclo } from './db-service-jornadas';
import { calcEffectiveness, calcFatorizacao, type FrmsV2DailyAdjustments } from './calculos';
import {
  computeFlightHoursDelta,
  resolveOperationalPolicyV2,
  type FrmsOperationalPolicyV2,
} from './operational-policy-v2';
import type { FadigaBusinessPolicy } from './fadiga-score';
import {
  loadFrmsActivityRows,
  summarizeFrmsActivities,
  type FrmsActivitySnapshotRow,
} from './activity-context';
import { resolveFrmsOperationalContext, asOperationalLimitesMap } from './parameter-governance';
import {
  buildFrmsFortnightIndicatorMap,
  type FrmsFortnightIndicator,
} from './fortnight-indicator';
import {
  buildDecisaoFields,
  type FrmsDecisaoCodigo,
  type FrmsDecisaoPolicy,
  type FrmsLimiteReferencia,
  type FrmsMitigacaoRecomendada,
  type FrmsNaturezaDado,
} from './decision-policy';
import { classifyOperationalCrewRole } from './operational-crew';
import { deriveFrmsOperationalDecision, type FrmsDecisaoOperacionalEstado } from './frms-operational-decision';



export type FrmsOperationalSnapshotAlertCode =
  | 'CHECKIN_PENDENTE'
  | 'CHECKIN_CRITICO'
  | 'SONO_ESTIMADO'
  | 'SONO_INSUFICIENTE'
  | 'KSS_ALTO'
  | 'EFETIVIDADE_BAIXA'
  | 'JORNADA_SEM_FATORIZACAO'
  | 'ESCALADO_SEM_JORNADA_FRMS'
  | 'JORNADA_FRMS_SEM_ESCALA'
  | 'DADO_INCONSISTENTE';

export type FrmsOperationalSnapshotStatus = 'OK' | 'ATENCAO' | 'CRITICO' | 'INCOMPLETO';

export interface FrmsOperationalSnapshotItem {
  empresa_id: number;
  data_operacional: string;
  funcionario_id: number;
  tripulante_id: number;
  nome: string | null;
  nome_guerra: string | null;
  funcao: string | null;
  base: string | null;
  aeronave: string | null;

  escalado: boolean;
  escala_source: 'SIGVOOS' | 'MANUAL' | 'EVD' | 'AUSENTE';
  hora_apresentacao: string | null;
  hora_termino: string | null;
  horas_voo_minutos: number;
  horas_voo_frms_minutos?: number;
  simulador_minutos?: number;
  treinamento_minutos?: number;
  atividade_frms_minutos?: number;
  atividade_principal?: 'VOO' | 'TREINAMENTO' | 'SIMULADOR' | 'ATIVIDADE' | 'MISTA' | 'SEM_DADO';
  atividade_hora_inicio?: string | null;
  atividade_hora_fim?: string | null;
  atividade_rotulos?: string[];
  duracao_jornada_minutos: number;
  teve_jornada: boolean;
  teve_atividade_frms?: boolean;

  checkin_status: 'RECEBIDO' | 'PENDENTE' | 'AUSENTE' | 'NAO_APLICAVEL';
  checkin_horario: string | null;
  kss_score: number | null;
  horas_sono: number | null;
  qualidade_sono: number | null;
  hora_acordar: string | null;
  fadiga_score: number | null;
  status_operacional_checkin: string | null;

  effectiveness_pct: number | null;
  effectiveness_source?: 'REAL' | 'PROJETADA_APRESENTACAO' | 'PROJETADA_ATIVIDADE' | 'AUSENTE';
  nivel_fadiga_calculado: string | null;
  fatorizacao_status: 'CALCULADA' | 'PROJETADA' | 'AUSENTE';

  sleep_data_source: 'REAL' | 'ESTIMADO' | 'AUSENTE';
  wake_data_source: 'REAL' | 'ESTIMADO' | 'AUSENTE';
  jornada_data_source: 'REAL' | 'MANUAL' | 'ESTIMADO' | 'AUSENTE' | 'INCONSISTENTE';
  jornada_origem: Origem | null;
  snapshot_status: FrmsOperationalSnapshotStatus;
  fortnight_indicator: FrmsFortnightIndicator | null;
  recovery_credit_points?: number;
  recovery_state?: string | null;
  recovery_activity_type?: string | null;

  alertas: FrmsOperationalSnapshotAlertCode[];
  natureza_dado: FrmsNaturezaDado;
  causa: string;
  mitigacao_recomendada: FrmsMitigacaoRecomendada;
  decisao: FrmsDecisaoCodigo;
  limite_referencia: FrmsLimiteReferencia | null;

  /** Decisão operacional canônica V1 — produzida por frms-operational-decision.ts */
  estado_operacional: FrmsDecisaoOperacionalEstado;
  /** Até 3 motivos principais, priorizados por severidade */
  motivos_principais: string[];
  /** Texto curto da ação recomendada para exibição na fila de coordenação */
  acao_recomendada_texto: string;
}

export interface FrmsOperationalSnapshotSummary {
  total_tripulantes: number;
  total_escalados: number;
  checkins_recebidos: number;
  checkins_pendentes: number;
  alertas_criticos: number;
  alertas_atencao: number;
  dados_estimados: number;
  inconsistencias: number;
  sem_fatorizacao: number;
  quinzena_incompleta: number;
  quinzena_atencao: number;
  quinzena_critica: number;
}

export interface FrmsOperationalSnapshotResult {
  items: FrmsOperationalSnapshotItem[];
  summary: FrmsOperationalSnapshotSummary;
}

export interface FrmsOperationalSnapshotFilters {
  funcionario_id?: number;
  base?: string;
  aeronave?: string;
  status?: string[];
  include_inconsistencies?: boolean;
}

export interface BuildOperationalSnapshotInput {
  empresaId: number;
  policy?: FrmsDecisaoPolicy;
  hoje?: string;
  rows: {
    escalas: ScaleSnapshotRow[];
    jornadas: JornadaSnapshotRow[];
    checkins: CheckinSnapshotRow[];
    effectiveness: EffectivenessSnapshotRow[];
    activities?: FrmsActivitySnapshotRow[];
    funcionarios: FuncionarioSnapshotRow[];
  };
  filters?: FrmsOperationalSnapshotFilters;
}

interface ScaleSnapshotRow {
  data_operacional: string;
  funcionario_id: number;
  hora_apresentacao: string | null;
  hora_termino: string | null;
  aeronave_prefixo: string | null;
  aeronave_modelo: string | null;
}

interface JornadaSnapshotRow {
  data_operacional: string;
  funcionario_id: number;
  hora_apresentacao: string | null;
  hora_termino: string | null;
  horas_voo_minutos: number;
  duracao_jornada_minutos: number;
  origem: string | null;
  has_operational_data: number;
  is_manual_empty: number;
}

interface CheckinSnapshotRow {
  data_operacional: string;
  funcionario_id: number;
  hora_checkin: string | null;
  hora_apresentacao?: string | null;
  kss_score: number | null;
  horas_sono: number | null;
  qualidade_sono: number | null;
  wake_time: string | null;
  score_fadiga: number | null;
  nivel_fadiga: string | null;
  status_operacional: string | null;
  computed_risk_level: string | null;
}

interface EffectivenessSnapshotRow {
  data_operacional: string;
  funcionario_id: number;
  effectiveness_pct: number | null;
  effectiveness_nivel: string | null;
  source?: 'REAL' | 'PROJETADA_APRESENTACAO' | 'PROJETADA_ATIVIDADE';
  dia_periodo_embarcado?: number | null;
  total_dias_periodo?: number | null;
}

interface FuncionarioSnapshotRow {
  id: number;
  nome: string | null;
  nome_guerra: string | null;
  funcao: string | null;
  cargo: string | null;
  base: string | null;
  aeronave: string | null;
}

function normalizeText(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clockToMinutes(value: string | null | undefined): number | null {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) return null;
  const [hours, minutes] = value.split(':').map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function minutesToClock(value: number): string {
  const normalized = ((Math.round(value) % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

function projectSleepStart(wakeTime: string, sleepHours: number): string | null {
  const wake = clockToMinutes(wakeTime);
  if (wake == null || !Number.isFinite(sleepHours) || sleepHours <= 0 || sleepHours > 24) return null;
  return minutesToClock(wake - Math.round(sleepHours * 60));
}

export function calculateMorningEffectivenessProjection(input: {
  dataOperacional: string;
  funcionarioId: number;
  presentationTime: string | null | undefined;
  wakeTime: string | null | undefined;
  sleepHours: number | null | undefined;
  limites: LimitesMap;
  diaPeriodo?: number | null;
  totalDiasPeriodo?: number | null;
  plannedEndTime?: string | null;
  plannedActivityMinutes?: number | null;
  frmsFlightEquivalentMinutes?: number | null;
  v2Adjustments?: FrmsV2DailyAdjustments | null;
}): EffectivenessSnapshotRow | null {
  const presentation = normalizeText(input.presentationTime);
  const wakeTime = normalizeText(input.wakeTime);
  const sleepHours = Number(input.sleepHours ?? 0);
  if (!presentation || !wakeTime || !Number.isFinite(sleepHours) || sleepHours <= 0 || sleepHours > 24) return null;
  if (clockToMinutes(presentation) == null || clockToMinutes(wakeTime) == null) return null;

  const sleepStart = projectSleepStart(wakeTime, sleepHours);
  if (!sleepStart) return null;
  const [year, month] = input.dataOperacional.split('-').map(Number);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  const presentationMinutes = clockToMinutes(presentation)!;
  const plannedEnd = normalizeText(input.plannedEndTime);
  const plannedEndMinutes = clockToMinutes(plannedEnd);
  let plannedDutyMinutes = Math.max(0, Number(input.plannedActivityMinutes ?? 0));
  let endTime = presentation;
  if (plannedEndMinutes != null) {
    plannedDutyMinutes = plannedEndMinutes - presentationMinutes;
    if (plannedDutyMinutes < 0) plannedDutyMinutes += 24 * 60;
    endTime = plannedEnd!;
  } else if (plannedDutyMinutes > 0) {
    endTime = minutesToClock(presentationMinutes + plannedDutyMinutes);
  }
  const frmsFlightEquivalentMinutes = Math.max(0, Number(input.frmsFlightEquivalentMinutes ?? 0));

  const jornada = {
    id: `projection-${input.dataOperacional}::${input.funcionarioId}`,
    empresa_id: 0,
    tripulante_id: input.funcionarioId,
    data: input.dataOperacional,
    status: 'ES',
    hora_apresentacao: presentation,
    hora_termino: endTime,
    duracao_jornada_minutos: plannedDutyMinutes,
    horas_voo_minutos: frmsFlightEquivalentMinutes,
    hora_dormiu: sleepStart,
    hora_acordou: wakeTime,
    origem: 'MANUAL',
    tipo_base: 'HOME',
    tripulacao_aumentada: 0,
    aclimatado: 1,
  } as FrmsJornada;

  const fatorizacao = calcFatorizacao({
    jornada,
    repousoAnteriorMin: null,
    limites: input.limites,
    diasDoMes: daysInMonth,
    diaDoCiclo: input.diaPeriodo ?? null,
  });
  const effectiveness = calcEffectiveness(
    fatorizacao,
    input.limites,
    {
      hora_apresentacao: presentation,
      hora_termino: endTime,
      hora_dormiu: sleepStart,
      hora_acordou: wakeTime,
      dia_periodo_embarcado: input.diaPeriodo ?? null,
      total_dias_periodo: input.totalDiasPeriodo ?? null,
    },
    null,
    input.v2Adjustments ?? null,
  );

  return {
    data_operacional: input.dataOperacional,
    funcionario_id: input.funcionarioId,
    effectiveness_pct: effectiveness.effectiveness_pct,
    effectiveness_nivel: effectiveness.nivel,
    source: plannedDutyMinutes > 0 || frmsFlightEquivalentMinutes > 0 ? 'PROJETADA_ATIVIDADE' : 'PROJETADA_APRESENTACAO',
    dia_periodo_embarcado: input.diaPeriodo ?? null,
    total_dias_periodo: input.totalDiasPeriodo ?? null,
  };
}

function appendMorningEffectivenessProjections(
  rows: OperationalSnapshotRows,
  limites: LimitesMap,
  anchorByKey: Map<string, { dia: number; total: number }>,
  options?: {
    v2Policy: FrmsOperationalPolicyV2 | null;
    fadigaPolicy: FadigaBusinessPolicy;
    recoveryCreditByKey: Map<string, { points: number; state: string | null; activityType: string | null }>;
  },
): void {
  const existing = new Set(
    rows.effectiveness
      .filter((row) => row.effectiveness_pct != null && Number.isFinite(Number(row.effectiveness_pct)))
      .map((row) => `${row.data_operacional}::${Number(row.funcionario_id)}`),
  );
  const activitiesByKey = new Map<string, FrmsActivitySnapshotRow[]>();
  for (const activity of rows.activities) {
    const activityKey = `${activity.data_operacional}::${Number(activity.funcionario_id)}`;
    const current = activitiesByKey.get(activityKey) ?? [];
    current.push(activity);
    activitiesByKey.set(activityKey, current);
  }
  const realHvByKey = new Map<string, number>();
  for (const jornada of rows.jornadas) {
    const jornadaKey = `${jornada.data_operacional}::${Number(jornada.funcionario_id)}`;
    realHvByKey.set(
      jornadaKey,
      (realHvByKey.get(jornadaKey) ?? 0) + Math.max(0, Number(jornada.horas_voo_minutos ?? 0)),
    );
  }

  for (const checkin of rows.checkins) {
    const key = `${checkin.data_operacional}::${Number(checkin.funcionario_id)}`;
    if (existing.has(key)) continue;
    const anchor = anchorByKey.get(key);
    const activitySummary = summarizeFrmsActivities(activitiesByKey.get(key) ?? [], false);
    let v2Adjustments: FrmsV2DailyAdjustments | null = null;
    if (options?.v2Policy) {
      const previousDate = addDaysIso(checkin.data_operacional, -1);
      const previousKey = `${previousDate}::${Number(checkin.funcionario_id)}`;
      const previousActivities = summarizeFrmsActivities(activitiesByKey.get(previousKey) ?? [], false);
      const previousFrmsFlightMinutes =
        (realHvByKey.get(previousKey) ?? 0) + previousActivities.simulator_minutes;
      const generatedCredit = computeFlightHoursDelta(
        previousFrmsFlightMinutes,
        0,
        options.v2Policy,
      ).generatedCreditForNextDayPoints;
      v2Adjustments = {
        policy: options.v2Policy,
        fadigaPolicy: options.fadigaPolicy,
        recoveryCreditPoints: options.recoveryCreditByKey.get(previousKey)?.points ?? 0,
        flightHours: computeFlightHoursDelta(
          activitySummary.simulator_minutes,
          generatedCredit,
          options.v2Policy,
        ),
      };
    }

    const projected = calculateMorningEffectivenessProjection({
      dataOperacional: checkin.data_operacional,
      funcionarioId: Number(checkin.funcionario_id),
      presentationTime: checkin.hora_apresentacao,
      wakeTime: checkin.wake_time,
      sleepHours: checkin.horas_sono,
      limites,
      diaPeriodo: anchor?.dia ?? null,
      totalDiasPeriodo: anchor?.total ?? null,
      plannedEndTime: activitySummary.end_time,
      plannedActivityMinutes: activitySummary.activity_minutes,
      frmsFlightEquivalentMinutes: activitySummary.simulator_minutes,
      v2Adjustments,
    });
    if (!projected) continue;
    rows.effectiveness.push(projected);
    existing.add(key);
  }
}

function alertPriority(status: FrmsOperationalSnapshotStatus): number {
  if (status === 'CRITICO') return 0;
  if (status === 'INCOMPLETO') return 1;
  if (status === 'ATENCAO') return 2;
  return 3;
}

function dedupeAlerts(alerts: FrmsOperationalSnapshotAlertCode[]): FrmsOperationalSnapshotAlertCode[] {
  return [...new Set(alerts)];
}

function buildSummary(items: FrmsOperationalSnapshotItem[]): FrmsOperationalSnapshotSummary {
  return {
    total_tripulantes: items.length,
    total_escalados: items.filter((item) => item.escalado).length,
    checkins_recebidos: items.filter((item) => item.checkin_status === 'RECEBIDO').length,
    checkins_pendentes: items.filter(
      (item) => item.checkin_status === 'PENDENTE' || item.checkin_status === 'AUSENTE',
    ).length,
    alertas_criticos: items.filter((item) => item.snapshot_status === 'CRITICO').length,
    alertas_atencao: items.filter((item) => item.snapshot_status === 'ATENCAO').length,
    dados_estimados: items.filter(
      (item) =>
        item.sleep_data_source === 'ESTIMADO' ||
        item.wake_data_source === 'ESTIMADO' ||
        item.jornada_data_source === 'ESTIMADO',
    ).length,
    inconsistencias: items.filter((item) => item.alertas.includes('DADO_INCONSISTENTE')).length,
    sem_fatorizacao: items.filter((item) => item.alertas.includes('JORNADA_SEM_FATORIZACAO')).length,
    quinzena_incompleta: items.filter(
      (item) => item.fortnight_indicator?.status_quinzena === 'INCOMPLETO',
    ).length,
    quinzena_atencao: items.filter(
      (item) => item.fortnight_indicator?.status_quinzena === 'ATENCAO',
    ).length,
    quinzena_critica: items.filter(
      (item) => item.fortnight_indicator?.status_quinzena === 'CRITICO',
    ).length,
  };
}

function isCriticalCheckin(checkin: CheckinSnapshotRow | null): boolean {
  if (!checkin) return false;
  const risk = String(checkin.computed_risk_level || '').toLowerCase();
  if (risk === 'critical' || risk === 'unfit_for_duty') return true;

  const nivel = String(checkin.nivel_fadiga || '').toUpperCase();
  if (nivel === 'LARANJA' || nivel === 'VERMELHO' || nivel === 'CRITICO') return true;

  const statusOperacional = String(checkin.status_operacional || '').toUpperCase();
  return statusOperacional.includes('NAO_APTO') || statusOperacional.includes('CRITICO');
}

function resolveJornadaSource(jornada: JornadaSnapshotRow | null): {
  source: FrmsOperationalSnapshotItem['jornada_data_source'];
  origem: Origem | null;
} {
  if (!jornada) {
    return { source: 'AUSENTE', origem: null };
  }

  const origem = normalizeText(jornada.origem) as Origem | null;
  if (asNumber(jornada.is_manual_empty) === 1) {
    // Linha manual vazia é apenas placeholder criado pelo fluxo de check-in.
    // Não é uma jornada realizada nem evidência inconsistente.
    return { source: 'AUSENTE', origem: origem ?? 'MANUAL' };
  }

  if (origem === 'MANUAL') {
    return { source: 'MANUAL', origem };
  }

  if (asNumber(jornada.has_operational_data) === 1) {
    return { source: 'REAL', origem };
  }

  return { source: 'ESTIMADO', origem };
}

function includesStatusFilter(
  item: FrmsOperationalSnapshotItem,
  normalizedStatusFilter: Set<string> | null,
): boolean {
  if (!normalizedStatusFilter) return true;
  return normalizedStatusFilter.has(item.snapshot_status);
}

function includesBaseFilter(item: FrmsOperationalSnapshotItem, baseFilter: string | null): boolean {
  if (!baseFilter) return true;
  return String(item.base || '').trim().toUpperCase() === baseFilter;
}

function includesAeronaveFilter(
  item: FrmsOperationalSnapshotItem,
  aeronaveFilter: string | null,
): boolean {
  if (!aeronaveFilter) return true;
  const aeronave = `${item.aeronave || ''}`.trim().toUpperCase();
  return aeronave.includes(aeronaveFilter);
}

/**
 * Filtros de apresentação da resposta. NÃO devem ser aplicados antes do cálculo
 * do Compliance quinzenal — apenas ao conjunto que volta para o cliente.
 * `funcionario_id`, por ser tenant-safe, pode limitar também o contexto.
 */
function applyPresentationFilters(
  items: FrmsOperationalSnapshotItem[],
  filters: FrmsOperationalSnapshotFilters | undefined,
): FrmsOperationalSnapshotItem[] {
  const statusFilterSet =
    filters?.status && filters.status.length > 0
      ? new Set(filters.status.map((status) => status.trim().toUpperCase()).filter(Boolean))
      : null;
  const baseFilter = normalizeText(filters?.base)?.toUpperCase() ?? null;
  const aeronaveFilter = normalizeText(filters?.aeronave)?.toUpperCase() ?? null;

  return items.filter((item) => {
    if (
      typeof filters?.funcionario_id === 'number' &&
      item.funcionario_id !== filters.funcionario_id
    ) {
      return false;
    }

    if (!includesStatusFilter(item, statusFilterSet)) return false;
    if (!includesBaseFilter(item, baseFilter)) return false;
    if (!includesAeronaveFilter(item, aeronaveFilter)) return false;

    if (
      filters?.include_inconsistencies === false &&
      item.alertas.includes('DADO_INCONSISTENTE')
    ) {
      return false;
    }

    return true;
  });
}

function compareSnapshotItems(
  a: FrmsOperationalSnapshotItem,
  b: FrmsOperationalSnapshotItem,
): number {
  if (a.data_operacional !== b.data_operacional) {
    return a.data_operacional < b.data_operacional ? -1 : 1;
  }

  const statusDiff = alertPriority(a.snapshot_status) - alertPriority(b.snapshot_status);
  if (statusDiff !== 0) return statusDiff;

  const nomeA = String(a.nome || '').toUpperCase();
  const nomeB = String(b.nome || '').toUpperCase();
  if (nomeA !== nomeB) return nomeA < nomeB ? -1 : 1;
  return a.funcionario_id - b.funcionario_id;
}

function parseIsoDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, (month || 1) - 1, day || 1));
}

function formatIsoDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDaysIso(iso: string, days: number): string {
  const date = parseIsoDate(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return formatIsoDate(date);
}

function minIso(a: string, b: string): string {
  return a <= b ? a : b;
}

function maxIso(a: string, b: string): string {
  return a >= b ? a : b;
}

/** Dias de contexto anteriores necessários para o rolling de 168h (7 dias, incluindo a âncora). */
const ROLLING_168H_CONTEXT_LEAD_DAYS = 6;

export function buildFrmsOperationalSnapshot(
  input: BuildOperationalSnapshotInput,
): FrmsOperationalSnapshotResult {
  const escalaMap = new Map<string, ScaleSnapshotRow>();
  const jornadaMap = new Map<string, JornadaSnapshotRow>();
  const checkinMap = new Map<string, CheckinSnapshotRow>();
  const effectivenessMap = new Map<string, EffectivenessSnapshotRow>();
  const activityMap = new Map<string, FrmsActivitySnapshotRow[]>();
  const funcionarioMap = new Map<number, FuncionarioSnapshotRow>();

  for (const funcionario of input.rows.funcionarios) {
    const classification = classifyOperationalCrewRole(funcionario.funcao, funcionario.cargo);
    if (!classification.isOperational) continue;
    funcionarioMap.set(asNumber(funcionario.id), funcionario);
  }

  for (const row of input.rows.escalas) {
    const key = `${row.data_operacional}::${asNumber(row.funcionario_id)}`;
    const current = escalaMap.get(key);
    if (!current) {
      escalaMap.set(key, { ...row });
      continue;
    }

    escalaMap.set(key, {
      ...current,
      hora_apresentacao:
        [current.hora_apresentacao, row.hora_apresentacao].filter(Boolean).sort()[0] ??
        current.hora_apresentacao,
      hora_termino:
        [current.hora_termino, row.hora_termino].filter(Boolean).sort().slice(-1)[0] ??
        current.hora_termino,
      aeronave_prefixo: current.aeronave_prefixo ?? row.aeronave_prefixo,
      aeronave_modelo: current.aeronave_modelo ?? row.aeronave_modelo,
    });
  }

  for (const row of input.rows.jornadas) {
    const key = `${row.data_operacional}::${asNumber(row.funcionario_id)}`;
    const current = jornadaMap.get(key);

    if (!current) {
      jornadaMap.set(key, { ...row });
      continue;
    }

    jornadaMap.set(key, {
      ...current,
      hora_apresentacao:
        [current.hora_apresentacao, row.hora_apresentacao].filter(Boolean).sort()[0] ??
        current.hora_apresentacao,
      hora_termino:
        [current.hora_termino, row.hora_termino].filter(Boolean).sort().slice(-1)[0] ??
        current.hora_termino,
      horas_voo_minutos: asNumber(current.horas_voo_minutos) + asNumber(row.horas_voo_minutos),
      duracao_jornada_minutos:
        asNumber(current.duracao_jornada_minutos) + asNumber(row.duracao_jornada_minutos),
      origem: normalizeText(current.origem) ?? normalizeText(row.origem),
      has_operational_data:
        asNumber(current.has_operational_data) === 1 || asNumber(row.has_operational_data) === 1
          ? 1
          : 0,
      is_manual_empty:
        asNumber(current.is_manual_empty) === 1 || asNumber(row.is_manual_empty) === 1 ? 1 : 0,
    });
  }

  for (const row of input.rows.checkins) {
    const key = `${row.data_operacional}::${asNumber(row.funcionario_id)}`;
    const current = checkinMap.get(key);
    if (!current) {
      checkinMap.set(key, { ...row });
      continue;
    }

    const currentTs = `${current.data_operacional} ${current.hora_checkin || '00:00:00'}`;
    const nextTs = `${row.data_operacional} ${row.hora_checkin || '00:00:00'}`;
    if (nextTs > currentTs) {
      checkinMap.set(key, { ...row });
    }
  }

  for (const row of input.rows.effectiveness) {
    const key = `${row.data_operacional}::${asNumber(row.funcionario_id)}`;
    effectivenessMap.set(key, row);
  }

  for (const row of input.rows.activities ?? []) {
    const key = `${row.data_operacional}::${asNumber(row.funcionario_id)}`;
    const current = activityMap.get(key) ?? [];
    current.push(row);
    activityMap.set(key, current);
  }

  const keys = new Set<string>([
    ...escalaMap.keys(),
    ...jornadaMap.keys(),
    ...checkinMap.keys(),
    ...effectivenessMap.keys(),
    ...activityMap.keys(),
  ]);

  const items: FrmsOperationalSnapshotItem[] = [];

  for (const key of keys) {
    const [data_operacional, funcionarioIdRaw] = key.split('::');
    const funcionario_id = Number(funcionarioIdRaw);

    const escala = escalaMap.get(key) ?? null;
    const jornada = jornadaMap.get(key) ?? null;
    const checkin = checkinMap.get(key) ?? null;
    const efetividade = effectivenessMap.get(key) ?? null;
    const activities = activityMap.get(key) ?? [];
    const funcionario = funcionarioMap.get(funcionario_id) ?? null;
    if (!funcionario) continue;

    const escalado = Boolean(escala);
    const teveJornada =
      Boolean(jornada) &&
      asNumber(jornada?.has_operational_data) === 1 &&
      asNumber(jornada?.is_manual_empty) !== 1;
    const activitySummary = summarizeFrmsActivities(activities, teveJornada);
    const teveAtividadeFrms = teveJornada || activities.length > 0;

    // A apresentação declarada no check-in diário é a fonte canônica para o FRMS.
    // Escala/SIGVOOS continuam sendo evidência operacional, mas não substituem o dado
    // subjetivo obrigatório quando ele estiver ausente.
    const horaApresentacao = normalizeText(checkin?.hora_apresentacao);
    const horaTermino =
      (teveJornada ? normalizeText(jornada?.hora_termino) : null) ??
      normalizeText(escala?.hora_termino) ??
      normalizeText(activitySummary.end_time);

    const horasVooMinutos = teveJornada ? asNumber(jornada?.horas_voo_minutos) : 0;
    const horasVooFrmsMinutos = horasVooMinutos + activitySummary.simulator_minutes;
    // A duração canônica é produzida pelo pipeline após o check-in. O snapshot
    // não reconstrói jornada a partir de horários parciais/legados.
    const duracaoJornadaMinutos = teveJornada
      ? Math.max(0, asNumber(jornada?.duracao_jornada_minutos))
      : 0;

    const { source: jornadaDataSource, origem: jornadaOrigem } = resolveJornadaSource(jornada);

    const checkinStatus: FrmsOperationalSnapshotItem['checkin_status'] = checkin
      ? 'RECEBIDO'
      : escalado || teveAtividadeFrms
        ? 'PENDENTE'
        : 'NAO_APLICAVEL';

    const kss = checkin ? asNumber(checkin.kss_score, 0) : null;
    const horasSonoCheckin = checkin ? Number(checkin.horas_sono ?? 0) : null;

    // Sem check-in válido não há fallback de sono de 8 h nem despertar inferido.
    // O snapshot permanece incompleto/ausente e a decisão operacional deve refletir
    // a falta de evidência, em vez de fabricar precisão.
    const sleepDataSource: FrmsOperationalSnapshotItem['sleep_data_source'] =
      checkin && horasSonoCheckin != null && Number.isFinite(horasSonoCheckin) && horasSonoCheckin > 0
        ? 'REAL'
        : 'AUSENTE';

    const wakeDataSource: FrmsOperationalSnapshotItem['wake_data_source'] = checkin?.wake_time
      ? 'REAL'
      : 'AUSENTE';

    const horasSono = sleepDataSource === 'REAL' ? horasSonoCheckin : null;
    const horaAcordar = wakeDataSource === 'REAL' ? normalizeText(checkin?.wake_time) : null;

    const completeDailyCheckin =
      Boolean(checkin) &&
      Boolean(horaApresentacao) &&
      sleepDataSource === 'REAL' &&
      wakeDataSource === 'REAL';

    const effectivenessPctRaw = completeDailyCheckin ? efetividade?.effectiveness_pct : null;
    const effectivenessPct =
      effectivenessPctRaw == null ? null : Number(effectivenessPctRaw);
    const effectivenessPctNormalized =
      effectivenessPct != null && Number.isFinite(effectivenessPct)
        ? Number(effectivenessPct.toFixed(1))
        : null;
    const effectivenessSource: FrmsOperationalSnapshotItem['effectiveness_source'] =
      effectivenessPctNormalized == null
        ? 'AUSENTE'
        : efetividade?.source === 'PROJETADA_ATIVIDADE'
          ? 'PROJETADA_ATIVIDADE'
          : efetividade?.source === 'PROJETADA_APRESENTACAO'
            ? 'PROJETADA_APRESENTACAO'
            : 'REAL';

    const nivelFadigaCalculado = completeDailyCheckin
      ? normalizeText(efetividade?.effectiveness_nivel) ?? normalizeText(checkin?.nivel_fadiga)
      : null;

    const alertas: FrmsOperationalSnapshotAlertCode[] = [];

    if ((escalado || teveAtividadeFrms) && !checkin) {
      alertas.push('CHECKIN_PENDENTE');
    }

    if (isCriticalCheckin(checkin)) {
      alertas.push('CHECKIN_CRITICO');
    }

    // Check-in existente mas incompleto não é "recebido com precisão reduzida":
    // é dado insuficiente para o cálculo canônico e deve ficar fail-closed.
    if (checkin && !completeDailyCheckin) {
      alertas.push('DADO_INCONSISTENTE');
    }

    if ((horasSono ?? 0) > 0 && (horasSono ?? 0) < 6) {
      alertas.push('SONO_INSUFICIENTE');
    }

    if (kss != null && kss >= 7) {
      alertas.push('KSS_ALTO');
    }

    if (effectivenessPctNormalized != null && effectivenessPctNormalized < 70) {
      alertas.push('EFETIVIDADE_BAIXA');
    }

    if (teveJornada && effectivenessPctNormalized == null) {
      alertas.push('JORNADA_SEM_FATORIZACAO');
    }

    if (escalado && !teveJornada) {
      alertas.push('ESCALADO_SEM_JORNADA_FRMS');
    }

    if (!escalado && teveJornada) {
      alertas.push('JORNADA_FRMS_SEM_ESCALA');
    }

    if (jornadaDataSource === 'INCONSISTENTE') {
      alertas.push('DADO_INCONSISTENTE');
    }

    const alertasUnicos = dedupeAlerts(alertas);

    const snapshotStatus: FrmsOperationalSnapshotStatus = alertasUnicos.includes(
      'DADO_INCONSISTENTE',
    )
      ? 'INCOMPLETO'
      : alertasUnicos.some((code) => code === 'CHECKIN_CRITICO' || code === 'EFETIVIDADE_BAIXA')
        ? 'CRITICO'
        : alertasUnicos.length > 0
          ? 'ATENCAO'
          : 'OK';

    const baseItem = {
      empresa_id: input.empresaId,
      data_operacional,
      funcionario_id,
      tripulante_id: funcionario_id,
      nome: normalizeText(funcionario?.nome),
      nome_guerra: normalizeText(funcionario?.nome_guerra),
      funcao: normalizeText(funcionario?.funcao) ?? normalizeText(funcionario?.cargo),
      base: normalizeText(funcionario?.base),
      aeronave:
        normalizeText(escala?.aeronave_modelo) ??
        normalizeText(escala?.aeronave_prefixo) ??
        normalizeText(funcionario?.aeronave),

      escalado,
      escala_source: escalado
        ? 'EVD'
        : jornadaOrigem === 'SIGVOOS'
          ? 'SIGVOOS'
          : jornadaOrigem === 'MANUAL'
            ? 'MANUAL'
            : 'AUSENTE',
      hora_apresentacao: horaApresentacao,
      hora_termino: horaTermino,
      horas_voo_minutos: horasVooMinutos,
      horas_voo_frms_minutos: horasVooFrmsMinutos,
      simulador_minutos: activitySummary.simulator_minutes,
      treinamento_minutos: activitySummary.training_minutes,
      atividade_frms_minutos: duracaoJornadaMinutos + activitySummary.activity_minutes,
      atividade_principal: activitySummary.activity_type,
      atividade_hora_inicio: activitySummary.start_time,
      atividade_hora_fim: activitySummary.end_time,
      atividade_rotulos: activitySummary.labels,
      duracao_jornada_minutos: duracaoJornadaMinutos,
      teve_jornada: teveJornada,
      teve_atividade_frms: teveAtividadeFrms,

      checkin_status: checkinStatus,
      checkin_horario: normalizeText(checkin?.hora_checkin),
      kss_score: kss,
      horas_sono: horasSono,
      qualidade_sono: checkin ? asNumber(checkin.qualidade_sono, 0) : null,
      hora_acordar: horaAcordar,
      fadiga_score: checkin ? asNumber(checkin.score_fadiga, 0) : null,
      status_operacional_checkin: normalizeText(checkin?.status_operacional),

      effectiveness_pct: effectivenessPctNormalized,
      effectiveness_source: effectivenessSource,
      nivel_fadiga_calculado: nivelFadigaCalculado,
      fatorizacao_status:
        effectivenessPctNormalized == null
          ? 'AUSENTE'
          : effectivenessSource === 'PROJETADA_APRESENTACAO' ||
              effectivenessSource === 'PROJETADA_ATIVIDADE'
            ? 'PROJETADA'
            : 'CALCULADA',

      sleep_data_source: sleepDataSource,
      wake_data_source: wakeDataSource,
      jornada_data_source: jornadaDataSource,
      jornada_origem: jornadaOrigem,
      snapshot_status: snapshotStatus,
      fortnight_indicator: null,

      alertas: alertasUnicos,
    } as Omit<
      FrmsOperationalSnapshotItem,
      | 'natureza_dado'
      | 'causa'
      | 'mitigacao_recomendada'
      | 'decisao'
      | 'limite_referencia'
      | 'estado_operacional'
      | 'motivos_principais'
      | 'acao_recomendada_texto'
    >;

    const decisaoFields = buildDecisaoFields(baseItem as FrmsOperationalSnapshotItem, {
      hoje: input.hoje,
      policy: input.policy,
    });

    // Decisão operacional canônica V1 — fonte única de verdade para a fila da coordenação.
    // O perfil regulatório não é configurável por item neste momento (sem migration);
    // usamos true como padrão conservador para não bloquear tripulantes com dados válidos.
    // Dado complementar ausente (REDEMET, granular SIGVOOS) é registrado como nota, não
    // como NAO_AVALIADO global.
    const decisaoOperacional = deriveFrmsOperationalDecision({
      snapshot_status: snapshotStatus,
      alertas: alertasUnicos,
      tem_violacao_normativa: false, // sem resolvedor por tenant nesta fase — não há compliance violation ativa
      perfil_regulatorio_configurado: true,  // conservador: tenant com dados é considerado configurado
      dados_complementares_ausentes: [],
    });

    const item = {
      ...baseItem,
      ...decisaoFields,
      estado_operacional: decisaoOperacional.estado_operacional,
      motivos_principais: decisaoOperacional.motivos_principais,
      acao_recomendada_texto: decisaoOperacional.acao_recomendada_texto,
    };

    items.push(item);
  }

  const filtered = applyPresentationFilters(items, input.filters).sort(compareSnapshotItems);

  return {
    items: filtered,
    summary: buildSummary(filtered),
  };
}

export interface ListFrmsOperationalSnapshotParams {
  empresaId: number;
  dataInicio: string;
  dataFim: string;
  filters?: FrmsOperationalSnapshotFilters;
  policy?: FrmsDecisaoPolicy;
  hoje?: string;
}

function buildPlaceholders(length: number): string {
  return Array.from({ length }, () => '?').join(', ');
}


interface RecoveryCreditSnapshotRow {
  data_operacional: string;
  funcionario_id: number;
  recovery_credit_points: number;
  recovery_state: string | null;
  activity_type: string | null;
}

async function loadRecoveryCreditRows(
  db: D1Database,
  empresaId: number,
  start: string,
  end: string,
): Promise<RecoveryCreditSnapshotRow[]> {
  try {
    const rows = await db.prepare(
      `SELECT ra.reference_date AS data_operacional,
              CAST(ra.funcionario_id AS INTEGER) AS funcionario_id,
              COALESCE(ra.recovery_credit_points, 0) AS recovery_credit_points,
              ra.recovery_state,
              rd.activity_type
         FROM frms_recovery_assessment ra
         LEFT JOIN frms_recovery_activity_day rd
           ON rd.id = ra.recovery_day_id
          AND rd.empresa_id = ra.empresa_id
          AND rd.funcionario_id = ra.funcionario_id
          AND rd.deleted_at IS NULL
        WHERE ra.empresa_id = ? AND ra.reference_date >= ? AND ra.reference_date <= ?
          AND ra.deleted_at IS NULL`,
    ).bind(empresaId, start, end).all<RecoveryCreditSnapshotRow>();
    return rows.results ?? [];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? '');
    if (message.includes('no such column') || message.includes('no such table')) return [];
    throw error;
  }
}

interface OperationalSnapshotRows {
  escalas: ScaleSnapshotRow[];
  jornadas: JornadaSnapshotRow[];
  checkins: CheckinSnapshotRow[];
  effectiveness: EffectivenessSnapshotRow[];
  activities: FrmsActivitySnapshotRow[];
}

/**
 * Carrega escalas/jornadas/check-ins/fatorização para uma janela de datas.
 * Todas as consultas continuam ancoradas em `empresa_id` (tenant isolation).
 * A janela aqui é a janela INTERNA de cálculo — não necessariamente o intervalo
 * pedido pelo cliente.
 */
async function loadOperationalSnapshotRows(
  db: D1Database,
  empresaId: number,
  janelaInicio: string,
  janelaFim: string,
): Promise<OperationalSnapshotRows> {
  const [escalasResult, jornadasResult, checkinsResult, effectivenessResult, activities] = await Promise.all([
    db
      .prepare(
        `WITH escala_crew AS (
           SELECT
             e.data AS data_operacional,
             CAST(e.pic_id AS INTEGER) AS funcionario_id,
             e.hora_apresentacao,
             COALESCE(e.hora_corte_motor, e.hora_pouso_real, e.hora_pouso_previsto) AS hora_termino,
             e.aeronave_prefixo,
             e.aeronave_modelo
           FROM escala_voo_diaria e
           WHERE e.deleted_at IS NULL
             AND e.empresa_id = ?
             AND e.data >= ?
             AND e.data <= ?
             AND e.pic_id IS NOT NULL

           UNION ALL

           SELECT
             e.data AS data_operacional,
             CAST(e.sic_id AS INTEGER) AS funcionario_id,
             e.hora_apresentacao,
             COALESCE(e.hora_corte_motor, e.hora_pouso_real, e.hora_pouso_previsto) AS hora_termino,
             e.aeronave_prefixo,
             e.aeronave_modelo
           FROM escala_voo_diaria e
           WHERE e.deleted_at IS NULL
             AND e.empresa_id = ?
             AND e.data >= ?
             AND e.data <= ?
             AND e.sic_id IS NOT NULL
         )
         SELECT data_operacional, funcionario_id, hora_apresentacao, hora_termino, aeronave_prefixo, aeronave_modelo
         FROM escala_crew`,
      )
      .bind(empresaId, janelaInicio, janelaFim, empresaId, janelaInicio, janelaFim)
      .all<ScaleSnapshotRow>(),

    db
      .prepare(
        `SELECT
           j.data AS data_operacional,
           CAST(j.tripulante_id AS INTEGER) AS funcionario_id,
           j.hora_apresentacao,
           COALESCE(j.hora_termino, j.hora_corte_motor, j.hora_ultimo_pouso) AS hora_termino,
           COALESCE(j.horas_voo_minutos, 0) AS horas_voo_minutos,
           COALESCE(j.duracao_jornada_minutos, 0) AS duracao_jornada_minutos,
           j.origem,
           CASE
             WHEN j.hora_apresentacao IS NOT NULL
               OR COALESCE(j.horas_voo_minutos, 0) > 0
               OR COALESCE(j.duracao_jornada_minutos, 0) > 0
               OR j.hora_termino IS NOT NULL
             THEN 1 ELSE 0
           END AS has_operational_data,
           CASE
             WHEN UPPER(COALESCE(j.origem, 'MANUAL')) = 'MANUAL'
              AND j.hora_apresentacao IS NULL
              AND j.hora_termino IS NULL
              AND COALESCE(j.horas_voo_minutos, 0) = 0
              AND COALESCE(j.duracao_jornada_minutos, 0) = 0
             THEN 1 ELSE 0
           END AS is_manual_empty
         FROM frms_jornada j
         JOIN funcionarios f ON f.id = CAST(j.tripulante_id AS INTEGER)
         WHERE j.deleted_at IS NULL
           AND f.deleted_at IS NULL
           AND f.empresa_id = ?
           AND j.data >= ?
           AND j.data <= ?`,
      )
      .bind(empresaId, janelaInicio, janelaFim)
      .all<JornadaSnapshotRow>(),

    db
      .prepare(
        `SELECT
           ch.data_checkin AS data_operacional,
           CAST(ch.funcionario_id AS INTEGER) AS funcionario_id,
           ch.hora_checkin,
           ch.jornada_inicio_prevista AS hora_apresentacao,
           ch.kss_score,
           ch.horas_sono,
           ch.qualidade_sono,
           ch.wake_time,
           ch.score_fadiga,
           ch.nivel_fadiga,
           ch.status_operacional,
           ch.computed_risk_level
         FROM frms_fadiga_checkin ch
         WHERE ch.deleted_at IS NULL
           AND ch.empresa_id = ?
           AND ch.data_checkin >= ?
           AND ch.data_checkin <= ?`,
      )
      .bind(empresaId, janelaInicio, janelaFim)
      .all<CheckinSnapshotRow>(),

    db
      .prepare(
        `WITH ranked AS (
           SELECT
             j.data AS data_operacional,
             CAST(j.tripulante_id AS INTEGER) AS funcionario_id,
             fj.effectiveness_pct,
             fj.effectiveness_nivel,
             fj.dia_periodo_embarcado,
             fj.total_dias_periodo,
             ROW_NUMBER() OVER (
               PARTITION BY j.data, j.tripulante_id
               ORDER BY fj.created_at DESC, fj.id DESC
             ) AS rn
           FROM frms_fatorizacao_jornada fj
           JOIN frms_jornada j ON j.id = fj.jornada_id
           JOIN funcionarios f ON f.id = CAST(j.tripulante_id AS INTEGER)
           WHERE fj.deleted_at IS NULL
             AND j.deleted_at IS NULL
             AND f.deleted_at IS NULL
             AND f.empresa_id = ?
             AND j.data >= ?
             AND j.data <= ?
         )
         SELECT
           data_operacional,
           funcionario_id,
           effectiveness_pct,
           effectiveness_nivel,
           dia_periodo_embarcado,
           total_dias_periodo
         FROM ranked
         WHERE rn = 1`,
      )
      .bind(empresaId, janelaInicio, janelaFim)
      .all<EffectivenessSnapshotRow>(),

    loadFrmsActivityRows(db, empresaId, janelaInicio, janelaFim),
  ]);

  return {
    escalas: escalasResult.results || [],
    jornadas: jornadasResult.results || [],
    checkins: checkinsResult.results || [],
    effectiveness: effectivenessResult.results || [],
    activities,
  };
}

function collectCandidateIds(rows: OperationalSnapshotRows): number[] {
  const candidateIds = new Set<number>();
  for (const row of rows.escalas) candidateIds.add(asNumber(row.funcionario_id));
  for (const row of rows.jornadas) candidateIds.add(asNumber(row.funcionario_id));
  for (const row of rows.checkins) candidateIds.add(asNumber(row.funcionario_id));
  for (const row of rows.effectiveness) candidateIds.add(asNumber(row.funcionario_id));
  for (const row of rows.activities) candidateIds.add(asNumber(row.funcionario_id));
  return Array.from(candidateIds).filter((id) => id > 0);
}

async function loadOperationalFuncionarios(
  db: D1Database,
  empresaId: number,
  ids: number[],
): Promise<FuncionarioSnapshotRow[]> {
  if (ids.length === 0) return [];
  const placeholders = buildPlaceholders(ids.length);
  const result = await db
    .prepare(
      `SELECT
         id,
         nome,
         guerra AS nome_guerra,
         funcao,
         cargo,
         base,
         aeronave
       FROM funcionarios
       WHERE deleted_at IS NULL
         AND empresa_id = ?
         AND id IN (${placeholders})`,
    )
    .bind(empresaId, ...ids)
    .all<FuncionarioSnapshotRow>();

  return result.results || [];
}

function anchorFromDiaTotal(
  data: string,
  dia: number | null | undefined,
  total: number | null | undefined,
): { periodoInicio: string; periodoFim: string } | null {
  if (
    dia == null ||
    total == null ||
    !Number.isFinite(dia) ||
    !Number.isFinite(total) ||
    dia <= 0 ||
    total <= 0 ||
    dia > total
  ) {
    return null;
  }
  const periodoInicio = addDaysIso(data, -(dia - 1));
  const periodoFim = addDaysIso(periodoInicio, total - 1);
  return { periodoInicio, periodoFim };
}

export async function listFrmsOperationalSnapshot(
  db: D1Database,
  params: ListFrmsOperationalSnapshotParams,
): Promise<FrmsOperationalSnapshotResult> {
  const operationalContext = await resolveFrmsOperationalContext(db, {
    empresaId: params.empresaId,
    referenceAt: params.hoje ?? params.dataFim,
  });
  const limites = asOperationalLimitesMap(operationalContext.parameters, operationalContext.cyclePolicyApproved);

  const requestedStart = params.dataInicio;
  const requestedEnd = params.dataFim;

  // `funcionario_id` já chega resolvido/tenant-safe pelas rotas (self scope força o
  // próprio funcionário). Quando presente, também limita o contexto de cálculo.
  const scopedFuncionarioId =
    typeof params.filters?.funcionario_id === 'number' && params.filters.funcionario_id > 0
      ? params.filters.funcionario_id
      : null;

  // ------------------------------------------------------------------------
  // Fase A — carrega o intervalo solicitado pelo cliente e descobre as âncoras
  // reais de período embarcado que contêm os dias pedidos.
  // ------------------------------------------------------------------------
  const requestedRows = await loadOperationalSnapshotRows(
    db,
    params.empresaId,
    requestedStart,
    requestedEnd,
  );

  const persistedAnchorByKey = new Map<string, { dia: number | null; total: number | null }>();
  for (const row of requestedRows.effectiveness) {
    persistedAnchorByKey.set(`${row.data_operacional}::${asNumber(row.funcionario_id)}`, {
      dia: row.dia_periodo_embarcado == null ? null : Number(row.dia_periodo_embarcado),
      total: row.total_dias_periodo == null ? null : Number(row.total_dias_periodo),
    });
  }

  const requestedKeys = new Set<string>();
  for (const row of requestedRows.escalas)
    requestedKeys.add(`${row.data_operacional}::${asNumber(row.funcionario_id)}`);
  for (const row of requestedRows.jornadas)
    requestedKeys.add(`${row.data_operacional}::${asNumber(row.funcionario_id)}`);
  for (const row of requestedRows.checkins)
    requestedKeys.add(`${row.data_operacional}::${asNumber(row.funcionario_id)}`);
  for (const row of requestedRows.effectiveness)
    requestedKeys.add(`${row.data_operacional}::${asNumber(row.funcionario_id)}`);

  // Âncoras resolvidas (dia/total) para os dias solicitados — reaproveitadas depois
  // para não repetir a chamada a calcularDiaDoCiclo().
  const resolvedAnchorByKey = new Map<string, { dia: number; total: number }>();
  let minPeriodoInicio: string | null = null;
  let maxPeriodoFim: string | null = null;

  await Promise.all(
    Array.from(requestedKeys).map(async (key) => {
      const [data, funcRaw] = key.split('::');
      const funcionarioId = Number(funcRaw);
      if (scopedFuncionarioId != null && funcionarioId !== scopedFuncionarioId) return;

      const persisted = persistedAnchorByKey.get(key);
      let dia = persisted?.dia ?? null;
      let total = persisted?.total ?? null;

      if (anchorFromDiaTotal(data, dia, total) == null) {
        const period = await calcularDiaDoCiclo(db, funcionarioId, data);
        if (period) {
          dia = period.dia;
          total = period.total;
        }
      }

      const anchor = anchorFromDiaTotal(data, dia, total);
      if (!anchor) return; // sem período real resolvível → fica INCOMPLETO (fail-closed)

      resolvedAnchorByKey.set(key, { dia: dia as number, total: total as number });
      minPeriodoInicio =
        minPeriodoInicio == null || anchor.periodoInicio < minPeriodoInicio
          ? anchor.periodoInicio
          : minPeriodoInicio;
      maxPeriodoFim =
        maxPeriodoFim == null || anchor.periodoFim > maxPeriodoFim
          ? anchor.periodoFim
          : maxPeriodoFim;
    }),
  );

  // ------------------------------------------------------------------------
  // Janela INTERNA de contexto: cobre todo o período embarcado que contém os
  // dias solicitados + 6 dias anteriores para o rolling de 168h. Sem período
  // real, mantém a janela solicitada (não fabrica contexto).
  // ------------------------------------------------------------------------
  const contextStart =
    minPeriodoInicio != null
      ? minIso(addDaysIso(minPeriodoInicio, -ROLLING_168H_CONTEXT_LEAD_DAYS), requestedStart)
      : requestedStart;
  const contextEnd = maxPeriodoFim != null ? maxIso(maxPeriodoFim, requestedEnd) : requestedEnd;

  // ------------------------------------------------------------------------
  // Fase B — carrega os dados do contexto (reaproveita a Fase A quando a janela
  // não muda).
  // ------------------------------------------------------------------------
  const contextRows =
    contextStart === requestedStart && contextEnd === requestedEnd
      ? requestedRows
      : await loadOperationalSnapshotRows(db, params.empresaId, contextStart, contextEnd);

  const recoveryCredits = await loadRecoveryCreditRows(db, params.empresaId, contextStart, contextEnd);
  const recoveryCreditByKey = new Map(
    recoveryCredits.map((row) => [
      `${row.data_operacional}::${Number(row.funcionario_id)}`,
      {
        points: Number(row.recovery_credit_points || 0),
        state: row.recovery_state ?? null,
        activityType: row.activity_type ?? null,
      },
    ]),
  );

  const ids = collectCandidateIds(contextRows).filter(
    (id) => scopedFuncionarioId == null || id === scopedFuncionarioId,
  );
  const funcionarios = await loadOperationalFuncionarios(db, params.empresaId, ids);

  const exclusionMetrics = funcionarios.reduce(
    (acc, funcionario) => {
      const classification = classifyOperationalCrewRole(funcionario.funcao, funcionario.cargo);
      if (classification.isOperational) {
        acc.operational += 1;
        return acc;
      }

      if (classification.exclusionReason === 'MISSING_ROLE') {
        acc.missingRole += 1;
        return acc;
      }

      acc.nonOperational += 1;
      return acc;
    },
    { operational: 0, missingRole: 0, nonOperational: 0 },
  );

  const missingFuncionario = ids.filter((id) => !funcionarios.some((funcionario) => asNumber(funcionario.id) === id))
    .length;

  if (exclusionMetrics.nonOperational > 0 || exclusionMetrics.missingRole > 0 || missingFuncionario > 0) {
    console.info('[frms] operational snapshot filtered non-operational candidates', {
      empresaId: params.empresaId,
      totalCandidates: ids.length,
      operationalCandidates: exclusionMetrics.operational,
      filteredNonOperational: exclusionMetrics.nonOperational,
      filteredMissingRole: exclusionMetrics.missingRole,
      filteredMissingFuncionario: missingFuncionario,
    });
  }

  // Para a decisão pré-voo da manhã, um check-in completo já permite calcular
  // a efetividade cognitiva projetada no instante da apresentação. Isso é
  // read-only e não transforma uma jornada planejada em jornada realizada.
  const v2Policy =
    operationalContext.parameters.FRMS_V2_ENABLED === 1
      ? resolveOperationalPolicyV2(operationalContext.parameters)
      : null;
  appendMorningEffectivenessProjections(contextRows, limites, resolvedAnchorByKey, {
    v2Policy,
    fadigaPolicy: operationalContext.fadigaPolicy,
    recoveryCreditByKey,
  });

  // Snapshot montado sobre TODO o contexto. Só `funcionario_id` (tenant-safe) pode
  // restringir aqui — os filtros de apresentação (status/base/aeronave/
  // include_inconsistencies) são aplicados depois, na resposta, para não remover
  // linhas históricas necessárias ao acumulado quinzenal.
  const snapshot = buildFrmsOperationalSnapshot({
    empresaId: params.empresaId,
    policy: params.policy,
    hoje: params.hoje,
    rows: {
      escalas: contextRows.escalas,
      jornadas: contextRows.jornadas,
      checkins: contextRows.checkins,
      effectiveness: contextRows.effectiveness,
      activities: contextRows.activities,
      funcionarios,
    },
    filters: scopedFuncionarioId != null ? { funcionario_id: scopedFuncionarioId } : undefined,
  });

  const effectivenessByKey = new Map<string, EffectivenessSnapshotRow>();
  for (const row of contextRows.effectiveness) {
    const key = `${row.data_operacional}::${Number(row.funcionario_id)}`;
    effectivenessByKey.set(key, row);
  }

  const derivedFortnightByKey = new Map<
    string,
    { dia_periodo_embarcado: number | null; total_dias_periodo: number | null }
  >();
  for (const row of contextRows.effectiveness) {
    const key = `${row.data_operacional}::${Number(row.funcionario_id)}`;
    derivedFortnightByKey.set(key, {
      dia_periodo_embarcado:
        row.dia_periodo_embarcado == null ? null : Number(row.dia_periodo_embarcado),
      total_dias_periodo: row.total_dias_periodo == null ? null : Number(row.total_dias_periodo),
    });
  }

  // Âncoras já resolvidas na Fase A (via calcularDiaDoCiclo) para os dias pedidos.
  for (const [key, anchor] of resolvedAnchorByKey) {
    if (derivedFortnightByKey.get(key)?.dia_periodo_embarcado == null) {
      derivedFortnightByKey.set(key, {
        dia_periodo_embarcado: anchor.dia,
        total_dias_periodo: anchor.total,
      });
    }
  }

  // calcularDiaDoCiclo() só para os dias efetivamente solicitados que ainda não
  // têm âncora; os demais dias do período são inferidos por jornadas vizinhas do
  // mesmo tripulante dentro de buildFrmsFortnightIndicatorMap.
  const missingFortnightKeys = snapshot.items.filter((item) => {
    if (item.data_operacional < requestedStart || item.data_operacional > requestedEnd) {
      return false;
    }
    const key = `${item.data_operacional}::${item.funcionario_id}`;
    return derivedFortnightByKey.get(key)?.dia_periodo_embarcado == null;
  });

  await Promise.all(
    missingFortnightKeys.map(async (item) => {
      const key = `${item.data_operacional}::${item.funcionario_id}`;
      const period = await calcularDiaDoCiclo(db, item.funcionario_id, item.data_operacional);
      if (!period) return;
      derivedFortnightByKey.set(key, {
        dia_periodo_embarcado: period.dia,
        total_dias_periodo: period.total,
      });
    }),
  );

  const fortnightIndicatorMap = buildFrmsFortnightIndicatorMap({
    items: snapshot.items.map((item) => {
      const itemKey = `${item.data_operacional}::${Number(item.funcionario_id)}`;
      const effectivenessRow = effectivenessByKey.get(itemKey);
      const derivedFortnight = derivedFortnightByKey.get(itemKey);
      return {
        data_operacional: item.data_operacional,
        funcionario_id: item.funcionario_id,
        snapshot_status: item.snapshot_status,
        checkin_status: item.checkin_status,
        sleep_data_source: item.sleep_data_source,
        wake_data_source: item.wake_data_source,
        jornada_data_source: item.jornada_data_source,
        hora_apresentacao: item.hora_apresentacao ?? item.atividade_hora_inicio ?? null,
        hora_termino: item.hora_termino,
        duracao_jornada_minutos: item.duracao_jornada_minutos,
        horas_voo_minutos: item.horas_voo_minutos,
        horas_voo_frms_minutos: item.horas_voo_frms_minutos,
        atividade_frms_minutos: item.atividade_frms_minutos,
        simulador_minutos: item.simulador_minutos,
        treinamento_minutos: item.treinamento_minutos,
        teve_jornada: item.teve_jornada,
        teve_atividade_frms: item.teve_atividade_frms,
        atividade_principal: item.atividade_principal,
        horas_sono: item.horas_sono,
        kss_score: item.kss_score,
        effectiveness_pct: item.effectiveness_pct,
        recovery_credit_points: recoveryCreditByKey.get(itemKey)?.points ?? 0,
        dia_periodo_embarcado:
          derivedFortnight?.dia_periodo_embarcado ??
          (effectivenessRow?.dia_periodo_embarcado != null
            ? Number(effectivenessRow.dia_periodo_embarcado)
            : null),
        total_dias_periodo:
          derivedFortnight?.total_dias_periodo ??
          (effectivenessRow?.total_dias_periodo != null
            ? Number(effectivenessRow.total_dias_periodo)
            : null),
      };
    }),
    // Janela REAL de contexto — permite que o algoritmo quinzenal reconheça o
    // período embarcado como totalmente coberto e produza fonte_periodo != INCOMPLETO
    // quando os dados existem.
    windowStart: contextStart,
    windowEnd: contextEnd,
    today: params.hoje,
    policy: operationalContext.fortnightPolicy,
    flightLimit168hMinutes:
      Number.isFinite(Number(limites.HV_7_DIAS_HORAS)) && Number(limites.HV_7_DIAS_HORAS) > 0
        ? Number(limites.HV_7_DIAS_HORAS) * 60
        : undefined,
  });

  const itemsWithFortnight = snapshot.items.map((item) => {
    const key = `${item.data_operacional}::${item.funcionario_id}`;
    const recovery = recoveryCreditByKey.get(key);
    const itemWithFortnight = {
      ...item,
      fortnight_indicator: fortnightIndicatorMap.get(key) ?? null,
      recovery_credit_points: recovery?.points ?? 0,
      recovery_state: recovery?.state ?? null,
      recovery_activity_type: recovery?.activityType ?? null,
    };
    return {
      ...itemWithFortnight,
      ...buildDecisaoFields(itemWithFortnight, {
        hoje: params.hoje,
        policy: params.policy,
      }),
    };
  });

  // Recorta de volta para o intervalo solicitado e só então aplica os filtros de
  // apresentação — o Compliance já foi calculado com contexto completo.
  const responseItems = applyPresentationFilters(
    itemsWithFortnight.filter(
      (item) =>
        item.data_operacional >= requestedStart && item.data_operacional <= requestedEnd,
    ),
    params.filters,
  ).sort(compareSnapshotItems);

  return {
    items: responseItems,
    summary: buildSummary(responseItems),
  };
}
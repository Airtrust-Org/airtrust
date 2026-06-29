import type {
  FrmsFortnightIndicator,
  FrmsOperationalSnapshotItem,
} from '@/react-app/hooks/useFrmsOperationalSnapshot';
import {
  formatFortnightMitigacao,
  formatFortnightTendencia,
  formatTrendArrow,
  resolveOperationalSourceChip,
  type OperationalSourceChip,
} from './fortnightOperationalLabels';

const ALERT_REASON_LABELS: Record<string, string> = {
  CHECKIN_CRITICO: 'Check-in critico',
  CHECKIN_PENDENTE: 'Check-in pendente',
  SONO_ESTIMADO: 'Sono estimado',
  SONO_INSUFICIENTE: 'Sono insuficiente',
  KSS_ALTO: 'KSS alto',
  EFETIVIDADE_BAIXA: 'Efetividade estimada baixa',
  JORNADA_SEM_FATORIZACAO: 'Jornada sem fatorizacao',
  ESCALADO_SEM_JORNADA_FRMS: 'Escalado sem jornada FRMS',
  JORNADA_FRMS_SEM_ESCALA: 'Jornada FRMS sem escala',
  DADO_INCONSISTENTE: 'Dado inconsistente',
};

type CrewSummary = {
  funcionarioId: number;
  displayName: string;
  roleLabel: string;
  equipmentLabel: string;
  snapshotStatus: FrmsOperationalSnapshotItem['snapshot_status'];
  fortnightStatus: FrmsFortnightIndicator['status_quinzena'] | null;
  dutyTimeMin: number | null;
  flightTimeMin: number | null;
  effectivenessPct: number | null;
  subjectiveScore: number | null;
  trend: FrmsFortnightIndicator['tendencia'] | null;
  primaryReason: string;
  recommendedAction: string;
  dataSourceLabel: string;
  jornadaDataSource: string;
  sleepDataSource: string;
  wakeDataSource: string;
  actionGroup: FrmsActionGroup;
  estimatedOrIncomplete: boolean;
  checkinCritical: boolean;
  checkinPending: boolean;
  needsAttention: boolean;
  periodKey: string | null;
  indicator: FrmsFortnightIndicator | null;
};

function formatDataSourceToken(value: string | null | undefined): string | null {
  if (!value || value === 'REAL') return null;
  if (value === 'ESTIMADO') return 'estimado';
  if (value === 'AUSENTE') return 'ausente';
  if (value === 'INCONSISTENTE') return 'inconsistente';
  if (value === 'PARCIAL') return 'parcial';
  return value.toLowerCase();
}

function resolveDataSourceLabel(primary: FrmsOperationalSnapshotItem): string {
  const parts: string[] = [];
  const jornada = formatDataSourceToken(primary.jornada_data_source);
  const sono = formatDataSourceToken(primary.sleep_data_source);
  const periodo = formatDataSourceToken(primary.fortnight_indicator?.fonte_periodo ?? undefined);
  if (jornada) parts.push(`Jornada ${jornada}`);
  if (sono) parts.push(`Sono ${sono}`);
  if (periodo) parts.push(`Quinzena ${periodo}`);
  if (parts.length === 0) {
    return primary.teve_jornada ? 'Jornada registrada' : 'Fonte não classificada';
  }
  return parts.join(' · ');
}

function resolveActionGroup(
  summary: Pick<
    CrewSummary,
    | 'snapshotStatus'
    | 'fortnightStatus'
    | 'checkinCritical'
    | 'checkinPending'
    | 'estimatedOrIncomplete'
  >,
): FrmsActionGroup {
  if (summary.checkinCritical) return 'critical';
  if (
    summary.fortnightStatus === 'CRITICO' ||
    summary.snapshotStatus === 'CRITICO'
  ) {
    return 'critical';
  }
  if (summary.checkinPending) return 'checkin';
  if (summary.estimatedOrIncomplete) return 'source';
  if (
    summary.fortnightStatus === 'ATENCAO' ||
    summary.snapshotStatus === 'ATENCAO'
  ) {
    return 'attention';
  }
  return 'observation';
}

export type FrmsActionGroup = 'critical' | 'attention' | 'checkin' | 'source' | 'observation';

export interface FortnightAttentionItem {
  funcionarioId: number;
  displayName: string;
  secondaryLabel: string;
  statusLabel: string;
  actionGroup: FrmsActionGroup;
  dataSourceLabel: string;
  sourceChip: OperationalSourceChip;
  trendLabel: string;
  subjectiveScore: number | null;
  effectivenessPct: number | null;
  dutyTimeMin: number | null;
  flightTimeMin: number | null;
  primaryReason: string;
  recommendedAction: string;
  controlPath: string;
  tripulantePath: string;
}

export interface FortnightOperationalSummaryView {
  monitoredCount: number;
  attentionCount: number;
  criticalCount: number;
  criticalCheckinsCount: number;
  estimatedOrIncompleteCount: number;
  incompleteCount: number;
  locatedCount: number;
  periodStart: string | null;
  periodEnd: string | null;
  periodLabel: string;
  periodStatus: 'COMPLETA' | 'INCOMPLETA' | 'NAO_CONFIRMADA';
  periodStatusLabel: string;
  totalDutyTimeMin: number;
  totalFlightTimeMin: number;
  generalTrendLabel: string;
  topDutyCrew: FortnightAttentionItem | null;
  topFlightCrew: FortnightAttentionItem | null;
  attentionItems: FortnightAttentionItem[];
}

function toDisplayName(item: FrmsOperationalSnapshotItem): string {
  return item.nome_guerra || item.nome || `ID ${item.funcionario_id}`;
}

function toSecondaryLabel(item: FrmsOperationalSnapshotItem): string {
  const parts = [item.funcao, item.aeronave].filter((value): value is string => Boolean(value?.trim()));
  return parts.join(' · ') || item.base || 'Contexto operacional';
}

function snapshotSeverity(status: FrmsOperationalSnapshotItem['snapshot_status'] | null | undefined): number {
  if (status === 'CRITICO') return 3;
  if (status === 'ATENCAO') return 2;
  if (status === 'INCOMPLETO') return 1;
  return 0;
}

function fortnightSeverity(status: FrmsFortnightIndicator['status_quinzena'] | null | undefined): number {
  if (status === 'CRITICO') return 3;
  if (status === 'ATENCAO') return 2;
  if (status === 'INCOMPLETO') return 1;
  return 0;
}

function rowSeverity(item: FrmsOperationalSnapshotItem): number {
  return Math.max(snapshotSeverity(item.snapshot_status), fortnightSeverity(item.fortnight_indicator?.status_quinzena));
}

function hasLocatedFortnight(indicator: FrmsFortnightIndicator | null | undefined): boolean {
  return Boolean(indicator?.periodo_inicio && indicator?.periodo_fim && indicator.fonte_periodo !== 'AUSENTE');
}

function isEstimatedOrIncomplete(item: FrmsOperationalSnapshotItem): boolean {
  const indicator = item.fortnight_indicator;
  return (
    item.sleep_data_source !== 'REAL' ||
    item.wake_data_source !== 'REAL' ||
    item.jornada_data_source === 'ESTIMADO' ||
    item.jornada_data_source === 'AUSENTE' ||
    item.jornada_data_source === 'INCONSISTENTE' ||
    indicator?.fonte_periodo === 'ESTIMADO' ||
    indicator?.fonte_periodo === 'INCOMPLETO' ||
    indicator?.freshness_dado === 'PARCIAL' ||
    indicator?.freshness_dado === 'ESTIMADO' ||
    indicator?.freshness_dado === 'AUSENTE' ||
    indicator?.status_quinzena === 'INCOMPLETO'
  );
}

function isCheckinCritical(item: FrmsOperationalSnapshotItem): boolean {
  return item.checkin_status === 'AUSENTE' || item.alertas.includes('CHECKIN_CRITICO');
}

function compareItems(left: FrmsOperationalSnapshotItem, right: FrmsOperationalSnapshotItem): number {
  const locatedDiff = Number(hasLocatedFortnight(right.fortnight_indicator)) - Number(hasLocatedFortnight(left.fortnight_indicator));
  if (locatedDiff !== 0) return locatedDiff;

  const severityDiff = rowSeverity(right) - rowSeverity(left);
  if (severityDiff !== 0) return severityDiff;

  return right.data_operacional.localeCompare(left.data_operacional);
}

function resolvePrimaryReason(
  item: FrmsOperationalSnapshotItem,
  estimatedOrIncomplete: boolean,
  checkinCritical: boolean,
): string {
  if (checkinCritical) return 'Check-in pendente — solicitar confirmação';
  if (item.checkin_status === 'PENDENTE' || item.alertas.includes('CHECKIN_PENDENTE')) {
    return 'Check-in pendente — solicitar confirmação';
  }
  if (
    item.fortnight_indicator?.status_quinzena === 'CRITICO' ||
    item.snapshot_status === 'CRITICO'
  ) {
    return 'Acúmulo elevado — revisar escala';
  }
  if (
    item.fortnight_indicator?.status_quinzena === 'ATENCAO' ||
    item.snapshot_status === 'ATENCAO'
  ) {
    return 'Acúmulo elevado — revisar escala';
  }
  if (estimatedOrIncomplete) return 'Fonte insuficiente — validar jornada antes de decidir';

  const firstAlert = item.alertas.find((alerta) => ALERT_REASON_LABELS[alerta]);
  if (firstAlert) return ALERT_REASON_LABELS[firstAlert];

  if (item.fortnight_indicator?.tendencia === 'CRESCENTE') {
    return 'Acúmulo em alta — acompanhar quinzena';
  }
  return 'Em observação — acompanhar quinzena';
}

function resolveRecommendedAction(
  item: FrmsOperationalSnapshotItem,
  estimatedOrIncomplete: boolean,
  checkinCritical: boolean,
): string {
  const mitigation = formatFortnightMitigacao(item.fortnight_indicator?.mitigacao_recomendada);
  if (mitigation !== '--' && mitigation !== 'Sem ação imediata') return mitigation;
  if (checkinCritical || item.checkin_status === 'PENDENTE') {
    return 'Solicitar confirmação de check-in';
  }
  if (
    snapshotSeverity(item.snapshot_status) >= 2 ||
    fortnightSeverity(item.fortnight_indicator?.status_quinzena) >= 2
  ) {
    return 'Revisar escala com a coordenação';
  }
  if (estimatedOrIncomplete) return 'Validar jornada antes de decidir';
  return 'Manter em observação';
}

function isCheckinPending(item: FrmsOperationalSnapshotItem): boolean {
  return item.checkin_status === 'PENDENTE' || item.alertas.includes('CHECKIN_PENDENTE');
}

function buildCrewSummary(items: FrmsOperationalSnapshotItem[]): CrewSummary {
  const sorted = [...items].sort(compareItems);
  const primary = sorted[0];
  const maxDutyTime = sorted.reduce<number | null>((acc, item) => {
    const value = item.fortnight_indicator?.duty_time_periodo_min;
    if (value == null || !Number.isFinite(value)) return acc;
    return acc == null ? value : Math.max(acc, value);
  }, null);
  const maxFlightTime = sorted.reduce<number | null>((acc, item) => {
    const value = item.fortnight_indicator?.horas_voo_periodo_min;
    if (value == null || !Number.isFinite(value)) return acc;
    return acc == null ? value : Math.max(acc, value);
  }, null);
  const latestScore = sorted.find((item) => item.fadiga_score != null)?.fadiga_score ?? null;
  const latestEffectiveness = sorted.find((item) => item.effectiveness_pct != null)?.effectiveness_pct ?? null;
  const estimatedOrIncomplete = sorted.some(isEstimatedOrIncomplete);
  const checkinCritical = sorted.some(isCheckinCritical);
  const checkinPending = sorted.some(isCheckinPending);
  const needsAttention =
    sorted.some((item) => rowSeverity(item) >= 2) ||
    estimatedOrIncomplete ||
    checkinCritical ||
    checkinPending;
  const indicator = primary.fortnight_indicator;
  const periodKey =
    indicator?.periodo_inicio && indicator?.periodo_fim ? `${indicator.periodo_inicio}__${indicator.periodo_fim}` : null;
  const dataSourceLabel = resolveDataSourceLabel(primary);
  const actionGroup = resolveActionGroup({
    snapshotStatus: primary.snapshot_status,
    fortnightStatus: indicator?.status_quinzena ?? null,
    checkinCritical,
    checkinPending,
    estimatedOrIncomplete,
  });

  return {
    funcionarioId: primary.funcionario_id,
    displayName: toDisplayName(primary),
    roleLabel: primary.funcao || 'Funcao nao informada',
    equipmentLabel: primary.aeronave || primary.base || 'Contexto operacional',
    snapshotStatus: primary.snapshot_status,
    fortnightStatus: indicator?.status_quinzena ?? null,
    dutyTimeMin: maxDutyTime,
    flightTimeMin: maxFlightTime,
    effectivenessPct: latestEffectiveness,
    subjectiveScore: latestScore,
    trend: indicator?.tendencia ?? null,
    primaryReason: resolvePrimaryReason(primary, estimatedOrIncomplete, checkinCritical),
    recommendedAction: resolveRecommendedAction(primary, estimatedOrIncomplete, checkinCritical),
    dataSourceLabel,
    jornadaDataSource: primary.jornada_data_source,
    sleepDataSource: primary.sleep_data_source,
    wakeDataSource: primary.wake_data_source,
    actionGroup,
    estimatedOrIncomplete,
    checkinCritical,
    checkinPending,
    needsAttention,
    periodKey,
    indicator,
  };
}

function buildAttentionItem(summary: CrewSummary, snapshotDate: string): FortnightAttentionItem {
  const statusLabel =
    summary.actionGroup === 'critical'
      ? 'Critico'
      : summary.actionGroup === 'attention'
        ? 'Em atencao'
        : summary.actionGroup === 'checkin'
          ? 'Check-in pendente'
          : summary.actionGroup === 'source'
            ? 'Fonte insuficiente'
            : 'Observacao';

  const sourceChip = resolveOperationalSourceChip({
    jornada_data_source: summary.jornadaDataSource,
    sleep_data_source: summary.sleepDataSource,
    wake_data_source: summary.wakeDataSource,
    fonte_periodo: summary.indicator?.fonte_periodo,
  });

  return {
    funcionarioId: summary.funcionarioId,
    displayName: summary.displayName,
    secondaryLabel: [summary.roleLabel, summary.equipmentLabel].filter(Boolean).join(' · '),
    statusLabel,
    actionGroup: summary.actionGroup,
    dataSourceLabel: summary.dataSourceLabel,
    sourceChip,
    trendLabel: formatTrendArrow(summary.trend),
    subjectiveScore: summary.subjectiveScore,
    effectivenessPct: summary.effectivenessPct,
    dutyTimeMin: summary.dutyTimeMin,
    flightTimeMin: summary.flightTimeMin,
    primaryReason: summary.primaryReason,
    recommendedAction: summary.recommendedAction,
    controlPath: `/frms/controle-operacional?data=${snapshotDate}&funcionario_id=${summary.funcionarioId}`,
    tripulantePath: `/frms/tripulante/${encodeURIComponent(String(summary.funcionarioId))}`,
  };
}

function resolvePeriod(
  crews: CrewSummary[],
): Pick<
  FortnightOperationalSummaryView,
  'periodStart' | 'periodEnd' | 'periodLabel' | 'periodStatus' | 'periodStatusLabel' | 'locatedCount' | 'incompleteCount'
> {
  const periodCounts = new Map<string, { count: number; start: string; end: string }>();

  for (const crew of crews) {
    const indicator = crew.indicator;
    if (!hasLocatedFortnight(indicator)) continue;
    const key = `${indicator?.periodo_inicio}__${indicator?.periodo_fim}`;
    const current = periodCounts.get(key);
    periodCounts.set(key, {
      count: (current?.count ?? 0) + 1,
      start: indicator?.periodo_inicio || '',
      end: indicator?.periodo_fim || '',
    });
  }

  const selectedPeriod = [...periodCounts.values()].sort((left, right) => {
    if (right.count !== left.count) return right.count - left.count;
    return right.end.localeCompare(left.end);
  })[0];

  const locatedCount = crews.filter((crew) => hasLocatedFortnight(crew.indicator)).length;
  const incompleteCount = crews.filter(
    (crew) =>
      !hasLocatedFortnight(crew.indicator) ||
      crew.estimatedOrIncomplete ||
      crew.fortnightStatus === 'INCOMPLETO',
  ).length;

  if (!selectedPeriod) {
    return {
      periodStart: null,
      periodEnd: null,
      periodLabel: 'Nao confirmada',
      periodStatus: 'NAO_CONFIRMADA',
      periodStatusLabel: 'Nao confirmada',
      locatedCount,
      incompleteCount,
    };
  }

  const periodStatus =
    incompleteCount > 0 || locatedCount < crews.length ? 'INCOMPLETA' : 'COMPLETA';

  return {
    periodStart: selectedPeriod.start,
    periodEnd: selectedPeriod.end,
    periodLabel: `${selectedPeriod.start}__${selectedPeriod.end}`,
    periodStatus,
    periodStatusLabel: periodStatus === 'COMPLETA' ? 'Completa' : 'Incompleta',
    locatedCount,
    incompleteCount,
  };
}

function resolveGeneralTrend(crews: CrewSummary[]): string {
  const counts = crews.reduce<Record<string, number>>((acc, crew) => {
    if (!crew.trend) return acc;
    acc[crew.trend] = (acc[crew.trend] ?? 0) + 1;
    return acc;
  }, {});

  const ranked = Object.entries(counts).sort((left, right) => right[1] - left[1]);
  if (ranked.length === 0) return 'Indeterminada';
  if (ranked.length > 1 && ranked[0][1] === ranked[1][1]) return 'Mista';
  return formatFortnightTendencia(ranked[0][0]);
}

export function buildFortnightOperationalSummary(
  items: FrmsOperationalSnapshotItem[],
  snapshotDate: string,
): FortnightOperationalSummaryView {
  const byCrew = new Map<number, FrmsOperationalSnapshotItem[]>();
  for (const item of items) {
    const bucket = byCrew.get(item.funcionario_id);
    if (bucket) bucket.push(item);
    else byCrew.set(item.funcionario_id, [item]);
  }

  const crews = [...byCrew.values()].map(buildCrewSummary);
  const period = resolvePeriod(crews);
  const attentionItems = crews
    .filter((crew) => crew.needsAttention)
    .sort((left, right) => {
      const severityDiff =
        Math.max(snapshotSeverity(right.snapshotStatus), fortnightSeverity(right.fortnightStatus)) -
        Math.max(snapshotSeverity(left.snapshotStatus), fortnightSeverity(left.fortnightStatus));
      if (severityDiff !== 0) return severityDiff;

      const dutyDiff = (right.dutyTimeMin ?? -1) - (left.dutyTimeMin ?? -1);
      if (dutyDiff !== 0) return dutyDiff;

      return (right.subjectiveScore ?? -1) - (left.subjectiveScore ?? -1);
    })
    .map((crew) => buildAttentionItem(crew, snapshotDate));

  const topDutyCrew =
    [...crews]
      .filter((crew) => crew.dutyTimeMin != null && hasLocatedFortnight(crew.indicator))
      .sort((left, right) => (right.dutyTimeMin ?? -1) - (left.dutyTimeMin ?? -1))
      .map((crew) => buildAttentionItem(crew, snapshotDate))[0] ?? null;
  const topFlightCrew =
    [...crews]
      .filter((crew) => crew.flightTimeMin != null && hasLocatedFortnight(crew.indicator))
      .sort((left, right) => (right.flightTimeMin ?? -1) - (left.flightTimeMin ?? -1))
      .map((crew) => buildAttentionItem(crew, snapshotDate))[0] ?? null;

  return {
    monitoredCount: crews.length,
    attentionCount: crews.filter(
      (crew) =>
        Math.max(snapshotSeverity(crew.snapshotStatus), fortnightSeverity(crew.fortnightStatus)) === 2,
    ).length,
    criticalCount: crews.filter(
      (crew) =>
        Math.max(snapshotSeverity(crew.snapshotStatus), fortnightSeverity(crew.fortnightStatus)) >= 3,
    ).length,
    criticalCheckinsCount: crews.filter((crew) => crew.checkinCritical).length,
    estimatedOrIncompleteCount: crews.filter((crew) => crew.estimatedOrIncomplete).length,
    incompleteCount: period.incompleteCount,
    locatedCount: period.locatedCount,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    periodLabel: period.periodLabel,
    periodStatus: period.periodStatus,
    periodStatusLabel: period.periodStatusLabel,
    totalDutyTimeMin: crews.reduce((acc, crew) => acc + Math.max(0, crew.dutyTimeMin ?? 0), 0),
    totalFlightTimeMin: crews.reduce((acc, crew) => acc + Math.max(0, crew.flightTimeMin ?? 0), 0),
    generalTrendLabel: resolveGeneralTrend(crews),
    topDutyCrew,
    topFlightCrew,
    attentionItems,
  };
}

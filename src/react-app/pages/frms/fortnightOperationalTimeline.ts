import type { FrmsOperationalSnapshotItem } from '@/react-app/hooks/useFrmsOperationalSnapshot';

export interface FortnightTimelineDay {
  data_operacional: string;
  label: string;
  day_index: number;
  total_days: number;
  is_focus_day: boolean;
  has_snapshot_data: boolean;
  teve_jornada: boolean;
  jornada_min: number;
  voo_min: number;
  jornada_acumulada_min: number;
  voo_acumulada_min: number;
  hora_apresentacao: string | null;
  hora_termino: string | null;
  horas_sono: number | null;
  kss_score: number | null;
  recovery_credit_points: number;
  recovery_state: string | null;
  recovery_activity_type: string | null;
  acao_recomendada_texto: string | null;
  snapshot_status: FrmsOperationalSnapshotItem['snapshot_status'] | 'SEM_REGISTRO';
  checkin_status: FrmsOperationalSnapshotItem['checkin_status'];
  effectiveness_pct: number | null;
  tendencia: string | null;
  explicacao_operacional: string | null;
  mitigacao_recomendada: string | null;
  highlights: string[];
}

export interface FortnightTimelineSummary {
  visible_days: number;
  jornadas_days: number;
  pending_checkins: number;
  estimated_days: number;
  attention_days: number;
  critical_days: number;
  cumulative_duty_min: number;
  cumulative_flight_min: number;
  received_checkins: number;
  recovery_days: number;
  low_sleep_days: number;
  no_flight_recovery_days: number;
  max_effectiveness_decline_streak_days: number;
}

export interface FortnightTimelineResult {
  days: FortnightTimelineDay[];
  summary: FortnightTimelineSummary;
}

const ALERT_LABELS: Record<string, string> = {
  CHECKIN_PENDENTE: 'Check-in pendente',
  CHECKIN_CRITICO: 'Check-in crítico',
  SONO_ESTIMADO: 'Sono estimado',
  SONO_INSUFICIENTE: 'Sono abaixo de 6h',
  KSS_ALTO: 'KSS alto',
  EFETIVIDADE_BAIXA: 'Efetividade < 70%',
  JORNADA_SEM_FATORIZACAO: 'Sem fatorização',
  ESCALADO_SEM_JORNADA_FRMS: 'Escalado sem jornada FRMS',
  JORNADA_FRMS_SEM_ESCALA: 'Jornada sem escala',
  DADO_INCONSISTENTE: 'Dado inconsistente',
};

function parseIsoDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year || 0, (month || 1) - 1, day || 1));
}

function addDays(value: string, days: number): string {
  const next = parseIsoDate(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function dateDiff(start: string, end: string): number {
  const startMs = parseIsoDate(start).getTime();
  const endMs = parseIsoDate(end).getTime();
  return Math.max(0, Math.round((endMs - startMs) / 86400000));
}

function formatDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return isoDate;
  return `${match[3]}/${match[2]}`;
}

function buildHighlights(item: FrmsOperationalSnapshotItem | null | undefined): string[] {
  if (!item) return ['Sem dado confirmado no snapshot'];

  const highlights: string[] = [];

  if (!item.teve_jornada) {
    highlights.push('Sem jornada FRMS confirmada');
  }

  for (const alerta of item.alertas) {
    const label = ALERT_LABELS[alerta];
    if (label) highlights.push(label);
  }

  if (item.sleep_data_source === 'ESTIMADO' && !highlights.includes('Sono estimado')) {
    highlights.push('Sono estimado');
  }

  if (
    item.jornada_data_source === 'ESTIMADO' &&
    !highlights.includes('Jornada estimada')
  ) {
    highlights.push('Jornada estimada');
  }

  if (
    item.hora_apresentacao &&
    item.hora_apresentacao < '06:00' &&
    !highlights.includes('Apresentação antes de 06:00')
  ) {
    highlights.push('Apresentação antes de 06:00');
  }

  return highlights.slice(0, 3);
}

export function buildFortnightTimeline(
  items: FrmsOperationalSnapshotItem[],
  params: {
    periodStart: string;
    periodEnd: string;
    focusDate?: string | null;
  },
): FortnightTimelineResult {
  const byDate = new Map<string, FrmsOperationalSnapshotItem>();
  for (const item of items) {
    if (item.data_operacional < params.periodStart || item.data_operacional > params.periodEnd) continue;
    byDate.set(item.data_operacional, item);
  }

  const totalDays = dateDiff(params.periodStart, params.periodEnd) + 1;
  const days: FortnightTimelineDay[] = [];

  let cumulativeDuty = 0;
  let cumulativeFlight = 0;
  let jornadasDays = 0;
  let pendingCheckins = 0;
  let estimatedDays = 0;
  let attentionDays = 0;
  let criticalDays = 0;
  let receivedCheckins = 0;
  let recoveryDays = 0;
  let lowSleepDays = 0;
  let noFlightRecoveryDays = 0;
  let currentEffectivenessDeclineStreakDays = 0;
  let maxEffectivenessDeclineStreakDays = 0;
  let previousEffectiveness: number | null = null;

  for (let index = 0; index < totalDays; index += 1) {
    const isoDate = addDays(params.periodStart, index);
    const item = byDate.get(isoDate);
    const jornadaMin = item?.teve_jornada ? Math.max(0, item.duracao_jornada_minutos || 0) : 0;
    const vooMin = item?.teve_jornada ? Math.max(0, item.horas_voo_minutos || 0) : 0;

    cumulativeDuty += jornadaMin;
    cumulativeFlight += vooMin;

    if (item?.teve_jornada) jornadasDays += 1;
    if (item?.checkin_status === 'RECEBIDO') receivedCheckins += 1;
    const hasRecovery = (item?.recovery_credit_points ?? 0) > 0 || Boolean(item?.recovery_state);
    if (hasRecovery) recoveryDays += 1;
    if (item?.alertas.includes('SONO_INSUFICIENTE')) lowSleepDays += 1;
    if (item && vooMin === 0 && hasRecovery) noFlightRecoveryDays += 1;

    const effectiveness = item?.effectiveness_pct;
    if (effectiveness != null && Number.isFinite(effectiveness)) {
      if (previousEffectiveness != null && effectiveness < previousEffectiveness) {
        currentEffectivenessDeclineStreakDays = currentEffectivenessDeclineStreakDays === 0
          ? 2
          : currentEffectivenessDeclineStreakDays + 1;
        maxEffectivenessDeclineStreakDays = Math.max(
          maxEffectivenessDeclineStreakDays,
          currentEffectivenessDeclineStreakDays,
        );
      } else {
        currentEffectivenessDeclineStreakDays = 0;
      }
      previousEffectiveness = effectiveness;
    } else {
      currentEffectivenessDeclineStreakDays = 0;
      previousEffectiveness = null;
    }

    if (item && (item.checkin_status === 'PENDENTE' || item.checkin_status === 'AUSENTE')) {
      pendingCheckins += 1;
    }
    if (
      item &&
      (item.sleep_data_source === 'ESTIMADO' ||
        item.wake_data_source === 'ESTIMADO' ||
        item.jornada_data_source === 'ESTIMADO' ||
        item.jornada_data_source === 'INCONSISTENTE')
    ) {
      estimatedDays += 1;
    }
    if (item?.snapshot_status === 'ATENCAO') attentionDays += 1;
    if (item?.snapshot_status === 'CRITICO') criticalDays += 1;

    days.push({
      data_operacional: isoDate,
      label: formatDate(isoDate),
      day_index: index + 1,
      total_days: totalDays,
      is_focus_day: isoDate === params.focusDate,
      has_snapshot_data: Boolean(item),
      teve_jornada: Boolean(item?.teve_jornada),
      jornada_min: jornadaMin,
      voo_min: vooMin,
      jornada_acumulada_min: cumulativeDuty,
      voo_acumulada_min: cumulativeFlight,
      hora_apresentacao: item?.hora_apresentacao ?? null,
      hora_termino: item?.hora_termino ?? null,
      horas_sono: item?.horas_sono ?? null,
      kss_score: item?.kss_score ?? null,
      recovery_credit_points: Number(item?.recovery_credit_points ?? 0),
      recovery_state: item?.recovery_state ?? null,
      recovery_activity_type: item?.recovery_activity_type ?? null,
      acao_recomendada_texto: item?.acao_recomendada_texto ?? null,
      snapshot_status: item?.snapshot_status ?? 'SEM_REGISTRO',
      checkin_status: item?.checkin_status ?? 'NAO_APLICAVEL',
      effectiveness_pct: item?.effectiveness_pct ?? null,
      tendencia: item?.fortnight_indicator?.tendencia ?? null,
      explicacao_operacional: item?.fortnight_indicator?.explicacao_operacional ?? null,
      mitigacao_recomendada: item?.fortnight_indicator?.mitigacao_recomendada ?? null,
      highlights: buildHighlights(item),
    });
  }

  return {
    days,
    summary: {
      visible_days: totalDays,
      jornadas_days: jornadasDays,
      pending_checkins: pendingCheckins,
      estimated_days: estimatedDays,
      attention_days: attentionDays,
      critical_days: criticalDays,
      cumulative_duty_min: cumulativeDuty,
      cumulative_flight_min: cumulativeFlight,
      received_checkins: receivedCheckins,
      recovery_days: recoveryDays,
      low_sleep_days: lowSleepDays,
      no_flight_recovery_days: noFlightRecoveryDays,
      max_effectiveness_decline_streak_days: maxEffectivenessDeclineStreakDays,
    },
  };
}
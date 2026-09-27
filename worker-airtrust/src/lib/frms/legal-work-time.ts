import type { FrmsActivitySnapshotRow } from './activity-context';

export interface LegalDutyRow {
  data: string;
  hora_apresentacao?: string | null;
  hora_termino?: string | null;
  duracao_jornada_minutos?: number | null;
}

export interface LegalWorkSegment {
  startAbsMin: number;
  endAbsMin: number;
  factor: number;
  source: 'DUTY' | 'TRAINING' | 'SIMULATOR' | 'RESERVE' | 'STANDBY' | 'TRAVEL' | 'OTHER';
}

export interface LegalWorkSummary {
  status: 'COMPLETE' | 'UNKNOWN';
  totalMin: number | null;
  knownMin: number;
  byCalendarDateMin: Record<string, number>;
  incompleteReasons: string[];
  incompleteReasonsByDate: Record<string, string[]>;
  segmentCount: number;
}

const MIN_PER_DAY = 24 * 60;
function parseYmdToDay(value: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(ms);
  if (
    d.getUTCFullYear() !== Number(m[1]) ||
    d.getUTCMonth() !== Number(m[2]) - 1 ||
    d.getUTCDate() !== Number(m[3])
  ) return null;
  return Math.floor(ms / 86400000);
}

function parseClock(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isInteger(h) || !Number.isInteger(min) || h > 23 || min > 59) return null;
  return h * 60 + min;
}
function toSegment(
  data: string,
  start: string | null | undefined,
  end: string | null | undefined,
  factor: number,
  source: LegalWorkSegment['source'],
): LegalWorkSegment | null {
  const day = parseYmdToDay(data);
  const startMin = parseClock(start);
  const endMin = parseClock(end);
  if (day == null || startMin == null || endMin == null) return null;
  const startAbsMin = day * MIN_PER_DAY + startMin;
  let endAbsMin = day * MIN_PER_DAY + endMin;
  if (endAbsMin <= startAbsMin) endAbsMin += MIN_PER_DAY;
  if (!Number.isFinite(factor) || factor <= 0 || factor > 1) return null;
  return { startAbsMin, endAbsMin, factor, source };
}

function activitySource(row: FrmsActivitySnapshotRow): LegalWorkSegment['source'] {
  switch (row.source_activity_type) {
    case 'STANDBY_HOME_HOTEL': return 'STANDBY';
    case 'STANDBY_ONSITE': return 'RESERVE';
    case 'DUTY_TRAVEL': return 'TRAVEL';
    case 'ADMIN_TRAINING': return 'TRAINING';
    default:
      if (row.activity_type === 'SIMULADOR') return 'SIMULATOR';
      if (row.activity_type === 'TREINAMENTO') return 'TRAINING';
      return 'OTHER';
  }
}

function ymdFromDay(day: number): string {
  return new Date(day * 86400000).toISOString().slice(0, 10);
}

/**
 * Soma intervalos ponderados sem dupla contagem. Em qualquer minuto sobreposto,
 * prevalece o maior fator aplicável (trabalho/reserva=1; sobreaviso=1/3).
 */
export function weightedLegalWorkUnion(segments: readonly LegalWorkSegment[]): {
  totalMin: number;
  byCalendarDateMin: Record<string, number>;
} {
  if (segments.length === 0) return { totalMin: 0, byCalendarDateMin: {} };
  const points = [...new Set(segments.flatMap((s) => [s.startAbsMin, s.endAbsMin]))]
    .sort((a, b) => a - b);
  let total = 0;
  const byDate: Record<string, number> = {};
  for (let i = 0; i < points.length - 1; i += 1) {
    let cursor = points[i];
    const end = points[i + 1];
    if (end <= cursor) continue;
    const active = segments.filter((s) => s.startAbsMin < end && s.endAbsMin > cursor);
    if (active.length === 0) continue;
    const factor = Math.max(...active.map((s) => s.factor));

    while (cursor < end) {
      const day = Math.floor(cursor / MIN_PER_DAY);
      const nextMidnight = (day + 1) * MIN_PER_DAY;
      const chunkEnd = Math.min(end, nextMidnight);
      const weighted = (chunkEnd - cursor) * factor;
      total += weighted;
      const key = ymdFromDay(day);
      byDate[key] = (byDate[key] ?? 0) + weighted;
      cursor = chunkEnd;
    }
  }

  return {
    totalMin: Math.round(total),
    byCalendarDateMin: Object.fromEntries(
      Object.entries(byDate).map(([date, min]) => [date, Math.round(min)]),
    ),
  };
}
/**
 * ACT Costa do Sol 2025/2027, cláusula 8ª, e RBAC 117 B/C 117.27:
 * trabalho inclui jornada/solo, reserva, 1/3 sobreaviso, extra a serviço,
 * treinamento/simulador/reuniões e demais serviços em terra escalados.
 *
 * Se faltar intervalo suficiente para deduplicar, falha fechado como UNKNOWN.
 */
export function summarizeCostaDoSolLegalWork(input: {
  duties: readonly LegalDutyRow[];
  activities: readonly FrmsActivitySnapshotRow[];
}): LegalWorkSummary {
  const segments: LegalWorkSegment[] = [];
  const incomplete = new Set<string>();
  const incompleteByDate = new Map<string, Set<string>>();
  const markIncomplete = (date: string, reason: string) => {
    incomplete.add(reason);
    const current = incompleteByDate.get(date) ?? new Set<string>();
    current.add(reason);
    incompleteByDate.set(date, current);
  };

  for (const duty of input.duties) {
    const duration = Math.max(0, Number(duty.duracao_jornada_minutos ?? 0));
    if (duration === 0) continue;
    const segment = toSegment(duty.data, duty.hora_apresentacao, duty.hora_termino, 1, 'DUTY');
    if (segment) segments.push(segment);
    else markIncomplete(duty.data, 'DUTY_INTERVAL_MISSING');
  }

  for (const activity of input.activities) {
    const factor = activity.legal_work_factor;
    if (factor == null || !Number.isFinite(factor)) {
      if (activity.hora_inicio && activity.hora_fim) markIncomplete(activity.data_operacional, 'ACTIVITY_LEGAL_FACTOR_MISSING');
      continue;
    }
    const segment = toSegment(
      activity.data_operacional,
      activity.hora_inicio,
      activity.hora_fim,
      factor,
      activitySource(activity),
    );
    if (segment) segments.push(segment);
    else markIncomplete(activity.data_operacional, 'ACTIVITY_INTERVAL_MISSING');
  }

  const union = weightedLegalWorkUnion(segments);
  const reasons = [...incomplete];
  return {
    status: reasons.length ? 'UNKNOWN' : 'COMPLETE',
    totalMin: reasons.length ? null : union.totalMin,
    knownMin: union.totalMin,
    byCalendarDateMin: union.byCalendarDateMin,
    incompleteReasons: reasons,
    incompleteReasonsByDate: Object.fromEntries(
      [...incompleteByDate.entries()].map(([date, values]) => [date, [...values]]),
    ),
    segmentCount: segments.length,
  };
}

function addDaysYmd(value: string, days: number): string {
  const base = parseYmdToDay(value);
  if (base == null) return value;
  return ymdFromDay(base + days);
}

export function sumLegalWorkCalendarMonth(
  byDate: Readonly<Record<string, number>>,
  month: string,
): number {
  return Math.round(
    Object.entries(byDate)
      .filter(([date]) => date.startsWith(`${month}-`))
      .reduce((sum, [, minutes]) => sum + Math.max(0, Number(minutes) || 0), 0),
  );
}

export function sumLegalWorkRollingDays(
  byDate: Readonly<Record<string, number>>,
  referenceDate: string,
  days: number,
): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(referenceDate) || !Number.isInteger(days) || days <= 0) return 0;
  const start = addDaysYmd(referenceDate, -(days - 1));
  return Math.round(
    Object.entries(byDate)
      .filter(([date]) => date >= start && date <= referenceDate)
      .reduce((sum, [, minutes]) => sum + Math.max(0, Number(minutes) || 0), 0),
  );
}

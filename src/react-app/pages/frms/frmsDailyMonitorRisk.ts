/**
 * Presenter for canonical daily-fatigue alerts. No numeric thresholds are
 * defined here; the Worker computes severity from tenant-specific parameters.
 * Missing/incomplete records do not dilute the risk percentage or certify fitness.
 */
export type MonitorItem = {
  funcionario_id?: unknown;
  status?: unknown;
  score_fadiga?: unknown;
  requires_operational_review?: unknown;
};
export type MonitorAlert = {
  tripulante_id?: unknown;
  nivel?: unknown;
};
export type MonitorStatus =
  | 'normal' | 'attention' | 'critical' | 'not_submitted'
  | 'incomplete_checkin' | 'no_duty' | 'unknown';
type AlertSeverity = 'CRITICO' | 'ATENCAO';

function validCrewId(value: unknown): number | null {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function indexCanonicalDailyAlerts(alerts: readonly MonitorAlert[]): Map<number, AlertSeverity> {
  const index = new Map<number, AlertSeverity>();
  for (const alert of alerts) {
    const id = validCrewId(alert.tripulante_id);
    if (id === null) continue;
    const severity: AlertSeverity = alert.nivel === 'CRITICO' ? 'CRITICO' : 'ATENCAO';
    if (severity === 'CRITICO' || !index.has(id)) index.set(id, severity);
  }
  return index;
}

export function classifyDailyMonitorItem(
  item: MonitorItem, alertIndex: ReadonlyMap<number, AlertSeverity>,
): MonitorStatus {
  const status = String(item.status ?? '');
  if (status === 'no_duty') return 'no_duty';
  if (status === 'not_submitted') return 'not_submitted';
  if (status === 'incomplete_checkin') return 'incomplete_checkin';
  if (!['normal', 'attention', 'critical', 'unfit_for_duty'].includes(status)) return 'unknown';
  if (status === 'critical' || status === 'unfit_for_duty') return 'critical';

  const id = validCrewId(item.funcionario_id);
  const severity = id === null ? null : alertIndex.get(id);
  if (severity === 'CRITICO') return 'critical';
  if (status === 'attention' || severity === 'ATENCAO' ||
      item.requires_operational_review === true ||
      item.requires_operational_review === 1) return 'attention';
  return 'normal';
}

export function summarizeDailyMonitor(
  items: readonly MonitorItem[], alerts: readonly MonitorAlert[],
) {
  const alertIndex = indexCanonicalDailyAlerts(alerts);
  let complete = 0;
  let critical = 0;
  let attention = 0;
  let pending = 0;
  const scores: number[] = [];
  for (const item of items) {
    const status = classifyDailyMonitorItem(item, alertIndex);
    if (status === 'not_submitted' || status === 'incomplete_checkin') pending += 1;
    if (!['normal', 'attention', 'critical'].includes(status)) continue;
    complete += 1;
    if (status === 'critical') critical += 1;
    if (status === 'attention') attention += 1;
    if (item.score_fadiga != null) {
      const score = Number(item.score_fadiga);
      if (Number.isFinite(score) && score >= 0) scores.push(score);
    }
  }
  return {
    alertIndex,
    complete,
    critical,
    attention,
    pending,
    mediaScore: scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null,
    riskPct: complete > 0 ? Math.round(((critical + attention) / complete) * 100) : null,
  };
}

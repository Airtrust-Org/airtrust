export type StatusLike = string | null | undefined;

function normalizeStatus(status: StatusLike): string {
  return String(status || '')
    .trim()
    .toUpperCase();
}

function escapeSqlLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

function toSqlList(statuses: readonly string[]): string {
  return `(${statuses.map((status) => `'${escapeSqlLiteral(status)}'`).join(', ')})`;
}

function toSqlEqualsAny(columnSql: string, statuses: readonly string[], fallback?: string): string {
  const lhs = fallback
    ? `COALESCE(${columnSql}, '${escapeSqlLiteral(fallback)}')`
    : columnSql;
  return `(${statuses.map((status) => `${lhs} = '${escapeSqlLiteral(status)}'`).join(' OR ')})`;
}

function toSqlNotEqualsAny(
  columnSql: string,
  statuses: readonly string[],
  fallback?: string,
): string {
  const lhs = fallback
    ? `COALESCE(${columnSql}, '${escapeSqlLiteral(fallback)}')`
    : columnSql;
  return statuses.map((status) => `${lhs} <> '${escapeSqlLiteral(status)}'`).join(' AND ');
}

export const SESSION_STATUS = {
  AGENDADO: 'AGENDADO',
  AGENDADA_LEGACY: 'AGENDADA',
  PENDENTE: 'PENDENTE',
  PENDING_LEGACY: 'PENDING',
  CONCLUIDA: 'CONCLUIDA',
  CONCLUIDO_LEGACY: 'CONCLUIDO',
  CANCELADA: 'CANCELADA',
  CANCELADO_LEGACY: 'CANCELADO',
} as const;

export const QUALIFICACAO_STATUS = {
  PLANEJADA: 'PLANEJADA',
  PLANEJADO_LEGACY: 'PLANEJADO',
  CONCLUIDA: 'CONCLUIDA',
  CONCLUIDO_LEGACY: 'CONCLUIDO',
  CANCELADA: 'CANCELADA',
  CANCELADO_LEGACY: 'CANCELADO',
  VALIDA: 'VALIDA',
  VENCIDA: 'VENCIDA',
  RENOVADA: 'RENOVADA',
} as const;

export const COMPLETED_STATUS_VALUES = [
  SESSION_STATUS.CONCLUIDA,
  SESSION_STATUS.CONCLUIDO_LEGACY,
] as const;

export const CANCELLED_STATUS_VALUES = [
  SESSION_STATUS.CANCELADA,
  SESSION_STATUS.CANCELADO_LEGACY,
] as const;

export const SCHEDULED_SESSION_STATUS_VALUES = [
  SESSION_STATUS.AGENDADO,
  SESSION_STATUS.PENDENTE,
  SESSION_STATUS.AGENDADA_LEGACY,
  SESSION_STATUS.PENDING_LEGACY,
] as const;

export const ACTIVE_OR_COMPLETED_SESSION_STATUS_VALUES = [
  SESSION_STATUS.AGENDADO,
  SESSION_STATUS.AGENDADA_LEGACY,
  SESSION_STATUS.CONCLUIDA,
  SESSION_STATUS.CONCLUIDO_LEGACY,
] as const;

export const TRAINING_PLANNED_STATUS_VALUES = [
  'PLANEJADO',
  'PLANEJADA',
  'PLANNED',
  SESSION_STATUS.AGENDADO,
  SESSION_STATUS.AGENDADA_LEGACY,
  SESSION_STATUS.PENDENTE,
  SESSION_STATUS.PENDING_LEGACY,
] as const;

export const TRAINING_CONFIRMED_STATUS_VALUES = ['CONFIRMADO', 'CONFIRMADA'] as const;
export const TRAINING_IN_PROGRESS_STATUS_VALUES = ['EM_ANDAMENTO', 'EM ANDAMENTO'] as const;

export const PLANNED_QUALIFICATION_STATUS_VALUES = [
  QUALIFICACAO_STATUS.PLANEJADA,
  QUALIFICACAO_STATUS.PLANEJADO_LEGACY,
] as const;

const completedStatusSet = new Set<string>(COMPLETED_STATUS_VALUES);
const cancelledStatusSet = new Set<string>(CANCELLED_STATUS_VALUES);
const activeOrCompletedSessionStatusSet = new Set<string>(ACTIVE_OR_COMPLETED_SESSION_STATUS_VALUES);
const plannedTrainingStatusSet = new Set<string>(TRAINING_PLANNED_STATUS_VALUES);
const confirmedTrainingStatusSet = new Set<string>(TRAINING_CONFIRMED_STATUS_VALUES);
const inProgressTrainingStatusSet = new Set<string>(TRAINING_IN_PROGRESS_STATUS_VALUES);
const plannedQualificationStatusSet = new Set<string>(PLANNED_QUALIFICATION_STATUS_VALUES);
const scheduledSessionStatusSet = new Set<string>(SCHEDULED_SESSION_STATUS_VALUES);

export const COMPLETED_STATUS_SQL = toSqlList(COMPLETED_STATUS_VALUES);
export const SCHEDULED_SESSION_STATUS_SQL = toSqlList(SCHEDULED_SESSION_STATUS_VALUES);
export const ACTIVE_OR_COMPLETED_SESSION_STATUS_SQL = toSqlList(
  ACTIVE_OR_COMPLETED_SESSION_STATUS_VALUES,
);

export function sqlStatusEqualsAny(
  columnSql: string,
  statuses: readonly string[],
  fallback?: string,
): string {
  return toSqlEqualsAny(columnSql, statuses, fallback);
}

export function sqlStatusNotEqualsAny(
  columnSql: string,
  statuses: readonly string[],
  fallback?: string,
): string {
  return toSqlNotEqualsAny(columnSql, statuses, fallback);
}

export function isCompletedStatus(status: StatusLike): boolean {
  return completedStatusSet.has(normalizeStatus(status));
}

export function isCancelledStatus(status: StatusLike): boolean {
  return cancelledStatusSet.has(normalizeStatus(status));
}

export function isActiveOrCompletedSessionStatus(status: StatusLike): boolean {
  return activeOrCompletedSessionStatusSet.has(normalizeStatus(status));
}

export function isPlannedQualificationStatus(status: StatusLike): boolean {
  return plannedQualificationStatusSet.has(normalizeStatus(status));
}

export function isScheduledSessionStatus(status: StatusLike): boolean {
  return scheduledSessionStatusSet.has(normalizeStatus(status));
}

export function isPlannedTrainingStatus(status: StatusLike): boolean {
  return plannedTrainingStatusSet.has(normalizeStatus(status));
}

export function isConfirmedTrainingStatus(status: StatusLike): boolean {
  return confirmedTrainingStatusSet.has(normalizeStatus(status));
}

export function isInProgressTrainingStatus(status: StatusLike): boolean {
  return inProgressTrainingStatusSet.has(normalizeStatus(status));
}

export function normalizeCompletedStatusForNewWrites(
  status: StatusLike,
): typeof SESSION_STATUS.CONCLUIDA | null {
  return isCompletedStatus(status) ? SESSION_STATUS.CONCLUIDA : null;
}

export function normalizeCancelledStatusForNewWrites(
  status: StatusLike,
): typeof SESSION_STATUS.CANCELADA | null {
  return isCancelledStatus(status) ? SESSION_STATUS.CANCELADA : null;
}

export function normalizePlannedStatusForNewWrites(
  status: StatusLike,
): typeof QUALIFICACAO_STATUS.PLANEJADA | null {
  return isPlannedQualificationStatus(status) ? QUALIFICACAO_STATUS.PLANEJADA : null;
}

export function normalizeSessionStatusForCompatibility(status: StatusLike): string | null {
  const normalized = normalizeStatus(status);
  if (!normalized) return null;
  if (normalized === SESSION_STATUS.AGENDADA_LEGACY) return SESSION_STATUS.AGENDADO;
  if (normalized === SESSION_STATUS.PENDING_LEGACY) return SESSION_STATUS.PENDENTE;
  if (isCompletedStatus(normalized)) return SESSION_STATUS.CONCLUIDA;
  if (isCancelledStatus(normalized)) return SESSION_STATUS.CANCELADA;
  return normalized;
}

export function normalizeQualificationStatusForCompatibility(status: StatusLike): string | null {
  const normalized = normalizeStatus(status);
  if (!normalized) return null;
  if (isPlannedQualificationStatus(normalized)) return QUALIFICACAO_STATUS.PLANEJADA;
  if (isCompletedStatus(normalized)) return QUALIFICACAO_STATUS.CONCLUIDA;
  if (isCancelledStatus(normalized)) return QUALIFICACAO_STATUS.CANCELADA;
  return normalized;
}

export function normalizeTrainingStatusForCompatibility(
  status: StatusLike,
): 'PLANEJADO' | 'CONFIRMADO' | 'EM_ANDAMENTO' | 'CONCLUIDO' | 'CANCELADO' | null {
  const normalized = normalizeStatus(status);
  if (!normalized) return null;
  if (isCancelledStatus(normalized)) return 'CANCELADO';
  if (isCompletedStatus(normalized)) return 'CONCLUIDO';
  if (isInProgressTrainingStatus(normalized)) return 'EM_ANDAMENTO';
  if (isConfirmedTrainingStatus(normalized)) return 'CONFIRMADO';
  if (isPlannedTrainingStatus(normalized) || isPlannedQualificationStatus(normalized)) {
    return 'PLANEJADO';
  }
  return normalized as 'PLANEJADO' | 'CONFIRMADO' | 'EM_ANDAMENTO' | 'CONCLUIDO' | 'CANCELADO';
}

export const COMPLETE_QUALIFICATION_HISTORY_STATUSES = [
  'VALIDA',
  'VENCIDA',
  'VENCENDO_30',
  'RENOVADA',
  'PLANEJADA',
  'CANCELADA',
] as const;

export function createDefaultQualificationHistoryStatusSet(): Set<string> {
  return new Set(COMPLETE_QUALIFICATION_HISTORY_STATUSES);
}

export function normalizeQualificationHistoryStatuses(values?: readonly string[]): string[] {
  return Array.from(
    new Set(
      (values || [])
        .map((value) => String(value || '').trim().toUpperCase())
        .filter(Boolean),
    ),
  );
}

export function shouldSendQualificationHistoryStatusFilter(values?: readonly string[]): boolean {
  const normalized = normalizeQualificationHistoryStatuses(values);
  if (normalized.length === 0) return false;

  const selected = new Set(normalized);
  return !(
    selected.size === COMPLETE_QUALIFICATION_HISTORY_STATUSES.length &&
    COMPLETE_QUALIFICATION_HISTORY_STATUSES.every((status) => selected.has(status))
  );
}

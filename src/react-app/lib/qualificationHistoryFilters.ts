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

export function normalizeQualificationHistorySectorFilter(
  selectedValues: readonly string[] | undefined,
  availableValues: readonly string[] | undefined,
): string[] {
  const selected = Array.from(
    new Set((selectedValues || []).map((value) => String(value).trim()).filter(Boolean)),
  );
  const available = Array.from(
    new Set((availableValues || []).map((value) => String(value).trim()).filter(Boolean)),
  );

  if (selected.length === 0 || available.length === 0) return selected;

  const availableSet = new Set(available);
  const selectsEveryAvailableSector =
    selected.length === available.length && selected.every((value) => availableSet.has(value));

  // Selecionar todos os setores disponíveis é semanticamente igual a não
  // filtrar por setor. Manter `setor_ids` nesse caso exclui registros legados
  // sem setor_id, que ainda fazem parte do histórico completo do tenant.
  return selectsEveryAvailableSector ? [] : selected;
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

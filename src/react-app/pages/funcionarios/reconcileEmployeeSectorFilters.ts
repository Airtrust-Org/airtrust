/** Restricts persisted sector filters to the current, authorized catalog. */
export function reconcileEmployeeSectorFilters(
  selected: readonly string[],
  available: readonly string[],
  catalogLoaded: boolean,
): { selected: string[]; applied: string[] } {
  if (!catalogLoaded) return { selected: [...selected], applied: [] };

  const permitted = new Set(available);
  const sanitized = [...new Set(selected.filter((id) => permitted.has(id)))];
  return {
    selected: sanitized,
    applied: permitted.size > 0 && sanitized.length === permitted.size ? [] : sanitized,
  };
}

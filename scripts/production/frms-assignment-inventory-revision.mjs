/**
 * Mirror the governed runtime's revision precedence for a read-only inventory:
 * an exact tenant revision takes precedence over a generic baseline, then
 * highest revision number and most recent effective date. Only an exact
 * priority tie within the selected scope is ambiguous.
 *
 * `rows` must already be filtered to effective ACTIVE profile revisions by
 * the caller's read-only production query. No D1 client or side effects here.
 */
export function chooseFrmsInventoryRevision(rows, empresaId) {
  const exactTenantRows = rows.filter((row) =>
    row.empresa_id != null && Number(row.empresa_id) === empresaId,
  );
  const scoped = exactTenantRows.length > 0
    ? exactTenantRows
    : rows.filter((row) => row.empresa_id == null);
  const ordered = [...scoped].sort((a, b) =>
    Number(b.revision_number) - Number(a.revision_number) ||
    String(b.effective_from).localeCompare(String(a.effective_from)),
  );
  const revision = ordered[0] ?? null;
  if (!revision) return { revision: null, ambiguous: false };
  const equallyPreferred = ordered.filter((row) =>
    Number(row.revision_number) === Number(revision.revision_number) &&
    row.effective_from === revision.effective_from,
  );
  return { revision, ambiguous: equallyPreferred.length !== 1 };
}

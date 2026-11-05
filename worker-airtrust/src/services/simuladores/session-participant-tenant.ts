/**
 * Validate every participant referenced by a simulator session mutation before
 * the session, its participant rows, or any ficha is changed.
 *
 * An ID from another tenant, a deleted employee, or an unknown ID is rejected
 * without revealing whether that ID exists elsewhere.
 */
export async function validateSessionParticipantTenant(
  db: D1Database,
  empresaId: number,
  input: unknown,
): Promise<boolean> {
  if (!Number.isSafeInteger(empresaId) || empresaId <= 0 || !Array.isArray(input)) {
    return false;
  }

  const ids = new Set<number>();
  for (const participant of input) {
    if (!participant || typeof participant !== 'object' || Array.isArray(participant)) {
      return false;
    }
    const value = (participant as Record<string, unknown>).funcionario_id;
    // Keep the legacy behavior of ignoring items without an employee identifier.
    if (value === undefined || value === null || value === '') continue;
    if ((typeof value !== 'number' && typeof value !== 'string') ||
        (typeof value === 'string' && !/^\d+$/.test(value))) {
      return false;
    }
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id <= 0) return false;
    ids.add(id);
  }

  const unique = [...ids];
  // SQLite/D1 binds have a finite limit; leave room for the tenant parameter.
  for (let offset = 0; offset < unique.length; offset += 250) {
    const batch = unique.slice(offset, offset + 250);
    const placeholders = batch.map(() => '?').join(', ');
    const result = await db.prepare(
      `SELECT id FROM funcionarios
        WHERE empresa_id = ? AND deleted_at IS NULL AND id IN (${placeholders})`,
    ).bind(empresaId, ...batch).all<{ id: number }>();
    const found = new Set((result.results || []).map((row) => Number(row.id)));
    if (found.size !== batch.length || batch.some((id) => !found.has(id))) {
      return false;
    }
  }
  return true;
}

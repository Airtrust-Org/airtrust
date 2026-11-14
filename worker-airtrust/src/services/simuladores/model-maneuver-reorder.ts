/**
 * PERF-05: model maneuver reorder. The route has already verified that
 * modeloId belongs to the authenticated tenant, and the UPDATE remains
 * restricted to that model. Invalid inputs keep the original skip semantics.
 */
export async function reorderModelManeuversAtomically(
  db: D1Database,
  modeloId: string,
  items: readonly unknown[],
): Promise<number> {
  const statements: D1PreparedStatement[] = [];

  for (const raw of items) {
    const item = raw as { id?: unknown; ordem?: unknown } | null | undefined;
    const relacaoId = Number(item?.id);
    const ordem = Number(item?.ordem);
    if (!Number.isInteger(relacaoId) || relacaoId <= 0 || !Number.isInteger(ordem) || ordem <= 0) {
      continue;
    }

    statements.push(db.prepare(
      `UPDATE modelos_sessao_manobras
       SET ordem = ?, updated_at = datetime('now')
       WHERE id = ? AND modelo_id = ? AND deleted_at IS NULL`,
    ).bind(ordem, relacaoId, modeloId));
  }

  if (statements.length > 0) {
    await db.batch(statements);
  }
  return statements.length;
}

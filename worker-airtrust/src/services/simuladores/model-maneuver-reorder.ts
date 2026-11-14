/**
 * PERF-05: model maneuver reorder. The route has already verified that
 * modeloId belongs to the authenticated tenant. Every UPDATE checks
 * tenant ownership in SQL as defense in depth. Invalid inputs keep the original skip semantics.
 */
export async function reorderModelManeuversAtomically(
  db: D1Database,
  modeloId: string,
  empresaId: number,
  items: readonly unknown[],
): Promise<number> {
  if (!Number.isSafeInteger(empresaId) || empresaId <= 0 || !modeloId.trim()) {
    throw new Error('INVALID_MODEL_REORDER_TENANT_SCOPE');
  }
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
       WHERE id = ? AND modelo_id = ? AND deleted_at IS NULL
         AND EXISTS (
           SELECT 1 FROM modelos_sessao m
            WHERE m.id = modelos_sessao_manobras.modelo_id
              AND m.empresa_id = ? AND m.deleted_at IS NULL
         )`,
    ).bind(ordem, relacaoId, modeloId, empresaId));
  }

  if (statements.length > 0) {
    await db.batch(statements);
  }
  return statements.length;
}

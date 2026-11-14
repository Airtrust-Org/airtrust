export type SgsoSlaNormalizedRow = {
  fase: string;
  horasPrazo: number;
  horasAlerta: number;
  ativo: number;
};

/**
 * A single D1 batch replaces per-phase network round trips, with rollback on
 * any failure. When a request repeats the same validated phase, the last value
 * wins as it did with the original sequential upserts.
 *
 * Callers must validate and normalize all submitted rows BEFORE invoking this
 * function; this service does not weaken route-level RBAC or input checks.
 */
export async function upsertSgsoSlaBatch(
  db: D1Database,
  empresaId: number,
  rows: readonly SgsoSlaNormalizedRow[],
): Promise<void> {
  if (!rows.length) return;
  const byPhase = new Map(rows.map((row) => [row.fase, row]));
  const statements = [...byPhase.values()].map((row) =>
    db.prepare(
      `INSERT INTO sgso_sla_config
        (empresa_id, fase, horas_prazo, horas_alerta_previa, ativo, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
       ON CONFLICT(empresa_id, fase) DO UPDATE SET
         horas_prazo = excluded.horas_prazo,
         horas_alerta_previa = excluded.horas_alerta_previa,
         ativo = excluded.ativo,
         updated_at = datetime('now')`,
    ).bind(empresaId, row.fase, row.horasPrazo, row.horasAlerta, row.ativo),
  );
  await db.batch(statements);
}

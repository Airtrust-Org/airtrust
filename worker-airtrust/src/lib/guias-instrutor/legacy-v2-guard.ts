import type { D1Database } from '@cloudflare/workers-types';

/**
 * Fails closed on legacy 51-guide executors once `_v2` has diverged from the
 * legacy tables (for example after creating V18/functional guides in `_v2`).
 * While `_v2` matches the legacy rows, `0586` triggers mirror legacy relinks
 * into `_v2` atomically inside `db.batch()`.
 */
export async function assertNoV2GuideDivergence(
  db: D1Database,
  empresaId: number,
  fail: (message: string) => never,
): Promise<void> {
  const v2Tables = await db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('simuladores_guias_instrutor_v2', 'simuladores_modelos_sessao_guias_v2')",
    )
    .all<{ name: string }>()
    .catch(() => ({ results: [] as Array<{ name: string }> }));

  const names = new Set((v2Tables.results || []).map((r) => r.name));
  if (!names.has('simuladores_guias_instrutor_v2') || !names.has('simuladores_modelos_sessao_guias_v2')) {
    return;
  }

  const guideDrift = await db
    .prepare(
      `SELECT 1 AS drift
       FROM simuladores_guias_instrutor_v2 v2
       LEFT JOIN simuladores_guias_instrutor l ON l.id = v2.id
       WHERE v2.empresa_id = ?1
         AND (
           l.id IS NULL
           OR v2.programa != l.programa
           OR IFNULL(v2.modelo_aeronave_id, -1) != IFNULL(l.modelo_aeronave_id, -1)
           OR v2.status != l.status
           OR IFNULL(v2.deleted_at, '') != IFNULL(l.deleted_at, '')
         )
       LIMIT 1`,
    )
    .bind(empresaId)
    .first<{ drift: number }>();

  if (guideDrift) {
    fail(
      'Executor legado bloqueado: simuladores_guias_instrutor_v2 já possui guias V18/funcionais independentes das tabelas legadas.',
    );
  }

  const linkDrift = await db
    .prepare(
      `SELECT 1 AS drift
       FROM simuladores_modelos_sessao_guias_v2 v2
       LEFT JOIN simuladores_modelos_sessao_guias l ON l.id = v2.id
       WHERE v2.empresa_id = ?1
         AND (
           l.id IS NULL
           OR v2.modelo_sessao_id != l.modelo_sessao_id
           OR v2.guia_id != l.guia_id
           OR IFNULL(v2.deleted_at, '') != IFNULL(l.deleted_at, '')
         )
       LIMIT 1`,
    )
    .bind(empresaId)
    .first<{ drift: number }>();

  if (linkDrift) {
    fail(
      'Executor legado bloqueado: simuladores_modelos_sessao_guias_v2 já possui vínculos V18 independentes das tabelas legadas.',
    );
  }
}

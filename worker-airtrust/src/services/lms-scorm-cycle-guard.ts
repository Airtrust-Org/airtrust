import { ApiError } from '../middleware/error-handler';

/**
 * Enrollments are reused for a governed new cycle; a still-open old iframe
 * may flush its asynchronous SCORM keepalive after that reset. The short-lived
 * HttpOnly cookie belongs to the browser, not to the old iframe's cycle, so
 * it cannot by itself protect the renewed enrollment from stale CMI.
 *
 * Only server-stored current-cycle identity may authorize that write.
 * Old integrations without a claimed cycle preserve their legacy behavior;
 * modern wrapper launches always send their server-rendered ciclo_id.
 */
export async function assertScormCommitCycle(
  db: D1Database,
  empresaId: number,
  matriculaId: number,
  claimedCycleId: number | undefined,
): Promise<void> {
  if (claimedCycleId === undefined) return;
  const active = await db.prepare(
    `SELECT id FROM lms_matricula_ciclos
       WHERE matricula_id = ? AND empresa_id = ?
         AND ciclo_atual = 1 AND deleted_at IS NULL
       LIMIT 1`,
  ).bind(matriculaId, empresaId).first<{ id: number }>();
  if (!active || active.id !== claimedCycleId) {
    throw new ApiError(
      'A sessão pertence a outro ciclo. Reabra o treinamento para continuar.',
      409,
      'LMS_SCORM_CYCLE_MISMATCH',
    );
  }
}

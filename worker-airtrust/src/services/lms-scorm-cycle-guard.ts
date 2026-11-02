import { ApiError } from '../middleware/error-handler';

/**
 * Enrollments are reused for a governed new cycle; a still-open old iframe
 * may flush its asynchronous SCORM keepalive after that reset. The short-lived
 * HttpOnly cookie belongs to the browser, not to the old iframe's cycle, so
 * it cannot by itself protect the renewed enrollment from stale CMI.
 *
 * Only server-stored current-cycle identity may authorize that write.
 * A commit without a claimed cycle is ambiguous: it may be a delayed write
 * from an iframe opened in an archived cycle. Require a fresh launch instead
 * of preserving the legacy unscoped write path.
 */
export async function assertScormCommitCycle(
  db: D1Database,
  empresaId: number,
  matriculaId: number,
  claimedCycleId: number | undefined,
): Promise<void> {
  if (claimedCycleId === undefined || !Number.isSafeInteger(claimedCycleId) || claimedCycleId <= 0) {
    throw new ApiError(
      'O commit SCORM não informa o ciclo da sessão. Reabra a matrícula para continuar.',
      409,
      'LMS_SCORM_CYCLE_MISMATCH',
    );
  }
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

/**
 * Write-time half of the cycle guard (#1541/#1422). `assertScormCommitCycle`
 * runs before the SCORM merge; a governed renewal may commit between that read
 * and the CMI upsert. The upsert therefore carries this predicate in its own
 * statement, so a commit from an archived cycle writes nothing even under that
 * race. Bind order: ciclo_id, matricula_id, empresa_id.
 */
export const SCORM_ACTIVE_CYCLE_WRITE_GUARD_SQL = `EXISTS (
  SELECT 1 FROM lms_matricula_ciclos guard_cy
   WHERE guard_cy.id = ? AND guard_cy.matricula_id = ? AND guard_cy.empresa_id = ?
     AND guard_cy.ciclo_atual = 1 AND guard_cy.deleted_at IS NULL)`;

export function scormActiveCycleWriteGuardBinds(
  cicloId: number,
  matriculaId: number,
  empresaId: number,
): [number, number, number] {
  return [cicloId, matriculaId, empresaId];
}

/** Zero rows written by the guarded upsert means the claimed cycle was archived. */
export function assertScormCycleWriteApplied(changes: unknown): void {
  const n = Number(changes);
  if (!Number.isFinite(n) || n < 1) {
    throw new ApiError(
      'A sessão pertence a outro ciclo. Reabra o treinamento para continuar.',
      409,
      'LMS_SCORM_CYCLE_MISMATCH',
    );
  }
}

import { ApiError } from '../errors/api-error';

/**
 * The assessment policy belongs to an EDITION, not to the course row. A
 * course-level edit is safe only before its FIRST active package or enrollment.
 * An active package can require scored/external assessment even when nobody is
 * enrolled yet; silently changing the course column would create a policy /
 * immutable-package mismatch. Edition activation owns those transitions and
 * freezes terminal cycles under their original policy.
 */
export async function assertCoursePolicyChangeAllowed(
  db: D1Database, empresaId: number, cursoId: number,
  current: string, requested: string | undefined,
): Promise<void> {
  if (requested === undefined || requested === current) return;
  const enrolled = await db
    .prepare('SELECT COUNT(*) AS n FROM lms_matriculas WHERE curso_id = ? AND empresa_id = ? AND deleted_at IS NULL')
    .bind(cursoId, empresaId)
    .first<{ n: number }>();
  const enrollmentCount = Number(enrolled?.n);
  if (enrolled?.n == null || !Number.isSafeInteger(enrollmentCount) || enrollmentCount > 0) {
    throw new ApiError(
      'A política avaliativa de um curso com matrículas só muda ao ativar uma nova edição do pacote.',
      409, 'POLICY_CHANGE_REQUIRES_EDITION_ACTIVATION');
  }
  // No enrolled users is insufficient: an ACTIVE immutable SCORM edition may
  // still mandate a passing internal quiz or an external exam. Never detach
  // that package contract with an unrelated course metadata edit.
  const active = await db
    .prepare("SELECT COUNT(*) AS n FROM lms_scorm_package_versions WHERE curso_id = ? AND empresa_id = ? AND status = 'ACTIVE'")
    .bind(cursoId, empresaId)
    .first<{ n: number }>();
  const activeCount = Number(active?.n);
  if (active?.n == null || !Number.isSafeInteger(activeCount) || activeCount > 0) {
    throw new ApiError(
      'A política avaliativa de um curso com pacote SCORM ativo só muda ao ativar uma nova edição.',
      409, 'POLICY_CHANGE_REQUIRES_EDITION_ACTIVATION');
  }
}

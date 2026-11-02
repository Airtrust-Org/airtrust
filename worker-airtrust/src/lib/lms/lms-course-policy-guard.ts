import { ApiError } from '../../middleware/error-handler';

/**
 * The assessment policy belongs to an EDITION, not to the course row: once
 * learners are enrolled it only moves through the audited edition activation,
 * which freezes every ended cycle with the policy it ended under.
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
  if ((Number(enrolled?.n) || 0) > 0) {
    throw new ApiError(
      'A política avaliativa de um curso com matrículas só muda ao ativar uma nova edição do pacote.',
      409, 'POLICY_CHANGE_REQUIRES_EDITION_ACTIVATION');
  }
}

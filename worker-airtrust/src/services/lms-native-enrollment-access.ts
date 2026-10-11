/**
 * Read-only Native V1 admission check against the EXISTING LMS enrollment
 * and course records. This service is intentionally not mounted on an API
 * route while native course type/version pinning lacks Schema V2 governance.
 *
 * Call only after auth() and tenant resolution. Never trust a client-supplied
 * funcionario_id or a display percent to grant access or completion.
 */
export type NativeAdmission = {
  matriculaId: number;
  cursoId: number;
  funcionarioId: number;
  empresaId: number;
  mode: 'LEARN' | 'REVIEW';
};

export class NativeAdmissionError extends Error {
  constructor(public readonly status: 400 | 403 | 404 | 409, public readonly code: string) {
    super(code);
    this.name = 'NativeAdmissionError';
  }
}

export async function resolveNativeEnrollmentAdmission(params: {
  db: D1Database;
  empresaId: number;
  matriculaId: number;
  actorUserId: number;
}): Promise<NativeAdmission> {
  const { db, empresaId, matriculaId, actorUserId } = params;
  if (![empresaId, matriculaId, actorUserId].every((value) => Number.isSafeInteger(value) && value > 0)) {
    throw new NativeAdmissionError(400, 'NATIVE_INVALID_ENROLLMENT_CONTEXT');
  }

  const enrollment = await db.prepare(
    `SELECT m.id, m.curso_id, m.funcionario_id, m.empresa_id, m.status,
            c.tipo_conteudo, c.ativo, c.publicado
       FROM lms_matriculas m
       JOIN lms_cursos c ON c.id = m.curso_id AND c.empresa_id = m.empresa_id
      WHERE m.id = ? AND m.empresa_id = ?
        AND m.deleted_at IS NULL AND c.deleted_at IS NULL
      LIMIT 1`
  ).bind(matriculaId, empresaId).first<{
    id: number; curso_id: number; funcionario_id: number; empresa_id: number;
    status: string; tipo_conteudo: string; ativo: number; publicado: number;
  }>();

  if (!enrollment || enrollment.empresa_id !== empresaId || enrollment.id !== matriculaId) {
    throw new NativeAdmissionError(404, 'NATIVE_ENROLLMENT_NOT_FOUND');
  }
  if (enrollment.tipo_conteudo !== 'native') {
    throw new NativeAdmissionError(404, 'NATIVE_COURSE_NOT_AVAILABLE');
  }

  // Always resolve employee ownership from the DB, never JWT's possibly stale
  // funcionarioId or user-provided identification. Global auth guards tenant
  // membership, but the individual enrollment still needs exact ownership.
  const actor = await db.prepare(
    `SELECT funcionario_id FROM usuarios
       WHERE id = ? AND deleted_at IS NULL LIMIT 1`
  ).bind(actorUserId).first<{ funcionario_id: number | null }>();
  if (!actor || !Number.isSafeInteger(actor.funcionario_id) ||
      Number(actor.funcionario_id) <= 0 ||
      actor.funcionario_id !== enrollment.funcionario_id) {
    throw new NativeAdmissionError(403, 'NATIVE_ENROLLMENT_ACCESS_DENIED');
  }
  if (enrollment.ativo !== 1 || enrollment.publicado !== 1) {
    throw new NativeAdmissionError(409, 'NATIVE_COURSE_NOT_PUBLISHED');
  }
  if (!['NAO_INICIADO', 'EM_ANDAMENTO', 'CONCLUIDO'].includes(enrollment.status)) {
    throw new NativeAdmissionError(409, 'NATIVE_ENROLLMENT_NOT_ACTIVE');
  }
  return {
    matriculaId,
    cursoId: enrollment.curso_id,
    empresaId,
    funcionarioId: enrollment.funcionario_id,
    mode: enrollment.status === 'CONCLUIDO' ? 'REVIEW' : 'LEARN',
  };
}

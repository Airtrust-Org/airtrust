/**
 * Native V1 enrollment start, staging-only integration service.
 * Never accept a client-supplied empresa, ciclo, course or edition hash.
 *
 * This ONLY changes NAO_INICIADO to EM_ANDAMENTO using the canonical
 * enrollment row. It does not write lesson evidence, score, qualification,
 * certificate or Compliance. Caller must first validate the private R2
 * package by loadNativePrivateCourse and pass its exact pinned scope.
 */
export class NativeEnrollmentStartError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'NativeEnrollmentStartError';
  }
}

const START_SQL = [
  'UPDATE lms_matriculas SET status=\'EM_ANDAMENTO\',',
  "data_inicio=COALESCE(data_inicio, datetime('now')), updated_at=datetime('now')",
  'WHERE id=? AND empresa_id=? AND curso_id=?',
  "AND status='NAO_INICIADO' AND deleted_at IS NULL",
  'AND EXISTS (SELECT 1 FROM usuarios u',
  'WHERE u.id=? AND u.funcionario_id=lms_matriculas.funcionario_id',
  'AND u.deleted_at IS NULL)',
  'AND EXISTS (SELECT 1 FROM lms_native_matricula_edicoes b',
  'JOIN lms_native_edicoes ed ON ed.id=b.edicao_id',
  'AND ed.empresa_id=b.empresa_id AND ed.curso_id=b.curso_id',
  'JOIN lms_matricula_ciclos ciclo ON ciclo.id=b.ciclo_id',
  'AND ciclo.matricula_id=b.matricula_id AND ciclo.empresa_id=b.empresa_id',
  'AND ciclo.curso_id=b.curso_id',
  'JOIN lms_cursos c ON c.id=b.curso_id AND c.empresa_id=b.empresa_id',
  'WHERE b.matricula_id=lms_matriculas.id',
  'AND b.empresa_id=lms_matriculas.empresa_id',
  'AND b.curso_id=lms_matriculas.curso_id',
  'AND b.ciclo_id=? AND ed.artifact_sha256=?',
  "AND ed.status='PUBLISHED' AND ciclo.ciclo_atual=1",
  "AND ciclo.deleted_at IS NULL AND c.deleted_at IS NULL",
  "AND c.tipo_conteudo='native' AND c.ativo=1 AND c.publicado=1)",
].join(' ');

const RECHECK_SQL = [
  'SELECT m.status FROM lms_matriculas m',
  'JOIN usuarios u ON u.id=? AND u.funcionario_id=m.funcionario_id AND u.deleted_at IS NULL',
  'JOIN lms_cursos c ON c.id=m.curso_id AND c.empresa_id=m.empresa_id',
  'JOIN lms_native_matricula_edicoes b ON b.matricula_id=m.id',
  'AND b.empresa_id=m.empresa_id AND b.curso_id=m.curso_id',
  'JOIN lms_native_edicoes ed ON ed.id=b.edicao_id',
  'AND ed.empresa_id=b.empresa_id AND ed.curso_id=b.curso_id',
  'JOIN lms_matricula_ciclos ciclo ON ciclo.id=b.ciclo_id',
  'AND ciclo.matricula_id=m.id AND ciclo.empresa_id=m.empresa_id',
  'AND ciclo.curso_id=m.curso_id',
  'WHERE m.id=? AND m.empresa_id=? AND m.curso_id=?',
  'AND b.ciclo_id=? AND ed.artifact_sha256=?',
  "AND ed.status='PUBLISHED' AND m.deleted_at IS NULL",
  "AND ciclo.ciclo_atual=1 AND ciclo.deleted_at IS NULL",
  "AND c.tipo_conteudo='native' AND c.ativo=1 AND c.publicado=1",
  'AND c.deleted_at IS NULL LIMIT 1',
].join(' ');

export type NativeEnrollmentStartReceipt = Readonly<{
  state: 'STARTED' | 'ALREADY_STARTED';
  editionHash: string;
  cicloId: number;
}>;

export async function startNativeEnrollment(params: {
  db: D1Database;
  actorUserId: number;
  empresaId: number;
  matriculaId: number;
  cursoId: number;
  cicloId: number;
  editionHash: string;
}): Promise<NativeEnrollmentStartReceipt> {
  const { db, actorUserId, empresaId, matriculaId, cursoId, cicloId, editionHash } = params;
  if (![actorUserId, empresaId, matriculaId, cursoId, cicloId]
      .every((x) => Number.isSafeInteger(x) && x > 0) ||
      !/^[a-f0-9]{64}$/.test(editionHash)) {
    throw new NativeEnrollmentStartError('NATIVE_START_INVALID_CONTEXT');
  }
  // Single-statement authorization + edition/cycle check closes a window in
  // which the course or enrollment could be revoked after a separate SELECT.
  const result = await db.prepare(START_SQL).bind(
    matriculaId, empresaId, cursoId, actorUserId, cicloId, editionHash,
  ).run();
  if (result.success && result.meta.changes === 1) {
    return { state: 'STARTED', cicloId, editionHash };
  }

  // A retry is idempotent only when the SAME user, tenant, enrollment, cycle,
  // edition and active publication remain intact. Do not re-open CANCELADO,
  // CONCLUIDO or a revoked course.
  const existing = await db.prepare(RECHECK_SQL).bind(
    actorUserId, matriculaId, empresaId, cursoId, cicloId, editionHash,
  ).first<{ status: string }>();
  if (existing?.status === 'EM_ANDAMENTO') {
    return { state: 'ALREADY_STARTED', cicloId, editionHash };
  }
  throw new NativeEnrollmentStartError('NATIVE_START_ACCESS_OR_STATE_DENIED');
}

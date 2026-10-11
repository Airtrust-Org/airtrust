/**
 * Native V1 staging-only enrollment start. Source of tenant, user, edition
 * and current cycle MUST come from the authenticated Worker + private R2.
 *
 * Both LMS status mirrors (lms_matriculas and its active
 * lms_matricula_ciclos row) are transitioned in a single D1.batch()
 * transaction. Never manufacture completion or qualification evidence.
 */
export class NativeEnrollmentStartError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'NativeEnrollmentStartError';
  }
}

/**
 * Every statement uses the same six server-owned placeholders in this order:
 * matricula, tenant, course, actor, cycle, SHA of published private edition.
 */
const PINNED_SCOPE = [
  'FROM lms_matriculas m',
  'JOIN usuarios u ON u.id=? AND u.funcionario_id=m.funcionario_id AND u.deleted_at IS NULL',
  'JOIN lms_cursos c ON c.id=m.curso_id AND c.empresa_id=m.empresa_id',
  'JOIN lms_native_matricula_edicoes b ON b.matricula_id=m.id',
  'AND b.empresa_id=m.empresa_id AND b.curso_id=m.curso_id',
  'JOIN lms_native_edicoes ed ON ed.id=b.edicao_id',
  'AND ed.empresa_id=b.empresa_id AND ed.curso_id=b.curso_id',
  'JOIN lms_matricula_ciclos ciclo ON ciclo.id=b.ciclo_id',
  'AND ciclo.matricula_id=m.id AND ciclo.empresa_id=m.empresa_id',
  'AND ciclo.curso_id=m.curso_id AND ciclo.funcionario_id=m.funcionario_id',
  'WHERE m.id=? AND m.empresa_id=? AND m.curso_id=?',
  'AND ciclo.id=? AND ed.artifact_sha256=?',
  "AND ed.status='PUBLISHED' AND m.deleted_at IS NULL",
  'AND ciclo.ciclo_atual=1 AND ciclo.deleted_at IS NULL',
  "AND c.tipo_conteudo='native' AND c.ativo=1 AND c.publicado=1",
  'AND c.deleted_at IS NULL',
].join(' ');

// D1.batch() executes sequentially in one transaction. The first statement
// refuses pre-existing status drift; a plain SELECT returning 0 would NOT
// abort and could accidentally permit half a lifecycle write. SQLite json()
// deliberately raises on the malformed non-JSON error literal.
const PREFLIGHT_SQL = [
  'SELECT json(CASE WHEN EXISTS (SELECT 1', PINNED_SCOPE,
  "AND ((m.status='NAO_INICIADO' AND ciclo.status='NAO_INICIADO')",
  "OR (m.status='EM_ANDAMENTO' AND ciclo.status='EM_ANDAMENTO')))",
  "THEN 'null' ELSE 'NATIVE_START_SCOPE_OR_STATUS_DRIFT' END)",
].join(' ');

const START_MATRICULA_SQL = [
  "UPDATE lms_matriculas SET status='EM_ANDAMENTO',",
  "data_inicio=COALESCE(data_inicio,datetime('now')),updated_at=datetime('now')",
  'WHERE id IN (SELECT m.id', PINNED_SCOPE,
  "AND m.status='NAO_INICIADO' AND ciclo.status='NAO_INICIADO')",
].join(' ');

const START_CYCLE_SQL = [
  "UPDATE lms_matricula_ciclos SET status='EM_ANDAMENTO',",
  'data_inicio=COALESCE(data_inicio,(SELECT m.data_inicio FROM lms_matriculas m',
  'WHERE m.id=lms_matricula_ciclos.matricula_id)),',
  "updated_at=datetime('now')",
  'WHERE id IN (SELECT ciclo.id', PINNED_SCOPE,
  "AND m.status='EM_ANDAMENTO' AND ciclo.status='NAO_INICIADO')",
].join(' ');

// If either status cannot be synchronized (including a concurrent revocation),
// abort the ENTIRE D1.batch() transaction rather than persisting partial state.
const POSTCHECK_SQL = [
  'SELECT json(CASE WHEN EXISTS (SELECT 1', PINNED_SCOPE,
  "AND m.status='EM_ANDAMENTO' AND ciclo.status='EM_ANDAMENTO')",
  "THEN 'null' ELSE 'NATIVE_START_ATOMIC_SYNC_FAILED' END)",
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
      .every((value) => Number.isSafeInteger(value) && value > 0) ||
      !/^[a-f0-9]{64}$/.test(editionHash)) {
    throw new NativeEnrollmentStartError('NATIVE_START_INVALID_CONTEXT');
  }

  const binds = [actorUserId, matriculaId, empresaId, cursoId, cicloId, editionHash] as const;
  // D1.batch is transactional; a failed assertion rolls back both writes.
  // Do not break this into separate .run() calls.
  let results: D1Result[];
  try {
    results = await db.batch([
      db.prepare(PREFLIGHT_SQL).bind(...binds),
      db.prepare(START_MATRICULA_SQL).bind(...binds),
      db.prepare(START_CYCLE_SQL).bind(...binds),
      db.prepare(POSTCHECK_SQL).bind(...binds),
    ]);
  } catch {
    throw new NativeEnrollmentStartError('NATIVE_START_ATOMIC_SYNC_REJECTED');
  }
  if (results.length !== 4 || results.some((result) => !result.success)) {
    throw new NativeEnrollmentStartError('NATIVE_START_ATOMIC_SYNC_REJECTED');
  }
  const matriculaChanges = results[1]?.meta.changes;
  const cycleChanges = results[2]?.meta.changes;
  if (matriculaChanges === 1 && cycleChanges === 1) {
    return { state: 'STARTED', cicloId, editionHash };
  }
  if (matriculaChanges === 0 && cycleChanges === 0) {
    return { state: 'ALREADY_STARTED', cicloId, editionHash };
  }
  // This should be impossible after the fail-closed postcheck, but never
  // report success if a nonconforming D1 adapter returns mixed row counts.
  throw new NativeEnrollmentStartError('NATIVE_START_INCONSISTENT_CHANGES');
}

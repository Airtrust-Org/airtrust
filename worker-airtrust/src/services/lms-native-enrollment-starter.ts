/**
 * Native V1 staging-only enrollment start. Source of tenant, user, edition
 * and current cycle MUST come from the authenticated Worker + private R2.
 *
 * Both LMS status mirrors (lms_matriculas and its active
 * lms_matricula_ciclos row) are transitioned in a single D1.batch()
 * transaction. Never manufacture completion or qualification evidence.
 */
import type { Env } from '../types';
import { NATIVE_ACTIVE_EMPLOYEE_JOIN, NATIVE_ACTIVE_USER_CONDITION } from './lms-native-active-learner-sql';
import { canReadNativeCatalogActivation, nativeScopedSql } from './lms-native-catalog-legacy-guard';

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
  NATIVE_ACTIVE_USER_CONDITION,
  NATIVE_ACTIVE_EMPLOYEE_JOIN,
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
  'SELECT json_extract(json(COALESCE((SELECT CASE',
  "WHEN m.status='NAO_INICIADO' AND ciclo.status='NAO_INICIADO'",
  'THEN \'"START"\'',
  "WHEN m.status='EM_ANDAMENTO' AND ciclo.status='EM_ANDAMENTO'",
  'THEN \'"ALREADY_STARTED"\'',
  "ELSE 'NATIVE_START_SCOPE_OR_STATUS_DRIFT' END",
  PINNED_SCOPE, 'LIMIT 1),',
  "'NATIVE_START_SCOPE_OR_STATUS_DRIFT')), char(36)) AS native_start_state",
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


// Activating the SCORM catalog marker alone must not start an enrollment.
// The authored HTML5 launch and modular grading capabilities must be enabled,
// and an APPROVED policy must belong to the exact pinned edition. Physical
// Native V1 keeps its original start contract.
function exactTenant(raw: string | undefined, tenant: number): boolean {
  return !!raw && !raw.includes('*') &&
    raw.split(',').some(value => value.trim() === String(tenant));
}

function scopedStartSql(sql: string, env: Env | undefined, tenant: number): string {
  const scoped = nativeScopedSql(sql, env, tenant);
  if (!env || !canReadNativeCatalogActivation(env, tenant)) return scoped;
  const launchReady =
    exactTenant(env.PLAYER3_AUTHORED_LAUNCH_ENABLED_TENANTS, tenant) &&
    exactTenant(env.PLAYER3_MODULE_ATTEMPTS_ENABLED_TENANTS, tenant);
  // Do not even reference the modular table while either gate is OFF:
  // the catalog marker can predate the governed modular schema.
  const approval = launchReady
    ? `EXISTS (SELECT 1 FROM lms_player3_politicas p
       WHERE p.edicao_id=ed.id AND p.empresa_id=c.empresa_id
         AND p.curso_id=c.id AND p.estado='APPROVED')`
    : '0';
  const anchor = "c.tipo_conteudo='scorm' AND EXISTS (";
  if (scoped.split(anchor).length !== 2) {
    throw new NativeEnrollmentStartError('NATIVE_START_SCOPE_CONTRACT_INVALID');
  }
  return scoped.replace(anchor,
    `c.tipo_conteudo='scorm' AND (${approval}) AND EXISTS (`);
}

export type NativeEnrollmentStartReceipt = Readonly<{
  state: 'STARTED' | 'ALREADY_STARTED';
  editionHash: string;
  cicloId: number;
}>;

export async function startNativeEnrollment(params: {
  db: D1Database;
  env?: Env;
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
      db.prepare(scopedStartSql(PREFLIGHT_SQL, params.env, empresaId)).bind(...binds),
      db.prepare(scopedStartSql(START_MATRICULA_SQL, params.env, empresaId)).bind(...binds),
      db.prepare(scopedStartSql(START_CYCLE_SQL, params.env, empresaId)).bind(...binds),
      db.prepare(scopedStartSql(POSTCHECK_SQL, params.env, empresaId)).bind(...binds),
    ]);
  } catch {
    throw new NativeEnrollmentStartError('NATIVE_START_ATOMIC_SYNC_REJECTED');
  }
  if (results.length !== 4 || results.some((result) => !result.success)) {
    throw new NativeEnrollmentStartError('NATIVE_START_ATOMIC_SYNC_REJECTED');
  }
  const preflightState = (
    results[0]?.results as Array<{ native_start_state?: unknown }> | undefined
  )?.[0]?.native_start_state;
  const matriculaChanges = results[1]?.meta.changes;
  const cycleChanges = results[2]?.meta.changes;
  // The preflight classifies the authenticated, edition-pinned state before
  // either write; the final SQL postcheck proves BOTH mirrors are active in
  // the SAME transaction. D1 may report 0 changes for a successfully
  // synchronized row (triggers/adapter). Do not return 409 AFTER COMMIT merely
  // because both metadata counters are zero.
  if (preflightState === 'START' &&
      ((matriculaChanges === 1 && cycleChanges === 1) ||
       (matriculaChanges === 0 && cycleChanges === 0))) {
    return { state: 'STARTED', cicloId, editionHash };
  }
  if (preflightState === 'ALREADY_STARTED' &&
      matriculaChanges === 0 && cycleChanges === 0) {
    return { state: 'ALREADY_STARTED', cicloId, editionHash };
  }
  // A mixed/unknown count, missing preflight receipt or mismatched
  // lifecycle mode is still a hard failure; never guess completion.
  throw new NativeEnrollmentStartError('NATIVE_START_INCONSISTENT_CHANGES');
}

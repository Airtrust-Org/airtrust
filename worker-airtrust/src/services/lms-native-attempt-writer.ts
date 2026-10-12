/**
 * Server-side Native assessment persistence, NOT ROUTED.
 *
 * The PRIVATE, digest-verified Native artifact comes from server R2; never
 * accept client-supplied grading policy, edition, answer key, score or status.
 * Requires the approved Schema V2 and authenticated tenant-bound context.
 * A stored passing attempt is NOT a certificate or LMS enrollment completion.
 */
import {
  type NativeCourseArtifact,
  validateNativeCourseArtifact,
} from '../lib/lms/lms-native-course-contract';
import { evaluateNativeAssessment } from '../lib/lms/lms-native-grading';
import type { NativeSessionScope } from '../lib/lms/lms-native-evidence-domain';

import type { Env } from '../types';
import { NATIVE_ACTIVE_EMPLOYEE_JOIN, NATIVE_ACTIVE_USER_CONDITION } from './lms-native-active-learner-sql';
import { nativeScopedSql } from './lms-native-catalog-legacy-guard';

export class NativeAttemptWriteError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'NativeAttemptWriteError';
  }
}
type Binding = { id: number };
type StoredAttempt = {
  id: number;
  tentativa_numero: number;
  answers_json: string;
  answers_sha256: string;
  policy: string;
  score_pct: number | null;
  assessment_satisfied: number;
};

const BINDING_SQL = [
  'SELECT b.id FROM lms_native_matricula_edicoes b',
  'JOIN lms_native_edicoes ed ON ed.id=b.edicao_id',
  'AND ed.empresa_id=b.empresa_id AND ed.curso_id=b.curso_id',
  'JOIN lms_matriculas m ON m.id=b.matricula_id',
  'AND m.empresa_id=b.empresa_id AND m.curso_id=b.curso_id',
  'JOIN lms_matricula_ciclos cycle ON cycle.id=b.ciclo_id',
  'AND cycle.matricula_id=m.id AND cycle.empresa_id=m.empresa_id AND cycle.curso_id=m.curso_id',
  'JOIN lms_cursos c ON c.id=m.curso_id AND c.empresa_id=m.empresa_id',
  'JOIN usuarios u ON u.id=? AND u.funcionario_id=m.funcionario_id AND u.deleted_at IS NULL',
  NATIVE_ACTIVE_USER_CONDITION,
  NATIVE_ACTIVE_EMPLOYEE_JOIN,
  'WHERE b.empresa_id=? AND b.matricula_id=? AND b.ciclo_id=? AND b.curso_id=?',
  "AND ed.artifact_sha256=? AND ed.status='PUBLISHED'",
  "AND m.status='EM_ANDAMENTO' AND m.deleted_at IS NULL",
  'AND cycle.ciclo_atual=1 AND cycle.deleted_at IS NULL',
  "AND cycle.status='EM_ANDAMENTO' AND cycle.funcionario_id=m.funcionario_id",
  "AND c.tipo_conteudo='native' AND c.ativo=1 AND c.publicado=1 AND c.deleted_at IS NULL",
  'LIMIT 1',
].join(' ');

// Bind + attempt insert happen in a single D1 statement and the immutable
// schema's BEFORE INSERT trigger enforces active enrollment/cycle/edition.
const INSERT_SQL = [
  'INSERT INTO lms_native_tentativas',
  '(vinculo_id,tentativa_numero,answers_json,answers_sha256,policy,score_pct,assessment_satisfied)',
  'SELECT b.id,?,?,?,?,?,? FROM lms_native_matricula_edicoes b',
  'JOIN lms_native_edicoes ed ON ed.id=b.edicao_id',
  'AND ed.empresa_id=b.empresa_id AND ed.curso_id=b.curso_id',
  'JOIN lms_matriculas m ON m.id=b.matricula_id',
  'AND m.empresa_id=b.empresa_id AND m.curso_id=b.curso_id',
  'JOIN lms_matricula_ciclos cycle ON cycle.id=b.ciclo_id',
  'AND cycle.matricula_id=m.id AND cycle.empresa_id=m.empresa_id AND cycle.curso_id=m.curso_id',
  'JOIN lms_cursos c ON c.id=m.curso_id AND c.empresa_id=m.empresa_id',
  'JOIN usuarios u ON u.id=? AND u.funcionario_id=m.funcionario_id AND u.deleted_at IS NULL',
  NATIVE_ACTIVE_USER_CONDITION,
  NATIVE_ACTIVE_EMPLOYEE_JOIN,
  'WHERE b.id=? AND b.empresa_id=? AND b.matricula_id=? AND b.ciclo_id=? AND b.curso_id=?',
  "AND ed.artifact_sha256=? AND ed.status='PUBLISHED'",
  "AND m.status='EM_ANDAMENTO' AND m.deleted_at IS NULL",
  'AND cycle.ciclo_atual=1 AND cycle.deleted_at IS NULL',
  "AND cycle.status='EM_ANDAMENTO' AND cycle.funcionario_id=m.funcionario_id",
  "AND c.tipo_conteudo='native' AND c.ativo=1 AND c.publicado=1 AND c.deleted_at IS NULL",
  'AND NOT EXISTS (SELECT 1 FROM lms_native_tentativas other',
  'WHERE other.vinculo_id=b.id AND other.tentativa_numero=?)',
].join(' ');
const LAST_SQL = [
  'SELECT id, tentativa_numero, answers_json, answers_sha256,',
  'policy, score_pct, assessment_satisfied FROM lms_native_tentativas',
  'WHERE vinculo_id=? ORDER BY tentativa_numero DESC LIMIT 1',
].join(' ');
const EXACT_SQL = [
  'SELECT id, tentativa_numero, answers_json, answers_sha256,',
  'policy, score_pct, assessment_satisfied FROM lms_native_tentativas',
  'WHERE vinculo_id=? AND tentativa_numero=? LIMIT 1',
].join(' ');

function fail(code: string): never {
  throw new NativeAttemptWriteError(code);
}
async function sha256(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export type NativeAttemptReceipt = Readonly<{
  state: 'APPLIED' | 'IDEMPOTENT_REPLAY';
  attemptNumber: number;
  editionHash: string;
  scorePct: number | null;
  assessmentSatisfied: boolean;
}>;

export async function commitNativeAssessmentAttempt(params: {
  db: D1Database;
  env?: Env;
  actorUserId: number;
  scope: NativeSessionScope;
  artifact: NativeCourseArtifact;
  attemptNumber: number;
  answers: unknown;
}): Promise<NativeAttemptReceipt> {
  const { db, actorUserId, scope, attemptNumber } = params;
  const artifact = validateNativeCourseArtifact(params.artifact);
  if (!Number.isSafeInteger(actorUserId) || actorUserId <= 0 ||
      ![scope.empresaId, scope.matriculaId, scope.cicloId, scope.cursoId].every(
        (id) => Number.isSafeInteger(id) && id > 0,
      ) || !/^[a-f0-9]{64}$/.test(scope.artifactHash) ||
      !Number.isSafeInteger(attemptNumber) || attemptNumber <= 0 || attemptNumber > 500) {
    fail('NATIVE_ATTEMPT_INVALID_CONTEXT');
  }

  // Evaluate first. The client sends only question IDs and selected option IDs.
  // Never accept client-supplied pass, grade or correct answer fields.
  const grade = evaluateNativeAssessment(artifact, params.answers);
  if (grade.mode === 'SCORED' && grade.scorePct === null) {
    fail('NATIVE_ATTEMPT_INCOMPLETE');
  }
  const answerJson = JSON.stringify(params.answers);
  if (typeof answerJson !== 'string' || answerJson.length < 2 ||
      new TextEncoder().encode(answerJson).byteLength > 131072) {
    fail('NATIVE_ATTEMPT_TOO_LARGE');
  }
  const digest = await sha256(answerJson);

  const binding = await db.prepare(nativeScopedSql(BINDING_SQL, params.env, scope.empresaId)).bind(
    actorUserId, scope.empresaId, scope.matriculaId,
    scope.cicloId, scope.cursoId, scope.artifactHash,
  ).first<Binding>();
  if (!binding || !Number.isSafeInteger(binding.id) || binding.id <= 0) {
    fail('NATIVE_ATTEMPT_ACCESS_DENIED');
  }

  const same = (row: StoredAttempt | null) => Boolean(row &&
    row.tentativa_numero === attemptNumber &&
    row.answers_sha256 === digest &&
    row.answers_json === answerJson &&
    row.policy === grade.mode &&
    row.score_pct === grade.scorePct &&
    row.assessment_satisfied === Number(grade.assessmentSatisfied));

  const last = await db.prepare(LAST_SQL).bind(binding.id).first<StoredAttempt>();
  if (last && attemptNumber === last.tentativa_numero) {
    if (!same(last)) fail('NATIVE_ATTEMPT_REPLAY_CONFLICT');
    return {
      state: 'IDEMPOTENT_REPLAY', attemptNumber,
      editionHash: scope.artifactHash,
      scorePct: grade.scorePct, assessmentSatisfied: grade.assessmentSatisfied,
    };
  }
  if (attemptNumber !== (last?.tentativa_numero ?? 0) + 1) {
    fail('NATIVE_ATTEMPT_SEQUENCE_CONFLICT');
  }

  try {
    const result = await db.prepare(nativeScopedSql(INSERT_SQL, params.env, scope.empresaId)).bind(
      attemptNumber, answerJson, digest, grade.mode,
      grade.scorePct, Number(grade.assessmentSatisfied),
      actorUserId, binding.id, scope.empresaId,
      scope.matriculaId, scope.cicloId, scope.cursoId,
      scope.artifactHash, attemptNumber,
    ).run();
    if (result.success && result.meta.changes === 1) {
      return {
        state: 'APPLIED', attemptNumber, editionHash: scope.artifactHash,
        scorePct: grade.scorePct, assessmentSatisfied: grade.assessmentSatisfied,
      };
    }
  } catch {
    // A concurrent matching submission may already have committed.
  }
  const persisted = await db.prepare(EXACT_SQL).bind(
    binding.id, attemptNumber,
  ).first<StoredAttempt>();
  if (same(persisted)) {
    return {
      state: 'IDEMPOTENT_REPLAY', attemptNumber, editionHash: scope.artifactHash,
      scorePct: grade.scorePct, assessmentSatisfied: grade.assessmentSatisfied,
    };
  }
  fail('NATIVE_ATTEMPT_ATOMIC_COMMIT_CONFLICT');
}

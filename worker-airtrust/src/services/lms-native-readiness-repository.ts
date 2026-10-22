/**
 * Read-only bridge from future Schema V2 Native evidence into canonical LMS.
 * Learner resume is read-only under staging-only authenticated preview;
 * canonical Native completion remains unavailable pending governed E2E.
 * The private authoring artifact MUST come from integrity-verified server R2,
 * never request JSON. Never writes enrollment, qualification or certificate.
 */
import { type NativeCourseArtifact, validateNativeCourseArtifact } from '../lib/lms/lms-native-course-contract';
import { readNativeEventLedger } from './lms-native-event-ledger';
import {
  assessNativeCompletionReadiness, gradeNativeSubmittedAnswers,
  type NativeReadinessVerdict, type NativeSessionScope, type NativeProgressSnapshot,
} from '../lib/lms/lms-native-evidence-domain';

import type { Env } from '../types';
import { NATIVE_ACTIVE_EMPLOYEE_JOIN, NATIVE_ACTIVE_USER_CONDITION } from './lms-native-active-learner-sql';
import { nativeScopedSql } from './lms-native-catalog-legacy-guard';

export class NativeEvidenceReadError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'NativeEvidenceReadError';
  }
}
type Binding = { id: number; status: string };
type AttemptRow = {
  id: number; tentativa_numero: number; answers_json: string; answers_sha256: string;
  policy: string; score_pct: number | null; assessment_satisfied: number;
};
const VALID_HASH = /^[a-f0-9]{64}$/;
const BINDING_SQL = [
  "SELECT b.id, m.status",
  "FROM lms_native_matricula_edicoes b",
  "JOIN lms_native_edicoes ed ON ed.id=b.edicao_id AND ed.empresa_id=b.empresa_id AND ed.curso_id=b.curso_id",
  "JOIN lms_matriculas m ON m.id=b.matricula_id AND m.empresa_id=b.empresa_id AND m.curso_id=b.curso_id",
  "JOIN lms_matricula_ciclos cycle ON cycle.id=b.ciclo_id AND cycle.matricula_id=m.id",
  "AND cycle.empresa_id=m.empresa_id AND cycle.curso_id=m.curso_id",
  "JOIN lms_cursos c ON c.id=m.curso_id AND c.empresa_id=m.empresa_id",
  "JOIN usuarios u ON u.id=? AND u.funcionario_id=m.funcionario_id AND u.deleted_at IS NULL",
  NATIVE_ACTIVE_USER_CONDITION,
  NATIVE_ACTIVE_EMPLOYEE_JOIN,
  "WHERE b.empresa_id=? AND b.matricula_id=? AND b.ciclo_id=? AND b.curso_id=?",
  "AND ed.artifact_sha256=? AND ed.status='PUBLISHED'",
  "AND m.deleted_at IS NULL AND cycle.deleted_at IS NULL AND cycle.ciclo_atual=1",
  "AND cycle.status=m.status AND cycle.funcionario_id=m.funcionario_id",
  "AND c.deleted_at IS NULL AND c.tipo_conteudo='native' AND c.ativo=1 AND c.publicado=1",
  "LIMIT 1",
].join(' ');
const ATTEMPT_SQL = [
  "SELECT id, tentativa_numero, answers_json, answers_sha256, policy, score_pct, assessment_satisfied",
  "FROM lms_native_tentativas WHERE vinculo_id=? ORDER BY tentativa_numero DESC LIMIT 1",
].join(' ');

function fail(code: string): never {
  throw new NativeEvidenceReadError(code);
}
async function sha256(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function checkpointPayloadHash(
  scope: NativeSessionScope,
  row: { event_id: string; sequencia: number; unidade_id: string },
): Promise<string> {
  return sha256(JSON.stringify([
    scope.empresaId, scope.matriculaId, scope.cicloId,
    scope.cursoId, scope.artifactHash,
    row.event_id, row.sequencia, row.unidade_id,
  ]));
}

/** Used only after auth and integrity-checked edition lookup. */
export type NativeSessionSummary = Readonly<{
  editionHash: string;
  cicloId: number;
  mode: 'LEARN' | 'REVIEW';
  nextSequence: number;
  seenLessonIds: readonly string[];
  lastVisitedUnitId: string | null;
  totalLessons: number;
  latestAttempt: null | {
    attemptNumber: number;
    scorePct: number | null;
    assessmentSatisfied: boolean;
  };
}>;

/**
 * Returns only sanitized navigation and attempt-summary data to the caller.
 * PRIVATE quiz answers and correct options are recalculated in the Worker
 * but never appear in this projection. The caller still controls HTTP auth.
 */
export async function readNativeLearnerSession(params: {
  db: D1Database;
  env?: Env;
  actorUserId: number;
  scope: NativeSessionScope;
  artifact: NativeCourseArtifact;
}): Promise<{ summary: NativeSessionSummary; readiness: NativeReadinessVerdict }> {
  const { db, scope, actorUserId } = params;
  const artifact = validateNativeCourseArtifact(params.artifact);
  if (!Number.isSafeInteger(actorUserId) || actorUserId <= 0 ||
      ![scope.empresaId, scope.cursoId, scope.matriculaId, scope.cicloId].every(
        (value) => Number.isSafeInteger(value) && value > 0
      ) || !VALID_HASH.test(scope.artifactHash)) fail('NATIVE_READ_INVALID_CONTEXT');

  // Enforce exact authenticated user -> employee -> enrollment and pinned
  // edition on the server. No admin role bypass or client-owned employee ID.
  const binding = await db.prepare(nativeScopedSql(BINDING_SQL, params.env, scope.empresaId)).bind(
    actorUserId, scope.empresaId, scope.matriculaId, scope.cicloId,
    scope.cursoId, scope.artifactHash,
  ).first<Binding>();
  if (!binding || !Number.isSafeInteger(binding.id) || binding.id <= 0) {
    fail('NATIVE_READ_ACCESS_OR_VERSION_DENIED');
  }

  let rows: Awaited<ReturnType<typeof readNativeEventLedger>>;
  try {
    rows = await readNativeEventLedger(db, binding.id);
  } catch {
    fail('NATIVE_READ_INVALID_EVENT_LEDGER');
  }
  // A malformed or reordered server ledger is a consistency incident, not
  // an opportunity to guess a location or award course completion.
  const orderedLessons = artifact.units
    .filter((unit) => unit.kind === 'lesson').map((unit) => unit.id);
  const lessons = new Set(orderedLessons);
  if (rows.length > orderedLessons.length ||
      new Set(rows.map((row) => row.event_id)).size !== rows.length ||
      new Set(rows.map((row) => row.unidade_id)).size !== rows.length) {
    fail('NATIVE_READ_INVALID_EVENT_LEDGER');
  }
  for (const [index, row] of rows.entries()) {
    if (row.sequencia !== index + 1 || typeof row.event_id !== 'string' ||
        !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(row.event_id) ||
        !lessons.has(row.unidade_id) || row.unidade_id !== orderedLessons[index] ||
        typeof row.payload_sha256 !== 'string' ||
        !VALID_HASH.test(row.payload_sha256) ||
        await checkpointPayloadHash(scope, row) !== row.payload_sha256) {
      fail('NATIVE_READ_INVALID_EVENT_LEDGER');
    }
  }
  const snapshot: NativeProgressSnapshot = {
    scope,
    nextSequence: rows.length + 1,
    recordedEvents: rows.map((row) => ({
      eventId: row.event_id, sequence: row.sequencia, unitId: row.unidade_id,
    })),
    seenLessonIds: rows.map((row) => row.unidade_id),
  };

  const stored = await db.prepare(ATTEMPT_SQL).bind(binding.id).first<AttemptRow>();
  let gradedAttempt = null;
  if (stored) {
    if (!Number.isSafeInteger(stored.id) || stored.id <= 0 ||
        !Number.isSafeInteger(stored.tentativa_numero) || stored.tentativa_numero <= 0 ||
        typeof stored.answers_json !== 'string' ||
        typeof stored.answers_sha256 !== 'string' ||
        (await sha256(stored.answers_json)) !== stored.answers_sha256) {
      fail('NATIVE_READ_ATTEMPT_HASH_CONFLICT');
    }
    let answers: unknown;
    try { answers = JSON.parse(stored.answers_json); }
    catch { fail('NATIVE_READ_INVALID_ATTEMPT_JSON'); }
    // Recompute with PRIVATE answer keys rather than trusting stored grades.
    let calculated;
    try { calculated = gradeNativeSubmittedAnswers(artifact, answers); }
    catch { fail('NATIVE_READ_ATTEMPT_INVALID'); }
    if (stored.policy !== calculated.mode ||
        stored.score_pct !== calculated.scorePct ||
        stored.assessment_satisfied !== Number(calculated.assessmentSatisfied)) {
      fail('NATIVE_READ_GRADE_RECONCILIATION_CONFLICT');
    }
    gradedAttempt = { scope, attemptId: stored.id, assessment: calculated };
  }

  const readiness = assessNativeCompletionReadiness(artifact, {
    scope, persistedSnapshot: snapshot, gradedAttempt,
    enrollmentStatus: binding.status,
  });
  return {
    summary: {
      editionHash: scope.artifactHash,
      cicloId: scope.cicloId,
      mode: binding.status === 'CONCLUIDO' ? 'REVIEW' : 'LEARN',
      nextSequence: snapshot.nextSequence,
      seenLessonIds: snapshot.seenLessonIds,
      lastVisitedUnitId: rows.at(-1)?.unidade_id ?? null,
      totalLessons: lessons.size,
      latestAttempt: stored && gradedAttempt ? {
        attemptNumber: stored.tentativa_numero,
        scorePct: gradedAttempt.assessment.scorePct,
        assessmentSatisfied: gradedAttempt.assessment.assessmentSatisfied,
      } : null,
    },
    readiness,
  };
}

/** The canonical completion gate consumes only Worker-calculated readiness. */
export async function readNativeCanonicalReadiness(params: {
  db: D1Database;
  env?: Env;
  actorUserId: number;
  scope: NativeSessionScope;
  artifact: NativeCourseArtifact;
}): Promise<NativeReadinessVerdict> {
  const result = await readNativeLearnerSession(params);
  return result.readiness;
}

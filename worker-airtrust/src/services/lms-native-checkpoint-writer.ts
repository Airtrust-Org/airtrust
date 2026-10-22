/**
 * Native V1 checkpoint persistence service.
 *
 * Called only by the authenticated, staging-only Native evidence route with
 * dual exact-tenant flags, and an integrity-verified PRIVATE R2 artifact.
 * Remote writes additionally require governed Schema V2 and a published edition.
 *
 * Exactly-once durable semantics use D1 UNIQUE(event_id, sequence), a
 * contiguous-sequence trigger and a scope-rechecked INSERT in the DB.
 * A page-visit checkpoint is NOT proof of knowledge or certification.
 */
import { type NativeCourseArtifact, validateNativeCourseArtifact } from '../lib/lms/lms-native-course-contract';
import { readNativeEventLedger } from './lms-native-event-ledger';
import {
  validateNativeCheckpoint,
  type NativeCheckpoint,
  type NativeProgressSnapshot,
  type NativeSessionScope,
} from '../lib/lms/lms-native-evidence-domain';

import type { Env } from '../types';
import { NATIVE_ACTIVE_EMPLOYEE_JOIN, NATIVE_ACTIVE_USER_CONDITION } from './lms-native-active-learner-sql';
import { nativeScopedSql } from './lms-native-catalog-legacy-guard';

export class NativeCheckpointWriteError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'NativeCheckpointWriteError';
  }
}

type BoundRow = { id: number };
type EventRow = {
  event_id: string;
  sequencia: number;
  unidade_id: string;
  payload_sha256: string;
};

function reject(code: string): never {
  throw new NativeCheckpointWriteError(code);
}

async function checkpointHash(scope: NativeSessionScope, event: NativeCheckpoint): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify([
    scope.empresaId, scope.matriculaId, scope.cicloId,
    scope.cursoId, scope.artifactHash,
    event.eventId, event.sequence, event.unitId,
  ]));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

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

// Re-check the exact authenticated user/tenant/enrollment/cycle/edition in
// the SAME statement that inserts the event. The Schema V2 trigger also
// refuses inactive or revoked contexts and out-of-order sequences.
const INSERT_SQL = [
  'INSERT INTO lms_native_eventos',
  '(vinculo_id,event_id,sequencia,unidade_id,payload_sha256)',
  'SELECT b.id,?,?,?,? FROM lms_native_matricula_edicoes b',
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
  'AND NOT EXISTS (SELECT 1 FROM lms_native_eventos prior',
  'WHERE prior.vinculo_id=b.id AND (prior.event_id=? OR prior.sequencia=?))',
].join(' ');

export type NativeCheckpointReceipt = Readonly<{
  state: 'APPLIED' | 'IDEMPOTENT_REPLAY';
  committedSequence: number;
  editionHash: string;
}>;

/**
 * Server-only implementation. Scope is obtained by the Worker from trusted
 * tenant/session/pinned-edition state, NEVER by trusting request JSON.
 */
export async function commitNativeLessonCheckpoint(params: {
  db: D1Database;
  env?: Env;
  actorUserId: number;
  scope: NativeSessionScope;
  event: NativeCheckpoint;
  artifact: NativeCourseArtifact;
}): Promise<NativeCheckpointReceipt> {
  const { db, actorUserId, scope, event } = params;
  const artifact = validateNativeCourseArtifact(params.artifact);
  if (!Number.isSafeInteger(actorUserId) || actorUserId <= 0 ||
      ![scope.empresaId, scope.matriculaId, scope.cicloId, scope.cursoId].every(
        (value) => Number.isSafeInteger(value) && value > 0,
      ) || !/^[a-f0-9]{64}$/.test(scope.artifactHash)) {
    reject('NATIVE_CHECKPOINT_INVALID_CONTEXT');
  }

  const binding = await db.prepare(nativeScopedSql(BINDING_SQL, params.env, scope.empresaId)).bind(
    actorUserId, scope.empresaId, scope.matriculaId, scope.cicloId,
    scope.cursoId, scope.artifactHash,
  ).first<BoundRow>();
  if (!binding || !Number.isSafeInteger(binding.id) || binding.id <= 0) {
    reject('NATIVE_CHECKPOINT_ACCESS_DENIED');
  }

  let rows: Awaited<ReturnType<typeof readNativeEventLedger>>;
  try {
    rows = await readNativeEventLedger(db, binding.id);
  } catch {
    reject('NATIVE_CHECKPOINT_INVALID_LEDGER');
  }
  for (const row of rows) {
    const storedHash=row.payload_sha256;
    if (typeof storedHash !== 'string' || !/^[a-f0-9]{64}$/.test(storedHash) ||
        await checkpointHash(scope, {
          eventId: row.event_id, sequence: row.sequencia,
          unitId: row.unidade_id, artifactHash: scope.artifactHash,
        }) !== storedHash) {
      reject('NATIVE_CHECKPOINT_INVALID_LEDGER');
    }
  }

  const snapshot: NativeProgressSnapshot = {
    scope,
    nextSequence: rows.length + 1,
    recordedEvents: rows.map((row) => ({
      eventId: row.event_id, sequence: row.sequencia, unitId: row.unidade_id,
    })),
    seenLessonIds: [...new Set(rows.map((row) => row.unidade_id))],
  };

  // Validate before touching the database. This does not grant completion.
  const verdict = validateNativeCheckpoint(artifact, snapshot, event);
  const digest = await checkpointHash(scope, event);
  if (verdict.decision === 'IDEMPOTENT_REPLAY') {
    const recorded = rows.find((row) => row.event_id === event.eventId);
    if (!recorded || recorded.payload_sha256 !== digest) reject('NATIVE_CHECKPOINT_REPLAY_CONFLICT');
    return {
      state: 'IDEMPOTENT_REPLAY', committedSequence: event.sequence, editionHash: scope.artifactHash,
    };
  }

  // The CHECK/UNIQUE/trigger constraints are authoritative under two-device
  // races; there is no unprotected read/then-write sequence assignment.
  try {
    const result = await db.prepare(nativeScopedSql(INSERT_SQL, params.env, scope.empresaId)).bind(
      event.eventId, event.sequence, event.unitId, digest,
      actorUserId, binding.id,
      scope.empresaId, scope.matriculaId, scope.cicloId, scope.cursoId,
      scope.artifactHash, event.eventId, event.sequence,
    ).run();
    if (result.success && result.meta.changes === 1) {
      return { state: 'APPLIED', committedSequence: event.sequence, editionHash: scope.artifactHash };
    }
  } catch {
    // A concurrent identical request may have succeeded. Verify exact
    // immutable payload before treating the retry as idempotent.
  }

  const existing = await db.prepare([
    'SELECT event_id, sequencia, unidade_id, payload_sha256 FROM lms_native_eventos',
    'WHERE vinculo_id=? AND event_id=? LIMIT 1',
  ].join(' ')).bind(binding.id, event.eventId).first<EventRow>();
  if (existing && existing.sequencia === event.sequence &&
      existing.unidade_id === event.unitId && existing.payload_sha256 === digest) {
    return { state: 'IDEMPOTENT_REPLAY', committedSequence: event.sequence, editionHash: scope.artifactHash };
  }
  reject('NATIVE_CHECKPOINT_ATOMIC_COMMIT_CONFLICT');
}

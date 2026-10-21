/**
 * AirTrust Native V1 — staging-only evidence writer API.
 *
 * Mounted ONLY below lms-native.ts, whose auth() middleware validates JWT.
 * Requires TWO separate exact-tenant staging allowlists and an approved,
 * published, hash-pinned private edition. OFF by default.
 *
 * Start may atomically change NAO_INICIADO to EM_ANDAMENTO; no endpoint
 * awards completion, qualifications or certificates.
 */
import { Hono, type Context } from 'hono';
import {canReadStudyOnlyInProduction,isNativeStudyOnlyEnabled,permitNativeStudyContent} from '../services/lms-native-study-only';
import { z } from 'zod';
import type { Env } from '../types';
import { getEmpresaIdSafe } from './escalas-shared';
import {
  loadNativePrivateCourse, NativeContentLoadError,
} from '../services/lms-native-content-loader';
import { NativeAdmissionError } from '../services/lms-native-enrollment-access';
import {
  commitNativeLessonCheckpoint, NativeCheckpointWriteError,
} from '../services/lms-native-checkpoint-writer';
import {
  commitNativeAssessmentAttempt, NativeAttemptWriteError,
} from '../services/lms-native-attempt-writer';
import { NativeCheckpointError } from '../lib/lms/lms-native-evidence-domain';
import { NativeSubmissionError } from '../lib/lms/lms-native-grading';
import { startNativeEnrollment, NativeEnrollmentStartError } from '../services/lms-native-enrollment-starter';

const app = new Hono<{ Bindings: Env }>();
const exactId = /^[1-9][0-9]{0,15}$/;
const smallId = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/;
const MAX_INPUT_BYTES = 128 * 1024;
const CheckpointBody = z.object({
  eventId: z.string().regex(smallId),
  sequence: z.number().int().min(1).max(10000),
  unitId: z.string().regex(smallId),
}).strict();
const StartBody = z.object({}).strict();
const AttemptBody = z.object({
  attemptNumber: z.number().int().min(1).max(500),
  answers: z.array(z.object({
    questionId: z.string().regex(smallId),
    optionId: z.string().regex(smallId),
  }).strict()).max(1000),
}).strict();

function isTenantAllowed(raw: string | undefined, tenant: number): boolean {
  if (!Number.isSafeInteger(tenant) || tenant <= 0 ||
      !raw || raw.includes('*')) return false;
  return raw.split(',').some((part) => part.trim() === String(tenant));
}

export function canWriteNative(env: Env, tenant: number): boolean {
  return (env.ENVIRONMENT === 'staging' &&
    isTenantAllowed(env.NATIVE_LEARNER_PREVIEW_ENABLED_TENANTS, tenant) &&
    isTenantAllowed(env.NATIVE_LEARNER_WRITE_ENABLED_TENANTS, tenant)) ||
    canReadStudyOnlyInProduction(env,tenant);
}

async function readSmallJson(c: { req: { header(name: string): string | undefined; raw: Request } }): Promise<unknown> {
  const contentLength = c.req.header('content-length');
  if (contentLength && (!/^[0-9]+$/.test(contentLength) ||
    Number(contentLength) > MAX_INPUT_BYTES)) throw new Error('NATIVE_INPUT_TOO_LARGE');
  if (!c.req.header('content-type')?.toLowerCase().startsWith('application/json')) {
    throw new Error('NATIVE_JSON_REQUIRED');
  }
  // Content-Length can be absent or false for streamed requests. Never
  // buffer the whole body before enforcing the server-owned byte limit.
  const reader = c.req.raw.body?.getReader();
  if (!reader) throw new Error('NATIVE_INVALID_JSON');
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_INPUT_BYTES) {
        // Best-effort stop of a chunked/streamed oversized request.
        void reader.cancel().catch(() => undefined);
        throw new Error('NATIVE_INPUT_TOO_LARGE');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes));
  } catch {
    throw new Error('NATIVE_INVALID_JSON');
  }
}

async function execute(c: Context<{ Bindings: Env }>,
  kind: 'start' | 'checkpoint' | 'attempt') {
  c.header('Cache-Control', 'private, no-store');
  const empresaId = getEmpresaIdSafe(c);
  if (!canWriteNative(c.env, empresaId) ||
      (isNativeStudyOnlyEnabled(c.env,empresaId) && kind==='attempt')) {
    return c.json({ success: false, code: 'NATIVE_EVIDENCE_WRITE_NOT_ENABLED' }, 404);
  }
  const matriculaRaw = c.req.param('matriculaId');
  if (!exactId.test(matriculaRaw ?? '')) {
    return c.json({ success: false, code: 'NATIVE_INVALID_ENROLLMENT_CONTEXT' }, 400);
  }
  const rawActor = c.get('userId' as never) as unknown;
  const actorUserId = typeof rawActor === 'number' ? rawActor :
    typeof rawActor === 'string' ? Number(rawActor) : NaN;
  if (!Number.isSafeInteger(actorUserId) || actorUserId <= 0) {
    return c.json({ success: false, code: 'NATIVE_ACCESS_DENIED' }, 403);
  }
  let input: unknown;
  try { input = await readSmallJson(c); }
  catch {
    return c.json({ success: false, code: 'NATIVE_INVALID_INPUT' }, 400);
  }
  const parsed = kind === 'start' ? StartBody.safeParse(input) :
    kind === 'checkpoint' ? CheckpointBody.safeParse(input) : AttemptBody.safeParse(input);
  if (!parsed.success) {
    return c.json({ success: false, code: 'NATIVE_INVALID_INPUT' }, 400);
  }

  try {
    const verified = await loadNativePrivateCourse({
      env: c.env, db: c.env.DB, bucket: c.env.BUCKET,
      empresaId, matriculaId: Number(matriculaRaw), actorUserId,
    });
    if(!permitNativeStudyContent(c.env,empresaId,verified.editionHash,verified.artifact)){
      return c.json({success:false,code:'NATIVE_STUDY_ONLY_EDITION_NOT_APPROVED'},409);
    }
    if (verified.mode !== 'LEARN') {
      return c.json({ success: false, code: 'NATIVE_REVIEW_READ_ONLY' }, 409);
    }
    // Identity, course, cycle and edition are sourced solely from the
    // authenticated/pinned DB+R2 state, never from the request body.
    const scope = {
      empresaId, matriculaId: Number(matriculaRaw),
      cicloId: verified.cicloId,
      cursoId: verified.cursoId,
      artifactHash: verified.editionHash,
    };
    if (kind === 'start') {
      const result = await startNativeEnrollment({
        env: c.env, db: c.env.DB, actorUserId, empresaId,
        matriculaId: Number(matriculaRaw), cursoId: verified.cursoId,
        cicloId: verified.cicloId, editionHash: verified.editionHash,
      });
      return c.json({ success: true, data: {
        state: result.state, ciclo_id: result.cicloId,
        edition_sha256: result.editionHash, completion_supported: false,
      } }, result.state === 'STARTED' ? 201 : 200);
    }
    if (kind === 'checkpoint') {
      const checkpoint = CheckpointBody.parse(parsed.data);
      const result = await commitNativeLessonCheckpoint({
        env: c.env, db: c.env.DB, actorUserId, artifact: verified.artifact, scope,
        event: { ...checkpoint, artifactHash: verified.editionHash },
      });
      return c.json({ success: true, data: {
        state: result.state,
        committed_sequence: result.committedSequence,
        edition_sha256: result.editionHash,
        completion_supported: false,
      } }, result.state === 'APPLIED' ? 201 : 200);
    }
    if (kind === 'attempt') {
      const attempt = AttemptBody.parse(parsed.data);
      const result = await commitNativeAssessmentAttempt({
        env: c.env, db: c.env.DB, actorUserId, artifact: verified.artifact, scope,
        attemptNumber: attempt.attemptNumber,
        answers: attempt.answers,
      });
      return c.json({ success: true, data: {
        state: result.state,
        attempt_number: result.attemptNumber,
        edition_sha256: result.editionHash,
        score_pct: result.scorePct,
        assessment_satisfied: result.assessmentSatisfied,
        completion_supported: false,
      } }, result.state === 'APPLIED' ? 201 : 200);
    }
    return c.json({ success: false, code: 'NATIVE_INVALID_INPUT' }, 400);
  } catch (error) {
    if (error instanceof NativeAdmissionError) {
      return c.json({ success: false, code: error.code }, error.status);
    }
    if (error instanceof NativeContentLoadError) {
      return c.json({ success: false, code: 'NATIVE_CONTENT_UNAVAILABLE' }, 409);
    }
    if (error instanceof NativeSubmissionError || error instanceof NativeCheckpointError) {
      return c.json({ success: false, code: 'NATIVE_INVALID_EVIDENCE' }, 409);
    }
    if (error instanceof NativeEnrollmentStartError || error instanceof NativeCheckpointWriteError || error instanceof NativeAttemptWriteError) {
      return c.json({ success: false, code: 'NATIVE_EVIDENCE_CONFLICT' }, 409);
    }
    throw error;
  }
}

app.post('/matriculas/:matriculaId/iniciar', (c) => execute(c, 'start'));
app.post('/matriculas/:matriculaId/checkpoints', (c) => execute(c, 'checkpoint'));
app.post('/matriculas/:matriculaId/tentativas', (c) => execute(c, 'attempt'));

export default app;

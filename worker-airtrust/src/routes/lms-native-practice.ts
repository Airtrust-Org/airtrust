/** Authenticated formative feedback, isolated from official attempts/completion.
 * Mounted below lms-native.ts and guarded by the same explicit staging tenant
 * capability as other learner writes. Does not persist a score or change a cycle.
 */
import { Hono } from 'hono';
import type { Env } from '../types';
import { getEmpresaIdSafe } from './escalas-shared';
import { canWriteNative } from './lms-native-write';
import { loadNativePrivateCourse, NativeContentLoadError } from '../services/lms-native-content-loader';
import { NativeAdmissionError } from '../services/lms-native-enrollment-access';
import { gradeNativePracticeAnswer, NativePracticeError } from '../lib/lms/lms-native-practice';

const app = new Hono<{ Bindings: Env }>();
const ID = /^[1-9][0-9]{0,15}$/;
const MAX_BYTES = 2048;

app.post('/matriculas/:matriculaId/pratica', async (c) => {
  c.header('Cache-Control', 'private, no-store');
  const empresaId = getEmpresaIdSafe(c);
  if (!canWriteNative(c.env, empresaId)) {
    return c.json({ success: false, code: 'NATIVE_PRACTICE_NOT_ENABLED' }, 404);
  }
  const rawId = c.req.param('matriculaId');
  if (!ID.test(rawId)) return c.json({ success: false, code: 'NATIVE_INVALID_ENROLLMENT_CONTEXT' }, 400);
  const rawActor = c.get('userId' as never) as unknown;
  const actorId = typeof rawActor === 'number' ? rawActor :
    typeof rawActor === 'string' ? Number(rawActor) : NaN;
  if (!Number.isSafeInteger(actorId) || actorId <= 0) {
    return c.json({ success: false, code: 'NATIVE_ACCESS_DENIED' }, 403);
  }
  if (!c.req.header('content-type')?.toLowerCase().startsWith('application/json')) {
    return c.json({ success: false, code: 'NATIVE_INVALID_PRACTICE_INPUT' }, 400);
  }
  const length = c.req.header('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_BYTES)) {
    return c.json({ success: false, code: 'NATIVE_INVALID_PRACTICE_INPUT' }, 400);
  }
  let payload: unknown;
  try {
    const reader = c.req.raw.body?.getReader();
    if (!reader) throw new Error('EMPTY_BODY');
    let total = 0;
    const chunks: Uint8Array[] = [];
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_BYTES) {
          void reader.cancel().catch(() => undefined);
          throw new Error('BODY_TOO_LARGE');
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const buffer = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      buffer.set(chunk, offset);
      offset += chunk.byteLength;
    }
    payload = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(buffer));
  } catch {
    return c.json({ success: false, code: 'NATIVE_INVALID_PRACTICE_INPUT' }, 400);
  }
  try {
    const verified = await loadNativePrivateCourse({
      env: c.env, db: c.env.DB, bucket: c.env.BUCKET,
      empresaId, matriculaId: Number(rawId), actorUserId: actorId,
    });
    if (verified.mode !== 'LEARN') {
      return c.json({ success: false, code: 'NATIVE_REVIEW_READ_ONLY' }, 409);
    }
    const result = gradeNativePracticeAnswer(verified.artifact, payload);
    return c.json({ success: true, data: {
      ...result, edition_sha256: verified.editionHash, non_certifying: true,
    } }, 200);
  } catch (error) {
    if (error instanceof NativeAdmissionError) {
      return c.json({ success: false, code: error.code }, error.status);
    }
    if (error instanceof NativeContentLoadError) {
      return c.json({ success: false, code: 'NATIVE_CONTENT_UNAVAILABLE' }, 409);
    }
    if (error instanceof NativePracticeError) {
      return c.json({ success: false, code: error.code }, 400);
    }
    throw error;
  }
});

export default app;

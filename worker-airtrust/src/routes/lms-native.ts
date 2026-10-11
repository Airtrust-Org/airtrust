/**
 * Native V1: read-only, enrollment-bound admission endpoint.
 *
 * Initial vertical integration with the existing LMS enrollment D1 records.
 * This endpoint does not launch content, set progress, publish a native course
 * or change qualifications. Native course storage/schema requires Schema V2.
 */
import { Hono } from 'hono';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { getEmpresaIdSafe } from './escalas-shared';
import { loadNativePublishedCourse, loadNativePrivateCourse, NativeContentLoadError } from '../services/lms-native-content-loader';
import { readNativeLearnerSession, NativeEvidenceReadError } from '../services/lms-native-readiness-repository';
import { loadNativeVerifiedAsset } from '../services/lms-native-asset-loader';
import nativeWriteRoutes, { canWriteNative } from './lms-native-write';
import {
  NativeAdmissionError,
  resolveNativeEnrollmentAdmission,
} from '../services/lms-native-enrollment-access';

const app = new Hono<{ Bindings: Env }>();
app.use('*', auth());

app.get('/matriculas/:matriculaId/admissao', async (c) => {
  c.header('Cache-Control', 'private, no-store');
  const empresaId = getEmpresaIdSafe(c);
  // Admission metadata is part of the Native pilot. Do not expose it to
  // production or non-allowlisted tenants before the Native catalog is live.
  if (!canPreviewNativeInStaging(c.env, empresaId)) {
    return c.json({ success: false, code: 'NATIVE_PLAYER_NOT_ENABLED' }, 404);
  }
  const rawId = c.req.param('matriculaId');
  if (!/^[1-9][0-9]{0,15}$/.test(rawId)) {
    return c.json({ success: false, code: 'NATIVE_INVALID_ENROLLMENT_CONTEXT' }, 400);
  }
  const rawUser = c.get('userId' as never) as unknown;
  const actorUserId = typeof rawUser === 'string' ? Number(rawUser) : rawUser;
  try {
    const admission = await resolveNativeEnrollmentAdmission({
      db: c.env.DB,
      empresaId,
      matriculaId: Number(rawId),
      actorUserId: actorUserId as number,
    });
    return c.json({
      success: true,
      data: {
        matricula_id: admission.matriculaId,
        curso_id: admission.cursoId,
        mode: admission.mode,
        native_package: 'NOT_YET_ENABLED',
      },
    });
  } catch (error) {
    if (error instanceof NativeAdmissionError) {
      return c.json({ success: false, code: error.code }, error.status);
    }
    throw error;
  }
});

/**
 * Staging pilot: load the validated, sanitized learner projection for the
 * exact current enrollment/cycle/edition. This does NOT provide completion,
 * answers, asset bytes or a public download.
 */
function canPreviewNativeInStaging(env: Env, empresaId: number): boolean {
  if (env.ENVIRONMENT !== 'staging' ||
      !Number.isSafeInteger(empresaId) || empresaId <= 0) return false;
  const allowlist = String(env.NATIVE_LEARNER_PREVIEW_ENABLED_TENANTS ?? '').trim();
  // No wildcard: avoid accidentally turning on new LMS content for all tenants.
  if (!allowlist || allowlist.includes('*')) return false;
  return allowlist.split(',').some((raw) => raw.trim() === String(empresaId));
}

app.get('/matriculas/:matriculaId/curso', async (c) => {
  c.header('Cache-Control', 'private, no-store');
  const empresaId = getEmpresaIdSafe(c);
  // A missing explicit staging allowlist results in no D1/R2 lookup at all.
  if (!canPreviewNativeInStaging(c.env, empresaId)) {
    return c.json({ success: false, code: 'NATIVE_PLAYER_NOT_ENABLED' }, 404);
  }
  const rawId = c.req.param('matriculaId');
  if (!/^[1-9][0-9]{0,15}$/.test(rawId)) {
    return c.json({ success: false, code: 'NATIVE_INVALID_ENROLLMENT_CONTEXT' }, 400);
  }
  const rawUser = c.get('userId' as never) as unknown;
  const actorUserId = typeof rawUser === 'string' ? Number(rawUser) : rawUser;
  try {
    const published = await loadNativePublishedCourse({
      db: c.env.DB,
      bucket: c.env.BUCKET,
      empresaId,
      matriculaId: Number(rawId),
      actorUserId: actorUserId as number,
    });
    return c.json({
      success: true,
      data: {
        matricula_id: Number(rawId),
        ciclo_id: published.cicloId,
        mode: published.mode,
        edition_sha256: published.editionHash,
        course: published.course,
        // Client capability hints never replace the exact-tenant server checks on POST.
        evidence_write_enabled: canWriteNative(c.env, empresaId) && published.mode === 'LEARN',
        // Progress, grading and native certificate endpoints are not enabled.
        completion_supported: false,
      },
    });
  } catch (error) {
    if (error instanceof NativeAdmissionError) {
      return c.json({ success: false, code: error.code }, error.status);
    }
    if (error instanceof NativeContentLoadError) {
      // Return a generic error code: details remain private to the server.
      return c.json({ success: false, code: 'NATIVE_CONTENT_UNAVAILABLE' }, 409);
    }
    throw error;
  }
});

/**
 * Read-only, version-bound resume state. This endpoint is not an authority
 * to conclude or certify a course, and never returns quiz answer selections.
 */
app.get('/matriculas/:matriculaId/sessao', async (c) => {
  c.header('Cache-Control', 'private, no-store');
  const empresaId = getEmpresaIdSafe(c);
  if (!canPreviewNativeInStaging(c.env, empresaId)) {
    return c.json({ success: false, code: 'NATIVE_PLAYER_NOT_ENABLED' }, 404);
  }
  const rawId = c.req.param('matriculaId');
  if (!/^[1-9][0-9]{0,15}$/.test(rawId)) {
    return c.json({ success: false, code: 'NATIVE_INVALID_ENROLLMENT_CONTEXT' }, 400);
  }
  const rawActor = c.get('userId' as never) as unknown;
  const actorUserId = typeof rawActor === 'number' ? rawActor :
    typeof rawActor === 'string' ? Number(rawActor) : NaN;
  if (!Number.isSafeInteger(actorUserId) || actorUserId <= 0) {
    return c.json({ success: false, code: 'NATIVE_ACCESS_DENIED' }, 403);
  }
  try {
    const edition = await loadNativePrivateCourse({
      db: c.env.DB, bucket: c.env.BUCKET,
      empresaId, matriculaId: Number(rawId), actorUserId,
    });
    const { summary } = await readNativeLearnerSession({
      db: c.env.DB, actorUserId, artifact: edition.artifact,
      scope: {
        empresaId, matriculaId: Number(rawId), cursoId: edition.cursoId,
        cicloId: edition.cicloId, artifactHash: edition.editionHash,
      },
    });
    // Only whitelisted navigation metadata leaves the Worker.
    return c.json({
      success: true,
      data: {
        matricula_id: Number(rawId),
        ciclo_id: summary.cicloId,
        edition_sha256: summary.editionHash,
        mode: summary.mode,
        next_sequence: summary.nextSequence,
        seen_lesson_ids: summary.seenLessonIds,
        last_visited_unit_id: summary.lastVisitedUnitId,
        total_lessons: summary.totalLessons,
        latest_attempt: summary.latestAttempt ? {
          attempt_number: summary.latestAttempt.attemptNumber,
          score_pct: summary.latestAttempt.scorePct,
          assessment_satisfied: summary.latestAttempt.assessmentSatisfied,
        } : null,
        completion_supported: false,
      },
    });
  } catch (error) {
    if (error instanceof NativeAdmissionError) {
      return c.json({ success: false, code: error.code }, error.status);
    }
    if (error instanceof NativeContentLoadError || error instanceof NativeEvidenceReadError) {
      return c.json({ success: false, code: 'NATIVE_SESSION_UNAVAILABLE' }, 409);
    }
    throw error;
  }
});

/**
 * Staging-only media transport. Browser clients must send the authenticated
 * Authorization header via fetch/Blob URLs; never put JWTs in media query
 * parameters or expose R2 keys.
 */
app.get('/matriculas/:matriculaId/assets/:assetId', async (c) => {
  c.header('Cache-Control', 'private, no-store');
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Cross-Origin-Resource-Policy', 'same-origin');
  const empresaId = getEmpresaIdSafe(c);
  if (!canPreviewNativeInStaging(c.env, empresaId)) {
    return c.json({ success: false, code: 'NATIVE_PLAYER_NOT_ENABLED' }, 404);
  }
  const rawId = c.req.param('matriculaId');
  const assetId = c.req.param('assetId');
  if (!/^[1-9][0-9]{0,15}$/.test(rawId) ||
      !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(assetId)) {
    return c.json({ success: false, code: 'NATIVE_INVALID_ASSET_REQUEST' }, 400);
  }
  const rawUser = c.get('userId' as never) as unknown;
  const actorUserId = typeof rawUser === 'string' ? Number(rawUser) : rawUser;
  try {
    const verified = await loadNativeVerifiedAsset({
      db: c.env.DB, bucket: c.env.BUCKET,
      empresaId, matriculaId: Number(rawId),
      actorUserId: actorUserId as number, assetId,
    });
    const buffer = new Uint8Array(verified.bytes);
    const range = c.req.header('Range');
    const headers: Record<string, string> = {
      'Content-Type': verified.contentType,
      'Content-Disposition': 'inline',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'same-origin',
    };
    if (range) {
      const match = /^bytes=(\d+)-(\d*)$/.exec(range);
      const start = match ? Number(match[1]) : NaN;
      const end = match && match[2] ? Number(match[2]) : buffer.length - 1;
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) ||
          start < 0 || start >= buffer.length || end < start || end >= buffer.length) {
        return c.body(null, 416, {
          ...headers, 'Content-Range': 'bytes */' + buffer.length,
        });
      }
      const data = buffer.slice(start, end + 1);
      return c.body(data.buffer, 206, {
        ...headers,
        'Content-Length': String(data.byteLength),
        'Content-Range': `bytes ${start}-${end}/${buffer.length}`,
      });
    }
    return c.body(buffer.buffer, 200, {
      ...headers, 'Content-Length': String(buffer.byteLength),
    });
  } catch (error) {
    if (error instanceof NativeAdmissionError) {
      return c.json({ success: false, code: error.code }, error.status);
    }
    if (error instanceof NativeContentLoadError) {
      return c.json({ success: false, code: 'NATIVE_CONTENT_UNAVAILABLE' }, 409);
    }
    throw error;
  }
});

// Inherits auth() and tenant isolation from this parent. The write router
// additionally requires two independent exact-tenant staging allowlists.
app.route('/', nativeWriteRoutes);

export default app;

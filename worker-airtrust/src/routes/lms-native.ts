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
import { loadNativePublishedCourse, NativeContentLoadError } from '../services/lms-native-content-loader';
import {
  NativeAdmissionError,
  resolveNativeEnrollmentAdmission,
} from '../services/lms-native-enrollment-access';

const app = new Hono<{ Bindings: Env }>();
app.use('*', auth());

app.get('/matriculas/:matriculaId/admissao', async (c) => {
  c.header('Cache-Control', 'private, no-store');
  const rawId = c.req.param('matriculaId');
  if (!/^[1-9][0-9]{0,15}$/.test(rawId)) {
    return c.json({ success: false, code: 'NATIVE_INVALID_ENROLLMENT_CONTEXT' }, 400);
  }
  const rawUser = c.get('userId' as never) as unknown;
  const actorUserId = typeof rawUser === 'string' ? Number(rawUser) : rawUser;
  try {
    const admission = await resolveNativeEnrollmentAdmission({
      db: c.env.DB,
      empresaId: getEmpresaIdSafe(c),
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

export default app;

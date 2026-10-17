/**
 * Staging-only, READ-ONLY Native completion diagnostics.
 * This is NOT permission to conclude a course or issue a certificate.
 * Inherits real JWT authentication and tenant context from lms-native.ts.
 * Hidden behind a fourth exact-tenant allowlist; OFF by default.
 */
import { Hono } from 'hono';
import type { Env } from '../types';
import { getEmpresaIdSafe } from './escalas-shared';
import { canProvisionNative } from '../services/lms-native-enrollment-provisioner';
import { preflightNativeCanonicalCompletion } from '../services/lms-native-canonical-completion-preflight';

const app = new Hono<{ Bindings: Env }>();
const ID = /^[1-9][0-9]{0,15}$/;

function canReadNativeCompletionPreflight(env: Env, tenant: number): boolean {
  const raw = env.NATIVE_COMPLETION_PREFLIGHT_ENABLED_TENANTS;
  return canProvisionNative(env, tenant) && !!raw && !raw.includes('*') &&
    raw.split(',').some(part => part.trim() === String(tenant));
}

app.get('/matriculas/:matriculaId/conclusao-prontidao', async c => {
  c.header('Cache-Control', 'private, no-store');
  c.header('X-Content-Type-Options', 'nosniff');
  const empresaId = getEmpresaIdSafe(c);
  if (!canReadNativeCompletionPreflight(c.env, empresaId)) {
    return c.json({ success: false, code: 'NATIVE_COMPLETION_PREFLIGHT_NOT_ENABLED' }, 404);
  }
  const raw = c.req.param('matriculaId');
  if (!ID.test(raw)) {
    return c.json({ success: false, code: 'NATIVE_COMPLETION_PREFLIGHT_INVALID_ID' }, 400);
  }
  const actor = c.get('userId' as never) as unknown;
  const actorUserId = typeof actor === 'number' ? actor :
    typeof actor === 'string' ? Number(actor) : NaN;
  if (!Number.isSafeInteger(actorUserId) || actorUserId <= 0) {
    return c.json({ success: false, code: 'NATIVE_COMPLETION_PREFLIGHT_ACCESS_DENIED' }, 403);
  }

  try {
    const result = await preflightNativeCanonicalCompletion({
      env: c.env, empresaId, matriculaId: Number(raw), actorUserId,
    });
    // No employee ID, private answers, score, certificate ID or qualification
    // metadata is returned. A READY result is evidence-only diagnostic:
    // canonical terminal completion is unavailable until separately governed.
    return c.json({ success: true, data: {
      matricula_id: Number(raw),
      ready_for_canonical_completion: result.ready,
      reason: result.reason,
      completion_supported: false,
    } });
  } catch {
    // Conceal whether an enrollment, user, edition, qualification, or answer
    // existed. Errors are not an invitation to try a SCORM completion route.
    return c.json({ success: false, code: 'NATIVE_COMPLETION_PREFLIGHT_UNAVAILABLE' }, 409);
  }
});

export default app;

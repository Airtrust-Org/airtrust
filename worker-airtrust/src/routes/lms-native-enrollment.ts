/**
 * Separate, default-disabled Native creation route (staging only).
 * Auth and tenant context are inherited from lms-native.ts.
 * No client-controlled employee, edition, cycle, score or completion input.
 */
import { Hono } from 'hono';
import type { Env } from '../types';
import { getEmpresaIdSafe } from './escalas-shared';
import {
  canProvisionNative, provisionNativeEnrollment, NativeProvisionError,
} from '../services/lms-native-enrollment-provisioner';
import {
  selectNativeEnrollmentEdition, NativeEditionSelectionError,
} from '../services/lms-native-enrollment-edition-selector';

const app = new Hono<{ Bindings: Env }>();
const ID = /^[1-9][0-9]{0,15}$/;

function exactTenantAllowlist(raw: string | undefined, tenant: number) {
  return !!raw && !raw.includes('*') &&
    raw.split(',').some(part => part.trim() === String(tenant));
}

app.post('/cursos/:cursoId/matricular', async c => {
  c.header('Cache-Control', 'private, no-store');
  const empresaId = getEmpresaIdSafe(c);
  if (!canProvisionNative(c.env, empresaId) ||
      !exactTenantAllowlist(c.env.NATIVE_LEARNER_ENROLLMENT_CREATE_ENABLED_TENANTS, empresaId)) {
    return c.json({ success: false, code: 'NATIVE_ENROLLMENT_CREATE_NOT_ENABLED' }, 404);
  }
  const raw = c.req.param('cursoId');
  if (!ID.test(raw)) {
    return c.json({ success: false, code: 'NATIVE_ENROLLMENT_CREATE_INVALID_COURSE' }, 400);
  }
  // This endpoint has no JSON/body arguments. Employee, version and cycle
  // must be selected exclusively from authenticated, tenant-bound data.
  if (c.req.raw.body || c.req.header('content-length') && c.req.header('content-length') !== '0') {
    return c.json({ success: false, code: 'NATIVE_ENROLLMENT_CREATE_BODY_NOT_ALLOWED' }, 400);
  }
  const rawActor = c.get('userId' as never) as unknown;
  const actorUserId = typeof rawActor === 'number' ? rawActor :
    typeof rawActor === 'string' ? Number(rawActor) : NaN;
  if (!Number.isSafeInteger(actorUserId) || actorUserId <= 0) {
    return c.json({ success: false, code: 'NATIVE_ENROLLMENT_CREATE_ACCESS_DENIED' }, 403);
  }
  try {
    const cursoId = Number(raw);
    const edicaoId = await selectNativeEnrollmentEdition({ env: c.env, empresaId, cursoId });
    const receipt = await provisionNativeEnrollment({
      env: c.env, empresaId, cursoId, actorUserId, edicaoId,
    });
    return c.json({ success: true, data: {
      matricula_id: receipt.matriculaId,
      ciclo_id: receipt.cicloId,
      // Authoritative edition is selected by Worker only.
      completion_supported: false,
    } }, 201);
  } catch (error) {
    if (error instanceof NativeProvisionError || error instanceof NativeEditionSelectionError) {
      // Conceal private R2 and tenant details; do not convert integrity
      // failures into a retry through the legacy SCORM enrollment route.
      return c.json({ success: false, code: 'NATIVE_ENROLLMENT_CREATE_UNAVAILABLE' }, 409);
    }
    throw error;
  }
});

export default app;

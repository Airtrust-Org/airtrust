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

export default app;

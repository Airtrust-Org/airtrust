import type { Context } from 'hono';
import { logAudit } from '../utils/db';
import { createLogger, toError } from '../utils/logger';
import { getEmpresaIdSafe } from './escalas-shared';

// Shared audit helper extracted from the protected enrollment router.
export function getCallerUserId(c: Context): number | undefined {
  const raw = c.get('userId' as never) as unknown;
  const parsed = typeof raw === 'string' ? Number(raw) : (raw as number | null | undefined);
  return Number.isFinite(parsed) && Number(parsed) > 0 ? Number(parsed) : undefined;
}

export async function logLmsMatriculaAudit(
  db: D1Database,
  c: Context,
  params: {
    action: string;
    matriculaId: number;
    oldValues?: Record<string, unknown>;
    newValues?: Record<string, unknown>;
  },
) {
  try {
    await logAudit(db, {
      userId: getCallerUserId(c),
      action: params.action,
      entityType: 'lms_matriculas',
      entityId: params.matriculaId,
      oldValues: params.oldValues,
      newValues: params.newValues,
      empresaId: getEmpresaIdSafe(c),
      ipAddress: c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? undefined,
      userAgent: c.req.header('user-agent') ?? undefined,
    });
  } catch (error) {
    createLogger(c, 'LmsMatriculas.audit').error('lms_matricula_audit_failed', toError(error), {
      matriculaId: params.matriculaId,
      action: params.action,
    });
  }
}


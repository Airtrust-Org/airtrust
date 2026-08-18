/**
 * FRMS — Shared helpers
 * Extracted from frms.ts for use by sub-route modules.
 */

import type { Context } from 'hono';
import type { Env, Variables } from '../types';
import { getEmpresaId } from '../middleware/tenant';
import { resolvePlatformAccessState, isPlatformAdminAccess } from '../lib/rbac/platform-access';
import { registrarAuditoria } from '../utils/auditoria';
import { createLogger, toError } from '../utils/logger';

export type FrmsAppContext = Context<{ Bindings: Env; Variables: Partial<Variables> }>;

type HandlerFn = (c: FrmsAppContext) => Promise<Response>;

export function safe(fn: HandlerFn): HandlerFn {
  return async (c) => {
    const logger = createLogger(c, 'FrmsRoutes.safe');
    try {
      return await fn(c);
    } catch (e) {
      logger.error('[FRMS] request failed', toError(e), {
        path: c.req.path,
        method: c.req.method,
      });
      return c.json(
        { success: false, error: 'Erro interno no módulo FRMS', code: 'FRMS_ERROR' },
        500,
      );
    }
  };
}

export function logDomainEventError(
  c: FrmsAppContext,
  eventName: string,
  error: unknown,
  data?: Record<string, unknown>,
) {
  const logger = createLogger(c, 'FrmsRoutes.domainEvents');
  logger.error('domain_event_error', toError(error), {
    eventName,
    ...data,
  });
}

export function getEmpresaIdSafe(c: FrmsAppContext): number | undefined {
  try {
    return getEmpresaId(c as unknown as Context<{ Bindings: Env }>);
  } catch {
    return undefined;
  }
}

export async function requirePlatformAdmin(c: FrmsAppContext): Promise<Response | null> {
  const userId = c.get('userId');
  const state = await resolvePlatformAccessState(c.env.DB, userId);
  if (!isPlatformAdminAccess(state)) {
    return c.json(
      {
        success: false,
        error: 'Apenas administradores da plataforma podem alterar configurações globais.',
        code: 'PLATFORM_ADMIN_REQUIRED',
      },
      403,
    );
  }
  return null;
}

/** Audit helper — fire-and-forget, nunca falha a operação principal */
export async function auditFrms(
  c: FrmsAppContext,
  tabela: string,
  acao: 'INSERT' | 'UPDATE' | 'DELETE',
  registro_id: string | number,
  dados?: { antes?: unknown; depois?: unknown },
) {
  try {
    const userId = String(c.get('userId') || '0');
    await registrarAuditoria({
      db: c.env.DB,
      tabela,
      acao,
      registro_id,
      usuario_id: userId,
      dados_anteriores: dados?.antes,
      dados_novos: dados?.depois,
      ip_address: c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for'),
      user_agent: c.req.header('user-agent'),
    });
  } catch {
    /* never fail the main operation */
  }
}

export async function assertTripulanteEmpresa(
  c: FrmsAppContext,
  tripulanteId: string,
): Promise<Response | null> {
  const empresaId = getEmpresaIdSafe(c);
  if (!empresaId) return null;

  const row = await c.env.DB.prepare(
    `SELECT id
       FROM funcionarios
      WHERE id = ?
        AND empresa_id = ?
        AND deleted_at IS NULL
        AND COALESCE(ativo, 1) = 1
        AND UPPER(COALESCE(NULLIF(TRIM(status), ''), 'ATIVO')) = 'ATIVO'
      LIMIT 1`,
  )
    .bind(Number(tripulanteId), empresaId)
    .first<{ id: number }>();

  if (!row) {
    return c.json(
      {
        success: false,
        error: 'Tripulante não pertence à sua empresa.',
        code: 'TENANT_ACCESS_DENIED',
      },
      403,
    );
  }

  return null;
}

export async function assertJornadaEmpresa(
  c: FrmsAppContext,
  jornadaId: string,
): Promise<Response | null> {
  const empresaId = getEmpresaIdSafe(c);
  if (!empresaId) return null;

  const row = await c.env.DB.prepare(
    `SELECT j.id
       FROM frms_jornada j
       JOIN funcionarios f ON f.id = CAST(j.tripulante_id AS INTEGER)
      WHERE j.id = ?
        AND j.deleted_at IS NULL
        AND f.deleted_at IS NULL
        AND COALESCE(f.ativo, 1) = 1
        AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
        AND f.empresa_id = ?
      LIMIT 1`,
  )
    .bind(jornadaId, empresaId)
    .first<{ id: string }>();

  if (!row) {
    return c.json(
      {
        success: false,
        error: 'Jornada não encontrada para sua empresa.',
        code: 'TENANT_ACCESS_DENIED',
      },
      403,
    );
  }

  return null;
}

export async function assertAlertaEmpresa(
  c: FrmsAppContext,
  alertaId: string,
): Promise<Response | null> {
  const empresaId = getEmpresaIdSafe(c);
  if (!empresaId) return null;

  const row = await c.env.DB.prepare(
    `SELECT a.id
       FROM frms_alerta a
       JOIN funcionarios f ON f.id = CAST(a.tripulante_id AS INTEGER)
      WHERE a.id = ?
        AND a.deleted_at IS NULL
        AND f.deleted_at IS NULL
        AND COALESCE(f.ativo, 1) = 1
        AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
        AND f.empresa_id = ?
      LIMIT 1`,
  )
    .bind(alertaId, empresaId)
    .first<{ id: string }>();

  if (!row) {
    return c.json(
      {
        success: false,
        error: 'Alerta não encontrado para sua empresa.',
        code: 'TENANT_ACCESS_DENIED',
      },
      403,
    );
  }

  return null;
}

export async function resolveFuncionarioId(c: FrmsAppContext): Promise<string> {
  const userId = String(c.get('userId') || '0');
  const empresaId = getEmpresaIdSafe(c);

  // Primary path: prefer the explicit usuarios.funcionario_id link, tenant-scoped.
  // This must run before any raw-userId-as-funcionario_id fallback, otherwise a
  // userId that happens to collide with another tenant's funcionarios.id would be
  // returned as if it were the caller's own employee record.
  const byUsuario = await c.env.DB.prepare(
    `SELECT f.id
       FROM usuarios u
       JOIN funcionarios f ON f.id = u.funcionario_id
      WHERE u.id = ?
        AND f.empresa_id = ?
        AND (u.deleted_at IS NULL OR u.deleted_at = 0)
        AND f.deleted_at IS NULL
        AND COALESCE(f.ativo, 1) = 1
        AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
      LIMIT 1`,
  )
    .bind(Number(userId), empresaId)
    .first<{ id: number }>();

  if (byUsuario?.id) return String(byUsuario.id);

  // Legacy fallback for tokens whose sub is itself a funcionarios.id. Still
  // tenant-scoped: funcionarios.id is not globally unique across tenants, so
  // this must never be a blind numeric passthrough.
  const byFuncionario = await c.env.DB.prepare(
    `SELECT id
       FROM funcionarios
      WHERE id = ?
        AND empresa_id = ?
        AND deleted_at IS NULL
        AND COALESCE(ativo, 1) = 1
        AND UPPER(COALESCE(NULLIF(TRIM(status), ''), 'ATIVO')) = 'ATIVO'
      LIMIT 1`,
  )
    .bind(Number(userId), empresaId)
    .first<{ id: number }>();

  if (byFuncionario?.id) return String(byFuncionario.id);

  return userId;
}

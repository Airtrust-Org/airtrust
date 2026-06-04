import type { Context, MiddlewareHandler } from 'hono';
import type { Env, Variables } from '../types';
import { buildAuditMetadata, buildLegacyAuditoriaActor, buildLegacyAuditPayload } from '../lib/audit/context';
import type { AuditSupportMode } from '../lib/audit/audit-events-v2';
import { recordLegacyAndCanonicalAudit } from '../lib/audit/record-legacy-and-canonical-audit';
import {
  canPerformSupportMutation,
  canStartSupportReadOnlySession,
  isPlatformAdminAccess,
  resolvePlatformAccessState,
  type SupportAccessLevel,
} from '../lib/rbac/platform-access';
import { forbidden } from './error-handler';

const SUPPORT_REASON_HEADER = 'x-airtrust-support-reason';
const SUPPORT_READ_ONLY_MODE = 1;
const SUPPORT_ELEVATED_MODE = 2;

type ControlledScopeAccess = 'read_only' | 'mutation' | 'sensitive_export';

type ControlledSupportOptions = {
  action: string;
  access: ControlledScopeAccess;
  entityType: string;
  module: string;
};

function hasAdminRole(rawRole: unknown): boolean {
  const normalized = String(rawRole || '')
    .trim()
    .toLowerCase();
  return normalized === 'admin' || normalized === 'administrador';
}

function normalizedSupportReason(
  c: Context<{ Bindings: Env; Variables: Variables }>,
): string | null {
  const headerValue = c.req.header(SUPPORT_REASON_HEADER);
  if (!headerValue) return null;
  const trimmed = headerValue.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function hasTable(db: D1Database, tableName: string): Promise<boolean> {
  const row = await db
    .prepare("SELECT 1 AS found FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
    .bind(tableName)
    .first<{ found: number }>();
  return Boolean(row?.found);
}

async function updateSupportSessionEnd(
  db: D1Database,
  sessionId: string | null,
) {
  if (!sessionId) return;
  await db
    .prepare(
      `UPDATE support_access_sessions
          SET ended_at = COALESCE(ended_at, CURRENT_TIMESTAMP)
        WHERE id = ?`,
    )
    .bind(sessionId)
    .run();
}

async function recordSupportAccessAudit(
  c: Context<{ Bindings: Env; Variables: Variables }>,
  params: {
    action: string;
    entityType: string;
    supportReason: string;
    supportMode: AuditSupportMode;
    accessLevel: SupportAccessLevel;
    success: boolean;
    sessionId: string | null;
    failureReasonCode?: string;
    module: string;
  },
) {
  const actorUserId = Number(c.get('userId') || 0) || null;
  const actorEmpresaId = Number(c.get('empresaId') || 0) || null;
  const actorRole = typeof c.get('userRole') === 'string' ? String(c.get('userRole')) : null;
  const requestId = c.req.header('x-request-id') || null;

  await recordLegacyAndCanonicalAudit({
    db: c.env.DB,
    legacyAuditoria: {
      tabela: 'support_access_sessions',
      acao: 'BULK_UPDATE',
      registro_id: params.sessionId ?? `${params.action}:${actorUserId ?? 'unknown'}`,
      dados_novos: buildLegacyAuditPayload(
        c,
        {
          action: params.action,
          access_level: params.accessLevel,
          support_reason: params.supportReason,
          success: params.success,
          failure_reason_code: params.failureReasonCode || null,
        },
        buildAuditMetadata(c, {
          module: params.module,
          source: 'platform_support_middleware',
          operation: params.action,
          request_path: c.req.path,
          http_method: c.req.method,
          scope: 'tenant',
          resource_kind: params.entityType,
          result: params.success ? 'success' : 'denied',
          reason_code: params.failureReasonCode,
        }),
      ),
      ...buildLegacyAuditoriaActor(c),
    },
    canonicalEvent: {
      empresaId: actorEmpresaId,
      targetEmpresaId: actorEmpresaId,
      actorUserId,
      actorEmpresaId,
      actorRole,
      actorType: 'support',
      supportMode: params.supportMode,
      supportReason: params.supportReason,
      requestId,
      eventCategory: 'SUPPORT_ACCESS',
      eventAction: params.success ? `${params.action}_AUTHORIZED` : `${params.action}_DENIED`,
      entityType: params.entityType,
      entityId: params.sessionId ?? params.action,
      riskLevel: params.success ? 'high' : 'critical',
      success: params.success,
      failureReasonCode: params.success ? null : params.failureReasonCode || 'SUPPORT_SCOPE_DENIED',
      metadata: {
        module: params.module,
        source: 'platform_support_middleware',
        operation: params.action,
        request_path: c.req.path,
        http_method: c.req.method,
        scope: 'tenant',
        resource_kind: params.entityType,
        result: params.success ? 'success' : 'denied',
        reason_code: params.failureReasonCode,
      },
      retentionClass: 'SUPPORT_CONTROLLED',
    },
  });
}

async function recordAuthorizedSupportSession(
  c: Context<{ Bindings: Env; Variables: Variables }>,
  params: {
    action: string;
    entityType: string;
    supportReason: string;
    accessLevel: SupportAccessLevel;
    module: string;
  },
): Promise<string | null> {
  const db = c.env.DB;
  const tableExists = await hasTable(db, 'support_access_sessions');
  const sessionId = tableExists ? crypto.randomUUID() : null;
  const actorUserId = Number(c.get('userId') || 0) || null;
  const empresaId = Number(c.get('empresaId') || 0) || null;
  const requestId = c.req.header('x-request-id') || null;
  const correlationId = c.req.header('x-correlation-id') || requestId || null;

  if (tableExists && actorUserId && empresaId) {
    await db
      .prepare(
        `INSERT INTO support_access_sessions (
          id,
          user_id,
          empresa_id,
          access_level,
          support_reason,
          request_id,
          correlation_id,
          ended_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      )
      .bind(
        sessionId,
        actorUserId,
        empresaId,
        params.accessLevel,
        params.supportReason,
        requestId,
        correlationId,
      )
      .run();
  }

  await recordSupportAccessAudit(c, {
    action: params.action,
    entityType: params.entityType,
    supportReason: params.supportReason,
    supportMode:
      (params.accessLevel === 'elevated'
        ? SUPPORT_ELEVATED_MODE
        : SUPPORT_READ_ONLY_MODE) as AuditSupportMode,
    accessLevel: params.accessLevel,
    success: true,
    sessionId,
    module: params.module,
  });

  return sessionId;
}

export function requireControlledAdminOrSupportAccess(
  options: ControlledSupportOptions,
): MiddlewareHandler<{ Bindings: Env; Variables: Variables }> {
  return async (c, next) => {
    const userId = c.get('userId');
    const empresaId = Number(c.get('empresaId') || 0);
    const userRole = c.get('userRole');

    if (!userId) {
      throw forbidden('Usuário não autenticado', 'NOT_AUTHENTICATED');
    }

    if (hasAdminRole(userRole)) {
      await next();
      return;
    }

    const accessState = await resolvePlatformAccessState(c.env.DB, userId);
    if (isPlatformAdminAccess(accessState)) {
      await next();
      return;
    }

    const supportReason = normalizedSupportReason(c);
    const allowsReadOnly =
      options.access === 'read_only' && canStartSupportReadOnlySession(accessState, empresaId, supportReason);
    const allowsElevated =
      options.access !== 'read_only' && canPerformSupportMutation(accessState, empresaId, supportReason);

    if (!allowsReadOnly && !allowsElevated) {
      const hasSupportRole =
        accessState.hasSupportReadOnlyRole || accessState.hasSupportElevatedRole;

      if (hasSupportRole && supportReason) {
        await recordSupportAccessAudit(c, {
          action: options.action,
          entityType: options.entityType,
          supportReason,
          supportMode:
            (accessState.hasSupportElevatedRole
              ? SUPPORT_ELEVATED_MODE
              : SUPPORT_READ_ONLY_MODE) as AuditSupportMode,
          accessLevel: accessState.hasSupportElevatedRole ? 'elevated' : 'read_only',
          success: false,
          sessionId: null,
          failureReasonCode: 'SUPPORT_SCOPE_DENIED',
          module: options.module,
        });
      }

      const denialMessage =
        options.access === 'read_only'
          ? 'Acesso de suporte somente leitura exige grant ativo e justificativa explícita.'
          : 'Ação sensível exige suporte elevado com grant ativo e justificativa explícita.';
      throw forbidden(denialMessage, 'SUPPORT_ACCESS_FORBIDDEN');
    }

    const accessLevel: SupportAccessLevel = allowsElevated ? 'elevated' : 'read_only';
    const sessionId = await recordAuthorizedSupportSession(c, {
      action: options.action,
      entityType: options.entityType,
      supportReason: supportReason!,
      accessLevel,
      module: options.module,
    });

    try {
      await next();
    } finally {
      await updateSupportSessionEnd(c.env.DB, sessionId);
    }
  };
}

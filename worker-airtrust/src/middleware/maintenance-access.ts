import type { Context, MiddlewareHandler } from 'hono';
import type { Env, Variables } from '../types';
import { extractBearerToken, verifyJWT } from '../utils/security';
import { normalizeTenantRole } from './tenant';
import { forbidden, unauthorized } from './error-handler';
import { buildAuditMetadata, buildLegacyAuditoriaActor, buildLegacyAuditPayload } from '../lib/audit/context';
import { recordLegacyAndCanonicalAudit } from '../lib/audit/record-legacy-and-canonical-audit';

export const MAINTENANCE_CAPABILITIES = {
  frmsVisualizar: 'frms.maintenance.visualizar',
  frmsExecutar: 'frms.maintenance.executar',
  sigvoosVisualizar: 'integracoes.sigvoos.maintenance.visualizar',
  sigvoosExecutar: 'integracoes.sigvoos.maintenance.executar',
} as const;

export type MaintenanceCapability =
  (typeof MAINTENANCE_CAPABILITIES)[keyof typeof MAINTENANCE_CAPABILITIES];

type MaintenanceContext = Context<{ Bindings: Env; Variables: Partial<Variables> }>;

const ROLE_LEVEL: Record<string, number> = {
  admin: 100,
  manager: 80,
  instructor: 60,
  editor: 50,
  student: 20,
  viewer: 10,
};

async function readPermissionOverride(
  db: D1Database,
  userId: number | string,
  capability: string,
): Promise<'GRANT' | 'DENY' | null> {
  // Authorization reads must fail closed. Swallowing a D1/schema error here would
  // erase an explicit DENY and incorrectly fall back to the user's role grants.
  const rows = await db
    .prepare(`SELECT tipo FROM usuario_permissoes WHERE usuario_id = ? AND permissao = ?`)
    .bind(userId, capability)
    .all<{ tipo: string }>();

  const results = rows.results || [];
  if (results.some((row) => String(row.tipo).toUpperCase() === 'DENY')) return 'DENY';
  if (results.some((row) => String(row.tipo).toUpperCase() === 'GRANT')) return 'GRANT';
  return null;
}

async function resolveActiveTenantRole(
  db: D1Database,
  userId: number,
  empresaId: number,
): Promise<string> {
  const row = await db
    .prepare(`SELECT role FROM usuarios_empresas WHERE usuario_id = ? AND empresa_id = ? LIMIT 1`)
    .bind(userId, empresaId)
    .first<{ role: string }>()
    .catch(() => null);

  return normalizeTenantRole(row?.role);
}

function defaultGrantForRole(capability: MaintenanceCapability, role: string): boolean {
  const level = ROLE_LEVEL[role] ?? 0;

  switch (capability) {
    case MAINTENANCE_CAPABILITIES.frmsVisualizar:
    case MAINTENANCE_CAPABILITIES.sigvoosVisualizar:
      return level >= ROLE_LEVEL.manager;
    case MAINTENANCE_CAPABILITIES.frmsExecutar:
    case MAINTENANCE_CAPABILITIES.sigvoosExecutar:
      return level >= ROLE_LEVEL.admin;
    default:
      return false;
  }
}

export async function hasMaintenanceCapability(
  c: MaintenanceContext,
  capability: MaintenanceCapability,
): Promise<boolean> {
  const userId = Number(c.get('userId') || 0);
  const empresaId = Number(c.get('empresaId') || 0);
  if (!userId || !empresaId) return false;

  let override: 'GRANT' | 'DENY' | null;
  try {
    override = await readPermissionOverride(c.env.DB, userId, capability);
  } catch {
    // A permissions-store failure is an authorization failure, never absence of
    // an override. This prevents a transient D1/schema error from bypassing DENY.
    return false;
  }

  if (override === 'DENY') return false;
  if (override === 'GRANT') return true;

  const role = await resolveActiveTenantRole(c.env.DB, userId, empresaId);
  return defaultGrantForRole(capability, role);
}

export function requireMaintenanceCapability(
  capability: MaintenanceCapability,
  deniedMessage = `Permissão insuficiente (${capability})`,
): MiddlewareHandler<{ Bindings: Env; Variables: Partial<Variables> }> {
  return async (c, next) => {
    if (!c.get('userId')) {
      return unauthorized('Usuário não autenticado', 'NOT_AUTHENTICATED');
    }

    const allowed = await hasMaintenanceCapability(c, capability);
    if (!allowed) {
      return forbidden(deniedMessage, 'MAINTENANCE_CAPABILITY_FORBIDDEN');
    }

    await next();
  };
}

export async function assertNoImpersonation(
  c: MaintenanceContext,
  deniedCode = 'IMPERSONATION_NOT_ALLOWED',
): Promise<Response | null> {
  const authHeader = c.req.header('Authorization');
  const token = extractBearerToken(authHeader);
  if (!token || !c.env.JWT_SECRET) return null;

  const payload = await verifyJWT(token, c.env.JWT_SECRET);
  if (payload?.impersonated_by) {
    return forbidden(
      'Operação bloqueada para sessões com impersonação ativa',
      deniedCode,
    );
  }

  return null;
}

export async function recordMaintenanceAudit(
  c: MaintenanceContext,
  params: {
    action: string;
    module: 'frms' | 'integracoes_sigvoos';
    entityType: string;
    capability?: string;
    entityId?: string | number | null;
    success: boolean;
    riskLevel?: 'medium' | 'high' | 'critical';
    result: 'success' | 'denied' | 'error';
    count?: number;
    approximateCount?: number;
    durationMs?: number;
    operationId?: string | null;
    failureReasonCode?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const actorUserId = Number(c.get('userId') || 0) || null;
  const actorEmpresaId = Number(c.get('empresaId') || 0) || null;
  const actorRole = typeof c.get('userRole') === 'string' ? String(c.get('userRole')) : null;

  await recordLegacyAndCanonicalAudit({
    db: c.env.DB,
    legacyAuditoria: {
      tabela: params.entityType,
      acao: 'BULK_UPDATE',
      registro_id: params.entityId ?? params.action,
      dados_novos: buildLegacyAuditPayload(
        c,
        {
          action: params.action,
          operation_id: params.operationId ?? null,
          capability: params.capability ?? null,
          result: params.result,
          duration_ms: params.durationMs,
          count: params.count,
          approximate_count: params.approximateCount,
          failure_reason_code: params.failureReasonCode ?? null,
          ...params.metadata,
        },
        buildAuditMetadata(c, {
          module: params.module,
          source: 'maintenance_access',
          operation: params.action,
          operation_id: params.operationId ?? undefined,
          capability: params.capability ?? undefined,
          request_path: c.req.path,
          http_method: c.req.method,
          scope: 'tenant',
          resource_kind: params.entityType,
          result: params.result,
          reason_code: params.failureReasonCode ?? undefined,
          count: params.count,
          approximate_count: params.approximateCount,
          duration_ms: params.durationMs,
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
      requestId: c.req.header('x-request-id') || null,
      eventCategory: 'ADMIN_OPERATION',
      eventAction: params.action,
      entityType: params.entityType,
      entityId: params.entityId ?? params.action,
      riskLevel: params.riskLevel ?? 'high',
      success: params.success,
      failureReasonCode: params.success ? null : (params.failureReasonCode ?? 'OPERATION_DENIED'),
      metadata: {
        module: params.module,
        source: 'maintenance_access',
        operation: params.action,
        operation_id: params.operationId ?? undefined,
        capability: params.capability ?? undefined,
        request_path: c.req.path,
        http_method: c.req.method,
        scope: 'tenant',
        resource_kind: params.entityType,
        result: params.result,
        reason_code: params.failureReasonCode ?? undefined,
        count: params.count,
        approximate_count: params.approximateCount,
        duration_ms: params.durationMs,
      },
      retentionClass: 'SECURITY_LONG',
    },
  });
}

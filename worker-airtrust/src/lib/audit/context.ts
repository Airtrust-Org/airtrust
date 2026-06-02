import { sanitizeAuditPayload } from './sanitize';

type AuditContextLike = {
  get: (key: string) => unknown;
  req?: {
    header: (name: string) => string | undefined;
  };
};

export interface AuditContextSnapshot {
  userId: number | null;
  userRole: string | null;
  empresaId: number | null;
  requestId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
}

function asNumber(value: unknown): number | null {
  const parsed = typeof value === 'string' ? Number(value) : Number(value ?? NaN);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function getAuditContextSnapshot(c: AuditContextLike): AuditContextSnapshot {
  return {
    userId: asNumber(c.get('userId')),
    userRole: asString(c.get('userRole')),
    empresaId: asNumber(c.get('empresaId')),
    requestId: asString(c.get('requestId')) ?? asString(c.req?.header('X-Request-ID')),
    ipAddress:
      asString(c.req?.header('cf-connecting-ip')) ?? asString(c.req?.header('x-forwarded-for')),
    userAgent: asString(c.req?.header('user-agent')),
  };
}

export function buildAuditMetadata(
  c: AuditContextLike,
  metadata: Record<string, unknown> = {},
): Record<string, unknown> {
  const snapshot = getAuditContextSnapshot(c);
  return sanitizeAuditPayload({
    ...metadata,
    request_id: snapshot.requestId,
    empresa_id: metadata.empresa_id ?? snapshot.empresaId,
    actor_user_id: snapshot.userId,
    actor_role: snapshot.userRole,
  }) as Record<string, unknown>;
}

export function buildLegacyAuditPayload(
  c: AuditContextLike,
  payload: unknown,
  metadata: Record<string, unknown> = {},
): Record<string, unknown> {
  const sanitizedPayload = sanitizeAuditPayload(payload);
  const auditContext = buildAuditMetadata(c, metadata);

  if (sanitizedPayload && typeof sanitizedPayload === 'object' && !Array.isArray(sanitizedPayload)) {
    return {
      ...(sanitizedPayload as Record<string, unknown>),
      _audit_context: auditContext,
    };
  }

  return {
    value: sanitizedPayload,
    _audit_context: auditContext,
  };
}

export function buildLegacyAuditoriaActor(c: AuditContextLike): {
  usuario_id?: string;
  ip_address?: string;
  user_agent?: string;
} {
  const snapshot = getAuditContextSnapshot(c);
  return {
    usuario_id: snapshot.userId ? String(snapshot.userId) : undefined,
    ip_address: snapshot.ipAddress ?? undefined,
    user_agent: snapshot.userAgent ?? undefined,
  };
}

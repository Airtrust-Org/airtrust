const AUDIT_EVENT_CATEGORIES = new Set([
  'AUTH',
  'TENANT_SWITCH',
  'USER_MANAGEMENT',
  'ROLE_PERMISSION',
  'SUPPORT_ACCESS',
  'DOCUMENT_ACCESS',
  'DOCUMENT_DOWNLOAD',
  'CERTIFICATE_ACCESS',
  'QUALIFICATION_CHANGE',
  'SIMULATOR_SESSION_CHANGE',
  'FRMS_CHECKIN',
  'EVD_CHANGE',
  'SCHEDULE_CHANGE',
  'ASSET_ACCESS',
  'ADMIN_OPERATION',
  'DATA_EXPORT',
  'D1_OPERATION',
  'MODULE_GATING_CHANGE',
  'SECURITY_GUARD',
]);

const AUDIT_RISK_LEVELS = new Set(['low', 'medium', 'high', 'critical']);
const AUDIT_RETENTION_CLASSES = new Set([
  'standard',
  'OPS_SHORT',
  'BUSINESS_MEDIUM',
  'COMPLIANCE_LONG',
  'SECURITY_LONG',
  'LGPD_SENSITIVE',
  'SUPPORT_CONTROLLED',
]);
const AUDIT_ACTOR_TYPES = new Set(['user', 'support', 'system', 'job']);
const AUDIT_SUPPORT_MODES = new Set([0, 1, 2, 3]);
const SAFE_METADATA_KEYS = new Set([
  'module',
  'source',
  'operation',
  'request_path',
  'http_method',
  'scope',
  'resource_kind',
  'result',
  'reason_code',
  'count',
  'approximate_count',
  'previous_status',
  'new_status',
  'previous_state',
  'new_state',
  'logical_prefix',
  'asset_category',
  'cache_policy',
  'course_content_type',
  'published',
  'automatic_sync',
]);

const MAX_METADATA_STRING_LENGTH = 160;
const SAFE_TOKEN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:_./-]*$/;
const CPF_PATTERN = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const URL_PATTERN = /https?:\/\//i;
const SECRET_VALUE_PATTERN = /^(bearer\s+|basic\s+|session=|token=|jwt=)/i;

export type AuditEventCategory =
  | 'AUTH'
  | 'TENANT_SWITCH'
  | 'USER_MANAGEMENT'
  | 'ROLE_PERMISSION'
  | 'SUPPORT_ACCESS'
  | 'DOCUMENT_ACCESS'
  | 'DOCUMENT_DOWNLOAD'
  | 'CERTIFICATE_ACCESS'
  | 'QUALIFICATION_CHANGE'
  | 'SIMULATOR_SESSION_CHANGE'
  | 'FRMS_CHECKIN'
  | 'EVD_CHANGE'
  | 'SCHEDULE_CHANGE'
  | 'ASSET_ACCESS'
  | 'ADMIN_OPERATION'
  | 'DATA_EXPORT'
  | 'D1_OPERATION'
  | 'MODULE_GATING_CHANGE'
  | 'SECURITY_GUARD';

export type AuditRiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type AuditRetentionClass =
  | 'standard'
  | 'OPS_SHORT'
  | 'BUSINESS_MEDIUM'
  | 'COMPLIANCE_LONG'
  | 'SECURITY_LONG'
  | 'LGPD_SENSITIVE'
  | 'SUPPORT_CONTROLLED';
export type AuditActorType = 'user' | 'support' | 'system' | 'job';
export type AuditSupportMode = 0 | 1 | 2 | 3;

export interface AuditEventV2Input {
  id?: string;
  empresaId?: number | null;
  targetEmpresaId?: number | null;
  actorUserId?: number | null;
  actorEmpresaId?: number | null;
  actorRole?: string | null;
  actorType?: AuditActorType;
  supportMode?: AuditSupportMode;
  supportReason?: string | null;
  requestId?: string | null;
  correlationId?: string | null;
  ipHash?: string | null;
  userAgentHash?: string | null;
  eventCategory: AuditEventCategory;
  eventAction: string;
  entityType?: string | null;
  entityId?: string | number | null;
  riskLevel?: AuditRiskLevel;
  success?: boolean;
  failureReasonCode?: string | null;
  metadata?: Record<string, unknown> | null;
  retentionClass?: AuditRetentionClass;
}

export interface AuditEventV2WriteResult {
  ok: boolean;
  id: string;
  errorCode?: 'invalid_event' | 'support_reason_required' | 'failure_reason_required' | 'db_write_failed';
}

function positiveIntegerOrNull(value: number | null | undefined): number | null {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : null;
}

function safeTokenOrNull(value: string | null | undefined, maxLength = 160): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (
    trimmed.length === 0 ||
    trimmed.length > maxLength ||
    !SAFE_TOKEN_PATTERN.test(trimmed) ||
    CPF_PATTERN.test(trimmed) ||
    EMAIL_PATTERN.test(trimmed) ||
    URL_PATTERN.test(trimmed) ||
    SECRET_VALUE_PATTERN.test(trimmed)
  ) {
    return null;
  }
  return trimmed;
}

function hashOrNull(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return /^(sha256:)?[a-f0-9]{64}$/i.test(trimmed) ? trimmed : null;
}

function safeMetadataValue(value: unknown): string | number | boolean | null | undefined {
  if (value === null) return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string') return undefined;

  const trimmed = value.trim();
  if (
    trimmed.length === 0 ||
    CPF_PATTERN.test(trimmed) ||
    EMAIL_PATTERN.test(trimmed) ||
    URL_PATTERN.test(trimmed) ||
    SECRET_VALUE_PATTERN.test(trimmed)
  ) {
    return undefined;
  }

  return trimmed.slice(0, MAX_METADATA_STRING_LENGTH);
}

export function sanitizeAuditEventV2Metadata(
  metadata: Record<string, unknown> | null | undefined,
): Record<string, string | number | boolean | null> {
  const sanitized: Record<string, string | number | boolean | null> = {};
  if (!metadata) return sanitized;

  for (const [key, value] of Object.entries(metadata)) {
    if (!SAFE_METADATA_KEYS.has(key)) continue;
    const safeValue = safeMetadataValue(value);
    if (safeValue !== undefined) {
      sanitized[key] = safeValue;
    }
  }

  return sanitized;
}

export async function recordAuditEventV2(
  db: D1Database,
  input: AuditEventV2Input,
): Promise<AuditEventV2WriteResult> {
  const id = safeTokenOrNull(input.id, 160) ?? crypto.randomUUID();
  const eventCategory = safeTokenOrNull(input.eventCategory, 80);
  const eventAction = safeTokenOrNull(input.eventAction, 120);
  const supportMode = AUDIT_SUPPORT_MODES.has(input.supportMode ?? 0) ? (input.supportMode ?? 0) : 0;
  const supportReason = safeTokenOrNull(input.supportReason, 160);
  const success = input.success ?? true;
  const failureReasonCode = safeTokenOrNull(input.failureReasonCode, 120);

  if (!eventCategory || !eventAction || !AUDIT_EVENT_CATEGORIES.has(eventCategory)) {
    return { ok: false, id, errorCode: 'invalid_event' };
  }
  if (supportMode > 0 && !supportReason) {
    return { ok: false, id, errorCode: 'support_reason_required' };
  }
  if (!success && !failureReasonCode) {
    return { ok: false, id, errorCode: 'failure_reason_required' };
  }

  const riskLevel = AUDIT_RISK_LEVELS.has(input.riskLevel ?? 'low') ? (input.riskLevel ?? 'low') : 'low';
  const retentionClass = AUDIT_RETENTION_CLASSES.has(input.retentionClass ?? 'standard')
    ? (input.retentionClass ?? 'standard')
    : 'standard';
  const actorType = AUDIT_ACTOR_TYPES.has(input.actorType ?? 'user') ? (input.actorType ?? 'user') : 'user';
  const metadata = sanitizeAuditEventV2Metadata(input.metadata);
  const metadataJson = Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : null;

  try {
    await db
      .prepare(
        `INSERT INTO audit_events_v2 (
          id, empresa_id, target_empresa_id, actor_user_id, actor_empresa_id,
          actor_role, actor_type, support_mode, support_reason, request_id,
          correlation_id, ip_hash, user_agent_hash, event_category, event_action,
          entity_type, entity_id, risk_level, success, failure_reason_code,
          metadata_sanitized_json, retention_class
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        positiveIntegerOrNull(input.empresaId),
        positiveIntegerOrNull(input.targetEmpresaId),
        positiveIntegerOrNull(input.actorUserId),
        positiveIntegerOrNull(input.actorEmpresaId),
        safeTokenOrNull(input.actorRole, 80),
        actorType,
        supportMode,
        supportReason,
        safeTokenOrNull(input.requestId, 160),
        safeTokenOrNull(input.correlationId, 160),
        hashOrNull(input.ipHash),
        hashOrNull(input.userAgentHash),
        eventCategory,
        eventAction,
        safeTokenOrNull(input.entityType, 80),
        safeTokenOrNull(input.entityId == null ? null : String(input.entityId), 160),
        riskLevel,
        success ? 1 : 0,
        failureReasonCode,
        metadataJson,
        retentionClass,
      )
      .run();
    return { ok: true, id };
  } catch {
    console.warn('[AuditV2] Falha ao registrar evento canônico', {
      eventCategory,
      eventAction,
    });
    return { ok: false, id, errorCode: 'db_write_failed' };
  }
}

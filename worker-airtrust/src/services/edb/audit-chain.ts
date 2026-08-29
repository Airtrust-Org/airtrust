import { canonicalJson, sha256Hex } from './canonicalization';
import type { EdbPersonIdentity } from './contracts';

export type EdbAuditEventType =
  | 'RECORD_CREATED'
  | 'SOURCE_SNAPSHOT_CAPTURED'
  | 'REGULATORY_DATA_UPDATED'
  | 'PIC_TECHNICAL_ACK_SIGNED'
  | 'PIC_FLIGHT_RECORD_SIGNED'
  | 'OPERATOR_RECORD_SIGNED'
  | 'DISCREPANCY_RECORDED'
  | 'MAINTENANCE_ACTION_APPENDED'
  | 'RTS_APPROVAL_APPENDED'
  | 'ANAC_SYNC_QUEUED'
  | 'ANAC_SYNC_ACKNOWLEDGED'
  | 'RECORD_SUPERSEDED'
  | 'RECORD_CANCELLED';

/**
 * Audit chains are anchored to the aircraft diary, not to a final record.
 * This allows preflight events to exist before a postflight revision is born.
 */
export interface EdbAuditScope {
  diaryId: number;
  sourceFlightId: number | null;
  technicalSituationId: string | null;
  revisionId: string | null;
}

export interface EdbAuditEventDraft {
  eventId: string;
  scope: EdbAuditScope;
  type: EdbAuditEventType;
  actor: EdbPersonIdentity | null;
  occurredAt: string;
  payload: unknown;
  previousEventHashSha256: string | null;
}

export interface EdbAuditEvent extends EdbAuditEventDraft {
  eventHashSha256: string;
}

export interface EdbAuditChainVerification {
  valid: boolean;
  issues: Array<{
    index: number;
    eventId: string;
    code:
      | 'FIRST_EVENT_PREVIOUS_HASH_NOT_NULL'
      | 'PREVIOUS_HASH_MISMATCH'
      | 'EVENT_HASH_MISMATCH'
      | 'DIARY_SCOPE_MISMATCH';
  }>;
}

const PREFLIGHT_EVENT_TYPES = new Set<EdbAuditEventType>([
  'SOURCE_SNAPSHOT_CAPTURED',
  'PIC_TECHNICAL_ACK_SIGNED',
]);

const REVISION_EVENT_TYPES = new Set<EdbAuditEventType>([
  'RECORD_CREATED',
  'PIC_FLIGHT_RECORD_SIGNED',
  'OPERATOR_RECORD_SIGNED',
  'DISCREPANCY_RECORDED',
  'MAINTENANCE_ACTION_APPENDED',
  'RTS_APPROVAL_APPENDED',
  'ANAC_SYNC_QUEUED',
  'ANAC_SYNC_ACKNOWLEDGED',
  'RECORD_SUPERSEDED',
  'RECORD_CANCELLED',
]);

function normalizeOptionalId(value: string | null, field: string): string | null {
  if (value === null) return null;
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} cannot be blank`);
  return normalized;
}

function normalizedScope(scope: EdbAuditScope, eventType: EdbAuditEventType): EdbAuditScope {
  if (!Number.isInteger(scope.diaryId) || scope.diaryId < 1) {
    throw new Error('scope.diaryId must be a positive integer');
  }
  if (
    scope.sourceFlightId !== null &&
    (!Number.isInteger(scope.sourceFlightId) || scope.sourceFlightId < 1)
  ) {
    throw new Error('scope.sourceFlightId must be null or a positive integer');
  }

  const normalized: EdbAuditScope = {
    diaryId: scope.diaryId,
    sourceFlightId: scope.sourceFlightId,
    technicalSituationId: normalizeOptionalId(
      scope.technicalSituationId,
      'scope.technicalSituationId',
    ),
    revisionId: normalizeOptionalId(scope.revisionId, 'scope.revisionId'),
  };

  if (PREFLIGHT_EVENT_TYPES.has(eventType)) {
    if (normalized.sourceFlightId === null) {
      throw new Error(`${eventType} requires scope.sourceFlightId`);
    }
    if (normalized.technicalSituationId === null) {
      throw new Error(`${eventType} requires scope.technicalSituationId`);
    }
    if (normalized.revisionId !== null) {
      throw new Error(`${eventType} must not depend on a postflight revision`);
    }
  }

  if (REVISION_EVENT_TYPES.has(eventType) && normalized.revisionId === null) {
    throw new Error(`${eventType} requires scope.revisionId`);
  }

  if (eventType === 'REGULATORY_DATA_UPDATED' && normalized.sourceFlightId === null) {
    throw new Error('REGULATORY_DATA_UPDATED requires scope.sourceFlightId');
  }

  return normalized;
}

function normalizedDraft(draft: EdbAuditEventDraft): EdbAuditEventDraft {
  const eventId = draft.eventId.trim();
  if (!eventId) throw new Error('eventId is required');
  if (!Number.isFinite(Date.parse(draft.occurredAt))) throw new Error('occurredAt must be a valid timestamp');
  if (
    draft.previousEventHashSha256 !== null &&
    !/^[a-f0-9]{64}$/.test(draft.previousEventHashSha256)
  ) {
    throw new Error('previousEventHashSha256 must be null or a lowercase SHA-256 hex digest');
  }
  if (draft.actor && !draft.actor.fullName.trim()) {
    throw new Error('actor.fullName is required when actor is present');
  }

  return {
    ...draft,
    eventId,
    scope: normalizedScope(draft.scope, draft.type),
    actor: draft.actor ? { ...draft.actor, fullName: draft.actor.fullName.trim() } : null,
  };
}

export async function hashEdbAuditEventDraft(draft: EdbAuditEventDraft): Promise<string> {
  return sha256Hex(canonicalJson(normalizedDraft(draft)));
}

export async function createEdbAuditEvent(draft: EdbAuditEventDraft): Promise<EdbAuditEvent> {
  const normalized = normalizedDraft(draft);
  return {
    ...normalized,
    eventHashSha256: await hashEdbAuditEventDraft(normalized),
  };
}

export async function appendEdbAuditEvent(
  chain: readonly EdbAuditEvent[],
  draft: Omit<EdbAuditEventDraft, 'previousEventHashSha256'>,
): Promise<EdbAuditEvent[]> {
  if (chain.length > 0 && chain[0].scope.diaryId !== draft.scope.diaryId) {
    throw new Error('EDB_AUDIT_DIARY_SCOPE_MISMATCH');
  }
  const previousEventHashSha256 =
    chain.length === 0 ? null : chain[chain.length - 1].eventHashSha256;
  const event = await createEdbAuditEvent({ ...draft, previousEventHashSha256 });
  return [...chain, event];
}

export async function verifyEdbAuditChain(
  chain: readonly EdbAuditEvent[],
): Promise<EdbAuditChainVerification> {
  const issues: EdbAuditChainVerification['issues'] = [];
  const expectedDiaryId = chain.length > 0 ? chain[0].scope.diaryId : null;

  for (let index = 0; index < chain.length; index += 1) {
    const event = chain[index];
    const expectedPrevious = index === 0 ? null : chain[index - 1].eventHashSha256;

    if (expectedDiaryId !== null && event.scope.diaryId !== expectedDiaryId) {
      issues.push({ index, eventId: event.eventId, code: 'DIARY_SCOPE_MISMATCH' });
    }

    if (index === 0 && event.previousEventHashSha256 !== null) {
      issues.push({ index, eventId: event.eventId, code: 'FIRST_EVENT_PREVIOUS_HASH_NOT_NULL' });
    } else if (index > 0 && event.previousEventHashSha256 !== expectedPrevious) {
      issues.push({ index, eventId: event.eventId, code: 'PREVIOUS_HASH_MISMATCH' });
    }

    const { eventHashSha256: _storedHash, ...draft } = event;
    const expectedHash = await hashEdbAuditEventDraft(draft);
    if (event.eventHashSha256 !== expectedHash) {
      issues.push({ index, eventId: event.eventId, code: 'EVENT_HASH_MISMATCH' });
    }
  }

  return { valid: issues.length === 0, issues };
}

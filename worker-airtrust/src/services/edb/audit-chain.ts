import { canonicalJson, sha256Hex } from './canonical-json';

export interface EdbAuditActor {
  actorRef: string;
  displayName: string;
}

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
  | 'RECORD_SUPERSEDED'
  | 'RECORD_CANCELLED';

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
  actor: EdbAuditActor | null;
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
      | 'DIARY_SCOPE_MISMATCH'
      | 'EVENT_TIME_REGRESSION';
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
  'RECORD_SUPERSEDED',
  'RECORD_CANCELLED',
]);

function required(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} is required`);
  return normalized;
}

function optionalId(value: string | null, field: string): string | null {
  if (value === null) return null;
  return required(value, field);
}

function timestamp(value: string, field: string): string {
  const normalized = required(value, field);
  if (!Number.isFinite(Date.parse(normalized))) {
    throw new Error(`${field} must be a valid timestamp`);
  }
  return normalized;
}

function normalizeScope(scope: EdbAuditScope, eventType: EdbAuditEventType): EdbAuditScope {
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
    technicalSituationId: optionalId(scope.technicalSituationId, 'scope.technicalSituationId'),
    revisionId: optionalId(scope.revisionId, 'scope.revisionId'),
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

function normalizeActor(actor: EdbAuditActor | null): EdbAuditActor | null {
  if (actor === null) return null;
  return {
    actorRef: required(actor.actorRef, 'actor.actorRef'),
    displayName: required(actor.displayName, 'actor.displayName'),
  };
}

function normalizeDraft(draft: EdbAuditEventDraft): EdbAuditEventDraft {
  if (
    draft.previousEventHashSha256 !== null &&
    !/^[a-f0-9]{64}$/.test(draft.previousEventHashSha256)
  ) {
    throw new Error('previousEventHashSha256 must be null or a lowercase SHA-256 hex digest');
  }

  return {
    ...draft,
    eventId: required(draft.eventId, 'eventId'),
    scope: normalizeScope(draft.scope, draft.type),
    actor: normalizeActor(draft.actor),
    occurredAt: timestamp(draft.occurredAt, 'occurredAt'),
  };
}

export async function hashEdbAuditEventDraft(draft: EdbAuditEventDraft): Promise<string> {
  return sha256Hex(canonicalJson(normalizeDraft(draft)));
}

export async function createEdbAuditEvent(draft: EdbAuditEventDraft): Promise<EdbAuditEvent> {
  const normalized = normalizeDraft(draft);
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

  const previous = chain.at(-1) ?? null;
  if (previous && Date.parse(draft.occurredAt) < Date.parse(previous.occurredAt)) {
    throw new Error('EDB_AUDIT_EVENT_TIME_REGRESSION');
  }

  const event = await createEdbAuditEvent({
    ...draft,
    previousEventHashSha256: previous?.eventHashSha256 ?? null,
  });

  return [...chain, event];
}

export async function verifyEdbAuditChain(
  chain: readonly EdbAuditEvent[],
): Promise<EdbAuditChainVerification> {
  const issues: EdbAuditChainVerification['issues'] = [];
  const expectedDiaryId = chain[0]?.scope.diaryId ?? null;

  for (let index = 0; index < chain.length; index += 1) {
    const event = chain[index];
    const previous = index === 0 ? null : chain[index - 1];
    const expectedPreviousHash = previous?.eventHashSha256 ?? null;

    if (expectedDiaryId !== null && event.scope.diaryId !== expectedDiaryId) {
      issues.push({ index, eventId: event.eventId, code: 'DIARY_SCOPE_MISMATCH' });
    }

    if (index === 0 && event.previousEventHashSha256 !== null) {
      issues.push({
        index,
        eventId: event.eventId,
        code: 'FIRST_EVENT_PREVIOUS_HASH_NOT_NULL',
      });
    } else if (index > 0 && event.previousEventHashSha256 !== expectedPreviousHash) {
      issues.push({ index, eventId: event.eventId, code: 'PREVIOUS_HASH_MISMATCH' });
    }

    if (previous && Date.parse(event.occurredAt) < Date.parse(previous.occurredAt)) {
      issues.push({ index, eventId: event.eventId, code: 'EVENT_TIME_REGRESSION' });
    }

    const { eventHashSha256: _storedHash, ...draft } = event;
    const expectedHash = await hashEdbAuditEventDraft(draft);
    if (event.eventHashSha256 !== expectedHash) {
      issues.push({ index, eventId: event.eventId, code: 'EVENT_HASH_MISMATCH' });
    }
  }

  return { valid: issues.length === 0, issues };
}

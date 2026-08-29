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

export interface EdbAuditEventDraft {
  eventId: string;
  recordId: string;
  revision: number;
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
    code: 'FIRST_EVENT_PREVIOUS_HASH_NOT_NULL' | 'PREVIOUS_HASH_MISMATCH' | 'EVENT_HASH_MISMATCH';
  }>;
}

function normalizedDraft(draft: EdbAuditEventDraft): EdbAuditEventDraft {
  const eventId = draft.eventId.trim();
  const recordId = draft.recordId.trim();
  if (!eventId) throw new Error('eventId is required');
  if (!recordId) throw new Error('recordId is required');
  if (!Number.isInteger(draft.revision) || draft.revision < 1) throw new Error('revision must be a positive integer');
  if (!Number.isFinite(Date.parse(draft.occurredAt))) throw new Error('occurredAt must be a valid timestamp');
  if (draft.previousEventHashSha256 !== null && !/^[a-f0-9]{64}$/.test(draft.previousEventHashSha256)) {
    throw new Error('previousEventHashSha256 must be null or a lowercase SHA-256 hex digest');
  }
  if (draft.actor && !draft.actor.fullName.trim()) throw new Error('actor.fullName is required when actor is present');

  return {
    ...draft,
    eventId,
    recordId,
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
  const previousEventHashSha256 = chain.length === 0 ? null : chain[chain.length - 1].eventHashSha256;
  const event = await createEdbAuditEvent({ ...draft, previousEventHashSha256 });
  return [...chain, event];
}

export async function verifyEdbAuditChain(
  chain: readonly EdbAuditEvent[],
): Promise<EdbAuditChainVerification> {
  const issues: EdbAuditChainVerification['issues'] = [];

  for (let index = 0; index < chain.length; index += 1) {
    const event = chain[index];
    const expectedPrevious = index === 0 ? null : chain[index - 1].eventHashSha256;

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

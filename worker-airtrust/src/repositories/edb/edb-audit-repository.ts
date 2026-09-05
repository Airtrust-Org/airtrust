import { canonicalJson } from '../../services/edb/canonical-json';
import {
  createEdbAuditEvent,
  verifyEdbAuditChain,
  type EdbAuditActor,
  type EdbAuditEvent,
  type EdbAuditEventDraft,
  type EdbAuditEventType,
} from '../../services/edb/audit-chain';

export interface EdbStoredAuditEventRow {
  id: string;
  empresa_id: number;
  diario_id: number;
  sequence_no: number;
  source_flight_id: number | null;
  technical_situation_id: string | null;
  revision_id: string | null;
  event_type: EdbAuditEventType;
  actor_json: string | null;
  occurred_at: string;
  payload_json: string;
  previous_event_hash_sha256: string | null;
  event_hash_sha256: string;
}

function required(value: string, code: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(code);
  return normalized;
}

function parseActor(value: string | null): EdbAuditActor | null {
  if (value === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('EDB_AUDIT_ACTOR_INVALID_JSON');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('EDB_AUDIT_ACTOR_INVALID');
  }
  const actor = parsed as Record<string, unknown>;
  if (typeof actor.actorRef !== 'string' || typeof actor.displayName !== 'string') {
    throw new Error('EDB_AUDIT_ACTOR_INVALID');
  }
  return {
    actorRef: required(actor.actorRef, 'EDB_AUDIT_ACTOR_INVALID'),
    displayName: required(actor.displayName, 'EDB_AUDIT_ACTOR_INVALID'),
  };
}

function parsePayload(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error('EDB_AUDIT_PAYLOAD_INVALID_JSON');
  }
}

export function hydrateEdbAuditEventRow(row: EdbStoredAuditEventRow): EdbAuditEvent {
  if (!Number.isInteger(row.diario_id) || row.diario_id < 1) {
    throw new Error('EDB_AUDIT_DIARY_ID_INVALID');
  }
  if (!Number.isInteger(row.sequence_no) || row.sequence_no < 1) {
    throw new Error('EDB_AUDIT_SEQUENCE_INVALID');
  }

  return {
    eventId: required(row.id, 'EDB_AUDIT_EVENT_ID_INVALID'),
    scope: {
      diaryId: row.diario_id,
      sourceFlightId: row.source_flight_id,
      technicalSituationId: row.technical_situation_id,
      revisionId: row.revision_id,
    },
    type: row.event_type,
    actor: parseActor(row.actor_json),
    occurredAt: row.occurred_at,
    payload: parsePayload(row.payload_json),
    previousEventHashSha256: row.previous_event_hash_sha256,
    eventHashSha256: row.event_hash_sha256,
  };
}

export async function appendPersistedEdbAuditEvent(params: {
  db: D1Database;
  empresaId: number;
  draft: Omit<EdbAuditEventDraft, 'previousEventHashSha256'>;
}): Promise<EdbAuditEvent> {
  if (!Number.isInteger(params.empresaId) || params.empresaId < 1) {
    throw new Error('EDB_AUDIT_TENANT_INVALID');
  }

  const previous = await params.db.prepare(
    `SELECT sequence_no, event_hash_sha256, occurred_at
       FROM edb_audit_events
      WHERE empresa_id = ? AND diario_id = ?
      ORDER BY sequence_no DESC
      LIMIT 1`,
  ).bind(params.empresaId, params.draft.scope.diaryId).first<{
    sequence_no: number;
    event_hash_sha256: string;
    occurred_at: string;
  }>();

  if (previous && Date.parse(params.draft.occurredAt) < Date.parse(previous.occurred_at)) {
    throw new Error('EDB_AUDIT_EVENT_TIME_REGRESSION');
  }

  const event = await createEdbAuditEvent({
    ...params.draft,
    previousEventHashSha256: previous?.event_hash_sha256 ?? null,
  });
  const sequence = (previous?.sequence_no ?? 0) + 1;

  const result = await params.db.prepare(
    `INSERT INTO edb_audit_events (
       id, empresa_id, diario_id, sequence_no,
       source_flight_id, technical_situation_id, revision_id,
       event_type, actor_json, occurred_at, payload_json,
       previous_event_hash_sha256, event_hash_sha256
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    event.eventId,
    params.empresaId,
    event.scope.diaryId,
    sequence,
    event.scope.sourceFlightId,
    event.scope.technicalSituationId,
    event.scope.revisionId,
    event.type,
    event.actor === null ? null : canonicalJson(event.actor),
    event.occurredAt,
    canonicalJson(event.payload),
    event.previousEventHashSha256,
    event.eventHashSha256,
  ).run();

  if ((result.meta.changes ?? 0) !== 1) {
    throw new Error('EDB_AUDIT_APPEND_CONFLICT');
  }

  return event;
}

export async function loadAndVerifyPersistedEdbAuditChain(params: {
  db: D1Database;
  empresaId: number;
  diaryId: number;
}): Promise<EdbAuditEvent[]> {
  const result = await params.db.prepare(
    `SELECT id, empresa_id, diario_id, sequence_no,
            source_flight_id, technical_situation_id, revision_id,
            event_type, actor_json, occurred_at, payload_json,
            previous_event_hash_sha256, event_hash_sha256
       FROM edb_audit_events
      WHERE empresa_id = ? AND diario_id = ?
      ORDER BY sequence_no ASC`,
  ).bind(params.empresaId, params.diaryId).all<EdbStoredAuditEventRow>();

  const rows = result.results ?? [];
  const events = rows.map(hydrateEdbAuditEventRow);
  const verification = await verifyEdbAuditChain(events);
  if (!verification.valid) {
    const codes = verification.issues.map((issue) => issue.code).join(',');
    throw new Error(`EDB_AUDIT_PERSISTED_CHAIN_INVALID:${codes}`);
  }
  return events;
}

import { canonicalJson } from '../../services/edb/canonicalization';
import {
  createEdbAuditEvent,
  verifyEdbAuditChain,
  type EdbAuditChainVerification,
  type EdbAuditEvent,
  type EdbAuditEventDraft,
  type EdbAuditEventType,
} from '../../services/edb/audit-chain';
import type { EdbPersonIdentity } from '../../services/edb/contracts';

const AUDIT_EVENT_TYPES: ReadonlySet<string> = new Set<EdbAuditEventType>([
  'RECORD_CREATED',
  'SOURCE_SNAPSHOT_CAPTURED',
  'REGULATORY_DATA_UPDATED',
  'PIC_TECHNICAL_ACK_SIGNED',
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

interface LatestAuditHashRow {
  event_hash_sha256: string;
}

export interface EdbAuditEventRow {
  id: string;
  empresa_id: number;
  diario_id: number;
  voo_id: number | null;
  situacao_tecnica_id: string | null;
  revision_id: string | null;
  event_type: string;
  actor_user_id: number | null;
  actor_funcionario_id: number | null;
  actor_json: string | null;
  payload_json: string;
  previous_event_hash_sha256: string | null;
  event_hash_sha256: string;
  occurred_at: string;
}

function requirePositiveInteger(value: number, code: string): number {
  if (!Number.isInteger(value) || value < 1) throw new Error(code);
  return value;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJson(value: string, code: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(code);
  }
}

function parseActor(value: string | null): EdbPersonIdentity | null {
  if (value === null) return null;
  const parsed = parseJson(value, 'EDB_AUDIT_ACTOR_JSON_INVALID');
  if (!isObject(parsed)) throw new Error('EDB_AUDIT_ACTOR_JSON_INVALID');
  const employeeId = parsed.employeeId;
  const fullName = parsed.fullName;
  const anacCode = parsed.anacCode;
  if (
    !(employeeId === null || (typeof employeeId === 'number' && Number.isInteger(employeeId))) ||
    typeof fullName !== 'string' ||
    !(anacCode === null || typeof anacCode === 'string')
  ) {
    throw new Error('EDB_AUDIT_ACTOR_JSON_INVALID');
  }
  return { employeeId, fullName, anacCode };
}

function parseEventType(value: string): EdbAuditEventType {
  if (!AUDIT_EVENT_TYPES.has(value)) throw new Error('EDB_AUDIT_EVENT_TYPE_INVALID');
  return value as EdbAuditEventType;
}

function assertHash(value: string | null, code: string, nullable: boolean): void {
  if (value === null) {
    if (!nullable) throw new Error(code);
    return;
  }
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error(code);
}

export async function appendPersistedEdbAuditEvent(params: {
  db: D1Database;
  empresaId: number;
  draft: Omit<EdbAuditEventDraft, 'previousEventHashSha256'>;
  actorUserId?: number | null;
}): Promise<EdbAuditEvent> {
  requirePositiveInteger(params.empresaId, 'EDB_AUDIT_EMPRESA_ID_INVALID');
  requirePositiveInteger(params.draft.scope.diaryId, 'EDB_AUDIT_DIARY_ID_INVALID');
  if (params.actorUserId !== undefined && params.actorUserId !== null) {
    requirePositiveInteger(params.actorUserId, 'EDB_AUDIT_ACTOR_USER_ID_INVALID');
  }

  const latest = await params.db
    .prepare(
      `
      SELECT event_hash_sha256
      FROM edb_auditoria_eventos
      WHERE empresa_id = ? AND diario_id = ?
      ORDER BY rowid DESC
      LIMIT 1
    `,
    )
    .bind(params.empresaId, params.draft.scope.diaryId)
    .first<LatestAuditHashRow>();

  const previousEventHashSha256 = latest?.event_hash_sha256 ?? null;
  assertHash(previousEventHashSha256, 'EDB_AUDIT_PREVIOUS_HASH_INVALID', true);
  const event = await createEdbAuditEvent({
    ...params.draft,
    previousEventHashSha256,
  });

  await params.db
    .prepare(
      `
      INSERT INTO edb_auditoria_eventos (
        id, empresa_id, diario_id, voo_id, situacao_tecnica_id, revision_id,
        event_type, actor_user_id, actor_funcionario_id, actor_json,
        payload_json, previous_event_hash_sha256, event_hash_sha256,
        occurred_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `,
    )
    .bind(
      event.eventId,
      params.empresaId,
      event.scope.diaryId,
      event.scope.sourceFlightId,
      event.scope.technicalSituationId,
      event.scope.revisionId,
      event.type,
      params.actorUserId ?? null,
      event.actor?.employeeId ?? null,
      event.actor === null ? null : canonicalJson(event.actor),
      canonicalJson(event.payload),
      event.previousEventHashSha256,
      event.eventHashSha256,
      event.occurredAt,
    )
    .run();

  return event;
}

export function hydrateEdbAuditEventRow(row: EdbAuditEventRow): EdbAuditEvent {
  requirePositiveInteger(row.empresa_id, 'EDB_AUDIT_EMPRESA_ID_INVALID');
  requirePositiveInteger(row.diario_id, 'EDB_AUDIT_DIARY_ID_INVALID');
  if (row.voo_id !== null) requirePositiveInteger(row.voo_id, 'EDB_AUDIT_FLIGHT_ID_INVALID');
  if (!row.id.trim()) throw new Error('EDB_AUDIT_EVENT_ID_REQUIRED');
  if (!Number.isFinite(Date.parse(row.occurred_at))) throw new Error('EDB_AUDIT_TIMESTAMP_INVALID');
  assertHash(row.previous_event_hash_sha256, 'EDB_AUDIT_PREVIOUS_HASH_INVALID', true);
  assertHash(row.event_hash_sha256, 'EDB_AUDIT_EVENT_HASH_INVALID', false);

  const actor = parseActor(row.actor_json);
  if ((actor?.employeeId ?? null) !== row.actor_funcionario_id) {
    throw new Error('EDB_AUDIT_ACTOR_EMPLOYEE_ID_MISMATCH');
  }

  return {
    eventId: row.id,
    scope: {
      diaryId: row.diario_id,
      sourceFlightId: row.voo_id,
      technicalSituationId: row.situacao_tecnica_id,
      revisionId: row.revision_id,
    },
    type: parseEventType(row.event_type),
    actor,
    occurredAt: row.occurred_at,
    payload: parseJson(row.payload_json, 'EDB_AUDIT_PAYLOAD_JSON_INVALID'),
    previousEventHashSha256: row.previous_event_hash_sha256,
    eventHashSha256: row.event_hash_sha256,
  };
}

export async function loadEdbAuditChain(params: {
  db: D1Database;
  empresaId: number;
  diaryId: number;
}): Promise<EdbAuditEvent[]> {
  requirePositiveInteger(params.empresaId, 'EDB_AUDIT_EMPRESA_ID_INVALID');
  requirePositiveInteger(params.diaryId, 'EDB_AUDIT_DIARY_ID_INVALID');

  const result = await params.db
    .prepare(
      `
      SELECT id, empresa_id, diario_id, voo_id, situacao_tecnica_id,
             revision_id, event_type, actor_user_id, actor_funcionario_id,
             actor_json, payload_json, previous_event_hash_sha256,
             event_hash_sha256, occurred_at
      FROM edb_auditoria_eventos
      WHERE empresa_id = ? AND diario_id = ?
      ORDER BY rowid ASC
    `,
    )
    .bind(params.empresaId, params.diaryId)
    .all<EdbAuditEventRow>();

  return (result.results ?? []).map(hydrateEdbAuditEventRow);
}

export async function loadAndVerifyEdbAuditChain(params: {
  db: D1Database;
  empresaId: number;
  diaryId: number;
}): Promise<{ events: EdbAuditEvent[]; verification: EdbAuditChainVerification }> {
  const events = await loadEdbAuditChain(params);
  const verification = await verifyEdbAuditChain(events);
  return { events, verification };
}

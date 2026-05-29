import {
  FRMS_READ_ACK_ACK_KIND,
  FRMS_READ_ACK_EVENT_KIND,
  type FrmsReadAckEvent,
  type FrmsReadAckEventSeverity,
  type FrmsReadAckEventStatus,
  type FrmsReadAckEventType,
} from './read-ack-events';

export interface LegacyFrmsFadigaEventoRow {
  id: string;
  empresa_id: number;
  tipo: string;
  created_at: string;
  payload_json: string | null;
}

export interface FrmsReadAckBackfillFilters {
  empresaId: number;
  dataInicio: string;
  dataFim: string;
}

export interface DedicatedReadAckEventBackfillRow {
  id: string;
  empresa_id: number;
  data_operacional: string;
  funcionario_id: number;
  event_type: FrmsReadAckEventType;
  severity: FrmsReadAckEventSeverity;
  source: 'OPERATIONAL_SNAPSHOT';
  lifecycle_status: FrmsReadAckEventStatus;
  snapshot_status: string;
  snapshot_alertas_json: string;
  data_sources_json: string;
  limitations_json: string;
  snapshot_payload_json: string;
  event_hash: string;
  created_at: string;
  created_by: number | null;
  acknowledged_at: string | null;
  acknowledged_by: number | null;
  ack_note: string | null;
  schema_version: 1;
}

export interface DedicatedReadAckAuditBackfillRow {
  id: string;
  empresa_id: number;
  event_id: string;
  action: 'ACK';
  actor_user_id: number | null;
  action_at: string;
  note: string | null;
  payload_before_json: string | null;
  payload_after_json: string | null;
  schema_version: 1;
}

export interface FrmsReadAckBackfillInvalidPayload {
  id: string;
  tipo: string;
  reason: string;
}

export interface FrmsReadAckBackfillPlan {
  legacy_events_found: number;
  legacy_acks_found: number;
  dedicated_events_existing: number;
  audit_existing: number;
  events_to_insert: DedicatedReadAckEventBackfillRow[];
  audits_to_insert: DedicatedReadAckAuditBackfillRow[];
  invalid_payloads: FrmsReadAckBackfillInvalidPayload[];
  skipped: Array<{ id: string; tipo: string; reason: string }>;
}

const EVENT_TYPES = new Set<FrmsReadAckEventType>([
  'CHECKIN_PENDENTE',
  'CHECKIN_CRITICO',
  'DADO_ESTIMADO',
  'DADO_INCONSISTENTE',
  'JORNADA_SEM_FATORIZACAO',
  'EFETIVIDADE_BAIXA',
  'QUINZENA_INCOMPLETA',
  'OUTRO_CONTEXTUAL',
]);

const SEVERITIES = new Set<FrmsReadAckEventSeverity>(['INFO', 'ATENCAO', 'CRITICO', 'INCOMPLETO']);
const STATUSES = new Set<FrmsReadAckEventStatus>(['PENDING', 'ACKED']);

function parseJsonPayload(row: LegacyFrmsFadigaEventoRow): Record<string, unknown> | null {
  if (!row.payload_json) return null;
  try {
    const parsed = JSON.parse(row.payload_json);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function asNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}

function isEventType(value: unknown): value is FrmsReadAckEventType {
  return typeof value === 'string' && EVENT_TYPES.has(value as FrmsReadAckEventType);
}

function isSeverity(value: unknown): value is FrmsReadAckEventSeverity {
  return typeof value === 'string' && SEVERITIES.has(value as FrmsReadAckEventSeverity);
}

function isStatus(value: unknown): value is FrmsReadAckEventStatus {
  return typeof value === 'string' && STATUSES.has(value as FrmsReadAckEventStatus);
}

function deterministicAuditId(legacyAckRowId: string): string {
  return `frms_read_ack_backfill_ack_${legacyAckRowId.replace(/[^A-Za-z0-9_-]/g, '_')}`;
}

export function mapLegacyReadAckEventToDedicated(
  row: LegacyFrmsFadigaEventoRow,
): DedicatedReadAckEventBackfillRow | FrmsReadAckBackfillInvalidPayload {
  if (row.tipo !== FRMS_READ_ACK_EVENT_KIND) {
    return { id: row.id, tipo: row.tipo, reason: 'tipo_nao_suportado' };
  }

  const payload = parseJsonPayload(row);
  if (!payload) return { id: row.id, tipo: row.tipo, reason: 'payload_json_invalido' };

  const dataOperacional = asString(payload.data_operacional);
  const funcionarioId = asNumber(payload.funcionario_id);
  const empresaId = asNumber(payload.empresa_id) ?? row.empresa_id;
  const eventType = payload.event_type;
  const severity = payload.severity;

  if (!dataOperacional) return { id: row.id, tipo: row.tipo, reason: 'data_operacional_ausente' };
  if (!funcionarioId) return { id: row.id, tipo: row.tipo, reason: 'funcionario_id_ausente' };
  if (!isEventType(eventType)) return { id: row.id, tipo: row.tipo, reason: 'event_type_invalido' };
  if (!isSeverity(severity)) return { id: row.id, tipo: row.tipo, reason: 'severity_invalida' };

  const lifecycleStatus = isStatus(payload.status) ? payload.status : 'PENDING';
  const acknowledgedBy = asNumber(payload.acknowledged_by);
  const acknowledgedAt = asString(payload.acknowledged_at);
  const ackNote = asString(payload.ack_note);

  return {
    id: row.id,
    empresa_id: empresaId,
    data_operacional: dataOperacional,
    funcionario_id: funcionarioId,
    event_type: eventType,
    severity,
    source: 'OPERATIONAL_SNAPSHOT',
    lifecycle_status: lifecycleStatus,
    snapshot_status: asString(payload.snapshot_status) ?? 'INCOMPLETO',
    snapshot_alertas_json: JSON.stringify(asStringArray(payload.snapshot_alertas)),
    data_sources_json: JSON.stringify({
      checkin_status: asString(payload.checkin_status) ?? 'AUSENTE',
      sleep_data_source: asString(payload.sleep_data_source) ?? 'AUSENTE',
      wake_data_source: asString(payload.wake_data_source) ?? 'AUSENTE',
      jornada_data_source: asString(payload.jornada_data_source) ?? 'AUSENTE',
      fortnight_status: asString(payload.fortnight_status),
    }),
    limitations_json: JSON.stringify(asStringArray(payload.limitations)),
    snapshot_payload_json: row.payload_json ?? JSON.stringify(payload),
    event_hash: row.id,
    created_at: asString(payload.created_at) ?? row.created_at,
    created_by: null,
    acknowledged_at: acknowledgedAt,
    acknowledged_by: acknowledgedBy,
    ack_note: ackNote,
    schema_version: 1,
  };
}

export function mapLegacyReadAckAckToAudit(
  row: LegacyFrmsFadigaEventoRow,
  legacyEventPayloadById: Map<string, string>,
): DedicatedReadAckAuditBackfillRow | FrmsReadAckBackfillInvalidPayload {
  if (row.tipo !== FRMS_READ_ACK_ACK_KIND) {
    return { id: row.id, tipo: row.tipo, reason: 'tipo_nao_suportado' };
  }

  const payload = parseJsonPayload(row);
  if (!payload) return { id: row.id, tipo: row.tipo, reason: 'payload_json_invalido' };

  const eventId = asString(payload.event_id);
  if (!eventId) return { id: row.id, tipo: row.tipo, reason: 'event_id_ausente' };
  if (!legacyEventPayloadById.has(eventId)) {
    return { id: row.id, tipo: row.tipo, reason: 'evento_referenciado_nao_encontrado' };
  }

  return {
    id: deterministicAuditId(row.id),
    empresa_id: row.empresa_id,
    event_id: eventId,
    action: 'ACK',
    actor_user_id: asNumber(payload.acknowledged_by),
    action_at: asString(payload.acknowledged_at) ?? row.created_at,
    note: asString(payload.ack_note),
    payload_before_json: null,
    payload_after_json: legacyEventPayloadById.get(eventId) ?? row.payload_json,
    schema_version: 1,
  };
}

export function buildFrmsReadAckBackfillPlan(params: {
  legacyRows: LegacyFrmsFadigaEventoRow[];
  existingDedicatedEventIds: Set<string>;
  existingAuditEventIds: Set<string>;
}): FrmsReadAckBackfillPlan {
  const legacyEventRows = params.legacyRows.filter((row) => row.tipo === FRMS_READ_ACK_EVENT_KIND);
  const legacyAckRows = params.legacyRows.filter((row) => row.tipo === FRMS_READ_ACK_ACK_KIND);
  const invalid_payloads: FrmsReadAckBackfillInvalidPayload[] = [];
  const skipped: FrmsReadAckBackfillPlan['skipped'] = [];
  const events_to_insert: DedicatedReadAckEventBackfillRow[] = [];
  const audits_to_insert: DedicatedReadAckAuditBackfillRow[] = [];
  const legacyEventPayloadById = new Map<string, string>();

  for (const row of legacyEventRows) {
    if (row.payload_json) legacyEventPayloadById.set(row.id, row.payload_json);
    const mapped = mapLegacyReadAckEventToDedicated(row);
    if ('reason' in mapped) {
      invalid_payloads.push(mapped);
      continue;
    }
    if (params.existingDedicatedEventIds.has(mapped.id)) {
      skipped.push({ id: mapped.id, tipo: row.tipo, reason: 'dedicated_event_exists' });
      continue;
    }
    events_to_insert.push(mapped);
  }

  for (const row of legacyAckRows) {
    const mapped = mapLegacyReadAckAckToAudit(row, legacyEventPayloadById);
    if ('reason' in mapped) {
      invalid_payloads.push(mapped);
      continue;
    }
    if (params.existingAuditEventIds.has(mapped.event_id)) {
      skipped.push({ id: mapped.id, tipo: row.tipo, reason: 'audit_ack_exists' });
      continue;
    }
    audits_to_insert.push(mapped);
  }

  const unexpectedRows = params.legacyRows.filter(
    (row) => row.tipo !== FRMS_READ_ACK_EVENT_KIND && row.tipo !== FRMS_READ_ACK_ACK_KIND,
  );
  for (const row of unexpectedRows) {
    skipped.push({ id: row.id, tipo: row.tipo, reason: 'tipo_nao_suportado' });
  }

  return {
    legacy_events_found: legacyEventRows.length,
    legacy_acks_found: legacyAckRows.length,
    dedicated_events_existing: params.existingDedicatedEventIds.size,
    audit_existing: params.existingAuditEventIds.size,
    events_to_insert,
    audits_to_insert,
    invalid_payloads,
    skipped,
  };
}

import { Hono } from 'hono';
import { z } from 'zod';
import type { Context } from 'hono';
import type { Env, Variables } from '../types';
import { auth } from '../middleware/auth';
import { getEmpresaId } from '../middleware/tenant';
import {
  listFrmsOperationalSnapshot,
  type FrmsOperationalSnapshotFilters,
} from '../lib/frms/operational-snapshot';
import {
  buildFrmsReadAckEventsFromSnapshot,
  buildFrmsReadAckEventHash,
  FRMS_READ_ACK_EVENT_KIND,
  FRMS_READ_ACK_QUERY_STATUSES,
  lifecycleStatusOfReadAckEvent,
  parseFrmsReadAckEventPayload,
  sanitizeAckNote,
  type FrmsReadAckEvent,
  type FrmsReadAckEventSeverity,
  type FrmsReadAckEventType,
  type FrmsReadAckLifecycleStatus,
  type FrmsReadAckQueryStatus,
  type FrmsReadAckEventStatus,
  type FrmsReadAckStorageSource,
} from '../lib/frms/read-ack-events';

type FrmsReadAckContext = Context<{ Bindings: Env; Variables: Partial<Variables> }>;

const router = new Hono<{ Bindings: Env; Variables: Partial<Variables> }>();
router.use('*', auth());

const querySchema = z
  .object({
    data_inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    data_fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    funcionario_id: z
      .string()
      .optional()
      .transform((value) => {
        if (!value) return undefined;
        const parsed = Number(value);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
      }),
    status: z
      .string()
      .optional()
      .transform((value) => {
        if (!value) return 'ALL';
        const normalized = value.trim().toUpperCase();
        return FRMS_READ_ACK_QUERY_STATUSES.includes(normalized as FrmsReadAckQueryStatus)
          ? (normalized as FrmsReadAckQueryStatus)
          : 'ALL';
      }),
    event_type: z
      .string()
      .optional()
      .transform((value) => value?.trim().toUpperCase() || undefined),
    severity: z
      .string()
      .optional()
      .transform((value) => value?.trim().toUpperCase() || undefined),
  })
  .refine((data) => data.data_fim >= data.data_inicio, {
    message: 'data_fim deve ser >= data_inicio',
    path: ['data_fim'],
  });

const generateSchema = z
  .object({
    data_inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    data_fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    funcionario_id: z.number().int().positive().optional(),
    base: z.string().trim().optional(),
    aeronave: z.string().trim().optional(),
    status: z.string().trim().optional(),
    include_inconsistencies: z.boolean().optional(),
  })
  .refine((data) => data.data_fim >= data.data_inicio, {
    message: 'data_fim deve ser >= data_inicio',
    path: ['data_fim'],
  });

const ackSchema = z.object({
  ack_note: z.string().max(280).optional().nullable(),
});

function normalizeRole(value: unknown): string {
  return String(value || '')
    .trim()
    .toUpperCase();
}

function canSeeTeam(c: FrmsReadAckContext): boolean {
  const role = normalizeRole(c.get('userRole'));
  return ['ADMIN', 'MANAGER', 'GESTOR', 'COORDENACAO', 'COORDENADOR', 'COORDINATOR'].includes(
    role,
  );
}

async function resolveOwnFuncionarioId(
  c: FrmsReadAckContext,
  empresaId: number,
): Promise<number | null> {
  const fromContext = Number(c.get('funcionarioId') || 0);
  if (fromContext > 0) {
    const row = await c.env.DB.prepare(
      `SELECT id
         FROM funcionarios
        WHERE id = ?
          AND empresa_id = ?
          AND deleted_at IS NULL
          AND COALESCE(ativo, 1) = 1
        LIMIT 1`,
    )
      .bind(fromContext, empresaId)
      .first<{ id: number }>();
    if (row?.id) return row.id;
  }

  const userId = Number(c.get('userId') || 0);
  if (userId <= 0) return null;

  const byUsuario = await c.env.DB.prepare(
    `SELECT f.id
       FROM usuarios u
       JOIN funcionarios f ON f.id = u.funcionario_id
      WHERE u.id = ?
        AND (u.deleted_at IS NULL OR u.deleted_at = 0)
        AND f.empresa_id = ?
        AND f.deleted_at IS NULL
        AND COALESCE(f.ativo, 1) = 1
      LIMIT 1`,
  )
    .bind(userId, empresaId)
    .first<{ id: number }>();
  if (byUsuario?.id) return byUsuario.id;

  const byFuncionario = await c.env.DB.prepare(
    `SELECT id
       FROM funcionarios
      WHERE id = ?
        AND empresa_id = ?
        AND deleted_at IS NULL
        AND COALESCE(ativo, 1) = 1
      LIMIT 1`,
  )
    .bind(userId, empresaId)
    .first<{ id: number }>();
  return byFuncionario?.id ?? null;
}

async function enforceFuncionarioScope(
  c: FrmsReadAckContext,
  empresaId: number,
  requestedFuncionarioId?: number,
): Promise<number | undefined | Response> {
  if (canSeeTeam(c)) return requestedFuncionarioId;

  const ownFuncionarioId = await resolveOwnFuncionarioId(c, empresaId);
  if (!ownFuncionarioId) {
    return c.json(
      { success: false, error: 'Funcionario nao encontrado para o usuario atual' },
      404,
    );
  }

  return ownFuncionarioId;
}

function userDisplayName(c: FrmsReadAckContext): string {
  return String(c.get('userEmail') || `Usuario ${c.get('userId') || '0'}`);
}

interface DedicatedReadAckEventRow {
  id: string;
  empresa_id: number;
  data_operacional: string;
  funcionario_id: number;
  event_type: FrmsReadAckEventType;
  severity: FrmsReadAckEventSeverity;
  source: 'OPERATIONAL_SNAPSHOT';
  lifecycle_status: FrmsReadAckEventStatus;
  snapshot_status: FrmsReadAckEvent['snapshot_status'] | null;
  snapshot_alertas_json: string | null;
  data_sources_json: string | null;
  limitations_json: string | null;
  snapshot_payload_json: string | null;
  created_at: string;
  acknowledged_at: string | null;
  acknowledged_by: number | null;
  ack_note: string | null;
}

interface LegacyReadAckEventRow {
  id: string;
  payload_json: string | null;
  created_at: string;
}

function parseJsonObject(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function parseJsonStringArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
  } catch {
    return [];
  }
}

function dedicatedRowToEvent(row: DedicatedReadAckEventRow): FrmsReadAckEvent | null {
  const fromPayload = parseFrmsReadAckEventPayload(
    row.id,
    row.snapshot_payload_json,
    row.created_at,
  );
  if (fromPayload) {
    return {
      ...fromPayload,
      status: row.lifecycle_status,
      acknowledged_at: row.acknowledged_at,
      acknowledged_by: row.acknowledged_by,
      ack_note: row.ack_note,
      storage_source: 'FRMS_READ_ACK_EVENTS',
    };
  }

  const dataSources = parseJsonObject(row.data_sources_json);
  return {
    id: row.id,
    schema_version: 1,
    empresa_id: row.empresa_id,
    data_operacional: row.data_operacional,
    funcionario_id: row.funcionario_id,
    funcionario_nome: null,
    event_type: row.event_type,
    severity: row.severity,
    status: row.lifecycle_status,
    source: row.source,
    snapshot_status: row.snapshot_status || 'INCOMPLETO',
    snapshot_alertas: parseJsonStringArray(row.snapshot_alertas_json) as FrmsReadAckEvent['snapshot_alertas'],
    checkin_status: String(dataSources.checkin_status || 'AUSENTE') as FrmsReadAckEvent['checkin_status'],
    sleep_data_source: String(dataSources.sleep_data_source || 'AUSENTE') as FrmsReadAckEvent['sleep_data_source'],
    wake_data_source: String(dataSources.wake_data_source || 'AUSENTE') as FrmsReadAckEvent['wake_data_source'],
    jornada_data_source: String(dataSources.jornada_data_source || 'AUSENTE') as FrmsReadAckEvent['jornada_data_source'],
    fortnight_status: typeof dataSources.fortnight_status === 'string' ? dataSources.fortnight_status : null,
    created_at: row.created_at,
    stored_created_at: row.created_at,
    acknowledged_at: row.acknowledged_at,
    acknowledged_by: row.acknowledged_by,
    acknowledged_by_name: null,
    ack_note: row.ack_note,
    limitations: parseJsonStringArray(row.limitations_json),
    storage_source: 'FRMS_READ_ACK_EVENTS',
  };
}

function legacyRowToEvent(row: LegacyReadAckEventRow): FrmsReadAckEvent | null {
  const event = parseFrmsReadAckEventPayload(row.id, row.payload_json, row.created_at);
  return event
    ? {
        ...event,
        storage_source: 'LEGACY_FRMS_FADIGA_EVENTO',
      }
    : null;
}

function dataSourcesJson(event: FrmsReadAckEvent): string {
  return JSON.stringify({
    checkin_status: event.checkin_status,
    sleep_data_source: event.sleep_data_source,
    wake_data_source: event.wake_data_source,
    jornada_data_source: event.jornada_data_source,
    fortnight_status: event.fortnight_status,
  });
}

async function listDedicatedEvents(
  db: D1Database,
  params: {
    empresaId: number;
    dataInicio: string;
    dataFim: string;
    funcionarioId?: number;
    status?: FrmsReadAckEventStatus;
    eventType?: FrmsReadAckEventType;
    severity?: FrmsReadAckEventSeverity;
  },
): Promise<FrmsReadAckEvent[]> {
  const conditions = [
    'empresa_id = ?',
    'data_operacional >= ?',
    'data_operacional <= ?',
  ];
  const binds: Array<string | number> = [
    params.empresaId,
    params.dataInicio,
    params.dataFim,
  ];

  if (params.funcionarioId) {
    conditions.push('funcionario_id = ?');
    binds.push(params.funcionarioId);
  }

  if (params.status) {
    conditions.push('lifecycle_status = ?');
    binds.push(params.status);
  }

  if (params.eventType) {
    conditions.push('event_type = ?');
    binds.push(params.eventType);
  }

  if (params.severity) {
    conditions.push('severity = ?');
    binds.push(params.severity);
  }

  const rows = await db
    .prepare(
      `SELECT id, empresa_id, data_operacional, funcionario_id, event_type, severity, source,
              lifecycle_status, snapshot_status, snapshot_alertas_json, data_sources_json,
              limitations_json, snapshot_payload_json, created_at, acknowledged_at,
              acknowledged_by, ack_note
         FROM frms_read_ack_events
        WHERE ${conditions.join(' AND ')}
        ORDER BY data_operacional DESC, created_at DESC
        LIMIT 500`,
    )
    .bind(...binds)
    .all<DedicatedReadAckEventRow>();

  return (rows.results ?? [])
    .map(dedicatedRowToEvent)
    .filter((event): event is FrmsReadAckEvent => event !== null);
}

async function listLegacyEvents(
  db: D1Database,
  params: {
    empresaId: number;
    dataInicio: string;
    dataFim: string;
    funcionarioId?: number;
    status?: FrmsReadAckEventStatus;
    eventType?: FrmsReadAckEventType;
    severity?: FrmsReadAckEventSeverity;
  },
): Promise<FrmsReadAckEvent[]> {
  const conditions = [
    'empresa_id = ?',
    'tipo = ?',
    "json_extract(payload_json, '$.data_operacional') >= ?",
    "json_extract(payload_json, '$.data_operacional') <= ?",
  ];
  const binds: Array<string | number> = [
    params.empresaId,
    FRMS_READ_ACK_EVENT_KIND,
    params.dataInicio,
    params.dataFim,
  ];

  if (params.funcionarioId) {
    conditions.push("CAST(json_extract(payload_json, '$.funcionario_id') AS INTEGER) = ?");
    binds.push(params.funcionarioId);
  }

  if (params.status) {
    conditions.push("json_extract(payload_json, '$.status') = ?");
    binds.push(params.status);
  }

  if (params.eventType) {
    conditions.push("json_extract(payload_json, '$.event_type') = ?");
    binds.push(params.eventType);
  }

  if (params.severity) {
    conditions.push("json_extract(payload_json, '$.severity') = ?");
    binds.push(params.severity);
  }

  const rows = await db
    .prepare(
      `SELECT id, payload_json, created_at
         FROM frms_fadiga_evento
        WHERE ${conditions.join(' AND ')}
        ORDER BY json_extract(payload_json, '$.data_operacional') DESC,
                 created_at DESC
        LIMIT 500`,
    )
    .bind(...binds)
    .all<LegacyReadAckEventRow>();

  return (rows.results ?? [])
    .map(legacyRowToEvent)
    .filter((event): event is FrmsReadAckEvent => event !== null);
}

async function listEvents(
  db: D1Database,
  params: {
    empresaId: number;
    dataInicio: string;
    dataFim: string;
    funcionarioId?: number;
    status?: FrmsReadAckEventStatus;
    eventType?: FrmsReadAckEventType;
    severity?: FrmsReadAckEventSeverity;
  },
): Promise<FrmsReadAckEvent[]> {
  const dedicated = await listDedicatedEvents(db, params);
  const dedicatedIds = new Set(dedicated.map((event) => event.id));
  const legacy = (await listLegacyEvents(db, params)).filter((event) => !dedicatedIds.has(event.id));

  return [...dedicated, ...legacy]
    .sort((left, right) => {
      if (left.data_operacional !== right.data_operacional) {
        return right.data_operacional.localeCompare(left.data_operacional);
      }
      return right.stored_created_at.localeCompare(left.stored_created_at);
    })
    .slice(0, 500);
}

function normalizeEventType(value?: string): FrmsReadAckEventType | undefined {
  if (!value) return undefined;
  const valid: FrmsReadAckEventType[] = [
    'CHECKIN_PENDENTE',
    'CHECKIN_CRITICO',
    'DADO_ESTIMADO',
    'DADO_INCONSISTENTE',
    'JORNADA_SEM_FATORIZACAO',
    'EFETIVIDADE_BAIXA',
    'QUINZENA_INCOMPLETA',
    'OUTRO_CONTEXTUAL',
  ];
  return valid.includes(value as FrmsReadAckEventType) ? (value as FrmsReadAckEventType) : undefined;
}

function normalizeSeverity(value?: string): FrmsReadAckEventSeverity | undefined {
  if (!value) return undefined;
  const valid: FrmsReadAckEventSeverity[] = ['INFO', 'ATENCAO', 'CRITICO', 'INCOMPLETO'];
  return valid.includes(value as FrmsReadAckEventSeverity)
    ? (value as FrmsReadAckEventSeverity)
    : undefined;
}

function withLifecycleStatus(events: FrmsReadAckEvent[]): FrmsReadAckEvent[] {
  const now = new Date();
  return events.map((event) => ({
    ...event,
    lifecycle_status: lifecycleStatusOfReadAckEvent(event, now),
  }));
}

function filterByLifecycleStatus(
  events: FrmsReadAckEvent[],
  status: FrmsReadAckQueryStatus,
): FrmsReadAckEvent[] {
  if (status === 'ALL') return events;
  if (status === 'PENDING') {
    return events.filter((event) => event.lifecycle_status === 'PENDING');
  }
  if (status === 'ACKED') {
    return events.filter((event) => event.lifecycle_status === 'ACKED');
  }
  return events.filter((event) => event.lifecycle_status === 'STALE');
}

function buildSummary(events: FrmsReadAckEvent[], displayedCount: number) {
  const summary = {
    total: events.length,
    displayed: displayedCount,
    pending: 0,
    acked: 0,
    stale: 0,
    by_type: {} as Record<string, number>,
    by_severity: {} as Record<string, number>,
  };

  for (const event of events) {
    const lifecycleStatus = event.lifecycle_status as FrmsReadAckLifecycleStatus | undefined;
    if (lifecycleStatus === 'ACKED') summary.acked += 1;
    else if (lifecycleStatus === 'STALE') summary.stale += 1;
    else summary.pending += 1;

    summary.by_type[event.event_type] = (summary.by_type[event.event_type] || 0) + 1;
    summary.by_severity[event.severity] = (summary.by_severity[event.severity] || 0) + 1;
  }

  return summary;
}

router.get('/read-ack/events', async (c) => {
  const parsed = querySchema.safeParse({
    data_inicio: c.req.query('data_inicio'),
    data_fim: c.req.query('data_fim'),
    funcionario_id: c.req.query('funcionario_id'),
    status: c.req.query('status'),
    event_type: c.req.query('event_type'),
    severity: c.req.query('severity'),
  });
  if (!parsed.success) {
    return c.json({ success: false, error: parsed.error.flatten(), code: 'VALIDATION_ERROR' }, 400);
  }

  const empresaId = getEmpresaId(c as unknown as Context<{ Bindings: Env; Variables: Variables }>);
  const scopedFuncionarioId = await enforceFuncionarioScope(
    c,
    empresaId,
    parsed.data.funcionario_id,
  );
  if (scopedFuncionarioId instanceof Response) return scopedFuncionarioId;

  const eventType = normalizeEventType(parsed.data.event_type);
  const severity = normalizeSeverity(parsed.data.severity);

  const rawStatusForQuery =
    parsed.data.status === 'ACKED' || parsed.data.status === 'PENDING'
      ? (parsed.data.status as FrmsReadAckEventStatus)
      : undefined;

  const events = await listEvents(c.env.DB, {
    empresaId,
    dataInicio: parsed.data.data_inicio,
    dataFim: parsed.data.data_fim,
    funcionarioId: scopedFuncionarioId,
    status: rawStatusForQuery,
    eventType,
    severity,
  });

  const withLifecycle = withLifecycleStatus(events);
  const filtered = filterByLifecycleStatus(withLifecycle, parsed.data.status);
  const summary = buildSummary(withLifecycle, filtered.length);

  return c.json({
    success: true,
    data: filtered,
    summary,
  });
});

router.post('/read-ack/events/generate', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = generateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: parsed.error.flatten(), code: 'VALIDATION_ERROR' }, 400);
  }

  const empresaId = getEmpresaId(c as unknown as Context<{ Bindings: Env; Variables: Variables }>);
  const scopedFuncionarioId = await enforceFuncionarioScope(
    c,
    empresaId,
    parsed.data.funcionario_id,
  );
  if (scopedFuncionarioId instanceof Response) return scopedFuncionarioId;

  const snapshotFilters: FrmsOperationalSnapshotFilters = {
    funcionario_id: scopedFuncionarioId,
    base: parsed.data.base,
    aeronave: parsed.data.aeronave,
    status: parsed.data.status
      ? parsed.data.status
          .split(',')
          .map((status) => status.trim().toUpperCase())
          .filter(Boolean)
      : undefined,
    include_inconsistencies: parsed.data.include_inconsistencies ?? true,
  };

  const snapshot = await listFrmsOperationalSnapshot(c.env.DB, {
    empresaId,
    dataInicio: parsed.data.data_inicio,
    dataFim: parsed.data.data_fim,
    filters: snapshotFilters,
  });

  const generatedAt = new Date().toISOString();
  const events = buildFrmsReadAckEventsFromSnapshot(snapshot.items, generatedAt);
  let inserted = 0;
  const createdBy = Number(c.get('userId') || 0) || null;

  for (const event of events) {
    const result = await c.env.DB.prepare(
      `INSERT OR IGNORE INTO frms_read_ack_events
         (id, empresa_id, data_operacional, funcionario_id, event_type, severity, source,
          lifecycle_status, snapshot_status, snapshot_alertas_json, data_sources_json,
          limitations_json, snapshot_payload_json, event_hash, created_by, created_at, schema_version)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), 1
        WHERE NOT EXISTS (
          SELECT 1
            FROM frms_fadiga_evento
           WHERE id = ?
             AND empresa_id = ?
             AND tipo = ?
        )`,
    )
      .bind(
        event.id,
        empresaId,
        event.data_operacional,
        event.funcionario_id,
        event.event_type,
        event.severity,
        event.source,
        event.status,
        event.snapshot_status,
        JSON.stringify(event.snapshot_alertas),
        dataSourcesJson(event),
        JSON.stringify(event.limitations),
        JSON.stringify(event),
        buildFrmsReadAckEventHash(event),
        createdBy,
        event.id,
        empresaId,
        FRMS_READ_ACK_EVENT_KIND,
      )
      .run();
    inserted += Number(result.meta?.changes ?? 0);
  }

  const storedEvents = await listEvents(c.env.DB, {
    empresaId,
    dataInicio: parsed.data.data_inicio,
    dataFim: parsed.data.data_fim,
    funcionarioId: scopedFuncionarioId,
  });

  return c.json({
    success: true,
    data: storedEvents,
    summary: {
      derived_from_snapshot: events.length,
      inserted,
      existing: events.length - inserted,
      pending: storedEvents.filter((event) => event.status === 'PENDING').length,
      acked: storedEvents.filter((event) => event.status === 'ACKED').length,
    },
  });
});

router.post('/read-ack/events/:id/ack', async (c) => {
  const id = c.req.param('id') ?? '';
  const body = await c.req.json().catch(() => ({}));
  const parsed = ackSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: parsed.error.flatten(), code: 'VALIDATION_ERROR' }, 400);
  }

  const empresaId = getEmpresaId(c as unknown as Context<{ Bindings: Env; Variables: Variables }>);
  let storageSource: FrmsReadAckStorageSource | null = null;
  const dedicatedRow = await c.env.DB.prepare(
    `SELECT id, empresa_id, data_operacional, funcionario_id, event_type, severity, source,
            lifecycle_status, snapshot_status, snapshot_alertas_json, data_sources_json,
            limitations_json, snapshot_payload_json, created_at, acknowledged_at,
            acknowledged_by, ack_note
       FROM frms_read_ack_events
      WHERE id = ?
        AND empresa_id = ?
      LIMIT 1`,
  )
    .bind(id, empresaId)
    .first<DedicatedReadAckEventRow>();

  let event = dedicatedRow ? dedicatedRowToEvent(dedicatedRow) : null;
  if (event) {
    storageSource = 'FRMS_READ_ACK_EVENTS';
  }

  let legacyRow: LegacyReadAckEventRow | null = null;
  if (!event) {
    legacyRow = await c.env.DB.prepare(
      `SELECT id, payload_json, created_at
         FROM frms_fadiga_evento
        WHERE id = ?
          AND empresa_id = ?
          AND tipo = ?
        LIMIT 1`,
    )
      .bind(id, empresaId, FRMS_READ_ACK_EVENT_KIND)
      .first<LegacyReadAckEventRow>();
    event = legacyRow ? legacyRowToEvent(legacyRow) : null;
    if (event) {
      storageSource = 'LEGACY_FRMS_FADIGA_EVENTO';
    }
  }

  if (!event) {
    return c.json({ success: false, error: 'Evento read/ack nao encontrado', code: 'NOT_FOUND' }, 404);
  }

  const scopedFuncionarioId = await enforceFuncionarioScope(c, empresaId, event.funcionario_id);
  if (scopedFuncionarioId instanceof Response) return scopedFuncionarioId;

  if (event.status === 'ACKED') {
    return c.json({ success: true, data: event, idempotent: true });
  }

  const acknowledgedAt = new Date().toISOString();
  const acknowledgedBy = Number(c.get('userId') || 0) || null;
  const ackedEvent: FrmsReadAckEvent = {
    ...event,
    status: 'ACKED',
    lifecycle_status: 'ACKED',
    acknowledged_at: acknowledgedAt,
    acknowledged_by: acknowledgedBy,
    acknowledged_by_name: userDisplayName(c),
    ack_note: sanitizeAckNote(parsed.data.ack_note),
  };

  if (storageSource === 'FRMS_READ_ACK_EVENTS') {
    await c.env.DB.prepare(
      `UPDATE frms_read_ack_events
          SET lifecycle_status = 'ACKED',
              acknowledged_at = ?,
              acknowledged_by = ?,
              ack_note = ?,
              snapshot_payload_json = ?
        WHERE id = ?
          AND empresa_id = ?`,
    )
      .bind(acknowledgedAt, acknowledgedBy, ackedEvent.ack_note, JSON.stringify(ackedEvent), id, empresaId)
      .run();
  } else {
    await c.env.DB.prepare(
      `UPDATE frms_fadiga_evento
          SET payload_json = ?
        WHERE id = ?
          AND empresa_id = ?
          AND tipo = ?`,
    )
      .bind(JSON.stringify(ackedEvent), id, empresaId, FRMS_READ_ACK_EVENT_KIND)
      .run();
  }

  await c.env.DB.prepare(
    `INSERT INTO frms_read_ack_event_audit
       (id, empresa_id, event_id, action, actor_user_id, action_at, note,
        payload_before_json, payload_after_json, schema_version)
     VALUES (?, ?, ?, 'ACK', ?, ?, ?, ?, ?, 1)`,
  )
    .bind(
      crypto.randomUUID(),
      empresaId,
      id,
      acknowledgedBy,
      acknowledgedAt,
      ackedEvent.ack_note,
      storageSource === 'FRMS_READ_ACK_EVENTS'
        ? dedicatedRow?.snapshot_payload_json ?? null
        : legacyRow?.payload_json ?? null,
      JSON.stringify(ackedEvent),
    )
    .run();

  return c.json({ success: true, data: ackedEvent });
});

export default router;

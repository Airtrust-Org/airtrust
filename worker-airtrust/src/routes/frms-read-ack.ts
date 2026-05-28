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
  FRMS_READ_ACK_ACK_KIND,
  FRMS_READ_ACK_EVENT_KIND,
  parseFrmsReadAckEventPayload,
  sanitizeAckNote,
  type FrmsReadAckEvent,
  type FrmsReadAckEventStatus,
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
        if (!value) return undefined;
        const normalized = value.trim().toUpperCase();
        return normalized === 'PENDING' || normalized === 'ACKED'
          ? (normalized as FrmsReadAckEventStatus)
          : undefined;
      }),
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

async function listEvents(
  db: D1Database,
  params: {
    empresaId: number;
    dataInicio: string;
    dataFim: string;
    funcionarioId?: number;
    status?: FrmsReadAckEventStatus;
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
    .all<{ id: string; payload_json: string | null; created_at: string }>();

  return (rows.results ?? [])
    .map((row) => parseFrmsReadAckEventPayload(row.id, row.payload_json, row.created_at))
    .filter((event): event is FrmsReadAckEvent => event !== null);
}

router.get('/read-ack/events', async (c) => {
  const parsed = querySchema.safeParse({
    data_inicio: c.req.query('data_inicio'),
    data_fim: c.req.query('data_fim'),
    funcionario_id: c.req.query('funcionario_id'),
    status: c.req.query('status'),
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

  const events = await listEvents(c.env.DB, {
    empresaId,
    dataInicio: parsed.data.data_inicio,
    dataFim: parsed.data.data_fim,
    funcionarioId: scopedFuncionarioId,
    status: parsed.data.status,
  });

  return c.json({
    success: true,
    data: events,
    summary: {
      total: events.length,
      pending: events.filter((event) => event.status === 'PENDING').length,
      acked: events.filter((event) => event.status === 'ACKED').length,
    },
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

  for (const event of events) {
    const result = await c.env.DB.prepare(
      `INSERT OR IGNORE INTO frms_fadiga_evento
         (id, empresa_id, checkin_id, tipo, payload_json, created_at)
       VALUES (?, ?, NULL, ?, ?, datetime('now'))`,
    )
      .bind(event.id, empresaId, FRMS_READ_ACK_EVENT_KIND, JSON.stringify(event))
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
  const row = await c.env.DB.prepare(
    `SELECT id, payload_json, created_at
       FROM frms_fadiga_evento
      WHERE id = ?
        AND empresa_id = ?
        AND tipo = ?
      LIMIT 1`,
  )
    .bind(id, empresaId, FRMS_READ_ACK_EVENT_KIND)
    .first<{ id: string; payload_json: string | null; created_at: string }>();

  const event = row
    ? parseFrmsReadAckEventPayload(row.id, row.payload_json, row.created_at)
    : null;
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
    acknowledged_at: acknowledgedAt,
    acknowledged_by: acknowledgedBy,
    acknowledged_by_name: userDisplayName(c),
    ack_note: sanitizeAckNote(parsed.data.ack_note),
  };

  await c.env.DB.prepare(
    `UPDATE frms_fadiga_evento
        SET payload_json = ?
      WHERE id = ?
        AND empresa_id = ?
        AND tipo = ?`,
  )
    .bind(JSON.stringify(ackedEvent), id, empresaId, FRMS_READ_ACK_EVENT_KIND)
    .run();

  await c.env.DB.prepare(
    `INSERT INTO frms_fadiga_evento
       (id, empresa_id, checkin_id, tipo, payload_json, created_at)
     VALUES (?, ?, NULL, ?, ?, datetime('now'))`,
  )
    .bind(
      crypto.randomUUID(),
      empresaId,
      FRMS_READ_ACK_ACK_KIND,
      JSON.stringify({
        schema_version: 1,
        event_id: id,
        acknowledged_at: acknowledgedAt,
        acknowledged_by: acknowledgedBy,
        acknowledged_by_name: ackedEvent.acknowledged_by_name,
        ack_note: ackedEvent.ack_note,
      }),
    )
    .run();

  return c.json({ success: true, data: ackedEvent });
});

export default router;

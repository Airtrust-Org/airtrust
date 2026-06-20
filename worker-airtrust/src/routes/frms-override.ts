import { Hono } from 'hono';
import { z } from 'zod';
import type { Context } from 'hono';
import type { Env, Variables } from '../types';
import { auth } from '../middleware/auth';
import { getEmpresaId } from '../middleware/tenant';
import { normalizeAirtrustRole } from '../utils/role-resolution';
import {
  buildFrmsOverridePayload,
  parseStoredOverrideAckNote,
} from '../lib/frms/override';

type FrmsOverrideContext = Context<{ Bindings: Env; Variables: Partial<Variables> }>;

const router = new Hono<{ Bindings: Env; Variables: Partial<Variables> }>();
router.use('*', auth());

const bodySchema = z.object({
  justificativa: z.string(),
  evidencia_ref: z.string().optional().nullable(),
});

interface ReadAckEventRow {
  id: string;
  empresa_id: number;
  lifecycle_status: string;
  ack_note: string | null;
  snapshot_payload_json: string | null;
}

function canApplyOverride(c: FrmsOverrideContext): boolean {
  const role = normalizeAirtrustRole(c.get('userRole'));
  return role === 'ADMINISTRADOR' || role === 'GESTOR';
}

function safeOverrideResponse(input: {
  eventId: string;
  empresaId: number;
  acknowledgedAt: string;
  acknowledgedBy: number;
  ackNoteJson: string;
}) {
  const parsed = parseStoredOverrideAckNote(input.ackNoteJson);
  return {
    event_id: input.eventId,
    empresa_id: input.empresaId,
    status: 'OVERRIDE_APPLIED',
    acknowledged_at: input.acknowledgedAt,
    acknowledged_by: input.acknowledgedBy,
    override: parsed
      ? {
          _override_schema: parsed._override_schema,
          evidencia_ref: parsed.evidencia_ref,
          override_at: parsed.override_at,
        }
      : null,
  };
}

router.post('/override/:eventId', async (c) => {
  if (!canApplyOverride(c)) {
    return c.json({ success: false, error: 'Permissao negada', code: 'RBAC_FORBIDDEN' }, 403);
  }

  const eventId = c.req.param('eventId') ?? '';
  const body = await c.req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: parsed.error.flatten(), code: 'VALIDATION_ERROR' }, 422);
  }

  const empresaId = getEmpresaId(c as unknown as Context<{ Bindings: Env; Variables: Variables }>);
  const userId = Number(c.get('userId') || 0);
  const overrideAt = new Date().toISOString();
  const overridePayload = buildFrmsOverridePayload({
    eventId,
    empresaId,
    responsavelUserId: userId,
    justificativa: parsed.data.justificativa,
    evidenciaRef: parsed.data.evidencia_ref,
    overrideAt,
  });

  if (!overridePayload) {
    return c.json(
      {
        success: false,
        error: 'Justificativa de override invalida',
        code: 'INVALID_JUSTIFICATIVA',
      },
      422,
    );
  }

  const existing = await c.env.DB.prepare(
    `SELECT id, empresa_id, lifecycle_status, ack_note, snapshot_payload_json
       FROM frms_read_ack_events
      WHERE id = ?
        AND empresa_id = ?
      LIMIT 1`,
  )
    .bind(eventId, empresaId)
    .first<ReadAckEventRow>();

  if (!existing) {
    return c.json({ success: false, error: 'Evento nao encontrado', code: 'NOT_FOUND' }, 404);
  }

  await c.env.DB.prepare(
    `UPDATE frms_read_ack_events
        SET lifecycle_status = 'ACKED',
            acknowledged_at = ?,
            acknowledged_by = ?,
            ack_note = ?
      WHERE id = ?
        AND empresa_id = ?`,
  )
    .bind(overrideAt, userId, overridePayload.ackNoteJson, eventId, empresaId)
    .run();

  const afterPayload = {
    event_id: eventId,
    empresa_id: empresaId,
    lifecycle_status: 'ACKED',
    ack_note: overridePayload.ackNote,
  };

  await c.env.DB.prepare(
    `INSERT INTO frms_read_ack_event_audit
       (id, empresa_id, event_id, action, actor_user_id, action_at, note,
        payload_before_json, payload_after_json, schema_version)
     VALUES (?, ?, ?, 'OVERRIDE_APPLIED', ?, ?, ?, ?, ?, 1)`,
  )
    .bind(
      crypto.randomUUID(),
      empresaId,
      eventId,
      userId,
      overrideAt,
      overridePayload.override.justificativa,
      existing.snapshot_payload_json ?? existing.ack_note ?? null,
      JSON.stringify(afterPayload),
    )
    .run();

  return c.json({
    success: true,
    data: safeOverrideResponse({
      eventId,
      empresaId,
      acknowledgedAt: overrideAt,
      acknowledgedBy: userId,
      ackNoteJson: overridePayload.ackNoteJson,
    }),
  });
});

export default router;

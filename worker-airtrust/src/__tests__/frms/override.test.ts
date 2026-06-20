import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    const rawUserId = c.req.header('x-user-id');
    if (!rawUserId) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }
    c.set('userId', Number(rawUserId));
    c.set('userRole', c.req.header('x-role') || 'student');
    await next();
  },
}));

vi.mock('../../middleware/tenant', () => ({
  getEmpresaId: (c: any) => Number(c.req.header('x-empresa-id') || 0),
}));

import overrideRoutes from '../../routes/frms-override';

interface EventRow {
  id: string;
  empresa_id: number;
  lifecycle_status: string;
  ack_note: string | null;
  snapshot_payload_json: string | null;
  acknowledged_at?: string | null;
  acknowledged_by?: number | null;
}

interface AuditRow {
  empresa_id: number;
  event_id: string;
  action: string;
  actor_user_id: number;
  note: string;
  payload_before_json: string | null;
  payload_after_json: string;
}

function createApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route('/frms', overrideRoutes);
  return app;
}

function createDb(seed: EventRow[] = []) {
  const events = [...seed];
  const audits: AuditRow[] = [];
  const runs: string[] = [];

  const db = {
    prepare: vi.fn((query: string) => ({
      bind: (...args: unknown[]) => ({
        first: async () => {
          if (query.includes('FROM frms_read_ack_events')) {
            const [id, empresaId] = args as [string, number];
            return events.find((event) => event.id === id && event.empresa_id === empresaId) ?? null;
          }
          return null;
        },
        run: async () => {
          runs.push(query);
          if (query.includes('UPDATE frms_read_ack_events')) {
            const [ackAt, ackBy, ackNote, id, empresaId] = args as [
              string,
              number,
              string,
              string,
              number,
            ];
            const event = events.find((item) => item.id === id && item.empresa_id === empresaId);
            if (!event) return { meta: { changes: 0 } };
            event.lifecycle_status = 'ACKED';
            event.acknowledged_at = ackAt;
            event.acknowledged_by = ackBy;
            event.ack_note = ackNote;
            return { meta: { changes: 1 } };
          }

          if (query.includes('INSERT INTO frms_read_ack_event_audit')) {
            const [
              ,
              empresaId,
              eventId,
              actorUserId,
              ,
              note,
              payloadBeforeJson,
              payloadAfterJson,
            ] = args as [string, number, string, number, string, string, string | null, string];
            audits.push({
              empresa_id: empresaId,
              event_id: eventId,
              action: 'OVERRIDE_APPLIED',
              actor_user_id: actorUserId,
              note,
              payload_before_json: payloadBeforeJson,
              payload_after_json: payloadAfterJson,
            });
            return { meta: { changes: 1 } };
          }

          return { meta: { changes: 0 } };
        },
      }),
    })),
  } as unknown as D1Database;

  return { db, events, audits, runs };
}

describe('POST /frms/override/:eventId', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sem auth retorna 401', async () => {
    const app = createApp();
    const response = await app.request(
      '/frms/override/event-1',
      { method: 'POST', body: JSON.stringify({ justificativa: 'Mitigacao operacional valida.' }) },
      { DB: createDb().db } as unknown as Env,
    );

    expect(response.status).toBe(401);
  });

  it('bloqueia student e instructor', async () => {
    const app = createApp();
    for (const role of ['student', 'instructor']) {
      const response = await app.request(
        '/frms/override/event-1',
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-user-id': '77',
            'x-role': role,
            'x-empresa-id': '5',
          },
          body: JSON.stringify({ justificativa: 'Mitigacao operacional valida.' }),
        },
        { DB: createDb().db } as unknown as Env,
      );
      expect(response.status).toBe(403);
    }
  });

  it('manager/admin com justificativa valida grava override e auditoria', async () => {
    const app = createApp();
    const { db, events, audits } = createDb([
      {
        id: 'event-1',
        empresa_id: 5,
        lifecycle_status: 'PENDING',
        ack_note: null,
        snapshot_payload_json: '{"schema_version":1}',
      },
    ]);

    const response = await app.request(
      '/frms/override/event-1',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-user-id': '77',
          'x-role': 'manager',
          'x-empresa-id': '5',
        },
        body: JSON.stringify({
          justificativa: 'Mitigacao operacional revisada pelo gestor de escala.',
          evidencia_ref: 'FRMS-DOC-001',
        }),
      },
      { DB: db } as unknown as Env,
    );

    expect(response.status).toBe(200);
    expect(events[0].lifecycle_status).toBe('ACKED');
    expect(JSON.parse(events[0].ack_note || '{}')).toMatchObject({
      _override_schema: 1,
      responsavel_user_id: 77,
      evidencia_ref: 'FRMS-DOC-001',
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      empresa_id: 5,
      event_id: 'event-1',
      action: 'OVERRIDE_APPLIED',
      actor_user_id: 77,
    });

    const payloadText = await response.text();
    expect(payloadText).not.toContain('Tripulante');
    expect(payloadText).not.toContain('email');
    expect(payloadText).not.toContain('Mitigacao operacional revisada');
  });

  it('justificativa vazia ou curta retorna 422', async () => {
    const app = createApp();
    const response = await app.request(
      '/frms/override/event-1',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-user-id': '77',
          'x-role': 'admin',
          'x-empresa-id': '5',
        },
        body: JSON.stringify({ justificativa: 'curta' }),
      },
      { DB: createDb().db } as unknown as Env,
    );

    expect(response.status).toBe(422);
  });

  it('eventId de outro tenant retorna 404 seguro', async () => {
    const app = createApp();
    const response = await app.request(
      '/frms/override/event-tenant-9',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-user-id': '77',
          'x-role': 'manager',
          'x-empresa-id': '5',
        },
        body: JSON.stringify({ justificativa: 'Mitigacao operacional revisada.' }),
      },
      {
        DB: createDb([
          {
            id: 'event-tenant-9',
            empresa_id: 9,
            lifecycle_status: 'PENDING',
            ack_note: null,
            snapshot_payload_json: null,
          },
        ]).db,
      } as unknown as Env,
    );

    expect(response.status).toBe(404);
  });
});

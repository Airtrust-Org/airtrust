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
import {
  buildFrmsOverridePayload,
  parseStoredOverrideAckNote,
  sanitizeOverrideEvidenceRef,
} from '../../lib/frms/override';

const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const READ_ACK_EVENT_ID = 'frms_read_ack_5_2026-06-20_77_CHECKIN_CRITICO';
const CROSS_TENANT_EVENT_ID = '99999999-9999-4999-8999-999999999999';

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
      `/frms/override/${EVENT_ID}`,
      { method: 'POST', body: JSON.stringify({ justificativa: 'Mitigacao operacional valida.' }) },
      { DB: createDb().db } as unknown as Env,
    );

    expect(response.status).toBe(401);
  });

  it('bloqueia student e instructor', async () => {
    const app = createApp();
    for (const role of ['student', 'instructor']) {
      const response = await app.request(
        `/frms/override/${EVENT_ID}`,
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

  it.each(['manager', 'admin'])(
    '%s com justificativa valida grava override e auditoria',
    async (role) => {
      const app = createApp();
      const { db, events, audits } = createDb([
        {
          id: EVENT_ID,
          empresa_id: 5,
          lifecycle_status: 'PENDING',
          ack_note: null,
          snapshot_payload_json:
            '{"schema_version":1,"funcionario_nome":"Tripulante Teste","email":"operador@example.invalid"}',
        },
      ]);

      const response = await app.request(
        `/frms/override/${EVENT_ID}`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-user-id': '77',
            'x-role': role,
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
        event_id: EVENT_ID,
        action: 'OVERRIDE_APPLIED',
        actor_user_id: 77,
        note: 'Override operacional FRMS aplicado',
      });
      expect(audits[0].payload_before_json).not.toContain('Tripulante Teste');
      expect(audits[0].payload_before_json).not.toContain('operador@example.invalid');
      expect(audits[0].payload_before_json).toContain('"snapshot_payload_present":true');
      expect(audits[0].payload_after_json).not.toContain('Mitigacao operacional revisada');
      expect(audits[0].payload_after_json).toContain('"override_schema":1');

      const payloadText = await response.text();
      expect(payloadText).not.toContain('Tripulante');
      expect(payloadText).not.toContain('email');
      expect(payloadText).not.toContain('Mitigacao operacional revisada');
    },
  );

  it('justificativa vazia ou curta retorna 422', async () => {
    const app = createApp();
    const response = await app.request(
      `/frms/override/${EVENT_ID}`,
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

  it.each([
    'Contato operador@example.invalid validado.',
    'CPF 000.000.000-00 informado na revisao.',
    'token operacional informado no texto.',
    'cookie operacional informado no texto.',
    'senha operacional informada no texto.',
    'password operacional informado no texto.',
    'secret operacional informado no texto.',
  ])('justificativa com PII ou segredo retorna 422 sem consultar o banco: %s', async (text) => {
    const app = createApp();
    const { db } = createDb([
      {
        id: EVENT_ID,
        empresa_id: 5,
        lifecycle_status: 'PENDING',
        ack_note: null,
        snapshot_payload_json: null,
      },
    ]);
    const response = await app.request(
      `/frms/override/${EVENT_ID}`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-user-id': '77',
          'x-role': 'admin',
          'x-empresa-id': '5',
        },
        body: JSON.stringify({ justificativa: text }),
      },
      { DB: db } as unknown as Env,
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: 'INVALID_JUSTIFICATIVA',
    });
    expect(db.prepare).not.toHaveBeenCalled();
  });

  it('eventId invalido retorna 422 sanitizado sem consultar o banco', async () => {
    const app = createApp();
    const { db } = createDb();
    const response = await app.request(
      '/frms/override/not-a-uuid',
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
      { DB: db } as unknown as Env,
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'Identificador de evento invalido',
      code: 'INVALID_EVENT_ID',
    });
    expect(db.prepare).not.toHaveBeenCalled();
  });

  it.each([
    'operador@example.invalid',
    '000.000.000-00',
    'token:valor-sintetico',
    'cookie:valor-sintetico',
    'senha:valor-sintetico',
    'password:valor-sintetico',
    'secret:valor-sintetico',
    'authorization:Bearer',
    'api_key:valor-sintetico',
    'access_token:valor-sintetico',
    'refresh_token:valor-sintetico',
    'session_id:valor-sintetico',
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature',
  ])('evidencia_ref sensivel e rejeitada com 422: %s', async (evidenciaRef) => {
    const app = createApp();
    const { db } = createDb([
      {
        id: EVENT_ID,
        empresa_id: 5,
        lifecycle_status: 'PENDING',
        ack_note: null,
        snapshot_payload_json: null,
      },
    ]);
    const response = await app.request(
      `/frms/override/${EVENT_ID}`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-user-id': '77',
          'x-role': 'manager',
          'x-empresa-id': '5',
        },
        body: JSON.stringify({
          justificativa: 'Mitigacao operacional revisada.',
          evidencia_ref: evidenciaRef,
        }),
      },
      { DB: db } as unknown as Env,
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: 'INVALID_EVIDENCIA_REF',
    });
    expect(db.prepare).not.toHaveBeenCalled();
  });

  it('aceita eventId canonico de frms_read_ack_events alem de UUID', async () => {
    const app = createApp();
    const { db, events, audits } = createDb([
      {
        id: READ_ACK_EVENT_ID,
        empresa_id: 5,
        lifecycle_status: 'PENDING',
        ack_note: null,
        snapshot_payload_json: null,
      },
    ]);
    const response = await app.request(
      `/frms/override/${READ_ACK_EVENT_ID}`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-user-id': '77',
          'x-role': 'manager',
          'x-empresa-id': '5',
        },
        body: JSON.stringify({
          justificativa: 'Mitigacao operacional revisada.',
          evidencia_ref: 'FRMS-DOC-001',
        }),
      },
      { DB: db } as unknown as Env,
    );

    expect(response.status).toBe(200);
    expect(events[0].ack_note).toContain('FRMS-DOC-001');
    expect(audits[0]).toMatchObject({
      empresa_id: 5,
      event_id: READ_ACK_EVENT_ID,
      action: 'OVERRIDE_APPLIED',
    });
  });

  it('eventId de outro tenant retorna 404 seguro e ignora empresa_id do body', async () => {
    const app = createApp();
    const { db, runs } = createDb([
      {
        id: CROSS_TENANT_EVENT_ID,
        empresa_id: 9,
        lifecycle_status: 'PENDING',
        ack_note: null,
        snapshot_payload_json: null,
      },
    ]);
    const response = await app.request(
      `/frms/override/${CROSS_TENANT_EVENT_ID}`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-user-id': '77',
          'x-role': 'manager',
          'x-empresa-id': '5',
        },
        body: JSON.stringify({
          justificativa: 'Mitigacao operacional revisada.',
          empresa_id: 9,
        }),
      },
      { DB: db } as unknown as Env,
    );

    expect(response.status).toBe(404);
    expect(runs).toHaveLength(0);
  });

  it('helpers rejeitam ids e evidencia invalidos fora da rota', () => {
    expect(
      buildFrmsOverridePayload({
        eventId: 'evento-arbitrario',
        empresaId: 5,
        responsavelUserId: 77,
        justificativa: 'Mitigacao operacional revisada.',
        evidenciaRef: 'FRMS-DOC-001',
        overrideAt: '2026-06-20T12:00:00.000Z',
      }),
    ).toBeNull();
    expect(sanitizeOverrideEvidenceRef('api_key:valor-sintetico')).toBeNull();
    expect(
      parseStoredOverrideAckNote(
        JSON.stringify({
          _override_schema: 1,
          responsavel_user_id: 77,
          justificativa: 'Mitigacao operacional revisada.',
          evidencia_ref: 'api_key:valor-sintetico',
          override_at: '2026-06-20T12:00:00.000Z',
        }),
      ),
    ).toBeNull();
  });
});

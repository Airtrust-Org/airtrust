import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

const listSnapshotMock = vi.fn();

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('userId', Number(c.req.header('x-user-id') || 1));
    c.set('userRole', c.req.header('x-role') || 'manager');
    c.set('funcionarioId', Number(c.req.header('x-own-funcionario-id') || 0) || null);
    c.set('userEmail', c.req.header('x-user-email') || 'coord@airtrust.test');
    await next();
  },
}));

vi.mock('../../middleware/tenant', () => ({
  getEmpresaId: (c: any) => Number(c.req.header('x-empresa-id') || 1),
}));

vi.mock('../../lib/frms/operational-snapshot', () => ({
  listFrmsOperationalSnapshot: (...args: unknown[]) => listSnapshotMock(...args),
}));

import readAckRoutes from '../../routes/frms-read-ack';

interface LegacyEvent {
  id: string;
  empresa_id: number;
  tipo: string;
  payload_json: string;
  created_at: string;
}

interface DedicatedEvent {
  id: string;
  empresa_id: number;
  data_operacional: string;
  funcionario_id: number;
  event_type: string;
  severity: string;
  source: string;
  lifecycle_status: string;
  snapshot_status: string | null;
  snapshot_alertas_json: string | null;
  data_sources_json: string | null;
  limitations_json: string | null;
  snapshot_payload_json: string | null;
  event_hash: string | null;
  created_by: number | null;
  created_at: string;
  acknowledged_at: string | null;
  acknowledged_by: number | null;
  ack_note: string | null;
}

interface AuditEvent {
  id: string;
  empresa_id: number;
  event_id: string;
  action: string;
  actor_user_id: number | null;
  action_at: string;
  note: string | null;
  payload_before_json: string | null;
  payload_after_json: string | null;
}

function snapshotItem(
  funcionarioId = 10,
  overrides?: Partial<{
    data_operacional: string;
    snapshot_status: 'OK' | 'ATENCAO' | 'CRITICO' | 'INCOMPLETO';
    alertas: string[];
  }>,
) {
  return {
    empresa_id: 1,
    data_operacional: overrides?.data_operacional || '2026-05-28',
    funcionario_id: funcionarioId,
    tripulante_id: funcionarioId,
    nome: 'Max Monteiro',
    nome_guerra: 'Max',
    funcao: 'PIC',
    base: 'SBSP',
    aeronave: 'AW139',
    escalado: true,
    escala_source: 'SIGVOOS',
    hora_apresentacao: '08:00',
    hora_termino: '18:00',
    horas_voo_minutos: 180,
    duracao_jornada_minutos: 600,
    teve_jornada: true,
    checkin_status: 'PENDENTE',
    checkin_horario: null,
    kss_score: null,
    horas_sono: null,
    qualidade_sono: null,
    hora_acordar: null,
    fadiga_score: null,
    status_operacional_checkin: null,
    effectiveness_pct: 62,
    nivel_fadiga_calculado: 'VERMELHO',
    fatorizacao_status: 'AUSENTE',
    sleep_data_source: 'ESTIMADO',
    wake_data_source: 'ESTIMADO',
    jornada_data_source: 'INCONSISTENTE',
    jornada_origem: null,
    snapshot_status: overrides?.snapshot_status || 'CRITICO',
    fortnight_indicator: { status_quinzena: 'INCOMPLETO' },
    alertas:
      overrides?.alertas || ['CHECKIN_PENDENTE', 'JORNADA_SEM_FATORIZACAO', 'DADO_INCONSISTENTE'],
  };
}

function createApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route('/frms', readAckRoutes);
  return app;
}

function createDb() {
  const legacyEvents: LegacyEvent[] = [];
  const dedicatedEvents: DedicatedEvent[] = [];
  const auditEvents: AuditEvent[] = [];
  const queries: string[] = [];

  const db = {
    prepare: vi.fn((query: string) => {
      queries.push(query);
      return {
        bind: (...args: unknown[]) => ({
          first: async () => {
            if (query.includes('FROM funcionarios') && query.includes('WHERE id = ?')) {
              return { id: Number(args[0]) };
            }
            if (query.includes('FROM usuarios u') && query.includes('JOIN funcionarios f')) {
              return { id: 11 };
            }
            if (query.includes('FROM frms_read_ack_events') && query.includes('WHERE id = ?')) {
              const [id, empresaId] = args;
              return (
                dedicatedEvents.find(
                  (event) => event.id === id && event.empresa_id === empresaId,
                ) ?? null
              );
            }
            if (query.includes('FROM frms_fadiga_evento') && query.includes('WHERE id = ?')) {
              const [id, empresaId, tipo] = args;
              return (
                legacyEvents.find(
                  (event) =>
                    event.id === id && event.empresa_id === empresaId && event.tipo === tipo,
                ) ?? null
              );
            }
            return null;
          },
          all: async () => {
            if (query.includes('FROM frms_read_ack_events')) {
              const [empresaId, dataInicio, dataFim] = args as [number, string, string];
              let cursor = 3;
              let funcionarioId: number | undefined;
              let status: string | undefined;
              let eventType: string | undefined;
              let severity: string | undefined;

              if (query.includes('funcionario_id = ?')) {
                funcionarioId = Number(args[cursor]);
                cursor += 1;
              }
              if (query.includes('lifecycle_status = ?')) {
                status = String(args[cursor]);
                cursor += 1;
              }
              if (query.includes('event_type = ?')) {
                eventType = String(args[cursor]);
                cursor += 1;
              }
              if (query.includes('severity = ?')) {
                severity = String(args[cursor]);
              }

              return {
                results: dedicatedEvents.filter((event) => {
                  if (event.empresa_id !== empresaId) return false;
                  if (event.data_operacional < dataInicio || event.data_operacional > dataFim) {
                    return false;
                  }
                  if (funcionarioId && event.funcionario_id !== funcionarioId) return false;
                  if (status && event.lifecycle_status !== status) return false;
                  if (eventType && event.event_type !== eventType) return false;
                  if (severity && event.severity !== severity) return false;
                  return true;
                }),
              };
            }
            if (!query.includes('FROM frms_fadiga_evento')) return { results: [] };

            const [empresaId, tipo, dataInicio, dataFim] = args as [
              number,
              string,
              string,
              string,
            ];
            let cursor = 4;
            let funcionarioId: number | undefined;
            let status: string | undefined;
            let eventType: string | undefined;
            let severity: string | undefined;

            if (query.includes('funcionario_id')) {
              funcionarioId = Number(args[cursor]);
              cursor += 1;
            }
            if (query.includes("$.status")) {
              status = String(args[cursor]);
              cursor += 1;
            }
            if (query.includes("$.event_type")) {
              eventType = String(args[cursor]);
              cursor += 1;
            }
            if (query.includes("$.severity")) {
              severity = String(args[cursor]);
            }

            return {
              results: legacyEvents.filter((event) => {
                if (event.empresa_id !== empresaId || event.tipo !== tipo) return false;
                const payload = JSON.parse(event.payload_json);
                if (payload.data_operacional < dataInicio || payload.data_operacional > dataFim) {
                  return false;
                }
                if (funcionarioId && payload.funcionario_id !== funcionarioId) return false;
                if (status && payload.status !== status) return false;
                if (eventType && payload.event_type !== eventType) return false;
                if (severity && payload.severity !== severity) return false;
                return true;
              }),
            };
          },
          run: async () => {
            if (query.includes('INSERT OR IGNORE INTO frms_read_ack_events')) {
              const [
                id,
                empresaId,
                dataOperacional,
                funcionarioId,
                eventType,
                severity,
                source,
                lifecycleStatus,
                snapshotStatus,
                snapshotAlertasJson,
                dataSourcesJson,
                limitationsJson,
                snapshotPayloadJson,
                eventHash,
                createdBy,
                legacyId,
                legacyEmpresaId,
                legacyTipo,
              ] = args as [
                string,
                number,
                string,
                number,
                string,
                string,
                string,
                string,
                string,
                string,
                string,
                string,
                string,
                string,
                number | null,
                string,
                number,
                string,
              ];
              if (dedicatedEvents.some((event) => event.id === id)) {
                return { meta: { changes: 0 } };
              }
              if (
                legacyEvents.some(
                  (event) =>
                    event.id === legacyId &&
                    event.empresa_id === legacyEmpresaId &&
                    event.tipo === legacyTipo,
                )
              ) {
                return { meta: { changes: 0 } };
              }
              dedicatedEvents.push({
                id,
                empresa_id: empresaId,
                data_operacional: dataOperacional,
                funcionario_id: funcionarioId,
                event_type: eventType,
                severity,
                source,
                lifecycle_status: lifecycleStatus,
                snapshot_status: snapshotStatus,
                snapshot_alertas_json: snapshotAlertasJson,
                data_sources_json: dataSourcesJson,
                limitations_json: limitationsJson,
                snapshot_payload_json: snapshotPayloadJson,
                event_hash: eventHash,
                created_by: createdBy,
                created_at: '2026-05-28 19:00:00',
                acknowledged_at: null,
                acknowledged_by: null,
                ack_note: null,
              });
              return { meta: { changes: 1 } };
            }

            if (query.includes('UPDATE frms_read_ack_events')) {
              const [acknowledgedAt, acknowledgedBy, ackNote, payloadJson, id, empresaId] = args as [
                string,
                number | null,
                string | null,
                string,
                string,
                number,
              ];
              const event = dedicatedEvents.find(
                (item) => item.id === id && item.empresa_id === empresaId,
              );
              if (event) {
                event.lifecycle_status = 'ACKED';
                event.acknowledged_at = acknowledgedAt;
                event.acknowledged_by = acknowledgedBy;
                event.ack_note = ackNote;
                event.snapshot_payload_json = payloadJson;
              }
              return { meta: { changes: event ? 1 : 0 } };
            }

            if (query.includes('UPDATE frms_fadiga_evento')) {
              const [payloadJson, id, empresaId, tipo] = args as [string, string, number, string];
              const event = legacyEvents.find(
                (item) => item.id === id && item.empresa_id === empresaId && item.tipo === tipo,
              );
              if (event) event.payload_json = payloadJson;
              return { meta: { changes: event ? 1 : 0 } };
            }

            if (query.includes('INSERT INTO frms_read_ack_event_audit')) {
              const [
                id,
                empresaId,
                eventId,
                actorUserId,
                actionAt,
                note,
                payloadBeforeJson,
                payloadAfterJson,
              ] = args as [
                string,
                number,
                string,
                number | null,
                string,
                string | null,
                string | null,
                string | null,
              ];
              auditEvents.push({
                id,
                empresa_id: empresaId,
                event_id: eventId,
                action: 'ACK',
                actor_user_id: actorUserId,
                action_at: actionAt,
                note,
                payload_before_json: payloadBeforeJson,
                payload_after_json: payloadAfterJson,
              });
              return { meta: { changes: 1 } };
            }

            return { meta: { changes: 0 } };
          },
        }),
      };
    }),
  } as unknown as D1Database;

  return { db, legacyEvents, dedicatedEvents, auditEvents, queries };
}

describe('FRMS D1 read/ack events', () => {
  beforeEach(() => {
    listSnapshotMock.mockReset();
  });

  it('gera eventos do snapshot de forma idempotente sem usar apto_para_voo', async () => {
    listSnapshotMock.mockResolvedValue({ items: [snapshotItem()], summary: {} });
    const app = createApp();
    const { db, dedicatedEvents } = createDb();

    const request = {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-empresa-id': '1' },
      body: JSON.stringify({ data_inicio: '2026-05-28', data_fim: '2026-05-28' }),
    };

    const first = await app.request('/frms/read-ack/events/generate', request, {
      DB: db,
    } as unknown as Env);
    const second = await app.request('/frms/read-ack/events/generate', request, {
      DB: db,
    } as unknown as Env);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const firstPayload = (await first.json()) as { summary: { inserted: number } };
    const secondPayload = (await second.json()) as { summary: { inserted: number } };
    expect(firstPayload.summary.inserted).toBe(4);
    expect(secondPayload.summary.inserted).toBe(0);
    expect(dedicatedEvents).toHaveLength(4);
    expect(JSON.stringify(dedicatedEvents)).not.toContain('apto_para_voo');
  });

  it('filtra por status PENDING, ACKED, ALL e STALE com summary de lifecycle', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    listSnapshotMock.mockResolvedValue({
      items: [
        snapshotItem(10, { data_operacional: today }),
        snapshotItem(11, { data_operacional: tenDaysAgo }),
      ],
      summary: {},
    });
    const app = createApp();
    const { db, dedicatedEvents } = createDb();

    await app.request(
      '/frms/read-ack/events/generate',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-empresa-id': '1' },
        body: JSON.stringify({ data_inicio: tenDaysAgo, data_fim: today }),
      },
      { DB: db } as unknown as Env,
    );

    const eventToAck = dedicatedEvents.find(
      (event) =>
        event.id.includes('_CHECKIN_PENDENTE') &&
        event.id.includes('_10_'),
    );
    expect(eventToAck?.id).toBeTruthy();

    await app.request(
      `/frms/read-ack/events/${encodeURIComponent(eventToAck!.id)}/ack`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-empresa-id': '1',
          'x-user-id': '99',
          'x-user-email': 'coord@airtrust.test',
        },
        body: JSON.stringify({ ack_note: 'Ciente' }),
      },
      { DB: db } as unknown as Env,
    );

    const pendingResp = await app.request(
      `/frms/read-ack/events?data_inicio=${tenDaysAgo}&data_fim=${today}&status=PENDING`,
      { method: 'GET', headers: { 'x-empresa-id': '1' } },
      { DB: db } as unknown as Env,
    );
    const pendingPayload = (await pendingResp.json()) as { data: Array<{ lifecycle_status: string }> };
    expect(pendingResp.status).toBe(200);
    expect(pendingPayload.data.every((event) => event.lifecycle_status === 'PENDING')).toBe(true);

    const ackedResp = await app.request(
      `/frms/read-ack/events?data_inicio=${tenDaysAgo}&data_fim=${today}&status=ACKED`,
      { method: 'GET', headers: { 'x-empresa-id': '1' } },
      { DB: db } as unknown as Env,
    );
    const ackedPayload = (await ackedResp.json()) as { data: Array<{ lifecycle_status: string }> };
    expect(ackedResp.status).toBe(200);
    expect(ackedPayload.data.every((event) => event.lifecycle_status === 'ACKED')).toBe(true);

    const staleResp = await app.request(
      `/frms/read-ack/events?data_inicio=${tenDaysAgo}&data_fim=${today}&status=STALE`,
      { method: 'GET', headers: { 'x-empresa-id': '1' } },
      { DB: db } as unknown as Env,
    );
    const stalePayload = (await staleResp.json()) as {
      data: Array<{ lifecycle_status: string }>;
      summary: { stale: number };
    };
    expect(staleResp.status).toBe(200);
    expect(stalePayload.data.every((event) => event.lifecycle_status === 'STALE')).toBe(true);
    expect(stalePayload.summary.stale).toBeGreaterThan(0);

    const allResp = await app.request(
      `/frms/read-ack/events?data_inicio=${tenDaysAgo}&data_fim=${today}&status=ALL`,
      { method: 'GET', headers: { 'x-empresa-id': '1' } },
      { DB: db } as unknown as Env,
    );
    const allPayload = (await allResp.json()) as {
      summary: { total: number; pending: number; acked: number; stale: number };
    };
    expect(allResp.status).toBe(200);
    expect(allPayload.summary.total).toBeGreaterThan(0);
    expect(allPayload.summary.pending + allPayload.summary.acked + allPayload.summary.stale).toBe(
      allPayload.summary.total,
    );
  });

  it('filtra por event_type e severity', async () => {
    listSnapshotMock.mockResolvedValue({
      items: [
        snapshotItem(10, { snapshot_status: 'CRITICO' }),
        snapshotItem(11, { snapshot_status: 'ATENCAO', alertas: ['CHECKIN_PENDENTE'] }),
      ],
      summary: {},
    });
    const app = createApp();
    const { db } = createDb();

    await app.request(
      '/frms/read-ack/events/generate',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-empresa-id': '1' },
        body: JSON.stringify({ data_inicio: '2026-05-28', data_fim: '2026-05-28' }),
      },
      { DB: db } as unknown as Env,
    );

    const byType = await app.request(
      '/frms/read-ack/events?data_inicio=2026-05-28&data_fim=2026-05-28&status=ALL&event_type=CHECKIN_PENDENTE',
      { method: 'GET', headers: { 'x-empresa-id': '1' } },
      { DB: db } as unknown as Env,
    );
    const byTypePayload = (await byType.json()) as { data: Array<{ event_type: string }> };
    expect(byType.status).toBe(200);
    expect(byTypePayload.data.length).toBeGreaterThan(0);
    expect(byTypePayload.data.every((event) => event.event_type === 'CHECKIN_PENDENTE')).toBe(true);

    const bySeverity = await app.request(
      '/frms/read-ack/events?data_inicio=2026-05-28&data_fim=2026-05-28&status=ALL&severity=CRITICO',
      { method: 'GET', headers: { 'x-empresa-id': '1' } },
      { DB: db } as unknown as Env,
    );
    const bySeverityPayload = (await bySeverity.json()) as { data: Array<{ severity: string }> };
    expect(bySeverity.status).toBe(200);
    expect(bySeverityPayload.data.length).toBeGreaterThan(0);
    expect(bySeverityPayload.data.every((event) => event.severity === 'CRITICO')).toBe(true);
  });

  it('registra ciencia com usuario e trilha de auditoria sem chamar SGSO ou escala', async () => {
    listSnapshotMock.mockResolvedValue({ items: [snapshotItem()], summary: {} });
    const app = createApp();
    const { db, dedicatedEvents, auditEvents, queries } = createDb();

    await app.request(
      '/frms/read-ack/events/generate',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-empresa-id': '1' },
        body: JSON.stringify({ data_inicio: '2026-05-28', data_fim: '2026-05-28' }),
      },
      { DB: db } as unknown as Env,
    );

    const eventId = dedicatedEvents[0]?.id ?? '';
    const ack = await app.request(
      `/frms/read-ack/events/${encodeURIComponent(eventId)}/ack`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-empresa-id': '1',
          'x-user-id': '88',
          'x-user-email': 'coord@airtrust.test',
        },
        body: JSON.stringify({ ack_note: 'Ciente pela coordenacao.' }),
      },
      { DB: db } as unknown as Env,
    );

    expect(ack.status).toBe(200);
    const payload = (await ack.json()) as {
      data: {
        status: string;
        acknowledged_by: number;
        limitations: string[];
      };
    };
    expect(payload.data.status).toBe('ACKED');
    expect(payload.data.acknowledged_by).toBe(88);
    expect(payload.data.limitations.join(' ')).toContain('nao representa mitigacao');
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0]).toMatchObject({ event_id: eventId, action: 'ACK', actor_user_id: 88 });
    expect(queries.join('\n').toLowerCase()).not.toContain('sgso');
    expect(queries.join('\n').toLowerCase()).not.toContain('escala_');
  });

  it('lista eventos dedicados e legados sem duplicidade visual', async () => {
    listSnapshotMock.mockResolvedValue({ items: [snapshotItem(10)], summary: {} });
    const app = createApp();
    const { db, legacyEvents } = createDb();
    const legacyPayload = {
      schema_version: 1,
      empresa_id: 1,
      data_operacional: '2026-05-28',
      funcionario_id: 99,
      funcionario_nome: 'Legacy',
      event_type: 'OUTRO_CONTEXTUAL',
      severity: 'ATENCAO',
      status: 'PENDING',
      source: 'OPERATIONAL_SNAPSHOT',
      snapshot_status: 'ATENCAO',
      snapshot_alertas: [],
      checkin_status: 'PENDENTE',
      sleep_data_source: 'REAL',
      wake_data_source: 'REAL',
      jornada_data_source: 'REAL',
      fortnight_status: null,
      created_at: '2026-05-28T19:00:00.000Z',
      acknowledged_at: null,
      acknowledged_by: null,
      acknowledged_by_name: null,
      ack_note: null,
      limitations: ['legado'],
    };
    legacyEvents.push({
      id: 'legacy_frms_read_ack',
      empresa_id: 1,
      tipo: 'FRMS_READ_ACK_EVENT',
      payload_json: JSON.stringify(legacyPayload),
      created_at: '2026-05-28 18:00:00',
    });

    await app.request(
      '/frms/read-ack/events/generate',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-empresa-id': '1' },
        body: JSON.stringify({ data_inicio: '2026-05-28', data_fim: '2026-05-28' }),
      },
      { DB: db } as unknown as Env,
    );

    const response = await app.request(
      '/frms/read-ack/events?data_inicio=2026-05-28&data_fim=2026-05-28&status=ALL',
      { method: 'GET', headers: { 'x-empresa-id': '1' } },
      { DB: db } as unknown as Env,
    );
    const payload = (await response.json()) as {
      data: Array<{ id: string; storage_source: string }>;
    };

    expect(response.status).toBe(200);
    expect(payload.data.some((event) => event.storage_source === 'FRMS_READ_ACK_EVENTS')).toBe(true);
    expect(payload.data.some((event) => event.storage_source === 'LEGACY_FRMS_FADIGA_EVENTO')).toBe(
      true,
    );
    expect(new Set(payload.data.map((event) => event.id)).size).toBe(payload.data.length);
  });

  it('mantem isolamento por empresa_id', async () => {
    listSnapshotMock.mockResolvedValue({ items: [snapshotItem()], summary: {} });
    const app = createApp();
    const { db } = createDb();

    await app.request(
      '/frms/read-ack/events/generate',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-empresa-id': '1' },
        body: JSON.stringify({ data_inicio: '2026-05-28', data_fim: '2026-05-28' }),
      },
      { DB: db } as unknown as Env,
    );

    const response = await app.request(
      '/frms/read-ack/events?data_inicio=2026-05-28&data_fim=2026-05-28',
      { method: 'GET', headers: { 'x-empresa-id': '2' } },
      { DB: db } as unknown as Env,
    );
    const payload = (await response.json()) as { data: unknown[] };
    expect(payload.data).toHaveLength(0);
  });

  it('usuario comum fica restrito ao proprio funcionario', async () => {
    listSnapshotMock.mockResolvedValue({ items: [snapshotItem(11)], summary: {} });
    const app = createApp();
    const { db } = createDb();

    const response = await app.request(
      '/frms/read-ack/events/generate',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-role': 'user',
          'x-own-funcionario-id': '11',
          'x-empresa-id': '1',
        },
        body: JSON.stringify({
          data_inicio: '2026-05-28',
          data_fim: '2026-05-28',
          funcionario_id: 99,
        }),
      },
      { DB: db } as unknown as Env,
    );

    expect(response.status).toBe(200);
    const [, params] = listSnapshotMock.mock.calls[0];
    expect(params).toMatchObject({
      empresaId: 1,
      filters: expect.objectContaining({ funcionario_id: 11 }),
    });
  });
});

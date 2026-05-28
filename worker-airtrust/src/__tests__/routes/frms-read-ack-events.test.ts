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

interface StoredEvent {
  id: string;
  empresa_id: number;
  tipo: string;
  payload_json: string;
  created_at: string;
}

function snapshotItem(funcionarioId = 10) {
  return {
    empresa_id: 1,
    data_operacional: '2026-05-28',
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
    snapshot_status: 'CRITICO',
    fortnight_indicator: { status_quinzena: 'INCOMPLETO' },
    alertas: ['CHECKIN_PENDENTE', 'JORNADA_SEM_FATORIZACAO', 'DADO_INCONSISTENTE'],
  };
}

function createApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route('/frms', readAckRoutes);
  return app;
}

function createDb() {
  const events: StoredEvent[] = [];
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
            if (query.includes('FROM frms_fadiga_evento') && query.includes('WHERE id = ?')) {
              const [id, empresaId, tipo] = args;
              return (
                events.find(
                  (event) =>
                    event.id === id && event.empresa_id === empresaId && event.tipo === tipo,
                ) ?? null
              );
            }
            return null;
          },
          all: async () => {
            if (!query.includes('FROM frms_fadiga_evento')) return { results: [] };

            const [empresaId, tipo, dataInicio, dataFim] = args as [
              number,
              string,
              string,
              string,
            ];
            const funcionarioId = query.includes('funcionario_id') ? Number(args[4]) : undefined;
            const status = query.includes("$.status") ? String(args[funcionarioId ? 5 : 4]) : undefined;

            return {
              results: events.filter((event) => {
                if (event.empresa_id !== empresaId || event.tipo !== tipo) return false;
                const payload = JSON.parse(event.payload_json);
                if (payload.data_operacional < dataInicio || payload.data_operacional > dataFim) {
                  return false;
                }
                if (funcionarioId && payload.funcionario_id !== funcionarioId) return false;
                if (status && payload.status !== status) return false;
                return true;
              }),
            };
          },
          run: async () => {
            if (query.includes('INSERT OR IGNORE INTO frms_fadiga_evento')) {
              const [id, empresaId, tipo, payloadJson] = args as [string, number, string, string];
              if (events.some((event) => event.id === id)) return { meta: { changes: 0 } };
              events.push({
                id,
                empresa_id: empresaId,
                tipo,
                payload_json: payloadJson,
                created_at: '2026-05-28 19:00:00',
              });
              return { meta: { changes: 1 } };
            }

            if (query.includes('UPDATE frms_fadiga_evento')) {
              const [payloadJson, id, empresaId, tipo] = args as [string, string, number, string];
              const event = events.find(
                (item) => item.id === id && item.empresa_id === empresaId && item.tipo === tipo,
              );
              if (event) event.payload_json = payloadJson;
              return { meta: { changes: event ? 1 : 0 } };
            }

            if (query.includes('INSERT INTO frms_fadiga_evento')) {
              const [id, empresaId, tipo, payloadJson] = args as [string, number, string, string];
              events.push({
                id,
                empresa_id: empresaId,
                tipo,
                payload_json: payloadJson,
                created_at: '2026-05-28 19:01:00',
              });
              return { meta: { changes: 1 } };
            }

            return { meta: { changes: 0 } };
          },
        }),
      };
    }),
  } as unknown as D1Database;

  return { db, events, queries };
}

describe('FRMS D1 read/ack events', () => {
  beforeEach(() => {
    listSnapshotMock.mockReset();
  });

  it('gera eventos do snapshot de forma idempotente sem usar apto_para_voo', async () => {
    listSnapshotMock.mockResolvedValue({ items: [snapshotItem()], summary: {} });
    const app = createApp();
    const { db, events } = createDb();

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
    expect(JSON.stringify(events)).not.toContain('apto_para_voo');
  });

  it('registra ciencia com usuario e trilha de auditoria sem chamar SGSO ou escala', async () => {
    listSnapshotMock.mockResolvedValue({ items: [snapshotItem()], summary: {} });
    const app = createApp();
    const { db, events, queries } = createDb();

    await app.request(
      '/frms/read-ack/events/generate',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-empresa-id': '1' },
        body: JSON.stringify({ data_inicio: '2026-05-28', data_fim: '2026-05-28' }),
      },
      { DB: db } as unknown as Env,
    );

    const eventId = events.find((event) => event.tipo === 'FRMS_READ_ACK_EVENT')?.id ?? '';
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
    expect(events.some((event) => event.tipo === 'FRMS_READ_ACK_ACK')).toBe(true);
    expect(queries.join('\n').toLowerCase()).not.toContain('sgso');
    expect(queries.join('\n').toLowerCase()).not.toContain('escala_');
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

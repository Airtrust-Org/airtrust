import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sincronizarCheckinComFrms } from '../../lib/frms/fadiga-frms-sync';
import { recalcularPipeline } from '../../lib/frms/db-service-jornadas';

vi.mock('../../lib/frms/db-service-jornadas', () => ({
  recalcularPipeline: vi.fn(),
}));

const recalcularPipelineMock = vi.mocked(recalcularPipeline);

type DbOptions = {
  noJornada?: boolean;
  previousEffectiveness?: number | null;
  existingSyncEventId?: string | null;
};

function createDb(options: DbOptions = {}) {
  const eventInserts: Array<{ tipo: string; payload: Record<string, unknown> }> = [];
  const eventUpdates: Array<{ payload: Record<string, unknown>; id: string }> = [];
  let autoJornadaCreated = false;

  const db = {
    prepare: (query: string) => ({
      bind: (...bindArgs: unknown[]) => ({
        first: async () => {
          if (query.includes('FROM frms_jornada')) {
            if (options.noJornada && !autoJornadaCreated) return null;
            return {
              id: options.noJornada ? 'jornada-auto' : 'jornada-1',
              tripulante_id: 1,
              data: '2026-05-28',
              status: 'ES',
              origem: 'SIGVOOS',
              horas_voo_minutos: 120,
              hora_corte_motor: '14:00',
              hora_termino: '14:00',
            };
          }
          if (query.includes('FROM frms_fatorizacao_jornada')) {
            return { effectiveness_pct: options.previousEffectiveness ?? 85 };
          }
          if (query.includes("tipo = 'FRMS_SYNC'")) {
            return options.existingSyncEventId ? { id: options.existingSyncEventId } : null;
          }
          if (query.includes('FROM frms_fadiga_evento')) return null;
          return null;
        },
        run: async () => {
          if (query.includes('INSERT OR IGNORE INTO frms_jornada')) {
            autoJornadaCreated = true;
          }
          if (query.includes('INSERT INTO frms_fadiga_evento')) {
            const tipo = /VALUES \(\?, \?, \?, '([^']+)'/.exec(query)?.[1] ?? 'UNKNOWN';
            eventInserts.push({
              tipo,
              payload: JSON.parse(String(bindArgs[3] ?? '{}')) as Record<string, unknown>,
            });
          }
          if (query.includes('UPDATE frms_fadiga_evento')) {
            eventUpdates.push({
              payload: JSON.parse(String(bindArgs[0] ?? '{}')) as Record<string, unknown>,
              id: String(bindArgs[1] ?? ''),
            });
          }
          return { success: true };
        },
      }),
    }),
  } as unknown as D1Database;

  return { db, eventInserts, eventUpdates };
}

beforeEach(() => {
  vi.clearAllMocks();
  recalcularPipelineMock.mockResolvedValue({
    fatorizacao: { effectiveness_pct: 72 },
    acumulo: {},
    alertas: [],
    bloqueado: false,
  } as never);
});

describe('sincronizarCheckinComFrms — check-in diário autoritativo', () => {
  it('check-in completo sem jornada permanece read-only e não cria placeholder operacional', async () => {
    const { db, eventInserts } = createDb({ noJornada: true });

    const result = await sincronizarCheckinComFrms(
      db, 'ck-1', 1, '2026-05-28', 7, 10, '06:30', '08:00',
    );

    expect(result).toEqual({ sincronizado: false });
    expect(eventInserts.some((event) => event.tipo === 'CHECKIN_SEM_JORNADA')).toBe(true);
    expect(recalcularPipelineMock).not.toHaveBeenCalled();
  });

  it('sem jornada e com check-in incompleto continua fail-closed', async () => {
    const { db, eventInserts } = createDb({ noJornada: true });

    const result = await sincronizarCheckinComFrms(
      db, 'ck-missing', 1, '2026-05-28', 7, 10, '06:30', null,
    );

    expect(result).toEqual({ sincronizado: false });
    expect(eventInserts.some((event) => event.tipo === 'CHECKIN_SEM_JORNADA')).toBe(true);
    expect(recalcularPipelineMock).not.toHaveBeenCalled();
  });

  it.each([
    { wake: null, presentation: '08:00' },
    { wake: '06:30', presentation: null },
    { wake: '06:30', presentation: '08:00', sleep: 0 },
  ])('falha fechado com check-in incompleto: %o', async ({ wake, presentation, sleep = 7 }) => {
    const { db, eventInserts } = createDb();

    const result = await sincronizarCheckinComFrms(
      db, 'ck-incomplete', 1, '2026-05-28', sleep, 10, wake, presentation,
    );

    expect(result).toMatchObject({ sincronizado: false, jornada_id: 'jornada-1' });
    expect(eventInserts.some((event) => event.tipo === 'FRMS_RECALCULO_NECESSARIO')).toBe(true);
    expect(recalcularPipelineMock).not.toHaveBeenCalled();
  });

  it('com check-in completo delega ao pipeline canônico e registra provenance real', async () => {
    const { db, eventInserts } = createDb({ previousEffectiveness: 85 });

    const result = await sincronizarCheckinComFrms(
      db, 'ck-complete', 1, '2026-05-28', 7, 10, '06:30', '08:00',
    );

    expect(recalcularPipelineMock).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      sincronizado: true,
      jornada_id: 'jornada-1',
      effectiveness_anterior: 85,
      effectiveness_nova: 72,
      delta_effectiveness: -13,
    });

    const syncEvent = eventInserts.find((event) => event.tipo === 'FRMS_SYNC');
    expect(syncEvent?.payload).toMatchObject({
      formula_version: 'FRMS_DAILY_CHECKIN_AUTHORITY_V1',
      jornada_id: 'jornada-1',
      checkin_id: 'ck-complete',
      presentation_time_source: 'CREW_REPORTED',
      wake_time_source: 'CREW_REPORTED',
      sleep_source: 'CREW_REPORTED',
      hora_apresentacao_efetiva: '08:00',
      hora_despertar_real: '06:30',
      horas_sono_24h: 7,
    });
    expect(JSON.stringify(syncEvent?.payload)).not.toMatch(/apto_para_voo|NAO_APTO|bloqueio/i);
  });

  it('mantém sincronizado=false quando o pipeline não produz effectiveness', async () => {
    recalcularPipelineMock.mockResolvedValueOnce({
      fatorizacao: { effectiveness_pct: null },
      acumulo: {},
      alertas: [],
      bloqueado: false,
    } as never);
    const { db } = createDb({ previousEffectiveness: 85 });

    const result = await sincronizarCheckinComFrms(
      db, 'ck-null', 1, '2026-05-28', 7, 10, '06:30', '08:00',
    );

    expect(result).toMatchObject({
      sincronizado: false,
      effectiveness_nova: null,
      delta_effectiveness: null,
    });
  });

  it('atualiza o evento FRMS_SYNC existente em vez de duplicar', async () => {
    const { db, eventInserts, eventUpdates } = createDb({
      existingSyncEventId: 'event-sync-1',
    });

    await sincronizarCheckinComFrms(
      db, 'ck-repeat', 1, '2026-05-28', 7, 10, '06:30', '08:00',
    );

    expect(eventInserts.some((event) => event.tipo === 'FRMS_SYNC')).toBe(false);
    expect(eventUpdates).toHaveLength(1);
    expect(eventUpdates[0].id).toBe('event-sync-1');
    expect(eventUpdates[0].payload).toMatchObject({ checkin_id: 'ck-repeat' });
  });

  it('propaga erro do pipeline governado sem fabricar fallback local', async () => {
    const governedError = Object.assign(new Error('FRMS_CONTEXT_UNAVAILABLE'), {
      code: 'FRMS_CONTEXT_UNAVAILABLE',
    });
    recalcularPipelineMock.mockRejectedValueOnce(governedError);
    const { db, eventInserts } = createDb();

    await expect(
      sincronizarCheckinComFrms(
        db, 'ck-error', 1, '2026-05-28', 7, 10, '06:30', '08:00',
      ),
    ).rejects.toMatchObject({ code: 'FRMS_CONTEXT_UNAVAILABLE' });

    expect(eventInserts.some((event) => event.tipo === 'FRMS_SYNC')).toBe(false);
  });
});

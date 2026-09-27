import { beforeEach, describe, expect, it, vi } from 'vitest';

const activityRowsMock = vi.hoisted(() => vi.fn());
vi.mock('../../lib/frms/activity-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/frms/activity-context')>();
  return { ...actual, loadFrmsActivityRows: activityRowsMock };
});

import { loadLegalWorkMonth } from '../../lib/frms/legal-work-service';

describe('FRMS legal work service', () => {
  beforeEach(() => {
    activityRowsMock.mockReset();
    activityRowsMock.mockResolvedValue([{
      data_operacional: '2026-09-10',
      funcionario_id: 8,
      activity_type: 'TREINAMENTO',
      hora_inicio: '08:00',
      hora_fim: '10:00',
      titulo: 'CRM',
      source_id: 80,
      source_activity_type: 'TREINAMENTO',
      legal_work_factor: 1,
    }]);
  });

  it('uses only canonical SIGVOOS journeys and includes activity-only crew', async () => {
    const queries: Array<{ sql: string; binds: unknown[] }> = [];
    const db = {
      prepare: vi.fn((sql: string) => ({
        bind: (...binds: unknown[]) => ({
          all: async () => {
            queries.push({ sql, binds });
            if (sql.includes('FROM frms_jornada j')) {
              return { results: [{
                tripulante_id: 7,
                data: '2026-09-05',
                hora_apresentacao: '08:00',
                hora_termino: '12:00',
                duracao_jornada_minutos: 240,
                horas_voo_minutos: 120,
              }] };
            }
            if (sql.includes('FROM funcionarios')) {
              return { results: [
                { id: 7, nome: 'Trip 7', guerra: 'T7', funcao: 'PIC' },
                { id: 8, nome: 'Trip 8', guerra: 'T8', funcao: 'SIC' },
              ] };
            }
            throw new Error(`Unexpected query: ${sql}`);
          },
        }),
      })),
    } as unknown as D1Database;

    const rows = await loadLegalWorkMonth(db, 42, '2026-09');
    expect(rows.map((row) => row.tripulante_id)).toEqual([7, 8]);
    expect(rows.find((row) => row.tripulante_id === 7)).toMatchObject({
      trabalho_mes_min: 240,
      voo_mes_min: 120,
    });
    expect(rows.find((row) => row.tripulante_id === 8)).toMatchObject({
      trabalho_mes_min: 120,
      voo_mes_min: 0,
      dias_com_jornada: 0,
    });

    const journeyQuery = queries.find((query) => query.sql.includes('FROM frms_jornada j'));
    expect(journeyQuery?.sql).toContain("UPPER(COALESCE(j.origem, '')) = 'SIGVOOS'");
    expect(journeyQuery?.binds[0]).toBe(42);
    expect(activityRowsMock).toHaveBeenCalledWith(db, 42, '2026-08-12', '2026-09-30');
  });
});

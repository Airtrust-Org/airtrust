import { describe, expect, it, vi } from 'vitest';

import {
  getTaxaConclusaoMensalMetricRows,
  getUtilizacaoSimuladoresMetricRows,
} from '../../repositories/dashboardMetricsRepository';

type QueryCall = { query: string; args: unknown[] };

describe('dashboardMetricsRepository', () => {
  it('requires explicit empresaId for taxa conclusao mensal', async () => {
    const db = { prepare: vi.fn() } as unknown as D1Database;

    await expect(getTaxaConclusaoMensalMetricRows(db, Number.NaN)).rejects.toThrow(
      'requires explicit empresaId',
    );
    expect(db.prepare).not.toHaveBeenCalled();
  });

  it('preserves tenant, soft-delete and completed status compatibility in taxa conclusao mensal', async () => {
    const calls: QueryCall[] = [];
    const db = {
      prepare: vi.fn((query: string) => ({
        bind: (...args: unknown[]) => {
          calls.push({ query, args });
          return {
            all: async () => ({
              results: [{ mes: '2026-05', taxa: 91.2 }],
            }),
          };
        },
      })),
    } as unknown as D1Database;

    const rows = await getTaxaConclusaoMensalMetricRows(db, 33);

    expect(rows).toEqual([{ mes: '2026-05', taxa: 91.2 }]);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.args).toEqual([33]);
    expect(calls[0]?.query).toContain('empresa_id = ?');
    expect(calls[0]?.query).toContain('deleted_at IS NULL');
    expect(calls[0]?.query).toContain("status IN ('CONCLUIDA', 'CONCLUIDO')");
  });

  it('preserves tenant, soft-delete and cancelled exclusion in utilizacao simuladores', async () => {
    const calls: QueryCall[] = [];
    const db = {
      prepare: vi.fn((query: string) => ({
        bind: (...args: unknown[]) => {
          calls.push({ query, args });
          return {
            all: async () => ({
              results: [
                {
                  id: 1,
                  nome: 'SIM-A',
                  fabricante: 'CAE',
                  modelo: 'A320',
                  horas_programadas: 12,
                  horas_disponiveis: 720,
                  taxa_utilizacao: 2,
                  status: 'operacional',
                },
              ],
            }),
          };
        },
      })),
    } as unknown as D1Database;

    const rows = await getUtilizacaoSimuladoresMetricRows(db, 19);

    expect(rows).toHaveLength(1);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.args).toEqual([19, 19]);
    expect(calls[0]?.query).toContain('s.empresa_id = ?');
    expect(calls[0]?.query).toContain('sa.empresa_id = ?');
    expect(calls[0]?.query).toContain('sa.deleted_at IS NULL');
    expect(calls[0]?.query).toContain('s.deleted_at IS NULL');
    expect(calls[0]?.query).toContain("sa.status IN ('AGENDADO', 'AGENDADA', 'CONCLUIDA', 'CONCLUIDO')");
    expect(calls[0]?.query).not.toContain('CANCELADA');
    expect(calls[0]?.query).not.toContain('CANCELADO');
  });
});

import { describe, expect, it, vi } from 'vitest';

import {
  getTaxaConclusaoMensal,
  getUtilizacaoSimuladores,
} from '../../services/dashboardService';

type QueryCall = { query: string; args: unknown[] };

describe('dashboard metrics integrity service', () => {
  it('enforce tenant + soft-delete + status concluida in taxa conclusao mensal', async () => {
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

    const result = await getTaxaConclusaoMensal(db, 33);

    expect(result.meses).toEqual(['Mai']);
    expect(result.taxas).toEqual([91]);
    expect(calls).toHaveLength(1);

    const [{ query, args }] = calls;
    expect(args).toEqual([33]);
    expect(query).toContain('empresa_id = ?');
    expect(query).toContain('deleted_at IS NULL');
    expect(query).toContain("status IN ('CONCLUIDA', 'CONCLUIDO')");
  });

  it('enforce tenant + soft-delete + cancelled exclusion in utilizacao simuladores', async () => {
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

    const result = await getUtilizacaoSimuladores(db, 19);

    expect(result.simuladores).toHaveLength(1);
    expect(calls).toHaveLength(1);

    const [{ query, args }] = calls;
    expect(args).toEqual([19, 19]);
    expect(query).toContain('s.empresa_id = ?');
    expect(query).toContain('sa.empresa_id = ?');
    expect(query).toContain('sa.deleted_at IS NULL');
    expect(query).toContain('s.deleted_at IS NULL');
    expect(query).toContain("sa.status IN ('AGENDADO', 'CONCLUIDA', 'CONCLUIDO')");
    expect(query).not.toContain('CANCELADA');
  });
});

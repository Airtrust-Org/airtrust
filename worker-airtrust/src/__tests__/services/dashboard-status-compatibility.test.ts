import { describe, expect, it, vi } from 'vitest';

import {
  getDemandaTreinamento,
  getTaxaConclusaoMensal,
  getUtilizacaoSimuladores,
} from '../../services/dashboardService';

type QueryCall = { query: string; args: unknown[] };

describe('dashboard status compatibility', () => {
  it('keeps completed session metrics compatible with CONCLUIDA and CONCLUIDO', async () => {
    const calls: QueryCall[] = [];
    const db = {
      prepare: vi.fn((query: string) => ({
        bind: (...args: unknown[]) => {
          calls.push({ query, args });
          return {
            all: async () => ({ results: [{ mes: '2026-05', taxa: 100 }] }),
          };
        },
      })),
    } as unknown as D1Database;

    await getTaxaConclusaoMensal(db, 6);

    expect(calls[0]?.query).toContain("status IN ('CONCLUIDA', 'CONCLUIDO')");
  });

  it('keeps future-demand queries compatible with PT and EN scheduled statuses', async () => {
    const calls: QueryCall[] = [];
    const db = {
      prepare: vi.fn((query: string) => ({
        bind: (...args: unknown[]) => {
          calls.push({ query, args });
          if (query.includes('GROUP BY tipo_sessao')) {
            return { all: async () => ({ results: [] }) };
          }
          if (query.includes('GROUP BY s.id, s.nome')) {
            return { all: async () => ({ results: [] }) };
          }
          if (query.includes('GROUP BY sa.instrutor_id, f.nome')) {
            return { all: async () => ({ results: [] }) };
          }
          return {
            first: async () => ({ proximos_30: 0, dias_31_60: 0, dias_61_90: 0, total: 0 }),
          };
        },
      })),
    } as unknown as D1Database;

    await getDemandaTreinamento(db, 9);

    const demandQueries = calls.map((call) => call.query).join('\n');
    expect(demandQueries).toContain("status IN ('AGENDADO', 'PENDENTE', 'AGENDADA', 'PENDING')");
  });

  it('keeps simulator utilization compatible with legacy completed and scheduled variants', async () => {
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
                  nome: 'SIM-01',
                  fabricante: 'CAE',
                  modelo: 'AW139',
                  horas_programadas: 4,
                  horas_disponiveis: 720,
                  taxa_utilizacao: 1,
                  status: 'operacional',
                },
              ],
            }),
          };
        },
      })),
    } as unknown as D1Database;

    await getUtilizacaoSimuladores(db, 11);

    expect(calls[0]?.query).toContain("sa.status IN ('AGENDADO', 'AGENDADA', 'CONCLUIDA', 'CONCLUIDO')");
    expect(calls[0]?.query).not.toContain('CANCELADO');
    expect(calls[0]?.query).not.toContain('CANCELADA');
  });
});

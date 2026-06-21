import { describe, expect, it, vi } from 'vitest';

import {
  getDashboardSimuladoresAlerts,
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

    const result = await getTaxaConclusaoMensal(db, 33, {
      mode: 'restricted',
      setorIds: [4, 9],
      funcionarioId: null,
    });

    expect(result.meses).toEqual(['Mai']);
    expect(result.taxas).toEqual([91]);
    expect(calls).toHaveLength(1);

    const [{ query, args }] = calls;
    expect(args).toEqual([33, 4, 9]);
    expect(query).toContain('empresa_id = ?');
    expect(query).toContain('deleted_at IS NULL');
    expect(query).toContain("status IN ('CONCLUIDA', 'CONCLUIDO')");
    expect(query).toContain('FROM sessoes_participantes sp_scope');
    expect(query).toContain('f_scope.setor_id IN (?, ?)');
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

    const result = await getUtilizacaoSimuladores(db, 19, {
      mode: 'restricted',
      setorIds: [7],
      funcionarioId: null,
    });

    expect(result.simuladores).toHaveLength(1);
    expect(calls).toHaveLength(1);

    const [{ query, args }] = calls;
    expect(args).toEqual([19, 7, 19]);
    expect(query).toContain('s.empresa_id = ?');
    expect(query).toContain('sa.empresa_id = ?');
    expect(query).toContain('sa.deleted_at IS NULL');
    expect(query).toContain('s.deleted_at IS NULL');
    expect(query).toContain("sa.status IN ('AGENDADO', 'AGENDADA', 'CONCLUIDA', 'CONCLUIDO')");
    expect(query).not.toContain('CANCELADA');
    expect(query).toContain('FROM sessoes_participantes sp_scope');
    expect(query).toContain('f_scope.setor_id IN (?)');
  });

  it('fails closed for empty manager scope in taxa conclusao mensal', async () => {
    const calls: QueryCall[] = [];
    const db = {
      prepare: vi.fn((query: string) => ({
        bind: (...args: unknown[]) => {
          calls.push({ query, args });
          return {
            all: async () => ({ results: [] }),
          };
        },
      })),
    } as unknown as D1Database;

    await getTaxaConclusaoMensal(db, 21, {
      mode: 'restricted',
      setorIds: [],
      funcionarioId: null,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.args).toEqual([21]);
    expect(calls[0]?.query).toContain('1 = 0');
  });

  it('resume alertas operacionais de simuladores sem PII e com fallback de edicoes', async () => {
    const calls: QueryCall[] = [];
    const firstQueue = [
      { name: 'fichas_sessao_edicoes' },
      {
        fichas_pendentes_avaliacao: 2,
        fichas_aguardando_assinatura_aluno: 1,
        fichas_aguardando_assinatura_instrutor: 3,
      },
      { total: 4 },
      { total: 5 },
    ];

    const db = {
      prepare: vi.fn((query: string) => ({
        bind: (...args: unknown[]) => {
          calls.push({ query, args });
          const row = firstQueue.shift() ?? null;
          return {
            first: async () => row,
          };
        },
      })),
    } as unknown as D1Database;

    const result = await getDashboardSimuladoresAlerts(db, 12, {
      mode: 'restricted',
      setorIds: [3],
      funcionarioId: null,
    });

    expect(result).toEqual({
      fichas_pendentes_avaliacao: 2,
      fichas_aguardando_assinatura_aluno: 1,
      fichas_aguardando_assinatura_instrutor: 3,
      fichas_aguardando_assinatura: 4,
      sessoes_proximas_sem_ficha_completa: 4,
      edicoes_pendentes: 5,
      janela_sessoes_proximas_horas: 24,
    });
    expect(calls[0]?.args).toEqual(['fichas_sessao_edicoes']);
    expect(calls[1]?.query).toContain('AVALIACAO_PENDENTE');
    expect(calls[2]?.query).toContain('COUNT(*) AS total');
    expect(calls[3]?.query).toContain("fe.status = 'PENDENTE'");
  });
});

import { describe, expect, it, vi } from 'vitest';

import {
  getDashboardSimuladoresAlertas,
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

  it('aggregates simuladores alertas with tenant scope, started-session gating and pending edits', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-21T15:30:00.000Z'));

    const calls: QueryCall[] = [];
    const db = {
      prepare: vi.fn((query: string) => ({
        bind: (...args: unknown[]) => {
          calls.push({ query, args });
          return {
            first: async () => {
              if (query.includes('sqlite_master')) {
                return { name: 'fichas_sessao_edicoes' };
              }

              if (query.includes('fichas_pendentes_avaliacao')) {
                return {
                  fichas_pendentes_avaliacao: 2,
                  fichas_aguardando_assinatura_aluno: 1,
                  fichas_aguardando_assinatura_instrutor: 3,
                };
              }

              if (query.includes('NOT EXISTS')) {
                return { total: 4 };
              }

              if (query.includes('FROM fichas_sessao_edicoes fe')) {
                return { total: 1 };
              }

              return null;
            },
          };
        },
      })),
    } as unknown as D1Database;

    const result = await getDashboardSimuladoresAlertas(db, 55, {
      mode: 'restricted',
      setorIds: [12],
      funcionarioId: null,
    });

    expect(result).toEqual({
      fichas_pendentes_avaliacao: 2,
      fichas_aguardando_assinatura_aluno: 1,
      fichas_aguardando_assinatura_instrutor: 3,
      fichas_aguardando_assinatura: 4,
      sessoes_proximas_sem_ficha_completa: 4,
      edicoes_pendentes: 1,
      janela_sessoes_proximas_horas: 24,
    });
    expect(calls).toHaveLength(4);

    const fichaResumoCall = calls.find((call) => call.query.includes('fichas_pendentes_avaliacao'));
    expect(fichaResumoCall?.args).toEqual(['2026-06-21 12:30', 55, 12]);
    expect(fichaResumoCall?.query).toContain("= 'AVALIACAO_PENDENTE'");
    expect(fichaResumoCall?.query).toContain("= 'AGUARDANDO_ASSINATURA_ALUNO'");
    expect(fichaResumoCall?.query).toContain("= 'AGUARDANDO_ASSINATURA_INSTRUTOR'");
    expect(fichaResumoCall?.query).toContain("status, '')) IN ('CONCLUIDA', 'CONCLUIDO')");
    expect(fichaResumoCall?.query).toContain('aluno.setor_id IN (?)');

    const sessoesCall = calls.find((call) => call.query.includes('NOT EXISTS'));
    expect(sessoesCall?.args).toEqual([55, 12, '2026-06-21 12:30', '2026-06-22 12:30']);
    expect(sessoesCall?.query).toContain(
      "IN ('AGENDADO', 'AGENDADA', 'PENDENTE', 'PENDING', 'CONFIRMADO', 'CONFIRMADA')",
    );
    expect(sessoesCall?.query).toContain("IN ('APROVADO', 'NAO_APROVADO')");
    expect(sessoesCall?.query).toContain('FROM sessoes_participantes sp_scope');
    expect(sessoesCall?.query).toContain('f_scope.setor_id IN (?)');

    const edicoesCall = calls.find((call) => call.query.includes('FROM fichas_sessao_edicoes fe'));
    expect(edicoesCall?.args).toEqual([55, 12]);
    expect(edicoesCall?.query).toContain("fe.status = 'PENDENTE'");
    expect(edicoesCall?.query).toContain('aluno.setor_id IN (?)');

    vi.useRealTimers();
  });

  it('returns zero pending edits when fichas_sessao_edicoes is unavailable', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-21T15:30:00.000Z'));

    const calls: QueryCall[] = [];
    const db = {
      prepare: vi.fn((query: string) => ({
        bind: (...args: unknown[]) => {
          calls.push({ query, args });
          return {
            first: async () => {
              if (query.includes('sqlite_master')) {
                return null;
              }

              if (query.includes('fichas_pendentes_avaliacao')) {
                return {
                  fichas_pendentes_avaliacao: 0,
                  fichas_aguardando_assinatura_aluno: 0,
                  fichas_aguardando_assinatura_instrutor: 0,
                };
              }

              if (query.includes('NOT EXISTS')) {
                return { total: 0 };
              }

              return null;
            },
          };
        },
      })),
    } as unknown as D1Database;

    const result = await getDashboardSimuladoresAlertas(db, 77, {
      mode: 'restricted',
      setorIds: [],
      funcionarioId: null,
    });

    expect(result.edicoes_pendentes).toBe(0);
    expect(calls.some((call) => call.query.includes('FROM fichas_sessao_edicoes fe'))).toBe(false);
    expect(
      calls.find((call) => call.query.includes('fichas_pendentes_avaliacao'))?.query,
    ).toContain('1 = 0');
    expect(calls.find((call) => call.query.includes('NOT EXISTS'))?.query).toContain('1 = 0');

    vi.useRealTimers();
  });
});

import { describe, expect, it, vi } from 'vitest';

vi.mock('../../utils/qualificacoes-alerta-config', () => ({
  getQualificacoesAlertaDias: vi.fn(async () => 30),
  getTodayIsoSaoPaulo: vi.fn(() => '2026-05-26'),
  getQualificacoesVencimentoExpr: vi.fn(
    () => `COALESCE(qh.data_vencimento, CASE WHEN qh.data_conclusao IS NOT NULL AND (qh.validade_meses IS NOT NULL OR qt.validade IS NOT NULL) THEN date(qh.data_conclusao, '+' || COALESCE(qh.validade_meses, qt.validade) || ' months') ELSE NULL END)`,
  ),
}));

import {
  getAtividadesRecentes,
  getComplianceScore,
  getDashboardMetrics,
} from '../../services/dashboardService';

type QueryCall = { query: string; args: unknown[] };

function createDbForMetricsAndCompliance(calls: QueryCall[]) {
  const db = {
    prepare: vi.fn((query: string) => ({
      bind: (...args: unknown[]) => {
        calls.push({ query, args });

        if (query.includes('FROM funcionarios') && query.includes('COUNT(*) as total')) {
          return { first: async () => ({ total: 12 }) };
        }
        if (query.includes('total_qualificacoes')) {
          return {
            first: async () => ({
              total_qualificacoes: 20,
              validas: 18,
              vencendo_30: 2,
              vencidas: 1,
              tripulantes_vencendo: 2,
              tripulantes_vencidos: 1,
            }),
          };
        }
        if (query.includes("strftime('%Y-%m', date('now', '-1 month'))")) {
          return { first: async () => ({ taxa_conclusao: 82 }) };
        }
        if (query.includes("strftime('%Y-%m', date('now', '-2 months'))")) {
          return { first: async () => ({ taxa: 77 }) };
        }
        if (query.includes('COUNT(CASE WHEN data BETWEEN date(\'now\')')) {
          return {
            first: async () => ({ proximos_30: 4, dias_31_60: 3, dias_61_90: 2 }),
          };
        }
        if (query.includes('FROM lms_cursos c')) {
          return {
            first: async () => ({
              total_cursos: 6,
              total_matriculas: 14,
              concluidos: 10,
              em_andamento: 4,
              taxa_conclusao_pct: 71.4,
            }),
          };
        }
        if (query.includes('percentual_qualificacoes_validas_anterior')) {
          return { first: async () => ({ percentual_qualificacoes_validas_anterior: 90 }) };
        }
        if (query.includes('percentual_qualificacoes_validas')) {
          return {
            first: async () => ({
              percentual_qualificacoes_validas: 95,
              total_qualificacoes: 100,
              qualificacoes_validas: 95,
            }),
          };
        }
        if (query.includes('percentual_sessoes_concluidas')) {
          return { first: async () => ({ percentual_sessoes_concluidas: 88 }) };
        }
        if (query.includes('percentual_lms_concluido')) {
          return { first: async () => ({ percentual_lms_concluido: 84 }) };
        }

        return {
          first: async () => ({}),
          all: async () => ({ results: [] }),
        };
      },
    })),
  } as unknown as D1Database;

  return db;
}

describe('dashboard home reliability fixes', () => {
  it('garante bind de empresa_id em queries de simuladores do dashboard', async () => {
    const calls: QueryCall[] = [];
    const db = createDbForMetricsAndCompliance(calls);

    await getDashboardMetrics(db, 77);
    await getComplianceScore(db, 77);

    const taxaAtual = calls.find((call) =>
      call.query.includes("strftime('%Y-%m', date('now', '-1 month'))"),
    );
    const taxaAnterior = calls.find((call) =>
      call.query.includes("strftime('%Y-%m', date('now', '-2 months'))"),
    );
    const demanda = calls.find(
      (call) =>
        call.query.includes("status IN ('AGENDADO', 'PENDENTE', 'AGENDADA', 'PENDING')") &&
        call.query.includes("data >= date('now')"),
    );
    const complianceSimuladores = calls.find((call) =>
      call.query.includes('percentual_sessoes_concluidas'),
    );

    expect(taxaAtual?.args).toEqual([77]);
    expect(taxaAnterior?.args).toEqual([77]);
    expect(demanda?.args).toEqual([77]);
    expect(complianceSimuladores?.args).toEqual([77, 77]);
  });

  it('propaga erro em atividades recentes para evitar sucesso silencioso', async () => {
    const db = {
      prepare: vi.fn((_query: string) => ({
        bind: (..._args: unknown[]) => ({
          all: async () => {
            throw new Error('db failure');
          },
        }),
      })),
    } as unknown as D1Database;

    await expect(getAtividadesRecentes(db, 7)).rejects.toThrow('db failure');
  });
});

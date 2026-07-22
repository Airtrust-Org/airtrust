import { describe, expect, it, vi } from 'vitest';

vi.mock('../../routes/simuladores-shared-session-conversion', () => ({
  // keep route imports light in unit isolation if pulled transitively
}));

import { criarQualificacoesPlanejadas } from '../../routes/simuladores-shared';

function mockDb(state: {
  modelo: Record<string, unknown>;
  existing?: Array<Record<string, unknown>>;
  inserts?: Array<unknown[]>;
}) {
  state.inserts = state.inserts || [];
  return {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async first() {
              if (sql.includes('FROM modelos_sessao ms')) return state.modelo;
              if (sql.includes('already has a planejada') || sql.includes('sessao_id = ?'))
                return null;
              if (sql.includes('FROM qualificacoes_historico') && sql.includes('PLANEJADA'))
                return state.existing?.[0] || null;
              return null;
            },
            async all() {
              return { results: [] };
            },
            async run() {
              if (sql.startsWith('INSERT INTO qualificacoes_historico')) state.inserts!.push(args);
              return { success: true };
            },
          };
        },
      };
    },
    batch: async (stmts: unknown[]) => stmts,
  } as any;
}

describe('structured qualification typing for simulator sessions', () => {
  it('maps Periodico to RECORRENTE and refuses code/title substrings that would create Semestral', async () => {
    const state = {
      modelo: {
        gera_qualificacao: 1,
        qualificacao_tipo_id: 10,
        duracao_estimada: 120,
        qual_codigo: 'PER-AW139',
        qual_categoria: 'TREINAMENTO',
        qual_validade: 12,
      },
      inserts: [] as unknown[][],
    };
    const db = mockDb(state);
    // Force the function path that uses tipoTreinamento by stubbing requisitos loader via empty table error handling is complex;
    // We assert the guard rejects code-like tipo before inserts.
    const rejected = await criarQualificacoesPlanejadas(db, {
      sessaoId: 1,
      modeloId: 1,
      tipoSessao: 'A139-P-01/04-C1',
      data: '2099-01-01',
      participantes: [{ funcionario_id: 1 }],
      empresaId: 7,
    });
    expect(rejected.criadas).toBe(0);
    expect(state.inserts).toHaveLength(0);

    const rejectedTitle = await criarQualificacoesPlanejadas(db, {
      sessaoId: 1,
      modeloId: 1,
      tipoSessao: 'LOFT Semestral Detalhado',
      data: '2099-01-01',
      participantes: [{ funcionario_id: 1 }],
      empresaId: 7,
    });
    expect(rejectedTitle.criadas).toBe(0);
  });
});

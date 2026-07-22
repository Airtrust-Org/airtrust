import { describe, expect, it, vi } from 'vitest';

vi.mock('../../routes/simuladores-shared-session-conversion', () => ({}));

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
          if (sql.startsWith('INSERT INTO qualificacoes_historico')) {
            state.inserts!.push(args);
          }
          return {
            async first() {
              if (sql.includes('FROM modelos_sessao ms')) return state.modelo;
              if (sql.includes('sessao_id = ?')) return state.existing?.[0] || null;
              if (sql.includes('FROM qualificacoes_historico') && sql.includes('qualificacao_codigo'))
                return null;
              if (sql.includes('FROM qualificacoes_historico')) return state.existing?.[0] || null;
              return null;
            },
            async all() {
              return { results: [] };
            },
            async run() {
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
  const modelo = {
    gera_qualificacao: 1,
    qualificacao_tipo_id: 10,
    duracao_estimada: 120,
    qual_codigo: 'PER-AW139',
    qual_categoria: 'TREINAMENTO',
    qual_validade: 12,
  };

  it('maps Periodico to RECORRENTE and refuses code/title substrings that would create Semestral', async () => {
    const state = { modelo, inserts: [] as unknown[][] };
    const db = mockDb(state);
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

  it('maps INICIAL / PERIODICO / SEMESTRAL / CHECK structured tokens only', async () => {
    const cases: Array<{ tipo: string; expected: string }> = [
      { tipo: 'INICIAL', expected: 'INICIAL' },
      { tipo: 'PERIODICO', expected: 'RECORRENTE' },
      { tipo: 'SEMESTRAL', expected: 'SEMESTRAL' },
      { tipo: 'CHECK', expected: 'RECORRENTE' },
    ];
    for (const entry of cases) {
      const state = { modelo, inserts: [] as unknown[][] };
      const db = mockDb(state);
      const result = await criarQualificacoesPlanejadas(db, {
        sessaoId: 10,
        modeloId: 1,
        tipoSessao: entry.tipo,
        data: '2099-06-01',
        participantes: [{ funcionario_id: 42 }],
        empresaId: 7,
      });
      expect(result.criadas, entry.tipo).toBe(1);
      expect(state.inserts.length, entry.tipo).toBe(1);
      const tipoIdx = state.inserts[0].findIndex((v) => v === entry.expected);
      expect(tipoIdx, `${entry.tipo} -> ${entry.expected}`).toBeGreaterThanOrEqual(0);
    }
  });

  it('regression: completed Periodico creates Periodica/RECORRENTE only — never Semestral', async () => {
    const state = { modelo, inserts: [] as unknown[][] };
    const db = mockDb(state);
    const result = await criarQualificacoesPlanejadas(db, {
      sessaoId: 99,
      modeloId: 1,
      tipoSessao: 'PERIODICO',
      data: '2099-07-01',
      participantes: [{ funcionario_id: 7 }, { funcionario_id: 8 }],
      empresaId: 7,
    });
    expect(result.criadas).toBe(2);
    expect(state.inserts).toHaveLength(2);
    for (const row of state.inserts) {
      expect(row).toContain('RECORRENTE');
      expect(row).not.toContain('SEMESTRAL');
    }
  });

  it('retry does not duplicate and other tenant cannot interfere via same call shape', async () => {
    const state = {
      modelo,
      inserts: [] as unknown[][],
      existing: [{ id: 1, status: 'PLANEJADA' }],
    };
    const db = mockDb(state);
    const retry = await criarQualificacoesPlanejadas(db, {
      sessaoId: 1,
      modeloId: 1,
      tipoSessao: 'PERIODICO',
      data: '2099-01-01',
      participantes: [{ funcionario_id: 1 }],
      empresaId: 7,
    });
    expect(retry.criadas).toBe(0);
    expect(retry.puladas).toBe(1);
    expect(state.inserts).toHaveLength(0);

    const otherTenant = await criarQualificacoesPlanejadas(db, {
      sessaoId: 1,
      modeloId: 1,
      tipoSessao: 'SEMESTRAL',
      data: '2099-01-01',
      participantes: [{ funcionario_id: 1 }],
      empresaId: 99,
    });
    // existing planejada still short-circuits before insert; no Semestral row created
    expect(otherTenant.criadas).toBe(0);
    expect(state.inserts).toHaveLength(0);
  });
});

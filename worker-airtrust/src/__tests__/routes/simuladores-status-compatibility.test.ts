import { describe, expect, it } from 'vitest';

import {
  criarQualificacoesPlanejadas,
  sincronizarQualificacoesDaSessaoConcluida,
} from '../../routes/simuladores-shared';

type HistoricoRow = {
  id: number;
  funcionario_id: number;
  qualificacao_id: number | null;
  qualificacao_codigo: string;
  categoria: string | null;
  data_conclusao: string;
  validade_meses: number | null;
  status: string;
  renovada: number;
  carga_horaria: number | null;
  tipo_treinamento: string | null;
  empresa_id: number;
  sessao_id: number | null;
  data_confirmacao: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

type ModeloState = {
  id: number;
  gera_qualificacao: number;
  qualificacao_tipo_id: number | null;
  duracao_estimada: number | null;
  qual_codigo: string | null;
  qual_categoria: string | null;
  qual_validade: number | null;
};

type FichaRow = {
  agendamento_slot_id: number;
  colaborador_id_aluno: number;
  empresa_id: number;
  status: string;
  aprovado: number | null;
  deleted_at: string | null;
};

type MockState = {
  modelos: Record<number, ModeloState>;
  historico: HistoricoRow[];
  fichas: FichaRow[];
};

function createMockDb(state: MockState): D1Database {
  return {
    prepare(query: string) {
      const sql = query.replace(/\s+/g, ' ').trim();
      return {
        bind(...args: unknown[]) {
          return {
            async all() {
              return { results: [] };
            },

            async first<T>() {
              if (sql.includes('FROM modelos_sessao ms') && sql.includes('WHERE ms.id = ?')) {
                const modeloId = Number(args.length > 1 ? args[1] : args[0]);
                return (state.modelos[modeloId] || null) as T | null;
              }

              if (sql.includes('WHERE sessao_id = ?') && sql.includes('funcionario_id = ?')) {
                const sessaoId = Number(args[0]);
                const funcionarioId = Number(args[1]);
                const row = state.historico.find(
                  (item) =>
                    item.deleted_at === null &&
                    item.sessao_id === sessaoId &&
                    item.funcionario_id === funcionarioId &&
                    !['CANCELADA', 'CANCELADO'].includes(item.status),
                );
                return ((row && { id: row.id, status: row.status }) || null) as T | null;
              }

              if (sql.includes('qualificacao_codigo = ?') && sql.includes('data_conclusao = ?')) {
                const funcionarioId = Number(args[0]);
                const codigo = String(args[1]);
                const dataConclusao = String(args[2]);
                const row = state.historico.find(
                  (item) =>
                    item.deleted_at === null &&
                    item.funcionario_id === funcionarioId &&
                    item.qualificacao_codigo === codigo &&
                    item.data_conclusao === dataConclusao,
                );
                return (
                  (row && { id: row.id, status: row.status, sessao_id: row.sessao_id }) ||
                  null
                ) as T | null;
              }

              return null as T | null;
            },

            async run() {
              if (sql.startsWith('UPDATE qualificacoes_historico') && sql.includes('SET deleted_at')) {
                const id = Number(args[0]);
                const row = state.historico.find((item) => item.id === id);
                if (row) {
                  row.deleted_at = 'now';
                  row.updated_at = 'now';
                }
                return { meta: { changes: row ? 1 : 0 } };
              }

              if (sql.startsWith('UPDATE qualificacoes_historico') && sql.includes("SET status = 'CONCLUIDA'")) {
                const sessaoId = Number(args[0]);
                const empresaId = args.length > 1 ? Number(args[1]) : null;
                let changes = 0;
                for (const row of state.historico) {
                  if (row.deleted_at !== null) continue;
                  if (row.sessao_id !== sessaoId) continue;
                  if (!['PLANEJADA', 'PLANEJADO'].includes(row.status)) continue;
                  if (empresaId !== null && row.empresa_id !== empresaId) continue;
                  const fichaAprovada = state.fichas.some(
                    (ficha) =>
                      ficha.deleted_at === null &&
                      ficha.agendamento_slot_id === row.sessao_id &&
                      ficha.colaborador_id_aluno === row.funcionario_id &&
                      ficha.empresa_id === row.empresa_id &&
                      ficha.aprovado === 1 &&
                      ['APROVADO', 'CONCLUIDA'].includes(ficha.status),
                  );
                  if (sql.includes('EXISTS (') && !fichaAprovada) continue;
                  row.status = 'CONCLUIDA';
                  row.data_confirmacao = 'now';
                  row.updated_at = 'now';
                  changes++;
                }
                return { meta: { changes } };
              }

              if (sql.startsWith('INSERT INTO qualificacoes_historico')) {
                const [funcionarioId, qualificacaoId, codigo, categoria, dataConclusao, validadeMeses, carga, tipoTreinamento, empresaId, sessaoId] =
                  args;
                const nextId = state.historico.reduce((max, row) => Math.max(max, row.id), 0) + 1;
                state.historico.push({
                  id: nextId,
                  funcionario_id: Number(funcionarioId),
                  qualificacao_id: qualificacaoId === null ? null : Number(qualificacaoId),
                  qualificacao_codigo: String(codigo),
                  categoria: categoria === null ? null : String(categoria),
                  data_conclusao: String(dataConclusao),
                  validade_meses: validadeMeses === null ? null : Number(validadeMeses),
                  status: 'PLANEJADA',
                  renovada: 0,
                  carga_horaria: carga === null ? null : Number(carga),
                  tipo_treinamento: tipoTreinamento === null ? null : String(tipoTreinamento),
                  empresa_id: Number(empresaId),
                  sessao_id: Number(sessaoId),
                  data_confirmacao: null,
                  deleted_at: null,
                  created_at: 'now',
                  updated_at: 'now',
                });
                return { meta: { changes: 1, last_row_id: nextId } };
              }

              return { meta: { changes: 0 } };
            },
          };
        },
      };
    },

    async batch(statements: Array<{ run: () => Promise<unknown> }>) {
      for (const statement of statements) {
        await statement.run();
      }
      return [];
    },
  } as unknown as D1Database;
}

function buildState(): MockState {
  return {
    modelos: {
      91: {
        id: 91,
        gera_qualificacao: 1,
        qualificacao_tipo_id: 15,
        duracao_estimada: 120,
        qual_codigo: 'PPC',
        qual_categoria: 'TREINAMENTO',
        qual_validade: 12,
      },
    },
    historico: [],
    fichas: [],
  };
}

describe('simuladores status compatibility', () => {
  it('conclui planejadas canonicas e legadas na mesma transicao de sessao', async () => {
    const state = buildState();
    state.historico.push(
      {
        id: 1,
        funcionario_id: 20,
        qualificacao_id: 15,
        qualificacao_codigo: 'PPC',
        categoria: 'TREINAMENTO',
        data_conclusao: '2026-06-10',
        validade_meses: 12,
        status: 'PLANEJADA',
        renovada: 0,
        carga_horaria: 120,
        tipo_treinamento: 'RECORRENTE',
        empresa_id: 6,
        sessao_id: 400,
        data_confirmacao: null,
        deleted_at: null,
        created_at: 'now',
        updated_at: 'now',
      },
      {
        id: 2,
        funcionario_id: 21,
        qualificacao_id: 15,
        qualificacao_codigo: 'PPC',
        categoria: 'TREINAMENTO',
        data_conclusao: '2026-06-10',
        validade_meses: 12,
        status: 'PLANEJADO',
        renovada: 0,
        carga_horaria: 120,
        tipo_treinamento: 'RECORRENTE',
        empresa_id: 6,
        sessao_id: 400,
        data_confirmacao: null,
        deleted_at: null,
        created_at: 'now',
        updated_at: 'now',
      },
    );

    state.fichas.push(
      {
        agendamento_slot_id: 400,
        colaborador_id_aluno: 20,
        empresa_id: 6,
        status: 'APROVADO',
        aprovado: 1,
        deleted_at: null,
      },
      {
        agendamento_slot_id: 400,
        colaborador_id_aluno: 21,
        empresa_id: 6,
        status: 'CONCLUIDA',
        aprovado: 1,
        deleted_at: null,
      },
    );

    const result = await sincronizarQualificacoesDaSessaoConcluida(createMockDb(state), {
      sessaoId: 400,
      empresaId: 6,
    });

    expect(result.atualizadas).toBe(2);
    expect(state.historico.map((item) => item.status)).toEqual(['CONCLUIDA', 'CONCLUIDA']);
  });

  it('recria planejada quando existe conflito legado cancelado na mesma data', async () => {
    const state = buildState();
    state.historico.push({
      id: 7,
      funcionario_id: 30,
      qualificacao_id: 15,
      qualificacao_codigo: 'PPC',
      categoria: 'TREINAMENTO',
      data_conclusao: '2099-06-20',
      validade_meses: 12,
      status: 'CANCELADO',
      renovada: 0,
      carga_horaria: 120,
      tipo_treinamento: 'RECORRENTE',
      empresa_id: 9,
      sessao_id: 500,
      data_confirmacao: null,
      deleted_at: null,
      created_at: 'now',
      updated_at: 'now',
    });

    const result = await criarQualificacoesPlanejadas(createMockDb(state), {
      sessaoId: 500,
      modeloId: 91,
      tipoSessao: 'PER',
      data: '2099-06-20',
      participantes: [{ funcionario_id: 30 }],
      empresaId: 9,
    });

    expect(result.criadas).toBe(1);
    expect(state.historico.filter((item) => item.deleted_at === null)).toHaveLength(1);
    expect(state.historico.find((item) => item.id === 7)?.deleted_at).toBe('now');
    expect(state.historico.at(-1)?.status).toBe('PLANEJADA');
  });
});

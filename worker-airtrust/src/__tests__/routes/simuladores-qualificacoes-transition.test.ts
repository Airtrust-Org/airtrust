import { describe, expect, it } from 'vitest';
import {
  criarQualificacoesPlanejadas,
  listarParticipantesDaSessaoParaQualificacao,
  sincronizarQualificacoesDaSessaoConcluida,
} from '../../routes/simuladores-shared';

type ParticipanteRow = {
  sessao_id: number;
  funcionario_id: number;
  deleted_at: string | null;
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

type FichaRow = {
  agendamento_slot_id: number;
  colaborador_id_aluno: number;
  empresa_id: number;
  status: string;
  aprovado: number | null;
  deleted_at: string | null;
};

type MockState = {
  participantes: ParticipanteRow[];
  modelos: Record<number, ModeloState>;
  historico: HistoricoRow[];
  fichas: FichaRow[];
};

function addDays(base: Date, days: number): string {
  const date = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function createMockDb(state: MockState): D1Database {
  function nowIso(): string {
    return 'now';
  }

  function uniqueByFuncionario(rows: Array<{ funcionario_id: number }>) {
    const seen = new Set<number>();
    return rows.filter((row) => {
      if (seen.has(row.funcionario_id)) return false;
      seen.add(row.funcionario_id);
      return true;
    });
  }

  return {
    prepare(query: string) {
      const sql = query.replace(/\s+/g, ' ').trim();
      return {
        bind(...args: unknown[]) {
          return {
            async all() {
              if (sql.includes('SELECT DISTINCT funcionario_id') && sql.includes('FROM sessoes_participantes')) {
                const sessaoId = Number(args[0]);
                const rows = state.participantes
                  .filter((p) => p.sessao_id === sessaoId && p.deleted_at === null)
                  .map((p) => ({ funcionario_id: p.funcionario_id }));
                return { results: uniqueByFuncionario(rows) };
              }

              return { results: [] };
            },

            async first<T>() {
              if (sql.includes('FROM modelos_sessao ms') && sql.includes('WHERE ms.id = ?')) {
                const modeloId = Number(args.length > 1 ? args[1] : args[0]);
                return (state.modelos[modeloId] || null) as T | null;
              }

              if (
                sql.includes('FROM qualificacoes_historico') &&
                sql.includes('WHERE sessao_id = ?') &&
                sql.includes('funcionario_id = ?') &&
                sql.includes('LIMIT 1')
              ) {
                const sessaoId = Number(args[0]);
                const funcionarioId = Number(args[1]);
                const row = state.historico.find((h) => {
                  if (h.deleted_at !== null) return false;
                  if (h.sessao_id !== sessaoId) return false;
                  if (h.funcionario_id !== funcionarioId) return false;
                  if (sql.includes("COALESCE(status, '') <> 'CANCELADA'") && h.status === 'CANCELADA') {
                    return false;
                  }
                  return true;
                });
                return ((row && { id: row.id, status: row.status }) || null) as T | null;
              }

              if (
                sql.includes('FROM qualificacoes_historico') &&
                sql.includes('qualificacao_codigo = ?') &&
                sql.includes('data_conclusao = ?') &&
                sql.includes('LIMIT 1')
              ) {
                const funcionarioId = Number(args[0]);
                const codigo = String(args[1]);
                const dataConclusao = String(args[2]);
                const row = state.historico.find(
                  (h) =>
                    h.deleted_at === null &&
                    h.funcionario_id === funcionarioId &&
                    h.qualificacao_codigo === codigo &&
                    h.data_conclusao === dataConclusao,
                );
                return ((row && { id: row.id, status: row.status, sessao_id: row.sessao_id }) || null) as T | null;
              }

              return null as T | null;
            },

            async run() {
              if (sql.startsWith('UPDATE qualificacoes_historico') && sql.includes('WHERE id = ?')) {
                const id = Number(args[0]);
                const row = state.historico.find((h) => h.id === id);
                if (row) {
                  row.deleted_at = nowIso();
                  row.updated_at = nowIso();
                }
                return { success: true, meta: { changes: row ? 1 : 0 } };
              }

              if (
                sql.includes("SET status = 'CONCLUIDA'") &&
                sql.includes('WHERE sessao_id = ?') &&
                sql.includes("COALESCE(status, 'PLANEJADA') = 'PLANEJADA'")
              ) {
                const sessaoId = Number(args[0]);
                const empresaId = args.length > 1 ? Number(args[1]) : null;
                let changes = 0;
                for (const row of state.historico) {
                  if (row.deleted_at !== null) continue;
                  if (row.sessao_id !== sessaoId) continue;
                  if (row.status !== 'PLANEJADA') continue;
                  if (empresaId !== null && Number.isFinite(empresaId) && row.empresa_id !== empresaId) {
                    continue;
                  }
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
                  row.data_confirmacao = nowIso();
                  row.updated_at = nowIso();
                  changes++;
                }
                return { success: true, meta: { changes } };
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
                  created_at: nowIso(),
                  updated_at: nowIso(),
                });
                return { success: true, meta: { changes: 1, last_row_id: nextId } };
              }

              return { success: true, meta: { changes: 0 } };
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

function baseState(): MockState {
  return {
    participantes: [],
    modelos: {
      78: {
        id: 78,
        gera_qualificacao: 1,
        qualificacao_tipo_id: 91,
        duracao_estimada: 120,
        qual_codigo: 'R',
        qual_categoria: 'TREINAMENTO DE VOO',
        qual_validade: 12,
      },
    },
    historico: [],
    fichas: [],
  };
}

describe('simuladores -> qualificacoes transition', () => {
  it('PLANEJADA vinculada à sessão vira CONCLUIDA sem duplicar', async () => {
    const state = baseState();
    state.participantes.push({ sessao_id: 120, funcionario_id: 19, deleted_at: null });
    const db = createMockDb(state);
    const futureDate = addDays(new Date(), 5);

    const participantes = await listarParticipantesDaSessaoParaQualificacao(db, 120);
    const created = await criarQualificacoesPlanejadas(db, {
      sessaoId: 120,
      modeloId: 78,
      tipoSessao: 'PER',
      data: futureDate,
      participantes,
      empresaId: 6,
    });

    expect(created.criadas).toBe(1);
    state.fichas.push({
      agendamento_slot_id: 120,
      colaborador_id_aluno: 19,
      empresa_id: 6,
      status: 'APROVADO',
      aprovado: 1,
      deleted_at: null,
    });

    const synced = await sincronizarQualificacoesDaSessaoConcluida(db, {
      sessaoId: 120,
      empresaId: 6,
    });

    expect(synced.atualizadas).toBe(1);
    const ativas = state.historico.filter((h) => h.deleted_at === null && h.sessao_id === 120);
    expect(ativas).toHaveLength(1);
    expect(ativas[0].status).toBe('CONCLUIDA');
  });

  it('não duplica quando já existe CONCLUIDA na mesma chave unique', async () => {
    const state = baseState();
    const futureDate = addDays(new Date(), 4);
    state.participantes.push({ sessao_id: 121, funcionario_id: 19, deleted_at: null });
    state.historico.push({
      id: 1,
      funcionario_id: 19,
      qualificacao_id: 91,
      qualificacao_codigo: 'R',
      categoria: 'TREINAMENTO DE VOO',
      data_conclusao: futureDate,
      validade_meses: 12,
      status: 'CONCLUIDA',
      renovada: 0,
      carga_horaria: 120,
      tipo_treinamento: 'RECORRENTE',
      empresa_id: 6,
      sessao_id: null,
      data_confirmacao: null,
      deleted_at: null,
      created_at: 'old',
      updated_at: 'old',
    });

    const db = createMockDb(state);
    const participantes = await listarParticipantesDaSessaoParaQualificacao(db, 121);
    const created = await criarQualificacoesPlanejadas(db, {
      sessaoId: 121,
      modeloId: 78,
      tipoSessao: 'PER',
      data: futureDate,
      participantes,
      empresaId: 6,
    });

    expect(created.criadas).toBe(0);
    expect(created.conflitosUniques).toBe(1);

    const synced = await sincronizarQualificacoesDaSessaoConcluida(db, {
      sessaoId: 121,
      empresaId: 6,
    });
    expect(synced.atualizadas).toBe(0);
  });

  it('PLANEJADA órfã compatível é tratada via regra atual (conflito unique)', async () => {
    const state = baseState();
    const futureDate = addDays(new Date(), 7);
    state.participantes.push({ sessao_id: 122, funcionario_id: 19, deleted_at: null });
    state.historico.push({
      id: 15,
      funcionario_id: 19,
      qualificacao_id: 91,
      qualificacao_codigo: 'R',
      categoria: 'TREINAMENTO DE VOO',
      data_conclusao: futureDate,
      validade_meses: 12,
      status: 'PLANEJADA',
      renovada: 0,
      carga_horaria: 120,
      tipo_treinamento: 'RECORRENTE',
      empresa_id: 6,
      sessao_id: null,
      data_confirmacao: null,
      deleted_at: null,
      created_at: 'old',
      updated_at: 'old',
    });

    const db = createMockDb(state);
    const participantes = await listarParticipantesDaSessaoParaQualificacao(db, 122);
    const created = await criarQualificacoesPlanejadas(db, {
      sessaoId: 122,
      modeloId: 78,
      tipoSessao: 'PER',
      data: futureDate,
      participantes,
      empresaId: 6,
    });

    expect(created.criadas).toBe(0);
    expect(created.conflitosUniques).toBe(1);
    expect(state.historico.filter((h) => h.deleted_at === null)).toHaveLength(1);
  });

  it('CANCELADA não bloqueia recriação de PLANEJADA ativa', async () => {
    const state = baseState();
    const futureDate = addDays(new Date(), 6);
    state.participantes.push({ sessao_id: 123, funcionario_id: 19, deleted_at: null });
    state.historico.push({
      id: 20,
      funcionario_id: 19,
      qualificacao_id: 91,
      qualificacao_codigo: 'R',
      categoria: 'TREINAMENTO DE VOO',
      data_conclusao: futureDate,
      validade_meses: 12,
      status: 'CANCELADA',
      renovada: 0,
      carga_horaria: 120,
      tipo_treinamento: 'RECORRENTE',
      empresa_id: 6,
      sessao_id: null,
      data_confirmacao: null,
      deleted_at: null,
      created_at: 'old',
      updated_at: 'old',
    });

    const db = createMockDb(state);
    const participantes = await listarParticipantesDaSessaoParaQualificacao(db, 123);
    const created = await criarQualificacoesPlanejadas(db, {
      sessaoId: 123,
      modeloId: 78,
      tipoSessao: 'PER',
      data: futureDate,
      participantes,
      empresaId: 6,
    });

    expect(created.criadas).toBe(1);
    expect(created.conflitosUniques).toBe(0);

    const canceladaAntiga = state.historico.find((h) => h.id === 20);
    expect(canceladaAntiga?.deleted_at).toBe('now');
    expect(state.historico.filter((h) => h.deleted_at === null && h.status === 'PLANEJADA')).toHaveLength(1);
  });

  it('preserva tenant-scope ao concluir por sessão', async () => {
    const state = baseState();
    state.historico.push(
      {
        id: 31,
        funcionario_id: 19,
        qualificacao_id: 91,
        qualificacao_codigo: 'R',
        categoria: 'TREINAMENTO DE VOO',
        data_conclusao: addDays(new Date(), 2),
        validade_meses: 12,
        status: 'PLANEJADA',
        renovada: 0,
        carga_horaria: 120,
        tipo_treinamento: 'RECORRENTE',
        empresa_id: 6,
        sessao_id: 200,
        data_confirmacao: null,
        deleted_at: null,
        created_at: 'old',
        updated_at: 'old',
      },
      {
        id: 32,
        funcionario_id: 44,
        qualificacao_id: 91,
        qualificacao_codigo: 'R',
        categoria: 'TREINAMENTO DE VOO',
        data_conclusao: addDays(new Date(), 2),
        validade_meses: 12,
        status: 'PLANEJADA',
        renovada: 0,
        carga_horaria: 120,
        tipo_treinamento: 'RECORRENTE',
        empresa_id: 9,
        sessao_id: 200,
        data_confirmacao: null,
        deleted_at: null,
        created_at: 'old',
        updated_at: 'old',
      },
    );

    state.fichas.push({
      agendamento_slot_id: 200,
      colaborador_id_aluno: 19,
      empresa_id: 6,
      status: 'APROVADO',
      aprovado: 1,
      deleted_at: null,
    });

    const db = createMockDb(state);
    const synced = await sincronizarQualificacoesDaSessaoConcluida(db, {
      sessaoId: 200,
      empresaId: 6,
    });

    expect(synced.atualizadas).toBe(1);
    expect(state.historico.find((h) => h.id === 31)?.status).toBe('CONCLUIDA');
    expect(state.historico.find((h) => h.id === 32)?.status).toBe('PLANEJADA');
  });

  it('conclui somente a qualificacao do participante com ficha aprovada', async () => {
    const state = baseState();
    for (const [id, funcionarioId] of [[41, 19], [42, 20]] as const) {
      state.historico.push({
        id,
        funcionario_id: funcionarioId,
        qualificacao_id: 91,
        qualificacao_codigo: 'R',
        categoria: 'TREINAMENTO DE VOO',
        data_conclusao: addDays(new Date(), 2),
        validade_meses: 12,
        status: 'PLANEJADA',
        renovada: 0,
        carga_horaria: 120,
        tipo_treinamento: 'RECORRENTE',
        empresa_id: 6,
        sessao_id: 201,
        data_confirmacao: null,
        deleted_at: null,
        created_at: 'old',
        updated_at: 'old',
      });
    }
    state.fichas.push(
      {
        agendamento_slot_id: 201,
        colaborador_id_aluno: 19,
        empresa_id: 6,
        status: 'APROVADO',
        aprovado: 1,
        deleted_at: null,
      },
      {
        agendamento_slot_id: 201,
        colaborador_id_aluno: 20,
        empresa_id: 6,
        status: 'NAO_APROVADO',
        aprovado: 0,
        deleted_at: null,
      },
    );

    const synced = await sincronizarQualificacoesDaSessaoConcluida(createMockDb(state), {
      sessaoId: 201,
      empresaId: 6,
    });

    expect(synced.atualizadas).toBe(1);
    expect(state.historico.find((h) => h.funcionario_id === 19)?.status).toBe('CONCLUIDA');
    expect(state.historico.find((h) => h.funcionario_id === 20)?.status).toBe('PLANEJADA');
  });

  it('bloqueia planejada em data passada e permite em data futura', async () => {
    const state = baseState();
    state.participantes.push({ sessao_id: 124, funcionario_id: 19, deleted_at: null });

    const db = createMockDb(state);
    const participantes = await listarParticipantesDaSessaoParaQualificacao(db, 124);

    const pastResult = await criarQualificacoesPlanejadas(db, {
      sessaoId: 124,
      modeloId: 78,
      tipoSessao: 'PER',
      data: addDays(new Date(), -1),
      participantes,
      empresaId: 6,
    });

    expect(pastResult.criadas).toBe(0);
    expect(pastResult.bloqueadasDataPassada).toBe(1);

    const futureResult = await criarQualificacoesPlanejadas(db, {
      sessaoId: 124,
      modeloId: 78,
      tipoSessao: 'PER',
      data: addDays(new Date(), 3),
      participantes,
      empresaId: 6,
    });

    expect(futureResult.criadas).toBe(1);
    expect(futureResult.bloqueadasDataPassada).toBe(0);
  });
});

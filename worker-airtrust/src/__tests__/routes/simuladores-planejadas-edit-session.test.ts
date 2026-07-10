import { describe, expect, it } from 'vitest';
import {
  criarQualificacoesPlanejadas,
  listarParticipantesDaSessaoParaQualificacao,
} from '../../routes/simuladores-shared';

type ParticipanteRow = {
  sessao_id: number;
  funcionario_id: number;
  deleted_at: string | null;
};

type FichaRow = {
  agendamento_slot_id: number;
  colaborador_id_aluno: number;
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
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

type RequisitoRow = {
  requisito_modelo_sessao_id: number;
  requisito_qualificacao_tipo_id: number | null;
};

type MockState = {
  participantes: ParticipanteRow[];
  fichas: FichaRow[];
  modelos: Record<number, ModeloState>;
  historico: HistoricoRow[];
  requisitos?: Record<number, RequisitoRow[]>;
  requisitosMode?: 'ok' | 'missing_table' | 'sql_error';
};

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
              if (sql.includes('FROM modelos_sessao_requisitos msr')) {
                if (state.requisitosMode === 'missing_table') {
                  throw new Error('no such table: modelos_sessao_requisitos');
                }
                if (state.requisitosMode === 'sql_error') {
                  throw new Error('db exploded');
                }
                const modeloId = Number(args[1]);
                return { results: state.requisitos?.[modeloId] || [] };
              }

              if (sql.includes('SELECT DISTINCT funcionario_id') && sql.includes('FROM sessoes_participantes')) {
                const sessaoId = Number(args[0]);
                const rows = state.participantes
                  .filter((p) => p.sessao_id === sessaoId && p.deleted_at === null)
                  .map((p) => ({ funcionario_id: p.funcionario_id }));
                return { results: uniqueByFuncionario(rows) };
              }

              if (sql.includes('SELECT DISTINCT fs.colaborador_id_aluno AS funcionario_id')) {
                const sessaoId = Number(args[0]);
                const rows = state.fichas
                  .filter((f) => f.agendamento_slot_id === sessaoId && f.deleted_at === null)
                  .map((f) => ({ funcionario_id: f.colaborador_id_aluno }));
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
                  if (['CANCELADA', 'CANCELADO'].includes(h.status)) {
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

              if (
                sql.includes('FROM qualificacoes_historico') &&
                sql.includes('qualificacao_id = ?') &&
                sql.includes('LIMIT 1')
              ) {
                const funcionarioId = Number(args[0]);
                const empresaId = Number(args[1]);
                const qualificacaoId = Number(args[2]);
                const row = state.historico.find(
                  (h) =>
                    h.deleted_at === null &&
                    h.funcionario_id === funcionarioId &&
                    h.empresa_id === empresaId &&
                    h.qualificacao_id === qualificacaoId &&
                    ['CONCLUIDA', 'CONCLUIDO', 'VALIDA', 'RENOVADA'].includes(h.status),
                );
                return ((row && { id: row.id }) || null) as T | null;
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
    fichas: [],
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
      79: {
        id: 79,
        gera_qualificacao: 1,
        qualificacao_tipo_id: null,
        duracao_estimada: 120,
        qual_codigo: null,
        qual_categoria: 'TREINAMENTO DE VOO',
        qual_validade: 12,
      },
    },
    historico: [],
    requisitos: {},
    requisitosMode: 'ok',
  };
}

describe('simuladores planejadas no edit de sessão (PUT)', () => {
  it('usa sessoes_participantes como fonte primária e ignora fallback de fichas', async () => {
    const state = baseState();
    state.participantes.push({ sessao_id: 66, funcionario_id: 19, deleted_at: null });
    state.fichas.push({ agendamento_slot_id: 66, colaborador_id_aluno: 999, deleted_at: null });
    const db = createMockDb(state);

    const participantes = await listarParticipantesDaSessaoParaQualificacao(db, 66);
    expect(participantes).toEqual([{ funcionario_id: 19 }]);
  });

  it('faz fallback para colaborador_id_aluno quando não há sessoes_participantes', async () => {
    const state = baseState();
    state.fichas.push({ agendamento_slot_id: 66, colaborador_id_aluno: 19, deleted_at: null });
    state.fichas.push({ agendamento_slot_id: 66, colaborador_id_aluno: 32, deleted_at: null });
    const db = createMockDb(state);

    const participantes = await listarParticipantesDaSessaoParaQualificacao(db, 66);
    expect(participantes).toEqual([{ funcionario_id: 19 }, { funcionario_id: 32 }]);
  });

  it('cria planejadas no primeiro PUT, mapeia tipo_treinamento e não duplica no segundo PUT', async () => {
    const state = baseState();
    state.participantes.push({ sessao_id: 66, funcionario_id: 19, deleted_at: null });
    state.participantes.push({ sessao_id: 66, funcionario_id: 32, deleted_at: null });
    const db = createMockDb(state);
    const participantes = await listarParticipantesDaSessaoParaQualificacao(db, 66);

    const first = await criarQualificacoesPlanejadas(db, {
      sessaoId: 66,
      modeloId: 78,
      tipoSessao: 'PER',
      data: '2099-05-23',
      participantes,
      empresaId: 6,
    });

    expect(first.criadas).toBe(2);
    expect(first.puladas).toBe(0);
    expect(first.conflitosUniques).toBe(0);
    expect(state.historico.filter((h) => h.deleted_at === null && h.status === 'PLANEJADA')).toHaveLength(2);
    expect(state.historico.every((h) => h.tipo_treinamento === 'RECORRENTE')).toBe(true);

    const second = await criarQualificacoesPlanejadas(db, {
      sessaoId: 66,
      modeloId: 78,
      tipoSessao: 'PER',
      data: '2099-05-23',
      participantes,
      empresaId: 6,
    });

    expect(second.criadas).toBe(0);
    expect(second.puladas).toBe(2);
    expect(second.conflitosUniques).toBe(0);
    expect(state.historico.filter((h) => h.deleted_at === null && h.status === 'PLANEJADA')).toHaveLength(2);
  });

  it('quando houver CANCELADA orphan ou da mesma sessão, arquiva e recria PLANEJADA ativa', async () => {
    const state = baseState();
    state.participantes.push({ sessao_id: 66, funcionario_id: 19, deleted_at: null });
    state.participantes.push({ sessao_id: 66, funcionario_id: 32, deleted_at: null });
    state.historico.push({
      id: 4516,
      funcionario_id: 19,
      qualificacao_id: 91,
      qualificacao_codigo: 'R',
      categoria: 'TREINAMENTO DE VOO',
      data_conclusao: '2099-05-23',
      validade_meses: 12,
      status: 'CANCELADA',
      renovada: 0,
      carga_horaria: 120,
      tipo_treinamento: 'RECORRENTE',
      empresa_id: 6,
      sessao_id: null,
      deleted_at: null,
      created_at: 'old',
      updated_at: 'old',
    });
    state.historico.push({
      id: 4518,
      funcionario_id: 32,
      qualificacao_id: 91,
      qualificacao_codigo: 'R',
      categoria: 'TREINAMENTO DE VOO',
      data_conclusao: '2099-05-23',
      validade_meses: 12,
      status: 'CANCELADA',
      renovada: 0,
      carga_horaria: 120,
      tipo_treinamento: 'RECORRENTE',
      empresa_id: 6,
      sessao_id: 66,
      deleted_at: null,
      created_at: 'old',
      updated_at: 'old',
    });

    const db = createMockDb(state);
    const participantes = await listarParticipantesDaSessaoParaQualificacao(db, 66);

    const result = await criarQualificacoesPlanejadas(db, {
      sessaoId: 66,
      modeloId: 78,
      tipoSessao: 'PER',
      data: '2099-05-23',
      participantes,
      empresaId: 6,
    });

    expect(result.criadas).toBe(2);
    expect(result.puladas).toBe(0);
    expect(result.conflitosUniques).toBe(0);

    const canceladasArquivadas = state.historico.filter((h) => [4516, 4518].includes(h.id));
    expect(canceladasArquivadas.every((h) => h.deleted_at !== null)).toBe(true);

    const ativas = state.historico.filter((h) => h.deleted_at === null && h.status === 'PLANEJADA');
    expect(ativas).toHaveLength(2);
    expect(ativas.map((h) => h.funcionario_id).sort((a, b) => a - b)).toEqual([19, 32]);
  });

  it('não gera quando o modelo não possui qualificação mapeada', async () => {
    const state = baseState();
    state.participantes.push({ sessao_id: 90, funcionario_id: 19, deleted_at: null });
    const db = createMockDb(state);
    const participantes = await listarParticipantesDaSessaoParaQualificacao(db, 90);

    const result = await criarQualificacoesPlanejadas(db, {
      sessaoId: 90,
      modeloId: 79,
      tipoSessao: 'PER',
      data: '2026-05-29',
      participantes,
      empresaId: 6,
    });

    expect(result.criadas).toBe(0);
    expect(result.puladas).toBe(0);
    expect(result.conflitosUniques).toBe(0);
    expect(state.historico.filter((h) => h.deleted_at === null)).toHaveLength(0);
  });

  it('sessão com data passada não gera PLANEJADA', async () => {
    const state = baseState();
    state.participantes.push({ sessao_id: 92, funcionario_id: 19, deleted_at: null });
    const db = createMockDb(state);
    const participantes = await listarParticipantesDaSessaoParaQualificacao(db, 92);

    const result = await criarQualificacoesPlanejadas(db, {
      sessaoId: 92,
      modeloId: 78,
      tipoSessao: 'PER',
      data: '2020-01-01',
      participantes,
      empresaId: 6,
    });

    expect(result.criadas).toBe(0);
    expect(result.bloqueadasDataPassada).toBe(1);
    expect(state.historico.filter((h) => h.deleted_at === null && h.status === 'PLANEJADA')).toHaveLength(0);
  });

  it('não duplica quando já existe legado CONCLUIDA com mesma chave UNIQUE (data futura)', async () => {
    const state = baseState();
    state.participantes.push({ sessao_id: 91, funcionario_id: 19, deleted_at: null });
    state.historico.push({
      id: 7001,
      funcionario_id: 19,
      qualificacao_id: 91,
      qualificacao_codigo: 'R',
      categoria: 'TREINAMENTO DE VOO',
      data_conclusao: '2099-05-30',
      validade_meses: 12,
      status: 'CONCLUIDA',
      renovada: 0,
      carga_horaria: 120,
      tipo_treinamento: 'RECORRENTE',
      empresa_id: 6,
      sessao_id: null,
      deleted_at: null,
      created_at: 'old',
      updated_at: 'old',
    });

    const db = createMockDb(state);
    const participantes = await listarParticipantesDaSessaoParaQualificacao(db, 91);

    const result = await criarQualificacoesPlanejadas(db, {
      sessaoId: 91,
      modeloId: 78,
      tipoSessao: 'PER',
      data: '2099-05-30',
      participantes,
      empresaId: 6,
    });

    expect(result.criadas).toBe(0);
    expect(result.puladas).toBe(0);
    expect(result.conflitosUniques).toBe(1);
    expect(state.historico.filter((h) => h.deleted_at === null && h.status === 'PLANEJADA')).toHaveLength(0);
  });

  it('gera quando o requisito configurado está satisfeito e não duplica na segunda execução', async () => {
    const state = baseState();
    state.participantes.push({ sessao_id: 93, funcionario_id: 19, deleted_at: null });
    state.requisitos![78] = [{ requisito_modelo_sessao_id: 55, requisito_qualificacao_tipo_id: 910 }];
    state.historico.push({
      id: 7101,
      funcionario_id: 19,
      qualificacao_id: 910,
      qualificacao_codigo: 'PRE-910',
      categoria: 'TREINAMENTO DE VOO',
      data_conclusao: '2026-01-01',
      validade_meses: 12,
      status: 'CONCLUIDA',
      renovada: 0,
      carga_horaria: 60,
      tipo_treinamento: 'RECORRENTE',
      empresa_id: 6,
      sessao_id: null,
      deleted_at: null,
      created_at: 'old',
      updated_at: 'old',
    });

    const db = createMockDb(state);
    const participantes = await listarParticipantesDaSessaoParaQualificacao(db, 93);

    const first = await criarQualificacoesPlanejadas(db, {
      sessaoId: 93,
      modeloId: 78,
      tipoSessao: 'PER',
      data: '2099-06-01',
      participantes,
      empresaId: 6,
    });
    const second = await criarQualificacoesPlanejadas(db, {
      sessaoId: 93,
      modeloId: 78,
      tipoSessao: 'PER',
      data: '2099-06-01',
      participantes,
      empresaId: 6,
    });

    expect(first.criadas).toBe(1);
    expect(first.puladas).toBe(0);
    expect(second.criadas).toBe(0);
    expect(second.puladas).toBe(1);
    expect(state.historico.filter((h) => h.deleted_at === null && h.status === 'PLANEJADA')).toHaveLength(1);
  });

  it('não gera quando o requisito configurado não está satisfeito', async () => {
    const state = baseState();
    state.participantes.push({ sessao_id: 94, funcionario_id: 19, deleted_at: null });
    state.requisitos![78] = [{ requisito_modelo_sessao_id: 55, requisito_qualificacao_tipo_id: 910 }];

    const db = createMockDb(state);
    const participantes = await listarParticipantesDaSessaoParaQualificacao(db, 94);

    const result = await criarQualificacoesPlanejadas(db, {
      sessaoId: 94,
      modeloId: 78,
      tipoSessao: 'PER',
      data: '2099-06-01',
      participantes,
      empresaId: 6,
    });

    expect(result.criadas).toBe(0);
    expect(result.puladas).toBe(1);
    expect(result.conflitosUniques).toBe(0);
    expect(state.historico.filter((h) => h.deleted_at === null && h.status === 'PLANEJADA')).toHaveLength(0);
  });

  it('mantém fallback compatível quando a tabela de requisitos não existe em sessão legada lida por fichas', async () => {
    const state = baseState();
    state.requisitosMode = 'missing_table';
    state.fichas.push({ agendamento_slot_id: 95, colaborador_id_aluno: 19, deleted_at: null });
    const db = createMockDb(state);
    const participantes = await listarParticipantesDaSessaoParaQualificacao(db, 95);

    const result = await criarQualificacoesPlanejadas(db, {
      sessaoId: 95,
      modeloId: 78,
      tipoSessao: 'PER',
      data: '2099-06-01',
      participantes,
      empresaId: 6,
    });

    expect(participantes).toEqual([{ funcionario_id: 19 }]);
    expect(result.criadas).toBe(1);
    expect(result.puladas).toBe(0);
    expect(state.historico.filter((h) => h.deleted_at === null && h.status === 'PLANEJADA')).toHaveLength(1);
  });

  it('propaga erro SQL diferente de tabela ausente ao carregar requisitos', async () => {
    const state = baseState();
    state.participantes.push({ sessao_id: 96, funcionario_id: 19, deleted_at: null });
    state.requisitosMode = 'sql_error';
    const db = createMockDb(state);
    const participantes = await listarParticipantesDaSessaoParaQualificacao(db, 96);

    await expect(
      criarQualificacoesPlanejadas(db, {
        sessaoId: 96,
        modeloId: 78,
        tipoSessao: 'PER',
        data: '2099-06-01',
        participantes,
        empresaId: 6,
      }),
    ).rejects.toThrow('db exploded');
  });
});

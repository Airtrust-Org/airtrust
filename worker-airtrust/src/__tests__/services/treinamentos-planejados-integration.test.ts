import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { invalidateMaterializedStatsMock, publishQualificacaoEventMock } = vi.hoisted(() => ({
  invalidateMaterializedStatsMock: vi.fn(),
  publishQualificacaoEventMock: vi.fn(),
}));

vi.mock('../../routes/qualificacoes/historico-helpers', () => ({
  invalidateMaterializedStats: invalidateMaterializedStatsMock,
  normalizeTipoTreinamento: (value: string | null | undefined) => value || 'RECORRENTE',
  publishQualificacaoEvent: publishQualificacaoEventMock,
  resolveCargaHorariaByTipo: () => 4,
}));

vi.mock('../../utils/qualificacoes-expiration', () => ({
  calcularDataVencimento: () => '2027-06-20',
}));

import { syncTreinamentoPlanejadoIntegration } from '../../services/treinamentos-planejados-integration';

type MockEvent = {
  id: number;
  empresa_id: number;
  qualificacao_tipo_id: number;
  qualificacao_codigo: string;
  qualificacao_categoria: string;
  qualificacao_validade: number;
  qualificacao_vencimento_fim_mes: number;
  qualificacao_carga_horaria: number | null;
  qualificacao_carga_horaria_inicial: number | null;
  qualificacao_carga_horaria_recorrente: number | null;
  data_prevista: string;
  status: string;
  instrutor_id: number | null;
  instrutor_nome: string | null;
  instrutor_guerra: string | null;
  local: string | null;
  carga_horaria_prevista: number | null;
  titulo: string | null;
  descricao: string | null;
  observacoes: string | null;
  codigo_turma: string | null;
};

type MockParticipant = {
  id: number;
  treinamento_id: number;
  funcionario_id: number;
  qualificacao_historico_id: number | null;
  confirmado: number | null;
  presente: number | null;
  aprovado: number | null;
  resultado: string | null;
  data_conclusao_efetiva: string | null;
};

type MockHistory = {
  id: number;
  empresa_id: number;
  funcionario_id: number;
  qualificacao_id: number;
  qualificacao_codigo: string;
  categoria: string;
  status: string;
  observacoes: string | null;
  data_conclusao: string | null;
  data_vencimento: string | null;
  renovada: number;
};

type MockRequest = {
  id: string;
  empresa_id: number;
  solicitante_id: number;
  qualificacao_id: number | null;
  status: string;
  status_pre_agendamento: string | null;
  treinamento_planejado_id: number | null;
  data_prevista: string | null;
  data_realizada: string | null;
};

type MockState = {
  tables: Set<string>;
  requestColumns: string[];
  event: MockEvent;
  participants: MockParticipant[];
  histories: MockHistory[];
  requests: MockRequest[];
  generatedLinks: Array<{
    id: number;
    empresa_id: number;
    treinamento_id: number;
    participante_id: number;
    funcionario_id: number;
    qualificacao_tipo_id: number;
    qualificacao_historico_id: number;
    data_conclusao_efetiva: string;
  }>;
  nextHistoryId: number;
  nextGeneratedLinkId: number;
};

function createMockDb(state: MockState): D1Database {
  return {
    prepare(query: string) {
      const trimmed = query.trim();
      const ddlPrefixes = ['CREATE TABLE', 'CREATE INDEX', 'ALTER TABLE'];
      const isDdl = ddlPrefixes.some((prefix) => trimmed.startsWith(prefix));

      const executeFirst = async (args: unknown[]) => {
        if (query.includes("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")) {
          const tableName = String(args[0] || '');
          return state.tables.has(tableName) ? { name: tableName } : null;
        }

        if (query.includes('FROM treinamentos_planejados t')) {
          const [treinamentoId, empresaId] = args as [number, number];
          if (state.event.id === treinamentoId && state.event.empresa_id === empresaId) {
            return state.event;
          }
          return null;
        }

        if (
          query.includes('FROM qualificacoes_historico') &&
          query.includes('WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL')
        ) {
          const [historicoId, empresaId] = args as [number, number];
          return (
            state.histories.find(
              (item) => item.id === historicoId && item.empresa_id === empresaId,
            ) || null
          );
        }

        if (query.includes('FROM qualificacoes_historico') && query.includes('AND id <> ?')) {
          const [empresaId, funcionarioId, qualificacaoCodigo, historicoId, dataConclusaoNova] =
            args as [number, number, string, number, string];
          return (
            state.histories.find(
              (item) =>
                item.empresa_id === empresaId &&
                item.funcionario_id === funcionarioId &&
                item.qualificacao_codigo === qualificacaoCodigo &&
                item.id !== historicoId &&
                item.status === 'CONCLUIDA' &&
                item.renovada === 0 &&
                // M5: só renova histórico ANTERIOR à nova conclusão.
                (item.data_conclusao || '1900-01-01') < dataConclusaoNova,
            ) || null
          );
        }

        if (
          query.includes('FROM qualificacoes_historico') &&
          query.includes('AND qualificacao_id = ?')
        ) {
          const [empresaId, funcionarioId, qualificacaoId, dataConclusao, marker] = args as [
            number,
            number,
            number,
            string,
            string,
          ];
          return (
            state.histories.find(
              (item) =>
                item.empresa_id === empresaId &&
                item.funcionario_id === funcionarioId &&
                item.qualificacao_id === qualificacaoId &&
                item.renovada === 0 &&
                ((item.status === 'PLANEJADA' && item.data_conclusao === dataConclusao) ||
                  String(item.observacoes || '').includes(String(marker).replace(/%/g, ''))),
            ) || null
          );
        }

        if (
          query.includes('FROM treinamentos_qualificacoes_geradas') &&
          query.includes('qualificacao_historico_id = ?') &&
          !query.includes('treinamento_id = ?')
        ) {
          // A4: lookup pela chave estável (qualificacao_historico_id).
          const [empresaId, historicoId] = args as [number, number];
          return (
            state.generatedLinks.find(
              (item) =>
                item.empresa_id === empresaId && item.qualificacao_historico_id === historicoId,
            ) || null
          );
        }

        if (query.includes('FROM treinamentos_qualificacoes_geradas')) {
          const [empresaId, treinamentoId, participanteId, qualificacaoTipoId, dataConclusao] =
            args as [number, number, number, number, string];
          return (
            state.generatedLinks.find(
              (item) =>
                item.empresa_id === empresaId &&
                item.treinamento_id === treinamentoId &&
                item.participante_id === participanteId &&
                item.qualificacao_tipo_id === qualificacaoTipoId &&
                item.data_conclusao_efetiva === dataConclusao,
            ) || null
          );
        }

        throw new Error(`Unhandled first query: ${query}`);
      };

      const executeAll = async (args: unknown[]) => {
        if (query.includes("PRAGMA table_info('solicitacoes_treinamento')")) {
          return { results: state.requestColumns.map((name) => ({ name })) };
        }

        if (
          query.includes('FROM treinamentos_participantes') &&
          query.includes('data_conclusao_efetiva')
        ) {
          const [treinamentoId] = args as [number];
          return {
            results: state.participants
              .filter((item) => item.treinamento_id === treinamentoId)
              .map((item) => ({
                id: item.id,
                funcionario_id: item.funcionario_id,
                qualificacao_historico_id: item.qualificacao_historico_id,
                confirmado: item.confirmado,
                presente: item.presente,
                aprovado: item.aprovado,
                resultado: item.resultado,
                data_conclusao_efetiva: item.data_conclusao_efetiva,
              })),
          };
        }

        if (
          query.includes(
            'SELECT id, status, status_pre_agendamento, treinamento_planejado_id, solicitante_id, qualificacao_id',
          )
        ) {
          const [empresaId, funcionarioId, qualificacaoId, treinamentoId] = args as [
            number,
            number,
            number,
            number,
          ];
          return {
            results: state.requests.filter(
              (item) =>
                item.empresa_id === empresaId &&
                item.solicitante_id === funcionarioId &&
                item.qualificacao_id === qualificacaoId &&
                ['APROVADA_GESTOR', 'APROVADA_OPS', 'AGENDADA'].includes(item.status) &&
                (item.treinamento_planejado_id === null ||
                  item.treinamento_planejado_id === treinamentoId),
            ),
          };
        }

        if (query.includes('SELECT id, status_pre_agendamento')) {
          const [empresaId, funcionarioId, treinamentoId] = args as [number, number, number];
          return {
            results: state.requests
              .filter(
                (item) =>
                  item.empresa_id === empresaId &&
                  item.solicitante_id === funcionarioId &&
                  item.treinamento_planejado_id === treinamentoId &&
                  item.status === 'AGENDADA',
              )
              .map((item) => ({
                id: item.id,
                status_pre_agendamento: item.status_pre_agendamento,
              })),
          };
        }

        throw new Error(`Unhandled all query: ${query}`);
      };

      const executeRun = async (args: unknown[]) => {
        if (isDdl) {
          return { meta: { changes: 0, last_row_id: 0 } };
        }

        if (query.includes('INSERT INTO qualificacoes_historico')) {
          const historicoId = state.nextHistoryId++;
          const [
            funcionarioId,
            qualificacaoId,
            qualificacaoCodigo,
            categoria,
            dataConclusao,
            dataVencimento,
            _validadeMeses,
            _instrutor,
            observacoes,
            _cargaHoraria,
            _tipoTreinamento,
            empresaId,
          ] = args as [
            number,
            number,
            string,
            string,
            string,
            string,
            null,
            string | null,
            string,
            number,
            string,
            number,
          ];
          void _validadeMeses;
          void _instrutor;
          void _cargaHoraria;
          void _tipoTreinamento;

          state.histories.push({
            id: historicoId,
            empresa_id: empresaId,
            funcionario_id: funcionarioId,
            qualificacao_id: qualificacaoId,
            qualificacao_codigo: qualificacaoCodigo,
            categoria,
            status: 'PLANEJADA',
            observacoes,
            data_conclusao: dataConclusao,
            data_vencimento: dataVencimento,
            renovada: 0,
          });

          return { meta: { changes: 1, last_row_id: historicoId } };
        }

        if (query.includes('UPDATE treinamentos_qualificacoes_geradas')) {
          // A4: atualização idempotente do vínculo pela chave estável.
          const [
            treinamentoId,
            participanteId,
            funcionarioId,
            qualificacaoTipoId,
            dataConclusaoEfetiva,
            id,
            empresaId,
          ] = args as [number, number, number, number, string, number, number];
          const link = state.generatedLinks.find(
            (item) => item.id === id && item.empresa_id === empresaId,
          );
          if (link) {
            link.treinamento_id = treinamentoId;
            link.participante_id = participanteId;
            link.funcionario_id = funcionarioId;
            link.qualificacao_tipo_id = qualificacaoTipoId;
            link.data_conclusao_efetiva = dataConclusaoEfetiva;
          }
          return { meta: { changes: link ? 1 : 0, last_row_id: 0 } };
        }

        if (
          query.includes('UPDATE treinamentos_planejados') &&
          query.includes('SET status = ?')
        ) {
          // M3: transição de ciclo de vida da turma.
          const [status, treinamentoId, empresaId] = args as [string, number, number];
          if (state.event.id === treinamentoId && state.event.empresa_id === empresaId) {
            state.event.status = status;
          }
          return { meta: { changes: 1, last_row_id: 0 } };
        }

        if (
          query.includes('UPDATE qualificacoes_historico') &&
          query.includes('SET data_conclusao = ?, data_vencimento = ?') &&
          !query.includes("status")
        ) {
          // A4: recálculo de data/vencimento em qualificação já concluída.
          const [dataConclusao, dataVencimento, historicoId, empresaId] = args as [
            string,
            string,
            number,
            number,
          ];
          const history = state.histories.find(
            (item) => item.id === historicoId && item.empresa_id === empresaId,
          );
          if (history) {
            history.data_conclusao = dataConclusao;
            history.data_vencimento = dataVencimento;
          }
          return { meta: { changes: history ? 1 : 0, last_row_id: 0 } };
        }

        if (query.includes('INSERT INTO treinamentos_qualificacoes_geradas')) {
          const [
            empresaId,
            treinamentoId,
            participanteId,
            funcionarioId,
            qualificacaoTipoId,
            qualificacaoHistoricoId,
            dataConclusaoEfetiva,
          ] = args as [number, number, number, number, number, number, string];
          state.generatedLinks.push({
            id: state.nextGeneratedLinkId++,
            empresa_id: empresaId,
            treinamento_id: treinamentoId,
            participante_id: participanteId,
            funcionario_id: funcionarioId,
            qualificacao_tipo_id: qualificacaoTipoId,
            qualificacao_historico_id: qualificacaoHistoricoId,
            data_conclusao_efetiva: dataConclusaoEfetiva,
          });
          return { meta: { changes: 1, last_row_id: state.nextGeneratedLinkId - 1 } };
        }

        if (
          query.includes('UPDATE treinamentos_participantes') &&
          query.includes('qualificacao_historico_id = ?')
        ) {
          const [historicoId, treinamentoId, funcionarioId] = args as [number, number, number];
          const participant = state.participants.find(
            (item) =>
              item.treinamento_id === treinamentoId && item.funcionario_id === funcionarioId,
          );
          if (participant) participant.qualificacao_historico_id = historicoId;
          return { meta: { changes: participant ? 1 : 0, last_row_id: 0 } };
        }

        if (
          query.includes('UPDATE qualificacoes_historico') &&
          query.includes('qualificacao_id = ?')
        ) {
          const [
            qualificacaoId,
            qualificacaoCodigo,
            categoria,
            dataConclusao,
            dataVencimento,
            _instrutor,
            observacoes,
            _cargaHoraria,
            _tipoTreinamento,
            historicoId,
            empresaId,
          ] = args as [
            number,
            string,
            string,
            string,
            string,
            string | null,
            string,
            number,
            string,
            number,
            number,
          ];
          void _instrutor;
          void _cargaHoraria;
          void _tipoTreinamento;
          const history = state.histories.find(
            (item) => item.id === historicoId && item.empresa_id === empresaId,
          );
          if (history) {
            history.qualificacao_id = qualificacaoId;
            history.qualificacao_codigo = qualificacaoCodigo;
            history.categoria = categoria;
            history.data_conclusao = dataConclusao;
            history.data_vencimento = dataVencimento;
            history.observacoes = observacoes;
            history.status = 'PLANEJADA';
          }
          return { meta: { changes: history ? 1 : 0, last_row_id: 0 } };
        }

        if (
          query.includes('UPDATE qualificacoes_historico') &&
          query.includes('SET observacoes = ?')
        ) {
          const [observacoes, historicoId, empresaId] = args as [string, number, number];
          const history = state.histories.find(
            (item) => item.id === historicoId && item.empresa_id === empresaId,
          );
          if (history) history.observacoes = observacoes;
          return { meta: { changes: history ? 1 : 0, last_row_id: 0 } };
        }

        if (
          query.includes('UPDATE qualificacoes_historico') &&
          query.includes("SET status = 'CANCELADA'")
        ) {
          const [historicoId, empresaId] = args as [number, number];
          const history = state.histories.find(
            (item) => item.id === historicoId && item.empresa_id === empresaId,
          );
          if (history) history.status = 'CANCELADA';
          return { meta: { changes: history ? 1 : 0, last_row_id: 0 } };
        }

        if (
          query.includes('UPDATE qualificacoes_historico') &&
          query.includes("SET status = 'CONCLUIDA'")
        ) {
          const [dataConclusao, dataVencimento, historicoId, empresaId] = args as [
            string,
            string,
            number,
            number,
          ];
          const history = state.histories.find(
            (item) => item.id === historicoId && item.empresa_id === empresaId,
          );
          if (history) {
            history.status = 'CONCLUIDA';
            history.data_conclusao = dataConclusao;
            history.data_vencimento = dataVencimento;
          }
          return { meta: { changes: history ? 1 : 0, last_row_id: 0 } };
        }

        if (
          query.includes('UPDATE qualificacoes_historico') &&
          query.includes('SET renovada = 1')
        ) {
          const [historicoId, empresaId] = args as [number, number];
          const history = state.histories.find(
            (item) => item.id === historicoId && item.empresa_id === empresaId,
          );
          if (history) {
            history.renovada = 1;
            history.status = 'RENOVADA';
          }
          return { meta: { changes: history ? 1 : 0, last_row_id: 0 } };
        }

        if (
          query.includes('UPDATE solicitacoes_treinamento') &&
          query.includes("SET status = 'AGENDADA'")
        ) {
          const [dataPrevista, treinamentoId, statusPre, solicitacaoId, empresaId] = args as [
            string,
            number,
            string,
            string,
            number,
          ];
          const request = state.requests.find(
            (item) => item.id === solicitacaoId && item.empresa_id === empresaId,
          );
          if (request) {
            request.status = 'AGENDADA';
            request.data_prevista = dataPrevista;
            request.treinamento_planejado_id = treinamentoId;
            request.status_pre_agendamento = statusPre;
          }
          return { meta: { changes: request ? 1 : 0, last_row_id: 0 } };
        }

        if (
          query.includes('UPDATE solicitacoes_treinamento') &&
          query.includes('data_prevista = NULL')
        ) {
          const [status, solicitacaoId, empresaId] = args as [string, string, number];
          const request = state.requests.find(
            (item) => item.id === solicitacaoId && item.empresa_id === empresaId,
          );
          if (request) {
            request.status = status;
            request.data_prevista = null;
            request.treinamento_planejado_id = null;
            request.status_pre_agendamento = null;
          }
          return { meta: { changes: request ? 1 : 0, last_row_id: 0 } };
        }

        if (
          query.includes('UPDATE solicitacoes_treinamento') &&
          query.includes("SET status = 'CONCLUIDA'") &&
          query.includes('treinamento_planejado_id = ?')
        ) {
          const [dataRealizada, empresaId, funcionarioId, treinamentoId] = args as [
            string,
            number,
            number,
            number,
          ];
          state.requests.forEach((item) => {
            if (
              item.empresa_id === empresaId &&
              item.solicitante_id === funcionarioId &&
              item.treinamento_planejado_id === treinamentoId &&
              ['APROVADA_GESTOR', 'APROVADA_OPS', 'AGENDADA'].includes(item.status)
            ) {
              item.status = 'CONCLUIDA';
              item.data_realizada = dataRealizada;
              item.status_pre_agendamento = null;
            }
          });
          return { meta: { changes: 1, last_row_id: 0 } };
        }

        throw new Error(`Unhandled run query: ${query}`);
      };

      return {
        first: async () => executeFirst([]),
        all: async () => executeAll([]),
        run: async () => executeRun([]),
        bind: (...args: unknown[]) => ({
          first: async () => executeFirst(args),
          all: async () => executeAll(args),
          run: async () => executeRun(args),
        }),
      };
    },
  } as unknown as D1Database;
}

function buildBaseState(status: string): MockState {
  return {
    tables: new Set(['solicitacoes_treinamento']),
    requestColumns: ['id', 'status', 'status_pre_agendamento', 'treinamento_planejado_id'],
    event: {
      id: 77,
      empresa_id: 1,
      qualificacao_tipo_id: 9,
      qualificacao_codigo: 'CRM',
      qualificacao_categoria: 'TREINAMENTO',
      qualificacao_validade: 12,
      qualificacao_vencimento_fim_mes: 1,
      qualificacao_carga_horaria: 4,
      qualificacao_carga_horaria_inicial: 8,
      qualificacao_carga_horaria_recorrente: 4,
      data_prevista: '2026-06-20',
      status,
      instrutor_id: 5,
      instrutor_nome: 'Instrutor Silva',
      instrutor_guerra: 'Silva',
      local: 'Sala Alpha',
      carga_horaria_prevista: 4,
      titulo: 'CRM Recorrente',
      descricao: 'Reciclagem operacional',
      observacoes: 'Checklist completo',
      codigo_turma: 'CRM-2026-A',
    },
    participants: [
      {
        id: 501,
        treinamento_id: 77,
        funcionario_id: 11,
        qualificacao_historico_id: null,
        confirmado: 1,
        presente: null,
        aprovado: null,
        resultado: null,
        data_conclusao_efetiva: null,
      },
    ],
    histories: [],
    requests: [
      {
        id: 'req-1',
        empresa_id: 1,
        solicitante_id: 11,
        qualificacao_id: 9,
        status: 'APROVADA_OPS',
        status_pre_agendamento: null,
        treinamento_planejado_id: null,
        data_prevista: null,
        data_realizada: null,
      },
    ],
    generatedLinks: [],
    nextHistoryId: 900,
    nextGeneratedLinkId: 1,
  };
}

describe('treinamentos planejados integration service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateMaterializedStatsMock.mockResolvedValue(undefined);
    publishQualificacaoEventMock.mockResolvedValue(undefined);
  });

  it('cria historico planejado e agenda solicitacoes aprovadas', async () => {
    const state = buildBaseState('PLANEJADO');
    const db = createMockDb(state);

    await syncTreinamentoPlanejadoIntegration({
      db,
      empresaId: 1,
      treinamentoId: 77,
    });

    expect(state.histories).toHaveLength(1);
    expect(state.histories[0]).toMatchObject({
      funcionario_id: 11,
      qualificacao_id: 9,
      status: 'PLANEJADA',
    });
    expect(state.histories[0].observacoes).toContain('Origem: Treinamento Planejado #77');
    expect(state.histories[0].observacoes).toContain('Origem: Turma CRM-2026-A');
    expect(state.participants[0].qualificacao_historico_id).toBe(state.histories[0].id);
    expect(state.requests[0]).toMatchObject({
      status: 'AGENDADA',
      treinamento_planejado_id: 77,
      status_pre_agendamento: 'APROVADA_OPS',
      data_prevista: '2026-06-20',
    });
    expect(invalidateMaterializedStatsMock).toHaveBeenCalledTimes(1);
  });

  it('cancela historico planejado gerenciado e desfaz agendamento vinculado', async () => {
    const state = buildBaseState('CANCELADO');
    state.participants[0].qualificacao_historico_id = 801;
    state.histories = [
      {
        id: 801,
        empresa_id: 1,
        funcionario_id: 11,
        qualificacao_id: 9,
        qualificacao_codigo: 'CRM',
        categoria: 'TREINAMENTO',
        status: 'PLANEJADA',
        observacoes: 'Checklist completo\nOrigem: Treinamento Planejado #77',
        data_conclusao: '2026-06-20',
        data_vencimento: '2027-06-20',
        renovada: 0,
      },
    ];
    state.requests = [
      {
        id: 'req-1',
        empresa_id: 1,
        solicitante_id: 11,
        qualificacao_id: 9,
        status: 'AGENDADA',
        status_pre_agendamento: 'APROVADA_OPS',
        treinamento_planejado_id: 77,
        data_prevista: '2026-06-20',
        data_realizada: null,
      },
    ];

    const db = createMockDb(state);

    await syncTreinamentoPlanejadoIntegration({
      db,
      empresaId: 1,
      treinamentoId: 77,
    });

    expect(state.histories[0].status).toBe('CANCELADA');
    expect(state.requests[0]).toMatchObject({
      status: 'APROVADA_OPS',
      treinamento_planejado_id: null,
      status_pre_agendamento: null,
      data_prevista: null,
    });
    expect(invalidateMaterializedStatsMock).toHaveBeenCalledTimes(1);
  });

  it('não conclui qualificação apenas por presença e encerramento da turma', async () => {
    const state = buildBaseState('CONCLUIDO');
    state.participants[0] = {
      ...state.participants[0],
      qualificacao_historico_id: 801,
      presente: 1,
    };
    state.histories = [
      {
        id: 801,
        empresa_id: 1,
        funcionario_id: 11,
        qualificacao_id: 9,
        qualificacao_codigo: 'CRM',
        categoria: 'TREINAMENTO',
        status: 'PLANEJADA',
        observacoes: 'Checklist completo\nOrigem: Treinamento Planejado #77',
        data_conclusao: '2026-06-20',
        data_vencimento: '2027-06-20',
        renovada: 0,
      },
    ];
    state.requests = [
      {
        id: 'req-1',
        empresa_id: 1,
        solicitante_id: 11,
        qualificacao_id: 9,
        status: 'AGENDADA',
        status_pre_agendamento: 'APROVADA_OPS',
        treinamento_planejado_id: 77,
        data_prevista: '2026-06-20',
        data_realizada: null,
      },
    ];

    const db = createMockDb(state);

    await syncTreinamentoPlanejadoIntegration({
      db,
      empresaId: 1,
      treinamentoId: 77,
    });

    expect(state.histories[0].status).toBe('PLANEJADA');
    expect(state.requests[0]).toMatchObject({
      status: 'AGENDADA',
      treinamento_planejado_id: 77,
      data_realizada: null,
    });
    expect(publishQualificacaoEventMock).not.toHaveBeenCalled();
  });

  it('conclui histórico e solicitação com aprovação e data efetiva individuais', async () => {
    const state = buildBaseState('CONCLUIDO');
    state.participants[0] = {
      ...state.participants[0],
      qualificacao_historico_id: 801,
      presente: 1,
      aprovado: 1,
      resultado: 'APROVADO',
      data_conclusao_efetiva: '2026-06-22',
    };
    state.histories = [
      {
        id: 801,
        empresa_id: 1,
        funcionario_id: 11,
        qualificacao_id: 9,
        qualificacao_codigo: 'CRM',
        categoria: 'TREINAMENTO',
        status: 'PLANEJADA',
        observacoes: 'Checklist completo\nOrigem: Treinamento Planejado #77',
        data_conclusao: '2026-06-20',
        data_vencimento: '2027-06-20',
        renovada: 0,
      },
    ];
    state.requests[0] = {
      ...state.requests[0],
      status: 'AGENDADA',
      status_pre_agendamento: 'APROVADA_OPS',
      treinamento_planejado_id: 77,
      data_prevista: '2026-06-20',
    };
    const db = createMockDb(state);

    await syncTreinamentoPlanejadoIntegration({ db, empresaId: 1, treinamentoId: 77 });

    expect(state.histories[0]).toMatchObject({
      status: 'CONCLUIDA',
      data_conclusao: '2026-06-22',
    });
    expect(state.requests[0]).toMatchObject({
      status: 'CONCLUIDA',
      data_realizada: '2026-06-22',
      status_pre_agendamento: null,
    });
    expect(publishQualificacaoEventMock).toHaveBeenCalledWith(
      db,
      'created',
      11,
      'CRM',
      expect.objectContaining({ status: 'CONCLUIDA' }),
    );
    expect(state.generatedLinks).toHaveLength(1);
    expect(state.generatedLinks[0]).toMatchObject({
      treinamento_id: 77,
      participante_id: 501,
      qualificacao_historico_id: 801,
      data_conclusao_efetiva: '2026-06-22',
    });
    expect(invalidateMaterializedStatsMock).toHaveBeenCalledTimes(1);
  });

  it('A4: reconcluir com data corrigida atualiza o vínculo sem duplicar nem lançar erro', async () => {
    const state = buildBaseState('EM_ANDAMENTO');
    state.participants[0] = {
      ...state.participants[0],
      qualificacao_historico_id: 801,
      presente: 1,
      aprovado: 1,
      resultado: 'APROVADO',
      data_conclusao_efetiva: '2026-06-22',
    };
    state.histories = [
      {
        id: 801,
        empresa_id: 1,
        funcionario_id: 11,
        qualificacao_id: 9,
        qualificacao_codigo: 'CRM',
        categoria: 'TREINAMENTO',
        status: 'PLANEJADA',
        observacoes: 'Checklist completo\nOrigem: Treinamento Planejado #77',
        data_conclusao: '2026-06-20',
        data_vencimento: '2027-06-20',
        renovada: 0,
      },
    ];
    const db = createMockDb(state);

    // 1ª conclusão (data 2026-06-22)
    await syncTreinamentoPlanejadoIntegration({ db, empresaId: 1, treinamentoId: 77 });
    expect(state.generatedLinks).toHaveLength(1);
    expect(state.generatedLinks[0].data_conclusao_efetiva).toBe('2026-06-22');
    expect(state.histories[0].status).toBe('CONCLUIDA');

    // Correção de data: 2026-06-25 — não deve lançar, não deve duplicar.
    state.participants[0].data_conclusao_efetiva = '2026-06-25';
    await expect(
      syncTreinamentoPlanejadoIntegration({ db, empresaId: 1, treinamentoId: 77 }),
    ).resolves.toBeUndefined();

    expect(state.generatedLinks).toHaveLength(1);
    expect(state.generatedLinks[0].data_conclusao_efetiva).toBe('2026-06-25');
    expect(state.histories[0].data_conclusao).toBe('2026-06-25');
  });

  it('M5: conclusão retroativa renova apenas histórico anterior, preservando o mais novo', async () => {
    const state = buildBaseState('CONCLUIDO');
    state.participants[0] = {
      ...state.participants[0],
      qualificacao_historico_id: 801,
      presente: 1,
      aprovado: 1,
      resultado: 'APROVADO',
      data_conclusao_efetiva: '2026-06-22',
    };
    state.histories = [
      {
        id: 801,
        empresa_id: 1,
        funcionario_id: 11,
        qualificacao_id: 9,
        qualificacao_codigo: 'CRM',
        categoria: 'TREINAMENTO',
        status: 'PLANEJADA',
        observacoes: 'Origem: Treinamento Planejado #77',
        data_conclusao: '2026-06-20',
        data_vencimento: '2027-06-20',
        renovada: 0,
      },
      {
        id: 700,
        empresa_id: 1,
        funcionario_id: 11,
        qualificacao_id: 9,
        qualificacao_codigo: 'CRM',
        categoria: 'TREINAMENTO',
        status: 'CONCLUIDA',
        observacoes: 'Antigo',
        data_conclusao: '2026-01-01',
        data_vencimento: '2027-01-01',
        renovada: 0,
      },
      {
        id: 900,
        empresa_id: 1,
        funcionario_id: 11,
        qualificacao_id: 9,
        qualificacao_codigo: 'CRM',
        categoria: 'TREINAMENTO',
        status: 'CONCLUIDA',
        observacoes: 'Mais novo',
        data_conclusao: '2026-08-01',
        data_vencimento: '2027-08-01',
        renovada: 0,
      },
    ];
    const db = createMockDb(state);

    await syncTreinamentoPlanejadoIntegration({ db, empresaId: 1, treinamentoId: 77 });

    const byId = (id: number) => state.histories.find((h) => h.id === id)!;
    expect(byId(801).status).toBe('CONCLUIDA');
    // 700 é anterior a 2026-06-22 -> renovado.
    expect(byId(700).status).toBe('RENOVADA');
    expect(byId(700).renovada).toBe(1);
    // 900 é posterior -> NÃO pode ser marcado como renovado por conclusão retroativa.
    expect(byId(900).status).toBe('CONCLUIDA');
    expect(byId(900).renovada).toBe(0);
  });

  it('M3: turma é encerrada (CONCLUIDO) quando todos os participantes têm resultado final', async () => {
    const state = buildBaseState('PLANEJADO');
    state.participants[0] = {
      ...state.participants[0],
      presente: 1,
      aprovado: 1,
      resultado: 'APROVADO',
      data_conclusao_efetiva: '2026-06-22',
    };
    const db = createMockDb(state);

    await syncTreinamentoPlanejadoIntegration({ db, empresaId: 1, treinamentoId: 77 });

    expect(state.event.status).toBe('CONCLUIDO');
  });

  it('A3: a conclusão via solicitações preenche resultado/data para emitir a qualificação', () => {
    const source = readFileSync(
      new URL('../../services/treinamentos-planejados-integration.ts', import.meta.url).pathname,
      'utf8',
    );
    // O caminho legado (solicitações) deve usar a MESMA semântica do endpoint novo:
    // sem preencher resultado + data_conclusao_efetiva, shouldCompleteParticipante não
    // dispara e a qualificação ficaria presa em PLANEJADA (bug A3).
    expect(source).toContain("resultado = COALESCE(NULLIF(resultado, ''), 'APROVADO')");
    expect(source).toContain('data_conclusao_efetiva = COALESCE(data_conclusao_efetiva, ?)');
  });

  it('M3: turma fica EM_ANDAMENTO quando há resultado parcial entre participantes', async () => {
    const state = buildBaseState('PLANEJADO');
    state.participants = [
      {
        id: 501,
        treinamento_id: 77,
        funcionario_id: 11,
        qualificacao_historico_id: null,
        confirmado: 1,
        presente: 1,
        aprovado: 1,
        resultado: 'APROVADO',
        data_conclusao_efetiva: '2026-06-22',
      },
      {
        id: 502,
        treinamento_id: 77,
        funcionario_id: 12,
        qualificacao_historico_id: null,
        confirmado: 1,
        presente: null,
        aprovado: null,
        resultado: null,
        data_conclusao_efetiva: null,
      },
    ];
    const db = createMockDb(state);

    await syncTreinamentoPlanejadoIntegration({ db, empresaId: 1, treinamentoId: 77 });

    expect(state.event.status).toBe('EM_ANDAMENTO');
  });
});

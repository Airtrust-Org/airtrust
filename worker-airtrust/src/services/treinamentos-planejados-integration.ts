import {
  invalidateMaterializedStats,
  normalizeTipoTreinamento,
  publishQualificacaoEvent,
  resolveCargaHorariaByTipo,
} from '../routes/qualificacoes/historico-helpers';
import {
  COMPLETED_STATUS_VALUES,
  isPlannedQualificationStatus,
  normalizeQualificationStatusForCompatibility,
  PLANNED_QUALIFICATION_STATUS_VALUES,
  QUALIFICACAO_STATUS,
  sqlStatusEqualsAny,
} from '../lib/status/status-codes';
import { calcularDataVencimento } from '../utils/qualificacoes-expiration';

type EventoContextRow = {
  id: number;
  empresa_id: number;
  qualificacao_tipo_id: number;
  qualificacao_codigo: string | null;
  qualificacao_categoria: string | null;
  qualificacao_validade: number | null;
  qualificacao_vencimento_fim_mes: number | null;
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
};

type ParticipanteContextRow = {
  funcionario_id: number;
  qualificacao_historico_id: number | null;
  confirmado: number | null;
  presente: number | null;
  aprovado: number | null;
};

type HistoricoPlanejadoRow = {
  id: number;
  funcionario_id: number;
  qualificacao_codigo: string | null;
  status: string | null;
  observacoes: string | null;
};

type SolicitacaoRow = {
  id: string;
  status: string | null;
  status_pre_agendamento: string | null;
  treinamento_planejado_id: number | null;
  solicitante_id: number;
  qualificacao_id: number | null;
  titulo?: string | null;
  descricao?: string | null;
};

type RemovedParticipantLink = {
  funcionario_id: number;
  qualificacao_historico_id?: number | null;
};

const ORIGEM_PREFIX = 'Origem: Treinamento Planejado #';
const DEFAULT_REQUEST_PREVIOUS_STATUS = 'APROVADA_OPS';
const REQUEST_APPROVAL_STATUSES = new Set(['APROVADA_GESTOR', 'APROVADA_OPS']);
const REQUEST_OPEN_STATUSES = new Set(['APROVADA_GESTOR', 'APROVADA_OPS', 'AGENDADA']);
const REQUEST_REVERT_ALLOWED = new Set(['APROVADA_GESTOR', 'APROVADA_OPS']);

function buildOrigemMarker(treinamentoId: number): string {
  return `${ORIGEM_PREFIX}${treinamentoId}`;
}

function stripMarker(observacoes: string | null | undefined, marker: string): string | null {
  if (!observacoes) return null;
  const parts = observacoes
    .split('\n')
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && part !== marker);
  return parts.length > 0 ? parts.join('\n') : null;
}

function mergeObservacoes(
  existingObservacoes: string | null | undefined,
  treinamentoObservacoes: string | null | undefined,
  marker: string,
): string {
  const merged = new Set<string>();
  const existing = stripMarker(existingObservacoes, marker);
  const planned = treinamentoObservacoes?.trim() || null;

  [existing, planned, marker].forEach((value) => {
    if (!value) return;
    if (value.trim()) merged.add(value.trim());
  });

  return [...merged].join('\n');
}

function resolveTipoTreinamento(
  validade: number | null,
): 'INICIAL' | 'RECORRENTE' | 'SEMESTRAL' | 'UPGRADE' | 'ESPECIFICO' {
  const normalized = normalizeTipoTreinamento(validade === 6 ? 'SEMESTRAL' : 'RECORRENTE');
  return normalized || 'RECORRENTE';
}

function shouldCompleteParticipante(
  evento: EventoContextRow,
  participante: ParticipanteContextRow,
) {
  return (
    Number(participante.aprovado || 0) === 1 ||
    (Number(participante.presente || 0) === 1 && evento.status === 'CONCLUIDO')
  );
}

async function tabelaExiste(db: D1Database, nomeTabela: string): Promise<boolean> {
  const result = await db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .bind(nomeTabela)
    .first<{ name: string }>();

  return Boolean(result?.name);
}
async function loadEventoContext(
  db: D1Database,
  empresaId: number,
  treinamentoId: number,
): Promise<EventoContextRow | null> {
  return (
    (await db
      .prepare(
        `SELECT t.id,
                t.empresa_id,
                t.qualificacao_tipo_id,
                qt.codigo AS qualificacao_codigo,
                qt.categoria AS qualificacao_categoria,
                qt.validade AS qualificacao_validade,
                COALESCE(qt.vencimento_fim_mes, 1) AS qualificacao_vencimento_fim_mes,
                qt.carga_horaria AS qualificacao_carga_horaria,
                qt.carga_horaria_inicial AS qualificacao_carga_horaria_inicial,
                qt.carga_horaria_recorrente AS qualificacao_carga_horaria_recorrente,
                t.data_prevista,
                t.status,
                t.instrutor_id,
                instr.nome AS instrutor_nome,
                instr.guerra AS instrutor_guerra,
                t.local,
                t.carga_horaria_prevista,
                t.titulo,
                t.descricao,
                t.observacoes
           FROM treinamentos_planejados t
           LEFT JOIN qualificacoes_tipos qt ON qt.id = t.qualificacao_tipo_id AND qt.deleted_at IS NULL
           LEFT JOIN funcionarios instr ON instr.id = t.instrutor_id AND instr.deleted_at IS NULL
          WHERE t.id = ? AND t.empresa_id = ? AND t.deleted_at IS NULL`,
      )
      .bind(treinamentoId, empresaId)
      .first<EventoContextRow>()) || null
  );
}

async function loadParticipantesContext(
  db: D1Database,
  treinamentoId: number,
): Promise<ParticipanteContextRow[]> {
  const rows = await db
    .prepare(
      `SELECT funcionario_id, qualificacao_historico_id, confirmado, presente, aprovado
         FROM treinamentos_participantes
        WHERE treinamento_id = ?
        ORDER BY funcionario_id`,
    )
    .bind(treinamentoId)
    .all<ParticipanteContextRow>();

  return rows.results || [];
}

async function loadHistoricoById(
  db: D1Database,
  empresaId: number,
  historicoId: number,
): Promise<HistoricoPlanejadoRow | null> {
  return (
    (await db
      .prepare(
        `SELECT id, funcionario_id, qualificacao_codigo, status, observacoes
           FROM qualificacoes_historico
          WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
      )
      .bind(historicoId, empresaId)
      .first<HistoricoPlanejadoRow>()) || null
  );
}

async function findHistoricoPlanejadoCandidate(
  db: D1Database,
  empresaId: number,
  evento: EventoContextRow,
  funcionarioId: number,
): Promise<HistoricoPlanejadoRow | null> {
  const marker = `%${buildOrigemMarker(evento.id)}%`;
  return (
    (await db
      .prepare(
        `SELECT id, funcionario_id, qualificacao_codigo, status, observacoes
           FROM qualificacoes_historico
          WHERE empresa_id = ?
            AND funcionario_id = ?
            AND qualificacao_id = ?
            AND deleted_at IS NULL
            AND COALESCE(renovada, 0) = 0
            AND (
              (${sqlStatusEqualsAny('status', PLANNED_QUALIFICATION_STATUS_VALUES, QUALIFICACAO_STATUS.CONCLUIDA)} AND date(COALESCE(data_conclusao, '1900-01-01')) = date(?))
              OR COALESCE(observacoes, '') LIKE ?
            )
          ORDER BY CASE WHEN COALESCE(observacoes, '') LIKE ? THEN 0 ELSE 1 END,
                   CASE WHEN date(COALESCE(data_conclusao, '1900-01-01')) = date(?) THEN 0 ELSE 1 END,
                   id DESC
          LIMIT 1`,
      )
      .bind(
        empresaId,
        funcionarioId,
        evento.qualificacao_tipo_id,
        evento.data_prevista,
        marker,
        marker,
        evento.data_prevista,
      )
      .first<HistoricoPlanejadoRow>()) || null
  );
}

async function updateParticipanteHistoricoLink(
  db: D1Database,
  treinamentoId: number,
  funcionarioId: number,
  historicoId: number,
): Promise<void> {
  await db
    .prepare(
      `UPDATE treinamentos_participantes
          SET qualificacao_historico_id = ?,
              updated_at = datetime('now')
        WHERE treinamento_id = ? AND funcionario_id = ?`,
    )
    .bind(historicoId, treinamentoId, funcionarioId)
    .run();
}

async function upsertHistoricoPlanejadoForParticipante(
  db: D1Database,
  empresaId: number,
  evento: EventoContextRow,
  participante: ParticipanteContextRow,
): Promise<{ historicoId: number | null; changed: boolean }> {
  if (!evento.qualificacao_codigo) {
    return { historicoId: participante.qualificacao_historico_id || null, changed: false };
  }

  const marker = buildOrigemMarker(evento.id);
  const tipoTreinamento = resolveTipoTreinamento(evento.qualificacao_validade);
  const cargaHoraria =
    evento.carga_horaria_prevista ??
    resolveCargaHorariaByTipo({
      tipoTreinamento,
      cargaInicial: evento.qualificacao_carga_horaria_inicial,
      cargaRecorrente: evento.qualificacao_carga_horaria_recorrente,
      cargaPadrao: evento.qualificacao_carga_horaria,
    });
  const validadeMeses =
    typeof evento.qualificacao_validade === 'number' && evento.qualificacao_validade > 0
      ? evento.qualificacao_validade
      : 12;
  const vencimentoFimMes = Number(evento.qualificacao_vencimento_fim_mes || 0) === 0 ? 0 : 1;
  const dataVencimento = calcularDataVencimento(
    evento.data_prevista,
    validadeMeses,
    vencimentoFimMes,
  );
  const instrutor = evento.instrutor_guerra || evento.instrutor_nome || null;

  let existing: HistoricoPlanejadoRow | null = null;
  if (participante.qualificacao_historico_id) {
    existing = await loadHistoricoById(db, empresaId, participante.qualificacao_historico_id);
  }
  if (!existing) {
    existing = await findHistoricoPlanejadoCandidate(
      db,
      empresaId,
      evento,
      participante.funcionario_id,
    );
  }

  if (
    existing &&
    [QUALIFICACAO_STATUS.CONCLUIDA, QUALIFICACAO_STATUS.RENOVADA].includes(
      normalizeQualificationStatusForCompatibility(existing.status) || '',
    )
  ) {
    await updateParticipanteHistoricoLink(db, evento.id, participante.funcionario_id, existing.id);
    return { historicoId: existing.id, changed: false };
  }

  const observacoes = mergeObservacoes(existing?.observacoes, evento.observacoes, marker);

  if (existing?.id) {
    await db
      .prepare(
        `UPDATE qualificacoes_historico
            SET qualificacao_id = ?,
                qualificacao_codigo = ?,
                categoria = ?,
                data_conclusao = ?,
                data_vencimento = ?,
                instrutor = ?,
                observacoes = ?,
                status = '${QUALIFICACAO_STATUS.PLANEJADA}',
                carga_horaria = ?,
                tipo_treinamento = ?,
                updated_at = datetime('now')
          WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
      )
      .bind(
        evento.qualificacao_tipo_id,
        evento.qualificacao_codigo,
        evento.qualificacao_categoria || 'TREINAMENTO',
        evento.data_prevista,
        dataVencimento,
        instrutor,
        observacoes,
        cargaHoraria,
        tipoTreinamento,
        existing.id,
        empresaId,
      )
      .run();

    await updateParticipanteHistoricoLink(db, evento.id, participante.funcionario_id, existing.id);
    return { historicoId: existing.id, changed: true };
  }

  const result = await db
    .prepare(
      `INSERT INTO qualificacoes_historico
        (funcionario_id, qualificacao_id, qualificacao_codigo, categoria,
         data_conclusao, data_vencimento, validade_meses, instrutor, observacoes,
         status, renovada, carga_horaria, tipo_treinamento, empresa_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '${QUALIFICACAO_STATUS.PLANEJADA}', 0, ?, ?, ?, datetime('now'), datetime('now'))`,
    )
    .bind(
      participante.funcionario_id,
      evento.qualificacao_tipo_id,
      evento.qualificacao_codigo,
      evento.qualificacao_categoria || 'TREINAMENTO',
      evento.data_prevista,
      dataVencimento,
      null,
      instrutor,
      observacoes,
      cargaHoraria,
      tipoTreinamento,
      empresaId,
    )
    .run();

  const historicoId = Number(result.meta.last_row_id || 0) || null;
  if (historicoId) {
    await updateParticipanteHistoricoLink(db, evento.id, participante.funcionario_id, historicoId);
  }

  return { historicoId, changed: Boolean(historicoId) };
}

async function cancelManagedHistoricoForParticipante(
  db: D1Database,
  empresaId: number,
  treinamentoId: number,
  participante: RemovedParticipantLink,
): Promise<boolean> {
  const marker = buildOrigemMarker(treinamentoId);
  let historico: HistoricoPlanejadoRow | null = null;

  if (participante.qualificacao_historico_id) {
    historico = await loadHistoricoById(db, empresaId, participante.qualificacao_historico_id);
  }

  if (!historico) {
    historico =
      (await db
        .prepare(
          `SELECT id, funcionario_id, qualificacao_codigo, status, observacoes
             FROM qualificacoes_historico
            WHERE empresa_id = ?
              AND funcionario_id = ?
              AND deleted_at IS NULL
              AND ${sqlStatusEqualsAny('status', PLANNED_QUALIFICATION_STATUS_VALUES, QUALIFICACAO_STATUS.CONCLUIDA)}
              AND COALESCE(observacoes, '') LIKE ?
            ORDER BY id DESC
            LIMIT 1`,
        )
        .bind(empresaId, participante.funcionario_id, `%${marker}%`)
        .first<HistoricoPlanejadoRow>()) || null;
  }

  if (!historico?.id || !String(historico.observacoes || '').includes(marker)) {
    return false;
  }

  if (isPlannedQualificationStatus(historico.status)) {
    await db
      .prepare(
        `UPDATE qualificacoes_historico
            SET status = '${QUALIFICACAO_STATUS.CANCELADA}',
                updated_at = datetime('now')
          WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
      )
      .bind(historico.id, empresaId)
      .run();
    return true;
  }

  return false;
}

async function concluirHistoricoPlanejado(
  db: D1Database,
  empresaId: number,
  evento: EventoContextRow,
  participante: ParticipanteContextRow,
): Promise<boolean> {
  if (!evento.qualificacao_codigo) return false;

  const upserted = await upsertHistoricoPlanejadoForParticipante(
    db,
    empresaId,
    evento,
    participante,
  );
  if (!upserted.historicoId) return false;

  const existing = await loadHistoricoById(db, empresaId, upserted.historicoId);
  const currentStatus = normalizeQualificationStatusForCompatibility(existing?.status);
  if (
    currentStatus === QUALIFICACAO_STATUS.CONCLUIDA ||
    currentStatus === QUALIFICACAO_STATUS.RENOVADA
  ) {
    return false;
  }

  await db
    .prepare(
      `UPDATE qualificacoes_historico
          SET status = '${QUALIFICACAO_STATUS.CONCLUIDA}',
              data_confirmacao = datetime('now'),
              confirmada_por = NULL,
              updated_at = datetime('now')
        WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
    )
    .bind(upserted.historicoId, empresaId)
    .run();

  const anterior = await db
    .prepare(
      `SELECT id
         FROM qualificacoes_historico
        WHERE empresa_id = ?
          AND funcionario_id = ?
          AND qualificacao_codigo = ?
          AND id <> ?
          AND deleted_at IS NULL
          AND ${sqlStatusEqualsAny('status', COMPLETED_STATUS_VALUES, QUALIFICACAO_STATUS.CONCLUIDA)}
          AND COALESCE(renovada, 0) = 0
        ORDER BY date(COALESCE(data_conclusao, '1900-01-01')) DESC, id DESC
        LIMIT 1`,
    )
    .bind(empresaId, participante.funcionario_id, evento.qualificacao_codigo, upserted.historicoId)
    .first<{ id: number }>();

  if (anterior?.id) {
    await db
      .prepare(
        `UPDATE qualificacoes_historico
            SET renovada = 1,
                status = 'RENOVADA',
                updated_at = datetime('now')
          WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
      )
      .bind(anterior.id, empresaId)
      .run();
  }

  try {
    await publishQualificacaoEvent(
      db,
      'created',
      participante.funcionario_id,
      evento.qualificacao_codigo,
      {
        registro_id: upserted.historicoId,
        status: QUALIFICACAO_STATUS.CONCLUIDA,
      },
    );
  } catch (error) {
    console.error('planned_training_publish_event_error', error);
  }

  return true;
}

async function scheduleSolicitacoesForParticipante(
  db: D1Database,
  empresaId: number,
  evento: EventoContextRow,
  participante: ParticipanteContextRow,
): Promise<void> {
  if (!(await tabelaExiste(db, 'solicitacoes_treinamento'))) return;

  const rows = await db
    .prepare(
      `SELECT id, status, status_pre_agendamento, treinamento_planejado_id, solicitante_id, qualificacao_id
         FROM solicitacoes_treinamento
        WHERE empresa_id = ?
          AND solicitante_id = ?
          AND qualificacao_id = ?
          AND deleted_at IS NULL
          AND status IN ('APROVADA_GESTOR', 'APROVADA_OPS', 'AGENDADA')
          AND (treinamento_planejado_id IS NULL OR treinamento_planejado_id = ?)
        ORDER BY datetime(created_at) DESC, id DESC`,
    )
    .bind(empresaId, participante.funcionario_id, evento.qualificacao_tipo_id, evento.id)
    .all<SolicitacaoRow>();

  for (const row of rows.results || []) {
    const previousStatus = REQUEST_APPROVAL_STATUSES.has(String(row.status || '').toUpperCase())
      ? String(row.status)
      : row.status_pre_agendamento || DEFAULT_REQUEST_PREVIOUS_STATUS;

    await db
      .prepare(
        `UPDATE solicitacoes_treinamento
            SET status = 'AGENDADA',
                data_prevista = ?,
                treinamento_planejado_id = ?,
                status_pre_agendamento = ?,
                updated_at = datetime('now')
          WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
      )
      .bind(evento.data_prevista, evento.id, previousStatus, row.id, empresaId)
      .run();
  }
}

async function unscheduleSolicitacoesLinkedToTraining(
  db: D1Database,
  empresaId: number,
  treinamentoId: number,
  funcionarioId: number,
): Promise<void> {
  if (!(await tabelaExiste(db, 'solicitacoes_treinamento'))) return;

  const rows = await db
    .prepare(
      `SELECT id, status_pre_agendamento
         FROM solicitacoes_treinamento
        WHERE empresa_id = ?
          AND solicitante_id = ?
          AND treinamento_planejado_id = ?
          AND deleted_at IS NULL
          AND status = 'AGENDADA'`,
    )
    .bind(empresaId, funcionarioId, treinamentoId)
    .all<{ id: string; status_pre_agendamento: string | null }>();

  for (const row of rows.results || []) {
    const previousStatus = REQUEST_REVERT_ALLOWED.has(String(row.status_pre_agendamento || ''))
      ? String(row.status_pre_agendamento)
      : DEFAULT_REQUEST_PREVIOUS_STATUS;

    await db
      .prepare(
        `UPDATE solicitacoes_treinamento
            SET status = ?,
                data_prevista = NULL,
                treinamento_planejado_id = NULL,
                status_pre_agendamento = NULL,
                updated_at = datetime('now')
          WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
      )
      .bind(previousStatus, row.id, empresaId)
      .run();
  }
}

async function concluirSolicitacoesLinkedToTraining(
  db: D1Database,
  empresaId: number,
  treinamentoId: number,
  funcionarioId: number,
  dataRealizada: string,
): Promise<void> {
  if (!(await tabelaExiste(db, 'solicitacoes_treinamento'))) return;

  await db
    .prepare(
      `UPDATE solicitacoes_treinamento
          SET status = 'CONCLUIDA',
              data_realizada = ?,
              status_pre_agendamento = NULL,
              updated_at = datetime('now')
        WHERE empresa_id = ?
          AND solicitante_id = ?
          AND treinamento_planejado_id = ?
          AND deleted_at IS NULL
          AND status IN ('APROVADA_GESTOR', 'APROVADA_OPS', 'AGENDADA')`,
    )
    .bind(dataRealizada, empresaId, funcionarioId, treinamentoId)
    .run();
}

export async function syncTreinamentoPlanejadoIntegration(params: {
  db: D1Database;
  empresaId: number;
  treinamentoId: number;
  removedParticipants?: RemovedParticipantLink[];
}): Promise<void> {
  const { db, empresaId, treinamentoId } = params;

  const evento = await loadEventoContext(db, empresaId, treinamentoId);
  if (!evento) return;

  let historicoChanged = false;
  const currentParticipants = await loadParticipantesContext(db, treinamentoId);
  const removedParticipants = params.removedParticipants || [];

  for (const participante of removedParticipants) {
    const canceled = await cancelManagedHistoricoForParticipante(
      db,
      empresaId,
      treinamentoId,
      participante,
    );
    historicoChanged = historicoChanged || canceled;
    await unscheduleSolicitacoesLinkedToTraining(
      db,
      empresaId,
      treinamentoId,
      participante.funcionario_id,
    );
  }

  if (evento.status === 'CANCELADO') {
    for (const participante of currentParticipants) {
      const canceled = await cancelManagedHistoricoForParticipante(
        db,
        empresaId,
        treinamentoId,
        participante,
      );
      historicoChanged = historicoChanged || canceled;
      await unscheduleSolicitacoesLinkedToTraining(
        db,
        empresaId,
        treinamentoId,
        participante.funcionario_id,
      );
    }

    if (historicoChanged) {
      await invalidateMaterializedStats(db);
    }
    return;
  }

  for (const participante of currentParticipants) {
    const upserted = await upsertHistoricoPlanejadoForParticipante(
      db,
      empresaId,
      evento,
      participante,
    );
    historicoChanged = historicoChanged || upserted.changed;
    await scheduleSolicitacoesForParticipante(db, empresaId, evento, participante);

    if (shouldCompleteParticipante(evento, participante)) {
      const completed = await concluirHistoricoPlanejado(db, empresaId, evento, participante);
      historicoChanged = historicoChanged || completed;
      await concluirSolicitacoesLinkedToTraining(
        db,
        empresaId,
        treinamentoId,
        participante.funcionario_id,
        evento.data_prevista,
      );
    }
  }

  if (historicoChanged) {
    await invalidateMaterializedStats(db);
  }
}

export async function sincronizarSolicitacaoAgendadaComTreinamentoPlanejado(params: {
  db: D1Database;
  empresaId: number;
  solicitacaoId: string;
  dataPrevista: string | null;
}): Promise<{ treinamentoPlanejadoId: number | null }> {
  const { db, empresaId, solicitacaoId, dataPrevista } = params;

  if (!dataPrevista) {
    return { treinamentoPlanejadoId: null };
  }

  const solicitacao = await db
    .prepare(
      `SELECT id, status, status_pre_agendamento, treinamento_planejado_id, solicitante_id, qualificacao_id, titulo, descricao
         FROM solicitacoes_treinamento
        WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
    )
    .bind(solicitacaoId, empresaId)
    .first<SolicitacaoRow>();

  if (!solicitacao?.qualificacao_id) {
    return { treinamentoPlanejadoId: null };
  }

  let treinamentoPlanejadoId = Number(solicitacao.treinamento_planejado_id || 0) || null;

  if (!treinamentoPlanejadoId) {
    const existing = await db
      .prepare(
        `SELECT t.id
           FROM treinamentos_planejados t
           INNER JOIN treinamentos_participantes tp ON tp.treinamento_id = t.id
          WHERE t.empresa_id = ?
            AND t.qualificacao_tipo_id = ?
            AND date(t.data_prevista) = date(?)
            AND tp.funcionario_id = ?
            AND t.deleted_at IS NULL
            AND t.status <> 'CANCELADO'
          ORDER BY t.id DESC
          LIMIT 1`,
      )
      .bind(empresaId, solicitacao.qualificacao_id, dataPrevista, solicitacao.solicitante_id)
      .first<{ id: number }>();

    if (existing?.id) {
      treinamentoPlanejadoId = existing.id;
    }
  }

  if (!treinamentoPlanejadoId) {
    const result = await db
      .prepare(
        `INSERT INTO treinamentos_planejados (
          empresa_id, qualificacao_tipo_id, data_prevista, status,
          titulo, descricao, observacoes, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, 'PLANEJADO', ?, ?, ?, NULL, datetime('now'), datetime('now'))`,
      )
      .bind(
        empresaId,
        solicitacao.qualificacao_id,
        dataPrevista,
        solicitacao.titulo || 'Treinamento planejado',
        solicitacao.descricao || null,
        `Origem: Solicitação de Treinamento #${solicitacao.id}`,
      )
      .run();
    treinamentoPlanejadoId = Number(result.meta.last_row_id || 0) || null;
  }

  if (!treinamentoPlanejadoId) {
    return { treinamentoPlanejadoId: null };
  }

  const participante = await db
    .prepare(
      'SELECT id FROM treinamentos_participantes WHERE treinamento_id = ? AND funcionario_id = ?',
    )
    .bind(treinamentoPlanejadoId, solicitacao.solicitante_id)
    .first<{ id: number }>();

  if (!participante) {
    await db
      .prepare(
        `INSERT INTO treinamentos_participantes (
          treinamento_id, funcionario_id, confirmado, presente, aprovado, nota, observacoes, created_at, updated_at
        ) VALUES (?, ?, 0, NULL, NULL, NULL, NULL, datetime('now'), datetime('now'))`,
      )
      .bind(treinamentoPlanejadoId, solicitacao.solicitante_id)
      .run();
  }

  const previousStatus = REQUEST_APPROVAL_STATUSES.has(
    String(solicitacao.status || '').toUpperCase(),
  )
    ? String(solicitacao.status)
    : solicitacao.status_pre_agendamento || DEFAULT_REQUEST_PREVIOUS_STATUS;

  await db
    .prepare(
      `UPDATE solicitacoes_treinamento
          SET status = 'AGENDADA',
              data_prevista = ?,
              treinamento_planejado_id = ?,
              status_pre_agendamento = ?,
              updated_at = datetime('now')
        WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
    )
    .bind(dataPrevista, treinamentoPlanejadoId, previousStatus, solicitacaoId, empresaId)
    .run();

  await syncTreinamentoPlanejadoIntegration({
    db,
    empresaId,
    treinamentoId: treinamentoPlanejadoId,
  });

  return { treinamentoPlanejadoId };
}

export async function sincronizarSolicitacaoConcluidaComTreinamentoPlanejado(params: {
  db: D1Database;
  empresaId: number;
  solicitacaoId: string;
  dataRealizada: string;
}): Promise<{ treinamentoPlanejadoId: number | null; qualificacaoHistoricoId: number | null }> {
  const { db, empresaId, solicitacaoId } = params;

  const solicitacao = await db
    .prepare(
      `SELECT id, treinamento_planejado_id, solicitante_id, qualificacao_id
         FROM solicitacoes_treinamento
        WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
    )
    .bind(solicitacaoId, empresaId)
    .first<{
      id: string;
      treinamento_planejado_id: number | null;
      solicitante_id: number;
      qualificacao_id: number | null;
    }>();

  const treinamentoPlanejadoId = Number(solicitacao?.treinamento_planejado_id || 0) || null;
  if (!solicitacao || !treinamentoPlanejadoId) {
    return { treinamentoPlanejadoId: null, qualificacaoHistoricoId: null };
  }

  await db
    .prepare(
      `UPDATE treinamentos_participantes
          SET confirmado = 1,
              presente = 1,
              aprovado = 1,
              updated_at = datetime('now')
        WHERE treinamento_id = ? AND funcionario_id = ?`,
    )
    .bind(treinamentoPlanejadoId, solicitacao.solicitante_id)
    .run();

  const pendencias = await db
    .prepare(
      `SELECT COUNT(*) AS pendentes
         FROM treinamentos_participantes
        WHERE treinamento_id = ?
          AND (presente IS NULL AND aprovado IS NULL)`,
    )
    .bind(treinamentoPlanejadoId)
    .first<{ pendentes: number | string | null }>();

  if (Number(pendencias?.pendentes || 0) === 0) {
    await db
      .prepare(
        `UPDATE treinamentos_planejados
            SET status = 'CONCLUIDO',
                updated_at = datetime('now')
          WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
      )
      .bind(treinamentoPlanejadoId, empresaId)
      .run();
  }

  await syncTreinamentoPlanejadoIntegration({
    db,
    empresaId,
    treinamentoId: treinamentoPlanejadoId,
  });

  const participante = await db
    .prepare(
      `SELECT qualificacao_historico_id
         FROM treinamentos_participantes
        WHERE treinamento_id = ? AND funcionario_id = ?`,
    )
    .bind(treinamentoPlanejadoId, solicitacao.solicitante_id)
    .first<{ qualificacao_historico_id: number | null }>();

  return {
    treinamentoPlanejadoId,
    qualificacaoHistoricoId: Number(participante?.qualificacao_historico_id || 0) || null,
  };
}

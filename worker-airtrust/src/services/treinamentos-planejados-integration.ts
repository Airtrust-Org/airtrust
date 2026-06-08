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
import { syncTreinamentoToEscalaEventos } from '../shared/syncEscalaEventosExternos';

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
  data_inicio: string | null;
  data_fim: string | null;
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
  created_by: number | null;
};

type ParticipanteContextRow = {
  id: number;
  funcionario_id: number;
  qualificacao_historico_id: number | null;
  confirmado: number | null;
  presente: number | null;
  aprovado: number | null;
  resultado: string | null;
  data_conclusao_efetiva: string | null;
};

type HistoricoPlanejadoRow = {
  id: number;
  funcionario_id: number;
  qualificacao_codigo: string | null;
  status: string | null;
  observacoes: string | null;
  data_conclusao: string | null;
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

type GeneratedQualificationLinkRow = {
  id: number;
  qualificacao_historico_id: number;
};

const ORIGEM_PREFIX = 'Origem: Treinamento Planejado #';
const DEFAULT_REQUEST_PREVIOUS_STATUS = 'APROVADA_OPS';
const REQUEST_APPROVAL_STATUSES = new Set(['APROVADA_GESTOR', 'APROVADA_OPS']);
const REQUEST_REVERT_ALLOWED = new Set(['APROVADA_GESTOR', 'APROVADA_OPS']);

function buildOrigemMarker(treinamentoId: number): string {
  return `${ORIGEM_PREFIX}${treinamentoId}`;
}

function buildTurmaLabel(evento: EventoContextRow): string {
  return `Origem: Turma ${evento.codigo_turma || `#${evento.id}`}`;
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
  cargaHorariaPrevista?: number | null,
  cargaHorariaInicial?: number | null,
): 'INICIAL' | 'RECORRENTE' | 'SEMESTRAL' | 'UPGRADE' | 'ESPECIFICO' {
  // Se a carga horária prevista bate com a carga horária inicial da qualificação,
  // é um treinamento inicial (primeira concessão/formação).
  if (
    cargaHorariaInicial != null &&
    cargaHorariaInicial > 0 &&
    cargaHorariaPrevista != null &&
    cargaHorariaPrevista === cargaHorariaInicial
  ) {
    return 'INICIAL';
  }
  const normalized = normalizeTipoTreinamento(validade === 6 ? 'SEMESTRAL' : 'RECORRENTE');
  return normalized || 'RECORRENTE';
}

function shouldCompleteParticipante(
  participante: ParticipanteContextRow,
) {
  return (
    Number(participante.aprovado || 0) === 1 &&
    String(participante.resultado || '').toUpperCase() === 'APROVADO' &&
    Boolean(participante.data_conclusao_efetiva)
  );
}

async function tabelaExiste(db: D1Database, nomeTabela: string): Promise<boolean> {
  const result = await db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .bind(nomeTabela)
    .first<{ name: string }>();

  return Boolean(result?.name);
}

async function tabelaTemColunas(
  db: D1Database,
  nomeTabela: string,
  colunasObrigatorias: string[],
): Promise<boolean> {
  if (!(await tabelaExiste(db, nomeTabela))) return false;
  const result = await db
    .prepare(`PRAGMA table_info('${nomeTabela.replaceAll("'", "''")}')`)
    .all<{ name: string }>();
  const columns = new Set((result.results || []).map((row) => row.name));
  return colunasObrigatorias.every((column) => columns.has(column));
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
                t.data_inicio,
                t.data_fim,
                t.status,
                t.instrutor_id,
                instr.nome AS instrutor_nome,
                instr.guerra AS instrutor_guerra,
                t.local,
                t.carga_horaria_prevista,
                t.titulo,
                t.descricao,
                t.observacoes,
                t.codigo_turma,
                t.created_by
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
      `SELECT id, funcionario_id, qualificacao_historico_id, confirmado, presente, aprovado,
              resultado, data_conclusao_efetiva
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
        `SELECT id, funcionario_id, qualificacao_codigo, status, observacoes, data_conclusao
           FROM qualificacoes_historico
          WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
      )
      .bind(historicoId, empresaId)
      .first<HistoricoPlanejadoRow>()) || null
  );
}

async function loadGeneratedQualificationLink(
  db: D1Database,
  empresaId: number,
  treinamentoId: number,
  participanteId: number,
  qualificacaoTipoId: number,
  dataConclusaoEfetiva: string,
): Promise<GeneratedQualificationLinkRow | null> {
  return (
    (await db
      .prepare(
        `SELECT id, qualificacao_historico_id
           FROM treinamentos_qualificacoes_geradas
          WHERE empresa_id = ?
            AND treinamento_id = ?
            AND participante_id = ?
            AND qualificacao_tipo_id = ?
            AND data_conclusao_efetiva = ?
          LIMIT 1`,
      )
      .bind(
        empresaId,
        treinamentoId,
        participanteId,
        qualificacaoTipoId,
        dataConclusaoEfetiva,
      )
      .first<GeneratedQualificationLinkRow>()) || null
  );
}

async function loadGeneratedQualificationLinkByHistorico(
  db: D1Database,
  empresaId: number,
  qualificacaoHistoricoId: number,
): Promise<GeneratedQualificationLinkRow | null> {
  return (
    (await db
      .prepare(
        `SELECT id, qualificacao_historico_id
           FROM treinamentos_qualificacoes_geradas
          WHERE empresa_id = ? AND qualificacao_historico_id = ?
          LIMIT 1`,
      )
      .bind(empresaId, qualificacaoHistoricoId)
      .first<GeneratedQualificationLinkRow>()) || null
  );
}

async function ensureGeneratedQualificationLink(
  db: D1Database,
  empresaId: number,
  evento: EventoContextRow,
  participante: ParticipanteContextRow,
  qualificacaoHistoricoId: number,
  dataConclusaoEfetiva: string,
): Promise<GeneratedQualificationLinkRow> {
  const existing = await loadGeneratedQualificationLink(
    db,
    empresaId,
    evento.id,
    participante.id,
    evento.qualificacao_tipo_id,
    dataConclusaoEfetiva,
  );
  if (existing) return existing;

  // A4: o histórico (qualificacao_historico_id) é a chave ESTÁVEL do vínculo. Quando o
  // gestor corrige a data de conclusão, o mesmo histórico é reaproveitado; inserir uma
  // nova linha violaria UNIQUE(qualificacao_historico_id) e produziria erro 500. Aqui
  // atualizamos a linha existente (idempotente) em vez de inserir.
  const byHistorico = await loadGeneratedQualificationLinkByHistorico(
    db,
    empresaId,
    qualificacaoHistoricoId,
  );
  if (byHistorico) {
    await db
      .prepare(
        `UPDATE treinamentos_qualificacoes_geradas
            SET treinamento_id = ?,
                participante_id = ?,
                funcionario_id = ?,
                qualificacao_tipo_id = ?,
                data_conclusao_efetiva = ?
          WHERE id = ? AND empresa_id = ?`,
      )
      .bind(
        evento.id,
        participante.id,
        participante.funcionario_id,
        evento.qualificacao_tipo_id,
        dataConclusaoEfetiva,
        byHistorico.id,
        empresaId,
      )
      .run();
    return { id: byHistorico.id, qualificacao_historico_id: qualificacaoHistoricoId };
  }

  try {
    await db
      .prepare(
        `INSERT INTO treinamentos_qualificacoes_geradas
          (empresa_id, treinamento_id, participante_id, funcionario_id, qualificacao_tipo_id,
           qualificacao_historico_id, data_conclusao_efetiva)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        empresaId,
        evento.id,
        participante.id,
        participante.funcionario_id,
        evento.qualificacao_tipo_id,
        qualificacaoHistoricoId,
        dataConclusaoEfetiva,
      )
      .run();
  } catch (error) {
    const afterConflict =
      (await loadGeneratedQualificationLink(
        db,
        empresaId,
        evento.id,
        participante.id,
        evento.qualificacao_tipo_id,
        dataConclusaoEfetiva,
      )) || (await loadGeneratedQualificationLinkByHistorico(db, empresaId, qualificacaoHistoricoId));
    if (afterConflict) return afterConflict;
    throw error;
  }

  const inserted = await loadGeneratedQualificationLink(
    db,
    empresaId,
    evento.id,
    participante.id,
    evento.qualificacao_tipo_id,
    dataConclusaoEfetiva,
  );
  if (!inserted) {
    throw new Error('Falha ao registrar vínculo idempotente da qualificação gerada.');
  }
  return inserted;
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
              (${sqlStatusEqualsAny('status', [...PLANNED_QUALIFICATION_STATUS_VALUES, QUALIFICACAO_STATUS.CONCLUIDA, QUALIFICACAO_STATUS.CANCELADA])} AND date(COALESCE(data_conclusao, '1900-01-01')) = date(?))
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
  const tipoTreinamento = resolveTipoTreinamento(
    evento.qualificacao_validade,
    evento.carga_horaria_prevista,
    evento.qualificacao_carga_horaria_inicial,
  );
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

  const normalizedExistingStatus = normalizeQualificationStatusForCompatibility(existing?.status);
  if (
    existing &&
    (normalizedExistingStatus === QUALIFICACAO_STATUS.CONCLUIDA ||
      normalizedExistingStatus === QUALIFICACAO_STATUS.RENOVADA)
  ) {
    const completedObservacoes = mergeObservacoes(
      existing.observacoes,
      [evento.observacoes, buildTurmaLabel(evento)].filter(Boolean).join('\n'),
      marker,
    );
    if (completedObservacoes !== existing.observacoes) {
      await db
        .prepare(
          `UPDATE qualificacoes_historico
              SET observacoes = ?, updated_at = datetime('now')
            WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
        )
        .bind(completedObservacoes, existing.id, empresaId)
        .run();
    }
    await updateParticipanteHistoricoLink(db, evento.id, participante.funcionario_id, existing.id);
    return { historicoId: existing.id, changed: false };
  }

  const observacoes = mergeObservacoes(
    existing?.observacoes,
    [evento.observacoes, buildTurmaLabel(evento)].filter(Boolean).join('\n'),
    marker,
  );

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
    const dataConclusaoCorrigida = participante.data_conclusao_efetiva as string;
    // A4: correção de data em qualificação JÁ concluída — recalcula data/vencimento do
    // histórico (sem duplicar) e mantém o vínculo idempotente coerente. RENOVADA não é
    // re-datada (já foi superada por um registro mais novo).
    if (
      currentStatus === QUALIFICACAO_STATUS.CONCLUIDA &&
      existing?.data_conclusao &&
      existing.data_conclusao !== dataConclusaoCorrigida
    ) {
      const validadeMesesCorrigida =
        typeof evento.qualificacao_validade === 'number' && evento.qualificacao_validade > 0
          ? evento.qualificacao_validade
          : 12;
      const dataVencimentoCorrigida = calcularDataVencimento(
        dataConclusaoCorrigida,
        validadeMesesCorrigida,
        Number(evento.qualificacao_vencimento_fim_mes || 0) === 0 ? 0 : 1,
      );
      await db
        .prepare(
          `UPDATE qualificacoes_historico
              SET data_conclusao = ?, data_vencimento = ?, updated_at = datetime('now')
            WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
        )
        .bind(dataConclusaoCorrigida, dataVencimentoCorrigida, upserted.historicoId, empresaId)
        .run();
    }
    await ensureGeneratedQualificationLink(
      db,
      empresaId,
      evento,
      participante,
      upserted.historicoId,
      dataConclusaoCorrigida,
    );
    return false;
  }

  const dataConclusao = participante.data_conclusao_efetiva as string;
  const validadeMeses =
    typeof evento.qualificacao_validade === 'number' && evento.qualificacao_validade > 0
      ? evento.qualificacao_validade
      : 12;
  const dataVencimento = calcularDataVencimento(
    dataConclusao,
    validadeMeses,
    Number(evento.qualificacao_vencimento_fim_mes || 0) === 0 ? 0 : 1,
  );

  await db
    .prepare(
      `UPDATE qualificacoes_historico
          SET status = '${QUALIFICACAO_STATUS.CONCLUIDA}',
              data_conclusao = ?,
              data_vencimento = ?,
              data_confirmacao = datetime('now'),
              confirmada_por = NULL,
              updated_at = datetime('now')
        WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
    )
    .bind(dataConclusao, dataVencimento, upserted.historicoId, empresaId)
    .run();

  await ensureGeneratedQualificationLink(
    db,
    empresaId,
    evento,
    participante,
    upserted.historicoId,
    dataConclusao,
  );

  // M5: ao concluir um treinamento (inclusive retroativo), só pode ser marcado como
  // RENOVADO um histórico ANTERIOR à nova conclusão. Sem o filtro de data, uma
  // conclusão retroativa marcaria erroneamente a qualificação MAIS NOVA como renovada.
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
          AND date(COALESCE(data_conclusao, '1900-01-01')) < date(?)
        ORDER BY date(COALESCE(data_conclusao, '1900-01-01')) DESC, id DESC
        LIMIT 1`,
    )
    .bind(
      empresaId,
      participante.funcionario_id,
      evento.qualificacao_codigo,
      upserted.historicoId,
      dataConclusao,
    )
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
  if (
    !(await tabelaTemColunas(db, 'solicitacoes_treinamento', [
      'status_pre_agendamento',
      'treinamento_planejado_id',
    ]))
  ) {
    return;
  }

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
  if (
    !(await tabelaTemColunas(db, 'solicitacoes_treinamento', [
      'status_pre_agendamento',
      'treinamento_planejado_id',
    ]))
  ) {
    return;
  }

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
  if (
    !(await tabelaTemColunas(db, 'solicitacoes_treinamento', [
      'status_pre_agendamento',
      'treinamento_planejado_id',
    ]))
  ) {
    return;
  }

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

    if (shouldCompleteParticipante(participante)) {
      const completed = await concluirHistoricoPlanejado(db, empresaId, evento, participante);
      historicoChanged = historicoChanged || completed;
      await concluirSolicitacoesLinkedToTraining(
        db,
        empresaId,
        treinamentoId,
        participante.funcionario_id,
        participante.data_conclusao_efetiva as string,
      );
    }
  }

  // M3: ciclo de vida da turma. Resultado final = APROVADO/REPROVADO/CANCELADO.
  // INCOMPLETO é tratado como pendência (reposição) e mantém a turma EM_ANDAMENTO.
  // Só avançamos o status (nunca rebaixamos CONCLUIDO automaticamente).
  let finalStatus = evento.status;
  if (evento.status !== 'CANCELADO' && currentParticipants.length > 0) {
    const isFinalResult = (resultado: string | null) =>
      ['APROVADO', 'REPROVADO', 'CANCELADO'].includes(String(resultado || '').trim().toUpperCase());
    const finalizedCount = currentParticipants.filter((p) => isFinalResult(p.resultado)).length;
    const desiredStatus =
      finalizedCount === currentParticipants.length
        ? 'CONCLUIDO'
        : finalizedCount > 0
          ? 'EM_ANDAMENTO'
          : null;
    const isDowngrade = evento.status === 'CONCLUIDO' && desiredStatus === 'EM_ANDAMENTO';
    if (desiredStatus && desiredStatus !== evento.status && !isDowngrade) {
      await db
        .prepare(
          `UPDATE treinamentos_planejados
              SET status = ?, updated_at = datetime('now')
            WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
        )
        .bind(desiredStatus, treinamentoId, empresaId)
        .run();
      historicoChanged = true;
      finalStatus = desiredStatus;
    }
  }

  if (historicoChanged) {
    await invalidateMaterializedStats(db);
  }

  const dataInicio = evento.data_inicio || evento.data_prevista;
  const dataFim = evento.data_fim || evento.data_prevista;
  const createdBy = String(evento.created_by || 'system');

  // R1: load instructors; R2: load effective days — both loaded in a single batch query.
  const [instrutorRows, diasRows] = await Promise.all([
    db
      .prepare(
        `SELECT ti.funcionario_id
           FROM treinamentos_instrutores ti
          WHERE ti.treinamento_id = ? AND ti.empresa_id = ?
          UNION
         SELECT t.instrutor_id AS funcionario_id
           FROM treinamentos_planejados t
          WHERE t.id = ? AND t.empresa_id = ? AND t.instrutor_id IS NOT NULL AND t.deleted_at IS NULL`,
      )
      .bind(treinamentoId, empresaId, treinamentoId, empresaId)
      .all<{ funcionario_id: number }>(),
    db
      .prepare(
        `SELECT data
           FROM treinamentos_dias
          WHERE treinamento_id = ? AND empresa_id = ? AND deleted_at IS NULL AND status = 'ATIVO'
          ORDER BY data`,
      )
      .bind(treinamentoId, empresaId)
      .all<{ data: string }>(),
  ]);

  const instrutorIds = [
    ...new Set((instrutorRows.results || []).map((r) => Number(r.funcionario_id)).filter(Boolean)),
  ];
  const diasEfetivos = (diasRows.results || []).map((r) => r.data).filter(Boolean);

  await syncTreinamentoToEscalaEventos({
    db,
    empresaId,
    treinamentoId,
    dataInicio,
    dataFim,
    diasEfetivos: diasEfetivos.length > 0 ? diasEfetivos : undefined,
    status: finalStatus,
    titulo: evento.titulo,
    codigoTurma: evento.codigo_turma,
    participanteIds: currentParticipants.map((p) => p.funcionario_id),
    instrutorIds,
    removedParticipantIds: removedParticipants.map((p) => p.funcionario_id),
    createdBy,
  }).catch((err) => {
    // Escala sync is non-critical — a failure here should not block training operations.
    console.error('treinamento_escala_sync_failed', { treinamentoId, error: (err as Error)?.message });
  });
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
  const { db, empresaId, solicitacaoId, dataRealizada } = params;

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

  // A3: a conclusão pela rota de solicitações precisa usar a MESMA semântica do endpoint
  // novo de conclusão. Preenchendo resultado='APROVADO' + data_conclusao_efetiva, o
  // gate shouldCompleteParticipante dispara e a qualificação é efetivamente EMITIDA
  // (CONCLUIDA) via concluirHistoricoPlanejado — em vez de ficar presa em PLANEJADA.
  await db
    .prepare(
      `UPDATE treinamentos_participantes
          SET confirmado = 1,
              presente = 1,
              aprovado = 1,
              resultado = COALESCE(NULLIF(resultado, ''), 'APROVADO'),
              data_conclusao_efetiva = COALESCE(data_conclusao_efetiva, ?),
              concluido_em = COALESCE(concluido_em, datetime('now')),
              updated_at = datetime('now')
        WHERE treinamento_id = ? AND funcionario_id = ?`,
    )
    .bind(dataRealizada, treinamentoPlanejadoId, solicitacao.solicitante_id)
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

import { calcularDataVencimento, type VencimentoMode } from '../utils/qualificacoes-expiration';
import { syncMatriculaCycleHistoricoLink } from './lms-matricula-cycle';

export interface LmsQualificationCompletionParams {
  db: D1Database;
  matriculaId: number;
  empresaId: number;
  funcionarioId: number;
  cursoTitulo: string;
  qualificacaoTipoId: number;
  qualificacaoCodigo: string | null;
  qualificacaoNome: string;
  qualificacaoCategoria: string | null;
  validade: number | null;
  vencimentoFimMes?: VencimentoMode | null;
  dataConclusao: string;
  existingHistoricoId?: number | null;
}

function appendObservacaoIfMissing(observacoes: string | null | undefined, marker: string): string {
  const base = (observacoes ?? '').trim();
  if (!base) return marker;
  if (base.includes(marker)) return base;
  return `${base}\n${marker}`;
}

async function linkMatriculaToHistorico(
  db: D1Database,
  matriculaId: number,
  empresaId: number,
  historicoId: number,
) {
  await db
    .prepare(
      "UPDATE lms_matriculas SET qualificacao_historico_id = ?, updated_at = datetime('now') WHERE id = ? AND empresa_id = ?",
    )
    .bind(historicoId, matriculaId, empresaId)
    .run();

  await syncMatriculaCycleHistoricoLink(db, {
    matriculaId,
    historicoId,
    empresaId,
  });
}

export async function createLmsQualificationOnCompletion(params: LmsQualificationCompletionParams) {
  if (params.existingHistoricoId) {
    return params.existingHistoricoId;
  }

  const validadeMeses =
    typeof params.validade === 'number' && params.validade > 0 ? params.validade : null;
  const vencimentoFimMes = params.vencimentoFimMes === 0 ? 0 : 1;
  const dataVencimento =
    validadeMeses != null
      ? calcularDataVencimento(params.dataConclusao, validadeMeses, vencimentoFimMes)
      : null;
  const qualificacaoCodigo = params.qualificacaoCodigo ?? params.qualificacaoNome;
  const observacoes = `Origem: LMS | Gerado automaticamente ao concluir: ${params.cursoTitulo}`;
  const marcadorRenovacao = `Renovada via LMS matrícula #${params.matriculaId} em ${new Date().toISOString().slice(0, 10)}`;

  const existingHistorico = await params.db
    .prepare(
      `SELECT id
         FROM qualificacoes_historico
        WHERE empresa_id = ?
          AND funcionario_id = ?
          AND qualificacao_codigo = ?
          AND data_conclusao = ?
          AND deleted_at IS NULL
        ORDER BY id DESC
        LIMIT 1`,
    )
    .bind(params.empresaId, params.funcionarioId, qualificacaoCodigo, params.dataConclusao)
    .first<{ id: number }>();

  if (existingHistorico?.id) {
    await linkMatriculaToHistorico(
      params.db,
      params.matriculaId,
      params.empresaId,
      existingHistorico.id,
    );
    return existingHistorico.id;
  }

  const anteriorAtiva = await params.db
    .prepare(
      `SELECT id, observacoes
         FROM qualificacoes_historico
        WHERE empresa_id = ?
          AND funcionario_id = ?
          AND qualificacao_codigo = ?
          AND COALESCE(renovada, 0) = 0
          AND COALESCE(data_conclusao, '') <> ?
          AND deleted_at IS NULL
        ORDER BY data_vencimento DESC, id DESC
        LIMIT 1`,
    )
    .bind(params.empresaId, params.funcionarioId, qualificacaoCodigo, params.dataConclusao)
    .first<{ id: number; observacoes?: string | null }>();

  if (anteriorAtiva?.id) {
    await params.db
      .prepare(
        `UPDATE qualificacoes_historico
            SET renovada = 1,
                status = 'RENOVADA',
                updated_at = datetime('now'),
                observacoes = ?
          WHERE id = ?`,
      )
      .bind(
        appendObservacaoIfMissing(anteriorAtiva.observacoes, marcadorRenovacao),
        anteriorAtiva.id,
      )
      .run();
  }

  let historicoId = 0;

  try {
    const result = await params.db
      .prepare(
        `INSERT INTO qualificacoes_historico (
           funcionario_id,
           qualificacao_id,
           qualificacao_codigo,
           tipo_codigo,
           codigo,
           categoria,
           data_conclusao,
           data_vencimento,
           validade_meses,
           observacoes,
           empresa_id,
           tipo,
           status,
           renovacao_de,
           lms_matricula_id,
           origem_tipo,
           created_at,
           updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'LMS', datetime('now'), datetime('now'))`,
      )
      .bind(
        params.funcionarioId,
        params.qualificacaoTipoId,
        qualificacaoCodigo,
        'TREINAMENTO',
        qualificacaoCodigo,
        params.qualificacaoCategoria ?? 'TREINAMENTO',
        params.dataConclusao,
        dataVencimento,
        validadeMeses,
        observacoes,
        params.empresaId,
        'LMS',
        'CONCLUIDA',
        anteriorAtiva?.id ?? null,
        params.matriculaId,
      )
      .run();

    historicoId = Number(result.meta.last_row_id || 0);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (!message.includes('qualificacoes_historico.funcionario_id')) {
      throw error;
    }

    const concurrentHistorico = await params.db
      .prepare(
        `SELECT id
           FROM qualificacoes_historico
          WHERE empresa_id = ?
            AND funcionario_id = ?
            AND qualificacao_codigo = ?
            AND data_conclusao = ?
            AND deleted_at IS NULL
          ORDER BY id DESC
          LIMIT 1`,
      )
      .bind(params.empresaId, params.funcionarioId, qualificacaoCodigo, params.dataConclusao)
      .first<{ id: number }>();

    if (!concurrentHistorico?.id) {
      throw error;
    }

    historicoId = concurrentHistorico.id;
  }

  await linkMatriculaToHistorico(params.db, params.matriculaId, params.empresaId, historicoId);

  return historicoId;
}

import {
  CANCELLED_STATUS_VALUES,
  PLANNED_QUALIFICATION_STATUS_VALUES,
  sqlStatusEqualsAny,
} from '../status/status-codes';
import { buildCurrentOperationalQualificationPredicate } from './operational-qualification-predicates';

type HistoricoTipoCol = 'tipo_qualificacao_id' | 'qualificacao_id' | 'tipo_id';
type HistoricoDateStartCol = 'data_realizacao' | 'data_conclusao';
type HistoricoDateEndCol = 'data_validade' | 'data_vencimento';

/** Compatibility of legacy matrix datasets is explicit; arbitrary SQL column
 * names are never accepted from a user or the database result.
 */
export interface MatrixHistorySqlOptions {
  tipoCol: HistoricoTipoCol;
  dataInicioCol: HistoricoDateStartCol;
  dataFimCol: HistoricoDateEndCol;
  hasStatus: boolean;
  hasEmpresaId: boolean;
  hasRenewalLink: boolean;
  typeIdCount: number;
}

/**
 * Matrix uses the same current-realization domain rule as Compliance/CMA
 * when modern renewal lineage exists. Older schemas retain a conservative
 * completed/status/date filter, with no invented renewal link.
 *
 * Ordered binds: funcionarioId, [empresaId], ...qualificationTypeIds.
 */
export function buildMatrixCurrentHistorySql(options: MatrixHistorySqlOptions): string {
  const {
    tipoCol, dataInicioCol, dataFimCol, hasStatus, hasEmpresaId, hasRenewalLink,
    typeIdCount,
  } = options;
  if (!Number.isInteger(typeIdCount) || typeIdCount < 1 || typeIdCount > 90) {
    throw new RangeError('INVALID_MATRIX_TYPE_ID_CHUNK_SIZE');
  }
  const placeholders = Array(typeIdCount).fill('?').join(',');
  const status = hasStatus ? "UPPER(COALESCE(qh.status, ''))" : "''";
  const canonicalAvailable = hasRenewalLink && hasEmpresaId && hasStatus
    && dataInicioCol === 'data_conclusao';
  const basic = `(qh.deleted_at IS NULL AND qh.${dataInicioCol} IS NOT NULL
    AND NOT (${sqlStatusEqualsAny(status, CANCELLED_STATUS_VALUES)})
    AND NOT (${sqlStatusEqualsAny(status, PLANNED_QUALIFICATION_STATUS_VALUES)}))`;
  const current = canonicalAvailable
    ? buildCurrentOperationalQualificationPredicate('qh')
    : basic;

  return `WITH historico_ativo AS (
    SELECT
      qh.${tipoCol} AS tipo_id,
      qh.${dataInicioCol} AS ultima_data,
      qh.${dataFimCol} AS data_vencimento,
      ROW_NUMBER() OVER (
        PARTITION BY qh.${tipoCol}
        ORDER BY date(qh.${dataInicioCol}) DESC, qh.id DESC
      ) AS rn
    FROM qualificacoes_historico qh
    WHERE qh.funcionario_id = ?
      ${hasEmpresaId ? 'AND qh.empresa_id = ?' : ''}
      AND ${current}
      AND qh.${tipoCol} IN (${placeholders})
  )
  SELECT tipo_id, ultima_data, data_vencimento
  FROM historico_ativo WHERE rn = 1`;
}

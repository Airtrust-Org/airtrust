import {
  CANCELLED_STATUS_VALUES,
  PLANNED_QUALIFICATION_STATUS_VALUES,
  sqlStatusEqualsAny,
} from '../status/status-codes';
import { buildCurrentOperationalQualificationPredicate } from './operational-qualification-predicates';

export type Ficha360HistoryColumns = {
  tipoCol: 'tipo_qualificacao_id' | 'qualificacao_id';
  inicioCol: 'data_realizacao' | 'data_conclusao';
  fimCol: 'data_validade' | 'data_vencimento';
  hasStatus: boolean;
  hasEmpresaId: boolean;
  hasRenewalLink: boolean;
};

/**
 * The qualification shown as "current" in Ficha 360 must be the most recent
 * completed realization, never the old row with the most distant expiry.
 * On modern schema, reuse the same renewal-lineage rule as Dashboard/Matrix.
 *
 * Parameter order:
 * - Modern schema: funcionarioId, empresaId
 * - Legacy history lacking empresa_id: empresaId, funcionarioId
 * Tenant is mandatory for the type join even on legacy history.
 */
export function buildFicha360CurrentHistorySql(cols: Ficha360HistoryColumns): string {
  const statusExpr = cols.hasStatus ? "UPPER(COALESCE(q.status, ''))" : "''";
  const basicEligibility = `(q.deleted_at IS NULL
    AND q.${cols.inicioCol} IS NOT NULL
    AND NOT (${sqlStatusEqualsAny(statusExpr, CANCELLED_STATUS_VALUES)})
    AND NOT (${sqlStatusEqualsAny(statusExpr, PLANNED_QUALIFICATION_STATUS_VALUES)}))`;
  const current = cols.hasStatus && cols.hasEmpresaId && cols.hasRenewalLink
    && cols.inicioCol === 'data_conclusao'
      ? buildCurrentOperationalQualificationPredicate('q')
      : basicEligibility;

  return `WITH qualificacoes_ativas AS (
    SELECT q.id, q.funcionario_id,
           q.${cols.tipoCol} AS tipo_id,
           q.${cols.inicioCol} AS data_realizacao,
           q.${cols.fimCol} AS data_vencimento,
           q.observacoes, q.created_at, q.updated_at,
           q.origem_tipo, q.lms_matricula_id,
           tq.categoria, tq.nome, tq.codigo,
           ROW_NUMBER() OVER (
             PARTITION BY UPPER(TRIM(tq.codigo))
             ORDER BY date(q.${cols.inicioCol}) DESC, q.id DESC
           ) AS rn
      FROM qualificacoes_historico q
      JOIN qualificacoes_tipos tq ON q.${cols.tipoCol} = tq.id
       ${cols.hasEmpresaId ? 'AND tq.empresa_id = q.empresa_id' : 'AND tq.empresa_id = ?'}
     WHERE q.funcionario_id = ?
       ${cols.hasEmpresaId ? 'AND q.empresa_id = ?' : ''}
       AND ${current}
  )
  SELECT id, funcionario_id, tipo_id, data_realizacao, data_vencimento,
         observacoes, created_at, updated_at, categoria, nome, codigo,
         origem_tipo, lms_matricula_id
    FROM qualificacoes_ativas WHERE rn = 1
   ORDER BY date(data_realizacao) DESC, id DESC`;
}

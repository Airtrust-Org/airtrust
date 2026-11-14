import {
  CANCELLED_STATUS_VALUES,
  PLANNED_QUALIFICATION_STATUS_VALUES,
  sqlStatusEqualsAny,
} from '../status/status-codes';
import { buildCurrentOperationalQualificationPredicate } from './operational-qualification-predicates';
import { collectByBindChunks } from '../../utils/d1-bind-chunks';

export type ComplianceHistoricColumns = {
  tipoCol: 'tipo_qualificacao_id' | 'qualificacao_id';
  inicioCol: 'data_realizacao' | 'data_conclusao';
  fimCol: 'data_vencimento' | 'data_validade';
  hasStatus: boolean;
  hasTenant: boolean;
  hasRenewalLink: boolean;
};

export interface ComplianceEmployeeQualification {
  funcionario_id: number;
  data_vencimento: string | null;
  codigo: string;
}

/** Latest ACTUALLY COMPLETED qualification, not the row with longest expiry.
 * The tenant of both qh and qualification type is explicitly scoped.
 * In legacy schemas where the renewal link is absent, the chronological
 * selection still ignores cancelled, planned and uncompleted snapshots.
 */
export function buildComplianceCurrentQualificationSql(
  cols: ComplianceHistoricColumns,
  employeeCount: number,
): string {
  if (!Number.isInteger(employeeCount) || employeeCount < 1 || employeeCount > 90) {
    throw new RangeError('INVALID_COMPLIANCE_EMPLOYEE_CHUNK_SIZE');
  }
  const placeholders = Array(employeeCount).fill('?').join(',');
  const statusExpr = cols.hasStatus ? "UPPER(COALESCE(qh.status, ''))" : "''";
  const basicEligibility = `qh.deleted_at IS NULL
    AND qh.${cols.inicioCol} IS NOT NULL
    AND NOT (${sqlStatusEqualsAny(statusExpr, CANCELLED_STATUS_VALUES)})
    AND NOT (${sqlStatusEqualsAny(statusExpr, PLANNED_QUALIFICATION_STATUS_VALUES)})`;
  const canUseCanonical = cols.hasTenant && cols.hasStatus && cols.hasRenewalLink
    && cols.inicioCol === 'data_conclusao';
  const eligibility = canUseCanonical
    ? buildCurrentOperationalQualificationPredicate('qh')
    : `(${basicEligibility})`;

  return `WITH qualificacoes_ativas AS (
    SELECT qh.funcionario_id, qh.${cols.fimCol} AS data_vencimento,
           tq.codigo,
           ROW_NUMBER() OVER (
             PARTITION BY qh.funcionario_id, UPPER(TRIM(tq.codigo))
             ORDER BY date(qh.${cols.inicioCol}) DESC, qh.id DESC
           ) AS rn
      FROM qualificacoes_historico qh
      JOIN qualificacoes_tipos tq
        ON tq.id = qh.${cols.tipoCol}
       AND tq.empresa_id = ?
       AND tq.deleted_at IS NULL
     WHERE qh.funcionario_id IN (${placeholders})
       ${cols.hasTenant ? 'AND qh.empresa_id = ?' : ''}
       AND ${eligibility}
  )
  SELECT funcionario_id, data_vencimento, codigo
    FROM qualificacoes_ativas
   WHERE rn = 1`;
}

export async function loadComplianceCurrentQualificacoes(
  db: D1Database,
  empresaId: number,
  ids: readonly number[],
  columns: ComplianceHistoricColumns,
): Promise<ComplianceEmployeeQualification[]> {
  const unique = [...new Set(ids)];
  if (unique.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
    throw new Error('INVALID_COMPLIANCE_EMPLOYEE_ID');
  }
  const fixed = 1 + (columns.hasTenant ? 1 : 0);
  return collectByBindChunks<number, ComplianceEmployeeQualification>(
    unique, fixed, async (batch) => {
      const sql = buildComplianceCurrentQualificationSql(columns, batch.length);
      const binds = [empresaId, ...batch, ...(columns.hasTenant ? [empresaId] : [])];
      const { results } = await db.prepare(sql).bind(...binds).all<ComplianceEmployeeQualification>();
      return results ?? [];
    },
  );
}

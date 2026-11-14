import { buildCurrentOperationalQualificationPredicate } from './operational-qualification-predicates';
import { getQualificacoesVencimentoExpr } from '../../utils/qualificacoes-alerta-config';
import { chunkByBindBudget } from '../../utils/d1-bind-chunks';

export interface ExpiredCrewQualification {
  func_id: number;
  func_nome: string;
  qual_nome: string;
  qual_codigo: string;
  data_vencimento_calc: string;
}

/**
 * Returns only the most recent CURRENT realization per employee and qualification.
 *
 * The old NOP-OPS-038 query trusted the legacy qh.renovada=0, ignored status,
 * ignored tenant on the type join, and used UTC date('now'). This made a
 * cancelled/planned qualification appear operational and let an expired
 * predecessor create an obsolete warning even after a valid renewal.
 *
 * Bind order: empresaId, ...employeeIds, SaoPauloCivilDate.
 * The list is generated solely from validated placeholders, never user SQL.
 */
export function buildExpiredCrewQualificationsSql(idCount: number): string {
  if (!Number.isInteger(idCount) || idCount < 1 || idCount > 90) {
    throw new Error('INVALID_CREW_QUALIFICATION_BIND_COUNT');
  }
  const placeholders = Array(idCount).fill('?').join(', ');
  const expiry = getQualificacoesVencimentoExpr('qh', 'qt');
  const current = buildCurrentOperationalQualificationPredicate('qh');

  return `WITH current_candidates AS (
    SELECT
      f.id AS func_id,
      f.nome AS func_nome,
      COALESCE(qt.nome, qh.tipo, qh.qualificacao_codigo, 'Qualificação') AS qual_nome,
      COALESCE(qt.codigo, qh.qualificacao_codigo, '') AS qual_codigo,
      ${expiry} AS data_vencimento_calc,
      ROW_NUMBER() OVER (
        PARTITION BY qh.empresa_id, qh.funcionario_id,
          UPPER(TRIM(COALESCE(
            NULLIF(qh.qualificacao_codigo, ''),
            NULLIF(qt.codigo, ''),
            CAST(qh.qualificacao_id AS TEXT),
            ''
          )))
        ORDER BY date(qh.data_conclusao) DESC, qh.id DESC
      ) AS ordem
    FROM qualificacoes_historico qh
    JOIN funcionarios f
      ON f.id = qh.funcionario_id
     AND f.empresa_id = qh.empresa_id
     AND f.deleted_at IS NULL
    LEFT JOIN qualificacoes_tipos qt
      ON qt.id = qh.qualificacao_id
     AND qt.empresa_id = qh.empresa_id
     AND qt.deleted_at IS NULL
    WHERE qh.empresa_id = ?
      AND qh.funcionario_id IN (${placeholders})
      AND ${current}
  )
  SELECT func_id, func_nome, qual_nome, qual_codigo, data_vencimento_calc
    FROM current_candidates
   WHERE ordem = 1
     AND data_vencimento_calc IS NOT NULL
     AND date(data_vencimento_calc) < date(?)`;
}

export async function findExpiredCrewQualifications(
  db: D1Database,
  empresaId: number,
  crewIds: readonly number[],
  todaySp: string,
): Promise<ExpiredCrewQualification[]> {
  const unique = [...new Set(crewIds)];
  // NOP-OPS-038 must fail closed: discarding unknown crew IDs would allow
  // an incomplete check to be reported as "no compliance violations".
  if (unique.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
    throw new Error('INVALID_CREW_QUALIFICATION_EMPLOYEE_ID');
  }
  const results: ExpiredCrewQualification[] = [];
  for (const ids of chunkByBindBudget(unique, 2)) {
    const chunk = await db
      .prepare(buildExpiredCrewQualificationsSql(ids.length))
      .bind(empresaId, ...ids, todaySp)
      .all<ExpiredCrewQualification>();
    results.push(...(chunk.results ?? []));
  }
  return results;
}

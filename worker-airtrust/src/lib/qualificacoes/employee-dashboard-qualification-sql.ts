import { buildCurrentOperationalQualificationPredicate } from './operational-qualification-predicates';
import { getQualificacoesVencimentoExpr } from '../../utils/qualificacoes-alerta-config';

/**
 * Consulta canônica para os indicadores de qualificação do dashboard de funcionários.
 * Fonte da elegibilidade: mesmo predicado do dashboard/estatísticas operacionais.
 * A redução a uma realização por funcionário + tipo usa a data de conclusão,
 * e apenas desempata por ID: autoincrement não é cronologia operacional.
 *
 * Os dois fragmentos recebidos são expressões SQL construídas pelo servidor
 * (ativoExpr e employeeSectorSql), nunca texto fornecido pelo usuário.
 * Binds: empresaId, ...sectorScopeBindings, todaySp, todaySp.
 */
export function buildEmployeeQualificationStatsSql(
  activeEmployeePredicate: string,
  sectorScopePredicate: string,
): string {
  const current = buildCurrentOperationalQualificationPredicate('qh');
  const expiry = getQualificacoesVencimentoExpr('qh', 'qt');
  const identity = `UPPER(TRIM(COALESCE(
    NULLIF(qh.qualificacao_codigo, ''),
    NULLIF(qt.codigo, ''),
    CAST(qh.qualificacao_id AS TEXT),
    ''
  )))`;

  return `
    WITH qualification_candidates AS (
      SELECT
        qh.funcionario_id,
        ${expiry} AS data_vencimento_calculada,
        ROW_NUMBER() OVER (
          PARTITION BY qh.empresa_id, qh.funcionario_id, ${identity}
          ORDER BY date(qh.data_conclusao) DESC, qh.id DESC
        ) AS realization_rank
      FROM qualificacoes_historico qh
      JOIN funcionarios f
        ON f.id = qh.funcionario_id AND f.deleted_at IS NULL
        AND f.empresa_id = qh.empresa_id
      LEFT JOIN qualificacoes_tipos qt
        ON qt.deleted_at IS NULL
        AND qt.empresa_id = qh.empresa_id
        AND (
          qt.id = qh.qualificacao_id
          OR (
            qh.qualificacao_id IS NULL
            AND UPPER(TRIM(COALESCE(qh.qualificacao_codigo, ''))) =
                UPPER(TRIM(COALESCE(qt.codigo, '')))
          )
        )
      WHERE ${current}
        AND ${activeEmployeePredicate}
        AND f.empresa_id = ?
        AND ${sectorScopePredicate}
    ),
    qualificacoes_ativas AS (
      SELECT funcionario_id, data_vencimento_calculada
      FROM qualification_candidates
      WHERE realization_rank = 1
    )
    SELECT
      COUNT(DISTINCT funcionario_id) AS funcionarios_com_qualificacoes,
      COUNT(*) AS total_qualificacoes,
      SUM(
        CASE WHEN data_vencimento_calculada IS NULL
          OR date(data_vencimento_calculada) >= date(?) THEN 1 ELSE 0 END
      ) AS qualificacoes_validas,
      SUM(
        CASE WHEN data_vencimento_calculada IS NOT NULL
          AND date(data_vencimento_calculada) < date(?) THEN 1 ELSE 0 END
      ) AS qualificacoes_vencidas
    FROM qualificacoes_ativas
  `;
}

import {
  CANCELLED_STATUS_VALUES,
  PLANNED_QUALIFICATION_STATUS_VALUES,
  sqlStatusEqualsAny,
} from '../status/status-codes';

/**
 * Predicados SQL canônicos de "qualificação operacional vigente" baseados no
 * vínculo explícito `renovacao_de` (sucessor → predecessor).
 *
 * Fonte única para o dashboard (`services/dashboardService.ts`) e para as
 * estatísticas de qualificações (`routes/qualificacoes/estatisticas.ts`),
 * que mantinham cópias idênticas destes builders.
 *
 * Plano de execução (#2078 / auditoria de performance 2026-11-13):
 * no `NOT EXISTS` correlacionado, o comparador de tenant usa o operador unário
 * `+` (`+qh_next.empresa_id = …`). Sem `sqlite_stat1`, o planner do D1
 * preferia `idx_qualificacoes_historico_empresa_deleted (empresa_id, deleted_at)`
 * — duas igualdades — e varria todo o histórico da empresa para CADA linha
 * externa (13,4 milhões de linhas e ~3 s por abertura do dashboard em produção).
 * O `+` só desabilita o uso de índice nesse termo; a condição de tenant continua
 * avaliada integralmente, e o planner passa a usar `idx_qh_renovacao_de`.
 * Coberto por `__tests__/services/qualification-correlated-subquery-plans.sqlite.test.ts`.
 */
function successorExclusionSql(alias: string, extraSuccessorCondition = ''): string {
  const successorStatusExpr = "UPPER(COALESCE(qh_next.status, ''))";
  const successorCancelled = sqlStatusEqualsAny(successorStatusExpr, CANCELLED_STATUS_VALUES);
  const successorPlanned = sqlStatusEqualsAny(
    successorStatusExpr,
    PLANNED_QUALIFICATION_STATUS_VALUES,
  );

  return `NOT EXISTS (
      SELECT 1
      FROM qualificacoes_historico qh_next
      WHERE +qh_next.empresa_id = ${alias}.empresa_id
        AND qh_next.renovacao_de = ${alias}.id
        AND qh_next.deleted_at IS NULL
        AND qh_next.data_conclusao IS NOT NULL${extraSuccessorCondition}
        AND NOT (${successorCancelled})
        AND NOT (${successorPlanned})
    )`;
}

export function buildCurrentOperationalQualificationPredicate(alias = 'qh'): string {
  const statusExpr = `UPPER(COALESCE(${alias}.status, ''))`;
  const cancelled = sqlStatusEqualsAny(statusExpr, CANCELLED_STATUS_VALUES);
  const planned = sqlStatusEqualsAny(statusExpr, PLANNED_QUALIFICATION_STATUS_VALUES);

  return `(${alias}.deleted_at IS NULL
    AND NOT (${cancelled})
    AND NOT (${planned})
    AND ${alias}.data_conclusao IS NOT NULL
    AND ${successorExclusionSql(alias)})`;
}

export function buildHistoricalOperationalQualificationPredicate(
  alias: string,
  cutoffSql: string,
): string {
  const statusExpr = `UPPER(COALESCE(${alias}.status, ''))`;
  const cancelled = sqlStatusEqualsAny(statusExpr, CANCELLED_STATUS_VALUES);
  const planned = sqlStatusEqualsAny(statusExpr, PLANNED_QUALIFICATION_STATUS_VALUES);

  return `(${alias}.deleted_at IS NULL
    AND NOT (${cancelled})
    AND NOT (${planned})
    AND ${alias}.data_conclusao IS NOT NULL
    AND date(${alias}.data_conclusao) <= date(${cutoffSql})
    AND ${successorExclusionSql(
      alias,
      `\n        AND date(qh_next.data_conclusao) <= date(${cutoffSql})`,
    )})`;
}

import type { D1Database } from '@cloudflare/workers-types';

import {
  ACTIVE_OR_COMPLETED_SESSION_STATUS_SQL,
  COMPLETED_STATUS_SQL,
} from '../lib/status/status-codes';
import {
  buildFuncionarioScopeWhere,
  type EmployeeSectorAccess,
} from '../services/employee-sector-access';

export type DashboardTaxaConclusaoMensalMetricRow = {
  mes: string;
  taxa: number | null;
};

export type DashboardUtilizacaoSimuladorMetricRow = {
  id: number;
  nome: string;
  fabricante: string | null;
  modelo: string | null;
  horas_programadas: number | null;
  horas_disponiveis: number | null;
  taxa_utilizacao: number | null;
  status: string | null;
};

function assertEmpresaId(empresaId: number): void {
  if (!Number.isInteger(empresaId) || empresaId <= 0) {
    throw new Error('dashboard metrics repository requires explicit empresaId');
  }
}

export async function getTaxaConclusaoMensalMetricRows(
  db: D1Database,
  empresaId: number,
  access?: EmployeeSectorAccess,
): Promise<DashboardTaxaConclusaoMensalMetricRow[]> {
  assertEmpresaId(empresaId);
  const sessionScope =
    access && access.mode !== 'all'
      ? (() => {
          const scope = buildFuncionarioScopeWhere(access, 'f_scope');
          return {
            clause: `EXISTS (
              SELECT 1
              FROM sessoes_participantes sp_scope
              JOIN funcionarios f_scope
                ON f_scope.id = sp_scope.funcionario_id
               AND f_scope.deleted_at IS NULL
              WHERE sp_scope.sessao_id = simulador_agendamentos.id
                AND sp_scope.deleted_at IS NULL
                AND ${scope.clause}
            )`,
            bindings: scope.bindings,
          };
        })()
      : { clause: '1 = 1', bindings: [] as number[] };

  const results = await db
    .prepare(
      `SELECT
         strftime('%Y-%m', data) as mes,
         COUNT(CASE WHEN status IN ${COMPLETED_STATUS_SQL} THEN 1 END) * 100.0 /
         NULLIF(COUNT(*), 0) as taxa
       FROM simulador_agendamentos
       WHERE deleted_at IS NULL
       AND empresa_id = ?
       AND ${sessionScope.clause}
       AND data >= date('now', '-6 months')
       GROUP BY strftime('%Y-%m', data)
       ORDER BY mes ASC`,
    )
    .bind(empresaId, ...sessionScope.bindings)
    .all<DashboardTaxaConclusaoMensalMetricRow>();

  return results.results || [];
}

export async function getUtilizacaoSimuladoresMetricRows(
  db: D1Database,
  empresaId: number,
  access?: EmployeeSectorAccess,
): Promise<DashboardUtilizacaoSimuladorMetricRow[]> {
  assertEmpresaId(empresaId);
  const sessionScope =
    access && access.mode !== 'all'
      ? (() => {
          const scope = buildFuncionarioScopeWhere(access, 'f_scope');
          return {
            clause: `EXISTS (
              SELECT 1
              FROM sessoes_participantes sp_scope
              JOIN funcionarios f_scope
                ON f_scope.id = sp_scope.funcionario_id
               AND f_scope.deleted_at IS NULL
              WHERE sp_scope.sessao_id = sa.id
                AND sp_scope.deleted_at IS NULL
                AND ${scope.clause}
            )`,
            bindings: scope.bindings,
          };
        })()
      : { clause: '1 = 1', bindings: [] as number[] };

  const results = await db
    .prepare(
      `SELECT
         s.id,
         s.nome,
         s.fabricante,
         s.modelo,
         COALESCE(SUM(CASE WHEN sa.status IN ${ACTIVE_OR_COMPLETED_SESSION_STATUS_SQL} THEN sa.duracao_minutos END), 0) / 60.0 as horas_programadas,
         720 as horas_disponiveis,
         COALESCE(SUM(CASE WHEN sa.status IN ${ACTIVE_OR_COMPLETED_SESSION_STATUS_SQL} THEN sa.duracao_minutos END), 0) * 100.0 / (720 * 60) as taxa_utilizacao,
         'operacional' as status
       FROM simuladores s
       LEFT JOIN simulador_agendamentos sa ON sa.simulador_id = s.id
         AND sa.deleted_at IS NULL
         AND sa.empresa_id = ?
         AND ${sessionScope.clause}
         AND sa.data >= date('now', '-30 days')
         AND sa.data <= date('now')
       WHERE s.deleted_at IS NULL
       AND s.empresa_id = ?
       GROUP BY s.id, s.nome, s.fabricante, s.modelo
       ORDER BY taxa_utilizacao DESC`,
    )
    .bind(empresaId, ...sessionScope.bindings, empresaId)
    .all<DashboardUtilizacaoSimuladorMetricRow>();

  return results.results || [];
}

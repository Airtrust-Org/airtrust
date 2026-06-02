import type { D1Database } from '@cloudflare/workers-types';

import {
  ACTIVE_OR_COMPLETED_SESSION_STATUS_SQL,
  COMPLETED_STATUS_SQL,
} from '../lib/status/status-codes';

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
): Promise<DashboardTaxaConclusaoMensalMetricRow[]> {
  assertEmpresaId(empresaId);

  const results = await db
    .prepare(
      `SELECT
         strftime('%Y-%m', data) as mes,
         COUNT(CASE WHEN status IN ${COMPLETED_STATUS_SQL} THEN 1 END) * 100.0 /
         NULLIF(COUNT(*), 0) as taxa
       FROM simulador_agendamentos
       WHERE deleted_at IS NULL
       AND empresa_id = ?
       AND data >= date('now', '-6 months')
       GROUP BY strftime('%Y-%m', data)
       ORDER BY mes ASC`,
    )
    .bind(empresaId)
    .all<DashboardTaxaConclusaoMensalMetricRow>();

  return results.results || [];
}

export async function getUtilizacaoSimuladoresMetricRows(
  db: D1Database,
  empresaId: number,
): Promise<DashboardUtilizacaoSimuladorMetricRow[]> {
  assertEmpresaId(empresaId);

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
         AND sa.data >= date('now', '-30 days')
         AND sa.data <= date('now')
       WHERE s.deleted_at IS NULL
       AND s.empresa_id = ?
       GROUP BY s.id, s.nome, s.fabricante, s.modelo
       ORDER BY taxa_utilizacao DESC`,
    )
    .bind(empresaId, empresaId)
    .all<DashboardUtilizacaoSimuladorMetricRow>();

  return results.results || [];
}

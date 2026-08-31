import { Hono } from 'hono';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { getTenantContext } from '../middleware/tenant';
import {
  resolveSimulatorPlanningConfig,
  type SimulatorPlanningConfigRow,
  type SimulatorRosterPolicy,
} from '../services/cae-planning-policy';

const app = new Hono<{ Bindings: Env }>();
app.use('*', auth());

const ALLOWED_POLICIES = new Set<SimulatorRosterPolicy>(['FOLGA', 'TRABALHO', 'AMBAS']);

app.put('/config', requireRole('admin'), async (c) => {
  const empresaId = getTenantContext(c).empresaId;
  const body = (await c.req.json().catch(() => null)) as { roster_policy?: unknown } | null;
  const rosterPolicy = String(body?.roster_policy || '')
    .trim()
    .toUpperCase() as SimulatorRosterPolicy;

  if (!ALLOWED_POLICIES.has(rosterPolicy)) {
    return c.json(
      {
        success: false,
        error: 'Regra de escala inválida. Use FOLGA, TRABALHO ou AMBAS.',
        code: 'SIMULATOR_PLANNING_ROSTER_POLICY_INVALID',
      },
      400,
    );
  }

  await c.env.DB
    .prepare(
      `INSERT INTO empresas_config (
         empresa_id,
         planejamento_simulador_regra_quinzena,
         updated_at
       ) VALUES (?, ?, datetime('now'))
       ON CONFLICT(empresa_id) DO UPDATE SET
         planejamento_simulador_regra_quinzena = excluded.planejamento_simulador_regra_quinzena,
         updated_at = datetime('now')`,
    )
    .bind(empresaId, rosterPolicy)
    .run();

  const row = await c.env.DB
    .prepare(
      `SELECT
         planejamento_simulador_antecedencia_dias,
         planejamento_simulador_regra_quinzena,
         planejamento_simulador_preferencia_sessoes_por_dia,
         planejamento_simulador_preferencia_minutos_por_dia,
         planejamento_simulador_permitir_quebra_preferencia,
         planejamento_simulador_permitir_sessao_compartilhada,
         planejamento_simulador_preferir_mesmo_treinamento,
         planejamento_simulador_preferir_mesma_sessao,
         planejamento_simulador_aprovacao_obrigatoria
       FROM empresas_config
       WHERE empresa_id = ?`,
    )
    .bind(empresaId)
    .first<SimulatorPlanningConfigRow>();

  const config = resolveSimulatorPlanningConfig(row);
  return c.json({
    success: true,
    data: {
      roster_policy: config.roster_policy,
      planning_horizon_days: config.planning_horizon_days,
      preferred_sessions_per_day: config.preferred_sessions_per_day,
      preferred_minutes_per_day: config.preferred_minutes_per_day,
      allow_shared_session: config.allow_shared_session,
      source: config.source,
      warnings: config.warnings,
    },
  });
});

export default app;

import { Hono } from 'hono';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { getTenantContext } from '../middleware/tenant';
import {
  resolveSimulatorPlanningConfig,
  type SimulatorPlanningConfigRow,
} from '../services/cae-planning-policy';

const app = new Hono<{ Bindings: Env }>();
app.use('*', auth());

app.get('/config', requireRole('admin', 'manager'), async (c) => {
  const empresaId = getTenantContext(c).empresaId;
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
    .first<SimulatorPlanningConfigRow>()
    .catch(() => undefined);

  const config = resolveSimulatorPlanningConfig(row);
  return c.json({
    success: true,
    data: {
      planning_horizon_days: config.planning_horizon_days,
      roster_policy: config.roster_policy,
      preferred_sessions_per_day: config.preferred_sessions_per_day,
      preferred_minutes_per_day: config.preferred_minutes_per_day,
      allow_shared_session: config.allow_shared_session,
      prefer_same_training: config.prefer_same_training,
      prefer_same_session: config.prefer_same_session,
      source: config.source,
      warnings: config.warnings,
    },
  });
});

export default app;

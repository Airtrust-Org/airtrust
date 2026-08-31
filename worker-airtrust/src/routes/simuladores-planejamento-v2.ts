import { Hono } from 'hono';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { getTenantContext } from '../middleware/tenant';
import {
  buildFuncionarioScopeWhere,
  getEmployeeSectorAccess,
} from '../services/employee-sector-access';
import {
  isInsidePlanningHorizon,
  resolveSimulatorPlanningConfig,
  type SimulatorPlanningConfigRow,
} from '../services/cae-planning-policy';
import { resolveIndividualRemainingModels } from '../services/cae-planning-participant-model-resolver';
import {
  buildSimulatorTrainingClasses,
  pairSimulatorTrainingSessions,
  type SimulatorTrainingSessionNeed,
} from '../services/cae-planning-session-proposal';
import {
  buildRenewalSqlPredicates,
  hasHistoricoRenovacaoDeColumn,
} from './qualificacoes/historico';

const app = new Hono<{ Bindings: Env }>();
app.use('*', auth());

type ModelRow = {
  id: number;
  qualificacao_tipo_id: number;
  codigo: string;
  nome: string;
  duracao_estimada: number | null;
  ordem_no_treinamento: number | null;
  modelo_aeronave: string | null;
};

type QualificationRow = {
  funcionario_id: number;
  funcionario_nome: string;
  funcionario_funcao: string | null;
  qualificacao_tipo_id: number;
  qualificacao_codigo: string | null;
  qualificacao_nome: string;
  data_vencimento: string;
  cycle_start_date: string | null;
};

function isIsoDate(value: unknown): value is string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const parsed = new Date(`${String(value)}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function normalizeEquipment(value: unknown): string {
  const compact = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  if (compact.includes('AW139')) return 'AW139';
  if (compact.includes('SK76') || compact.includes('S76')) return 'SK76';
  return compact || 'UNIVERSAL';
}

async function tableExists(db: D1Database, tableName: string): Promise<boolean> {
  const row = await db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .bind(tableName)
    .first<{ name: string }>();
  return row?.name === tableName;
}

async function loadConfig(db: D1Database, empresaId: number) {
  const row = await db
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
  return resolveSimulatorPlanningConfig(row);
}

async function loadModels(db: D1Database, empresaId: number): Promise<ModelRow[]> {
  const hasVersioning = await tableExists(db, 'modelos_sessao_versionamento');
  const versioningJoin = hasVersioning
    ? `INNER JOIN modelos_sessao_versionamento msv
         ON msv.modelo_id = ms.id
        AND msv.empresa_id = ms.empresa_id
        AND msv.is_current = 1`
    : '';
  const rows = await db
    .prepare(
      `SELECT ms.id,
              ms.qualificacao_tipo_id,
              ms.codigo,
              ms.nome,
              ms.duracao_estimada,
              ms.ordem_no_treinamento,
              ms.modelo_aeronave
         FROM modelos_sessao ms
         ${versioningJoin}
         INNER JOIN qualificacoes_tipos qt
           ON qt.id = ms.qualificacao_tipo_id
          AND qt.empresa_id = ms.empresa_id
          AND qt.deleted_at IS NULL
          AND COALESCE(qt.ativo, 1) = 1
        WHERE ms.empresa_id = ?
          AND ms.deleted_at IS NULL
          AND COALESCE(ms.ativo, 1) = 1
          AND ms.qualificacao_tipo_id IS NOT NULL
        ORDER BY ms.qualificacao_tipo_id,
                 COALESCE(ms.ordem_no_treinamento, 999999),
                 ms.id`,
    )
    .bind(empresaId)
    .all<ModelRow>();
  return rows.results || [];
}

async function loadQualifications(params: {
  db: D1Database;
  empresaId: number;
  inicio: string;
  fim: string;
  scopeClause: string;
  scopeBindings: number[];
  qualificationTypeIds: number[];
}): Promise<QualificationRow[]> {
  if (params.qualificationTypeIds.length === 0) return [];
  const hasRenovacaoDe = await hasHistoricoRenovacaoDeColumn(params.db);
  const { operationalCurrentQualificationPredicate } = buildRenewalSqlPredicates(hasRenovacaoDe);
  const placeholders = params.qualificationTypeIds.map(() => '?').join(', ');
  const rows = await params.db
    .prepare(
      `SELECT f.id AS funcionario_id,
              f.nome AS funcionario_nome,
              f.funcao AS funcionario_funcao,
              qt.id AS qualificacao_tipo_id,
              qt.codigo AS qualificacao_codigo,
              qt.nome AS qualificacao_nome,
              qh.data_vencimento,
              qh.data_conclusao AS cycle_start_date
         FROM qualificacoes_historico qh
         INNER JOIN funcionarios f
           ON f.id = qh.funcionario_id
          AND f.empresa_id = qh.empresa_id
          AND f.deleted_at IS NULL
          AND COALESCE(f.ativo, 1) = 1
         INNER JOIN qualificacoes_tipos qt
           ON qt.id = qh.qualificacao_id
          AND qt.empresa_id = qh.empresa_id
          AND qt.deleted_at IS NULL
          AND COALESCE(qt.ativo, 1) = 1
        WHERE qh.empresa_id = ?
          AND qh.data_vencimento IS NOT NULL
          AND date(qh.data_vencimento) BETWEEN date(?) AND date(?)
          AND qt.id IN (${placeholders})
          AND ${params.scopeClause}
          AND ${operationalCurrentQualificationPredicate}
        ORDER BY date(qh.data_vencimento), f.nome, qt.nome`,
    )
    .bind(
      params.empresaId,
      params.inicio,
      params.fim,
      ...params.qualificationTypeIds,
      ...params.scopeBindings,
    )
    .all<QualificationRow>();
  return rows.results || [];
}

function chooseModelsForQualification(
  qualification: QualificationRow,
  models: ModelRow[],
): { equipment: string; models: ModelRow[]; ambiguous: boolean } {
  const groups = new Map<string, ModelRow[]>();
  for (const model of models) {
    const equipment = normalizeEquipment(model.modelo_aeronave);
    const bucket = groups.get(equipment) || [];
    bucket.push(model);
    groups.set(equipment, bucket);
  }
  if (groups.size === 0) return { equipment: 'A_DEFINIR', models: [], ambiguous: true };
  if (groups.size === 1) {
    const [equipment, rows] = [...groups.entries()][0];
    return { equipment, models: rows, ambiguous: false };
  }
  const identity = normalizeEquipment(
    `${qualification.qualificacao_codigo || ''} ${qualification.qualificacao_nome}`,
  );
  const matched = [...groups.entries()].find(([equipment]) =>
    equipment !== 'UNIVERSAL' && identity.includes(equipment),
  );
  if (matched) {
    return {
      equipment: matched[0],
      models: [...matched[1], ...(groups.get('UNIVERSAL') || [])],
      ambiguous: false,
    };
  }
  return { equipment: 'A_DEFINIR', models: [], ambiguous: true };
}

app.get('/config', requireRole('admin', 'manager'), async (c) => {
  const empresaId = getTenantContext(c).empresaId;
  const config = await loadConfig(c.env.DB, empresaId);
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

app.post('/proposta', requireRole('admin', 'manager'), async (c) => {
  const empresaId = getTenantContext(c).empresaId;
  const body = (await c.req.json().catch(() => null)) as {
    vencimento_inicio?: unknown;
    vencimento_fim?: unknown;
    data_referencia?: unknown;
  } | null;
  const inicio = String(body?.vencimento_inicio || '');
  const fim = String(body?.vencimento_fim || '');
  const referencia = String(body?.data_referencia || new Date().toISOString().slice(0, 10));
  if (!isIsoDate(inicio) || !isIsoDate(fim) || inicio > fim || !isIsoDate(referencia)) {
    return c.json({ success: false, error: 'Intervalo ou data de referência inválidos' }, 400);
  }

  const db = c.env.DB;
  const config = await loadConfig(db, empresaId);
  const access = await getEmployeeSectorAccess(c, empresaId);
  const scope = buildFuncionarioScopeWhere(access, 'f');
  const models = await loadModels(db, empresaId);
  const qualificationTypeIds = [...new Set(models.map((model) => Number(model.qualificacao_tipo_id)))];
  const qualifications = await loadQualifications({
    db,
    empresaId,
    inicio,
    fim,
    scopeClause: scope.clause,
    scopeBindings: scope.bindings,
    qualificationTypeIds,
  });
  const modelsByQualification = new Map<number, ModelRow[]>();
  for (const model of models) {
    const id = Number(model.qualificacao_tipo_id);
    const bucket = modelsByQualification.get(id) || [];
    bucket.push(model);
    modelsByQualification.set(id, bucket);
  }

  const sessionNeeds: SimulatorTrainingSessionNeed[] = [];
  const trainings: Array<Record<string, unknown>> = [];
  const exceptions: Array<Record<string, unknown>> = [];

  for (const qualification of qualifications) {
    const expiry = String(qualification.data_vencimento).slice(0, 10);
    if (!isInsidePlanningHorizon({ reference_date: referencia, expiry_date: expiry, config })) continue;
    const selected = chooseModelsForQualification(
      qualification,
      modelsByQualification.get(Number(qualification.qualificacao_tipo_id)) || [],
    );
    if (selected.ambiguous || selected.models.length === 0) {
      exceptions.push({
        type: 'CURRICULO_AMBIGUO',
        employee_id: qualification.funcionario_id,
        employee_name: qualification.funcionario_nome,
        qualification_name: qualification.qualificacao_nome,
        expiry_date: expiry,
      });
      continue;
    }

    const remaining = await resolveIndividualRemainingModels({
      db,
      empresaId,
      employeeId: Number(qualification.funcionario_id),
      cycleStartDate: qualification.cycle_start_date,
      models: selected.models.map((model) => ({
        id: Number(model.id),
        ordem_no_treinamento: model.ordem_no_treinamento,
      })),
    });
    const remainingIds = new Set(remaining.models.map((model) => Number(model.id)));
    const remainingRows = selected.models.filter((model) => remainingIds.has(Number(model.id)));
    if (remainingRows.length === 0) continue;

    const ordered = [...remainingRows].sort(
      (a, b) =>
        (a.ordem_no_treinamento ?? 999999) - (b.ordem_no_treinamento ?? 999999) ||
        Number(a.id) - Number(b.id),
    );
    const invalidDuration = ordered.some(
      (model) => !Number.isFinite(Number(model.duracao_estimada)) || Number(model.duracao_estimada) <= 0,
    );
    if (invalidDuration) {
      exceptions.push({
        type: 'DURACAO_SESSAO_AUSENTE',
        employee_id: qualification.funcionario_id,
        employee_name: qualification.funcionario_nome,
        qualification_name: qualification.qualificacao_nome,
        expiry_date: expiry,
      });
      continue;
    }

    trainings.push({
      employee_id: Number(qualification.funcionario_id),
      employee_name: qualification.funcionario_nome,
      employee_role: qualification.funcionario_funcao,
      qualification_type_id: Number(qualification.qualificacao_tipo_id),
      qualification_code: qualification.qualificacao_codigo,
      qualification_name: qualification.qualificacao_nome,
      expiry_date: expiry,
      equipment: selected.equipment,
      total_sessions: ordered.length,
      remaining_source: remaining.source,
      sessions: ordered.map((model, index) => ({
        model_id: Number(model.id),
        code: model.codigo,
        name: model.nome,
        order: Number(model.ordem_no_treinamento ?? index + 1),
        duration_minutes: Number(model.duracao_estimada),
      })),
    });

    ordered.forEach((model, index) => {
      const order = Number(model.ordem_no_treinamento ?? index + 1);
      sessionNeeds.push({
        need_id: `${qualification.funcionario_id}:${qualification.qualificacao_tipo_id}:${model.id}`,
        employee_id: Number(qualification.funcionario_id),
        employee_name: qualification.funcionario_nome,
        employee_role: qualification.funcionario_funcao,
        qualification_type_id: Number(qualification.qualificacao_tipo_id),
        qualification_code: qualification.qualificacao_codigo,
        qualification_name: qualification.qualificacao_nome,
        expiry_date: expiry,
        equipment: selected.equipment,
        session_model_id: Number(model.id),
        session_code: model.codigo,
        session_name: model.nome,
        session_order: order,
        duration_minutes: Number(model.duracao_estimada),
        training_session_count: ordered.length,
      });
    });
  }

  const blocks = pairSimulatorTrainingSessions(
    sessionNeeds,
    config.allow_shared_session ? config.planning_horizon_days : 0,
  );
  const classes = buildSimulatorTrainingClasses(blocks);
  const unmatched = blocks.filter((block) => block.pairing === 'SEM_DUPLA').length;

  return c.json({
    success: true,
    data: {
      mode: 'PREVIEW_ONLY',
      generated_at: new Date().toISOString(),
      reference_date: referencia,
      config: {
        planning_horizon_days: config.planning_horizon_days,
        roster_policy: config.roster_policy,
        preferred_sessions_per_day: config.preferred_sessions_per_day,
        preferred_minutes_per_day: config.preferred_minutes_per_day,
        allow_shared_session: config.allow_shared_session,
        source: config.source,
        warnings: config.warnings,
      },
      summary: {
        trainings: trainings.length,
        session_requirements: sessionNeeds.length,
        paired_blocks: blocks.length - unmatched,
        unmatched_blocks: unmatched,
        classes: classes.length,
      },
      trainings,
      classes,
      exceptions,
    },
  });
});

export default app;

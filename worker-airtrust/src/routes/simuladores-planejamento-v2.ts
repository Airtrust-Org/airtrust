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
  createEmployeeFortnightPairEligibility,
  loadEmployeeFortnightAssignments,
  loadOperationalFortnightWindows,
} from '../services/cae-planning-employee-fortnight';
import { loadPendingTrainingDependencyQualifications } from '../services/cae-planning-dependency-source';
import { SIMULATOR_TRAINING_TIME_POLICY } from '../services/cae-planning-time-policy';
import {
  curriculumReferenceYear,
  loadResolvedSimulatorCurriculum,
  loadSimulatorCycleManagedQualificationIds,
} from '../services/simulator-curriculum-cycles';
import {
  buildRenewalSqlPredicates,
  hasHistoricoRenovacaoDeColumn,
} from './qualificacoes/historico';

const app = new Hono<{ Bindings: Env }>();
app.use('*', auth());

export type ModelRow = {
  id: number;
  qualificacao_tipo_id: number;
  codigo: string;
  nome: string;
  duracao_estimada: number | null;
  ordem_no_treinamento: number | null;
  modelo_aeronave: string | null;
};

export type QualificationRow = {
  funcionario_id: number;
  funcionario_nome: string;
  funcionario_funcao: string | null;
  qualificacao_tipo_id: number;
  qualificacao_codigo: string | null;
  qualificacao_nome: string;
  data_vencimento: string;
  cycle_start_date: string | null;
  planning_source?: 'QUALIFICATION_HISTORY' | 'TRAINING_DEPENDENCY';
  source_planning_id?: number | null;
};

export type TrainingCoverageRule = {
  source_qualification_type_id: number;
  source_qualification_code: string | null;
  source_qualification_name: string;
  destination_qualification_type_id: number;
};

type PlanningQualificationRow = QualificationRow & {
  requirement_qualification_type_id: number;
  requirement_qualification_code: string | null;
  requirement_qualification_name: string;
  coverage_reason: 'RECORRENTE_PRIORITARIO_SOBRE_SEMESTRAL' | null;
  satisfies_qualification_type_ids: number[];
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

export function normalizeEquipmentFilter(value: unknown): string | null {
  const raw = String(value || '').trim();
  if (!raw || ['ALL', 'TODAS', 'TODOS'].includes(raw.toUpperCase())) return null;
  const normalized = normalizeEquipment(raw);
  return normalized === 'UNIVERSAL' ? null : normalized;
}

function daysDistance(left: string, right: string): number {
  return Math.abs(
    Math.round((Date.parse(`${left}T00:00:00Z`) - Date.parse(`${right}T00:00:00Z`)) / 86_400_000),
  );
}

async function tableExists(db: D1Database, tableName: string): Promise<boolean> {
  const row = await db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .bind(tableName)
    .first<{ name: string }>();
  return row?.name === tableName;
}

async function loadTrainingCoverageRules(
  db: D1Database,
  empresaId: number,
): Promise<TrainingCoverageRule[]> {
  if (!(await tableExists(db, 'treinamento_dependencias'))) return [];
  if (!(await tableExists(db, 'treinamento_programas'))) return [];
  const rows = await db
    .prepare(
      `SELECT d.qualificacao_origem_id AS source_qualification_type_id,
              qs.codigo AS source_qualification_code,
              qs.nome AS source_qualification_name,
              d.qualificacao_destino_id AS destination_qualification_type_id
         FROM treinamento_dependencias d
         JOIN qualificacoes_tipos qs
           ON qs.id=d.qualificacao_origem_id AND qs.empresa_id=d.empresa_id
          AND qs.deleted_at IS NULL AND COALESCE(qs.ativo,1)=1
        WHERE d.empresa_id=? AND d.ativo=1 AND d.deleted_at IS NULL
          AND EXISTS (
            SELECT 1 FROM treinamento_programas p
             WHERE p.empresa_id=d.empresa_id AND p.qualificacao_tipo_id=d.qualificacao_origem_id
               AND p.tipo_treinamento='RECORRENTE' AND p.ativo=1 AND p.deleted_at IS NULL
          )
          AND EXISTS (
            SELECT 1 FROM treinamento_programas p
             WHERE p.empresa_id=d.empresa_id AND p.qualificacao_tipo_id=d.qualificacao_destino_id
               AND p.tipo_treinamento='SEMESTRAL' AND p.ativo=1 AND p.deleted_at IS NULL
          )
        ORDER BY d.id`,
    )
    .bind(empresaId)
    .all<TrainingCoverageRule>();
  return (rows.results || []).map((row) => ({
    ...row,
    source_qualification_type_id: Number(row.source_qualification_type_id),
    destination_qualification_type_id: Number(row.destination_qualification_type_id),
  }));
}

async function loadEmployeeCompletedQualificationKeys(params: {
  db: D1Database;
  empresaId: number;
  qualifications: QualificationRow[];
  rules: TrainingCoverageRule[];
}): Promise<Set<string>> {
  const destinationToSource = new Map(
    params.rules.map((rule) => [
      rule.destination_qualification_type_id,
      rule.source_qualification_type_id,
    ]),
  );
  const requestedPairs = params.qualifications
    .map((qualification) => ({
      employeeId: Number(qualification.funcionario_id),
      qualificationTypeId: destinationToSource.get(Number(qualification.qualificacao_tipo_id)),
    }))
    .filter(
      (item): item is { employeeId: number; qualificationTypeId: number } =>
        Number.isInteger(item.employeeId) &&
        item.employeeId > 0 &&
        Number.isInteger(item.qualificationTypeId) &&
        Number(item.qualificationTypeId) > 0,
    );
  if (requestedPairs.length === 0) return new Set();
  const employeeIds = [...new Set(requestedPairs.map((item) => item.employeeId))];
  const qualificationTypeIds = [...new Set(requestedPairs.map((item) => item.qualificationTypeId))];
  const employeePlaceholders = employeeIds.map(() => '?').join(',');
  const qualificationPlaceholders = qualificationTypeIds.map(() => '?').join(',');
  const rows = await params.db
    .prepare(
      `SELECT DISTINCT funcionario_id, qualificacao_id
         FROM qualificacoes_historico
        WHERE empresa_id=? AND deleted_at IS NULL
          AND funcionario_id IN (${employeePlaceholders})
          AND qualificacao_id IN (${qualificationPlaceholders})
          AND UPPER(COALESCE(status,'')) IN ('CONCLUIDA','RENOVADA','VALIDA','VÁLIDA')`,
    )
    .bind(params.empresaId, ...employeeIds, ...qualificationTypeIds)
    .all<{ funcionario_id: number; qualificacao_id: number }>();
  return new Set(
    (rows.results || []).map(
      (row) => `${Number(row.funcionario_id)}:${Number(row.qualificacao_id)}`,
    ),
  );
}

export function applyRecurringPriorityOverSemiannual(params: {
  qualifications: QualificationRow[];
  rules: TrainingCoverageRule[];
  maxPairingDays: number;
  eligibleRecurringKeys: Set<string>;
  fixedFortnightByEmployee?: Map<number, 1 | 2 | null>;
  rosterPolicy?: 'FOLGA' | 'TRABALHO' | 'AMBAS';
}): PlanningQualificationRow[] {
  const ruleByDestination = new Map(
    params.rules.map((rule) => [rule.destination_qualification_type_id, rule]),
  );
  const sameEmployeeCoveredDestinations = new Map<string, QualificationRow[]>();

  for (const qualification of params.qualifications) {
    const rule = ruleByDestination.get(Number(qualification.qualificacao_tipo_id));
    if (!rule) continue;
    const sameEmployeeRecurring = params.qualifications.find(
      (candidate) =>
        Number(candidate.funcionario_id) === Number(qualification.funcionario_id) &&
        Number(candidate.qualificacao_tipo_id) === rule.source_qualification_type_id,
    );
    if (!sameEmployeeRecurring) continue;
    const key = `${qualification.funcionario_id}:${rule.source_qualification_type_id}`;
    const bucket = sameEmployeeCoveredDestinations.get(key) || [];
    bucket.push(qualification);
    sameEmployeeCoveredDestinations.set(key, bucket);
  }

  const result: PlanningQualificationRow[] = [];
  for (const qualification of params.qualifications) {
    const qualificationTypeId = Number(qualification.qualificacao_tipo_id);
    const destinationRule = ruleByDestination.get(qualificationTypeId);
    if (destinationRule) {
      const sameEmployeeRecurring = params.qualifications.some(
        (candidate) =>
          Number(candidate.funcionario_id) === Number(qualification.funcionario_id) &&
          Number(candidate.qualificacao_tipo_id) === destinationRule.source_qualification_type_id,
      );
      if (sameEmployeeRecurring) continue;

      const candidateFortnight = params.fixedFortnightByEmployee?.get(
        Number(qualification.funcionario_id),
      );
      const recurringPeer = params.qualifications.find((candidate) => {
        if (
          Number(candidate.funcionario_id) === Number(qualification.funcionario_id) ||
          Number(candidate.qualificacao_tipo_id) !== destinationRule.source_qualification_type_id ||
          daysDistance(candidate.data_vencimento, qualification.data_vencimento) >
            Math.max(0, params.maxPairingDays)
        ) {
          return false;
        }
        if (!params.fixedFortnightByEmployee) return true;
        const peerFortnight = params.fixedFortnightByEmployee.get(Number(candidate.funcionario_id));
        if (!candidateFortnight || !peerFortnight) return false;
        return params.rosterPolicy === 'AMBAS' || candidateFortnight === peerFortnight;
      });
      const employeeEligibleForRecurring = params.eligibleRecurringKeys.has(
        `${qualification.funcionario_id}:${destinationRule.source_qualification_type_id}`,
      );
      if (recurringPeer && employeeEligibleForRecurring) {
        result.push({
          ...qualification,
          qualificacao_tipo_id: destinationRule.source_qualification_type_id,
          qualificacao_codigo: destinationRule.source_qualification_code,
          qualificacao_nome: destinationRule.source_qualification_name,
          requirement_qualification_type_id: qualificationTypeId,
          requirement_qualification_code: qualification.qualificacao_codigo,
          requirement_qualification_name: qualification.qualificacao_nome,
          coverage_reason: 'RECORRENTE_PRIORITARIO_SOBRE_SEMESTRAL',
          satisfies_qualification_type_ids: [
            destinationRule.source_qualification_type_id,
            destinationRule.destination_qualification_type_id,
          ],
        });
        continue;
      }
    }

    const coveredDestinations =
      sameEmployeeCoveredDestinations.get(
        `${qualification.funcionario_id}:${qualificationTypeId}`,
      ) || [];
    const earliestCovered = coveredDestinations.map((row) => row.data_vencimento).sort()[0];
    result.push({
      ...qualification,
      data_vencimento:
        earliestCovered && earliestCovered < qualification.data_vencimento
          ? earliestCovered
          : qualification.data_vencimento,
      requirement_qualification_type_id: qualificationTypeId,
      requirement_qualification_code: qualification.qualificacao_codigo,
      requirement_qualification_name: qualification.qualificacao_nome,
      coverage_reason:
        coveredDestinations.length > 0 ? 'RECORRENTE_PRIORITARIO_SOBRE_SEMESTRAL' : null,
      satisfies_qualification_type_ids: [
        qualificationTypeId,
        ...coveredDestinations.map((row) => Number(row.qualificacao_tipo_id)),
      ],
    });
  }

  return result;
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
  return (rows.results || []).map((row) => ({
    ...row,
    planning_source: 'QUALIFICATION_HISTORY',
    source_planning_id: null,
  }));
}

export function chooseModelsForQualification(
  qualification: QualificationRow,
  models: ModelRow[],
  requestedEquipment: string | null = null,
): { equipment: string; models: ModelRow[]; ambiguous: boolean; filteredOut: boolean } {
  const groups = new Map<string, ModelRow[]>();
  for (const model of models) {
    const equipment = normalizeEquipment(model.modelo_aeronave);
    const bucket = groups.get(equipment) || [];
    bucket.push(model);
    groups.set(equipment, bucket);
  }
  if (groups.size === 0)
    return { equipment: 'A_DEFINIR', models: [], ambiguous: true, filteredOut: false };
  if (requestedEquipment) {
    const requested = groups.get(requestedEquipment);
    if (!requested)
      return { equipment: requestedEquipment, models: [], ambiguous: false, filteredOut: true };
    return {
      equipment: requestedEquipment,
      models: [...requested, ...(groups.get('UNIVERSAL') || [])],
      ambiguous: false,
      filteredOut: false,
    };
  }
  if (groups.size === 1) {
    const [equipment, rows] = [...groups.entries()][0];
    return { equipment, models: rows, ambiguous: false, filteredOut: false };
  }
  const identity = normalizeEquipment(
    `${qualification.qualificacao_codigo || ''} ${qualification.qualificacao_nome}`,
  );
  const matched = [...groups.entries()].find(
    ([equipment]) => equipment !== 'UNIVERSAL' && identity.includes(equipment),
  );
  if (matched) {
    return {
      equipment: matched[0],
      models: [...matched[1], ...(groups.get('UNIVERSAL') || [])],
      ambiguous: false,
      filteredOut: false,
    };
  }
  return { equipment: 'A_DEFINIR', models: [], ambiguous: true, filteredOut: false };
}

app.get('/config', requireRole('admin', 'manager'), async (c) => {
  const empresaId = getTenantContext(c).empresaId;
  const [config, models] = await Promise.all([
    loadConfig(c.env.DB, empresaId),
    loadModels(c.env.DB, empresaId),
  ]);
  const equipmentOptions = [
    ...new Set(
      models
        .filter((model) => model.ordem_no_treinamento != null)
        .map((model) => normalizeEquipment(model.modelo_aeronave))
        .filter((value) => value !== 'UNIVERSAL'),
    ),
  ].sort();
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
      time_preference: {
        business_start: SIMULATOR_TRAINING_TIME_POLICY.business_start,
        business_end: SIMULATOR_TRAINING_TIME_POLICY.business_end,
        daytime_start: SIMULATOR_TRAINING_TIME_POLICY.daytime_start,
        daytime_end: SIMULATOR_TRAINING_TIME_POLICY.daytime_end,
        night_fallback_only: true,
      },
      source: config.source,
      warnings: config.warnings,
      equipment_options: equipmentOptions,
    },
  });
});

app.post('/proposta', requireRole('admin', 'manager'), async (c) => {
  const empresaId = getTenantContext(c).empresaId;
  const body = (await c.req.json().catch(() => null)) as {
    vencimento_inicio?: unknown;
    vencimento_fim?: unknown;
    data_referencia?: unknown;
    equipment?: unknown;
  } | null;
  const inicio = String(body?.vencimento_inicio || '');
  const fim = String(body?.vencimento_fim || '');
  const referencia = String(body?.data_referencia || new Date().toISOString().slice(0, 10));
  const equipmentFilter = normalizeEquipmentFilter(body?.equipment);
  if (!isIsoDate(inicio) || !isIsoDate(fim) || inicio > fim || !isIsoDate(referencia)) {
    return c.json({ success: false, error: 'Intervalo ou data de referência inválidos' }, 400);
  }

  const db = c.env.DB;
  const config = await loadConfig(db, empresaId);
  const access = await getEmployeeSectorAccess(c, empresaId);
  const scope = buildFuncionarioScopeWhere(access, 'f');
  const models = await loadModels(db, empresaId);
  const cycleManagedQualificationIds = await loadSimulatorCycleManagedQualificationIds(
    db,
    empresaId,
  );
  const cycleManagedQualificationIdSet = new Set(cycleManagedQualificationIds);
  const qualificationTypeIds = [
    ...new Set([
      ...models.map((model) => Number(model.qualificacao_tipo_id)),
      ...cycleManagedQualificationIds,
    ]),
  ];
  const qualificationHistory = await loadQualifications({
    db,
    empresaId,
    inicio,
    fim,
    scopeClause: scope.clause,
    scopeBindings: scope.bindings,
    qualificationTypeIds,
  });
  const dependencyQualifications = await loadPendingTrainingDependencyQualifications({
    db,
    empresaId,
    inicio,
    fim,
    scopeClause: scope.clause,
    scopeBindings: scope.bindings,
    qualificationTypeIds,
  });

  // An explicit dependency obligation is the authoritative future due-date for
  // that employee + destination qualification. It wins over an older historical
  // row for the same qualification. The dependency source itself suppresses the
  // obligation when a destination completion already occurred after its source.
  const dependencyKeys = new Set(
    dependencyQualifications.map(
      (qualification) =>
        `${Number(qualification.funcionario_id)}:${Number(qualification.qualificacao_tipo_id)}`,
    ),
  );
  const qualifications: QualificationRow[] = [
    ...dependencyQualifications,
    ...qualificationHistory.filter(
      (qualification) =>
        !dependencyKeys.has(
          `${Number(qualification.funcionario_id)}:${Number(qualification.qualificacao_tipo_id)}`,
        ),
    ),
  ].sort(
    (left, right) =>
      String(left.data_vencimento).localeCompare(String(right.data_vencimento)) ||
      left.funcionario_nome.localeCompare(right.funcionario_nome) ||
      left.qualificacao_nome.localeCompare(right.qualificacao_nome),
  );
  const coverageRules = await loadTrainingCoverageRules(db, empresaId);
  const qualificationEmployeeIds = [
    ...new Set(qualifications.map((qualification) => Number(qualification.funcionario_id))),
  ];
  const [eligibleRecurringKeys, qualificationFortnightAssignments] = await Promise.all([
    loadEmployeeCompletedQualificationKeys({
      db,
      empresaId,
      qualifications,
      rules: coverageRules,
    }),
    loadEmployeeFortnightAssignments({ db, empresaId, employeeIds: qualificationEmployeeIds }),
  ]);
  const fixedFortnightByEmployee = new Map(
    [...qualificationFortnightAssignments.entries()].map(([employeeId, assignment]) => [
      employeeId,
      assignment.fortnight_number,
    ]),
  );
  const planningQualifications = applyRecurringPriorityOverSemiannual({
    qualifications,
    rules: coverageRules,
    maxPairingDays: config.planning_horizon_days,
    eligibleRecurringKeys,
    fixedFortnightByEmployee,
    rosterPolicy: config.roster_policy,
  });

  // `qualificacao_tipo_id` also has a second, legacy meaning on the model that
  // generates/renews a qualification.  It is therefore NOT sufficient to say
  // that a model belongs to the planning curriculum.  PR #251 made
  // `ordem_no_treinamento` the explicit curriculum membership/order signal.
  // Keep all linked models above only to discover which qualification types are
  // plannable; use ordered rows exclusively when building the proposal.
  const modelsByQualification = new Map<number, ModelRow[]>();
  for (const model of models) {
    if (model.ordem_no_treinamento == null) continue;
    const id = Number(model.qualificacao_tipo_id);
    const bucket = modelsByQualification.get(id) || [];
    bucket.push(model);
    modelsByQualification.set(id, bucket);
  }

  const sessionNeeds: SimulatorTrainingSessionNeed[] = [];
  const trainings: Array<Record<string, unknown>> = [];
  const exceptions: Array<Record<string, unknown>> = [];

  for (const qualification of planningQualifications) {
    const expiry = String(qualification.data_vencimento).slice(0, 10);
    if (!isInsidePlanningHorizon({ reference_date: referencia, expiry_date: expiry, config }))
      continue;
    const qualificationTypeId = Number(qualification.qualificacao_tipo_id);
    let configuredModels = modelsByQualification.get(qualificationTypeId) || [];
    let curriculumCycle: number | null = null;
    let curriculumReferenceYearValue: number | null = null;
    let curriculumProgramId: number | null = null;
    let curriculumProgramType: string | null = null;
    let curriculumProgramName: string | null = null;

    if (cycleManagedQualificationIdSet.has(qualificationTypeId)) {
      curriculumReferenceYearValue = curriculumReferenceYear(expiry);
      const resolved = curriculumReferenceYearValue
        ? await loadResolvedSimulatorCurriculum({
            db,
            empresaId,
            qualificationTypeId,
            referenceYear: curriculumReferenceYearValue,
            employeeId: Number(qualification.funcionario_id),
          })
        : null;
      if (!resolved || resolved.unresolved_items > 0 || resolved.models.length === 0) {
        exceptions.push({
          type: 'CURRICULO_CICLO_NAO_CONFIGURADO',
          employee_id: qualification.funcionario_id,
          employee_name: qualification.funcionario_nome,
          qualification_name: qualification.qualificacao_nome,
          qualification_code: qualification.qualificacao_codigo,
          expiry_date: expiry,
          curriculum_cycle: resolved?.cycle ?? null,
          curriculum_reference_year: curriculumReferenceYearValue,
          unresolved_items: resolved?.unresolved_items ?? null,
          planning_source: qualification.planning_source || 'QUALIFICATION_HISTORY',
        });
        continue;
      }
      curriculumCycle = resolved.cycle;
      curriculumProgramId = resolved.program_id;
      curriculumProgramType = resolved.program_type;
      curriculumProgramName = resolved.program?.nome ?? null;
      configuredModels = resolved.models.map((model) => ({
        id: Number(model.id),
        qualificacao_tipo_id: qualificationTypeId,
        codigo: model.codigo_canonico || model.codigo,
        nome: model.nome,
        duracao_estimada: model.duracao_estimada,
        ordem_no_treinamento: model.ordem_no_treinamento,
        modelo_aeronave: model.modelo_aeronave,
      }));
    }

    if (configuredModels.length === 0) {
      exceptions.push({
        type: 'CURRICULO_NAO_CONFIGURADO',
        employee_id: qualification.funcionario_id,
        employee_name: qualification.funcionario_nome,
        qualification_name: qualification.qualificacao_nome,
        qualification_code: qualification.qualificacao_codigo,
        expiry_date: expiry,
        planning_source: qualification.planning_source || 'QUALIFICATION_HISTORY',
      });
      continue;
    }

    const selected = chooseModelsForQualification(qualification, configuredModels, equipmentFilter);
    if (selected.filteredOut) continue;
    if (selected.ambiguous || selected.models.length === 0) {
      exceptions.push({
        type: 'CURRICULO_AMBIGUO',
        employee_id: qualification.funcionario_id,
        employee_name: qualification.funcionario_nome,
        qualification_name: qualification.qualificacao_nome,
        qualification_code: qualification.qualificacao_codigo,
        expiry_date: expiry,
        planning_source: qualification.planning_source || 'QUALIFICATION_HISTORY',
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
      (model) =>
        !Number.isFinite(Number(model.duracao_estimada)) || Number(model.duracao_estimada) <= 0,
    );
    if (invalidDuration) {
      exceptions.push({
        type: 'DURACAO_SESSAO_AUSENTE',
        employee_id: qualification.funcionario_id,
        employee_name: qualification.funcionario_nome,
        qualification_name: qualification.qualificacao_nome,
        qualification_code: qualification.qualificacao_codigo,
        expiry_date: expiry,
        invalid_sessions: ordered
          .filter(
            (model) =>
              !Number.isFinite(Number(model.duracao_estimada)) ||
              Number(model.duracao_estimada) <= 0,
          )
          .map((model) => ({ code: model.codigo, name: model.nome })),
        planning_source: qualification.planning_source || 'QUALIFICATION_HISTORY',
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
      planning_source: qualification.planning_source || 'QUALIFICATION_HISTORY',
      source_planning_id: qualification.source_planning_id ?? null,
      curriculum_cycle: curriculumCycle,
      curriculum_reference_year: curriculumReferenceYearValue,
      training_program_id: curriculumProgramId,
      training_program_type: curriculumProgramType,
      training_program_name: curriculumProgramName,
      requirement_qualification_type_id: qualification.requirement_qualification_type_id,
      requirement_qualification_code: qualification.requirement_qualification_code,
      requirement_qualification_name: qualification.requirement_qualification_name,
      coverage_reason: qualification.coverage_reason,
      satisfies_qualification_type_ids: qualification.satisfies_qualification_type_ids,
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
        curriculum_cycle: curriculumCycle,
        curriculum_reference_year: curriculumReferenceYearValue,
        training_program_id: curriculumProgramId,
        training_program_type: curriculumProgramType,
        training_program_name: curriculumProgramName,
        requirement_qualification_type_id: qualification.requirement_qualification_type_id,
        requirement_qualification_code: qualification.requirement_qualification_code,
        requirement_qualification_name: qualification.requirement_qualification_name,
        coverage_reason: qualification.coverage_reason,
        satisfies_qualification_type_ids: qualification.satisfies_qualification_type_ids,
      });
    });
  }

  const latestExpiry =
    sessionNeeds
      .map((need) => need.expiry_date)
      .sort()
      .at(-1) || referencia;
  const fortnightAssignments = qualificationFortnightAssignments;
  const fortnightWindows = await loadOperationalFortnightWindows({
    db,
    empresaId,
    startDate: referencia,
    endDate: latestExpiry,
  });
  const rosterPairing = createEmployeeFortnightPairEligibility({
    needs: sessionNeeds,
    referenceDate: referencia,
    horizonDays: config.planning_horizon_days,
    rosterPolicy: config.roster_policy,
    assignments: fortnightAssignments,
    windows: fortnightWindows,
  });

  const coverageLinks = new Set(
    coverageRules.flatMap((rule) => [
      `${rule.source_qualification_type_id}:${rule.destination_qualification_type_id}`,
      `${rule.destination_qualification_type_id}:${rule.source_qualification_type_id}`,
    ]),
  );
  const blocks = pairSimulatorTrainingSessions(
    sessionNeeds,
    config.planning_horizon_days,
    config.allow_shared_session,
    (left, right) => {
      const linkedPriorityPrograms = coverageLinks.has(
        `${left.qualification_type_id}:${right.qualification_type_id}`,
      );
      if (linkedPriorityPrograms) return false;
      return rosterPairing.pairEligibility(left, right);
    },
  );
  const baseClasses = buildSimulatorTrainingClasses(blocks);
  const unmatched = blocks.filter((block) => block.pairing === 'SEM_DUPLA').length;

  // CAE availability is intentionally excluded from proposal generation.
  // Exact slots are compared later by POST /comparar-cae against this already
  // formed proposal, preserving its pairs and unmatched single blocks.
  const classes: unknown = baseClasses;
  const caeComparison: unknown = null;

  return c.json({
    success: true,
    data: {
      mode: 'PREVIEW_ONLY',
      generated_at: new Date().toISOString(),
      reference_date: referencia,
      equipment_filter: equipmentFilter,
      config: {
        planning_horizon_days: config.planning_horizon_days,
        roster_policy: config.roster_policy,
        preferred_sessions_per_day: config.preferred_sessions_per_day,
        preferred_minutes_per_day: config.preferred_minutes_per_day,
        allow_shared_session: config.allow_shared_session,
        time_preference: {
          business_start: SIMULATOR_TRAINING_TIME_POLICY.business_start,
          business_end: SIMULATOR_TRAINING_TIME_POLICY.business_end,
          daytime_start: SIMULATOR_TRAINING_TIME_POLICY.daytime_start,
          daytime_end: SIMULATOR_TRAINING_TIME_POLICY.daytime_end,
          night_fallback_only: true,
        },
        source: config.source,
        warnings: config.warnings,
      },
      summary: {
        trainings: trainings.length,
        session_requirements: sessionNeeds.length,
        paired_blocks: blocks.length - unmatched,
        unmatched_blocks: unmatched,
        classes: baseClasses.length,
        roster_pairing: {
          source: 'FUNCIONARIO_ESCALA_1_2',
          employees_with_fixed_fortnight: rosterPairing.employeesWithFixedFortnight,
          employees_with_eligible_dates: rosterPairing.employeesWithEligibleDates,
          eligible_date_count: rosterPairing.eligibleDateCount,
          calendar_windows: fortnightWindows.length,
          calendar_fallback_windows: fortnightWindows.filter(
            (window) => window.source === 'DEFAULT',
          ).length,
        },
      },
      trainings,
      classes,
      cae_comparison: caeComparison,
      exceptions,
    },
  });
});

export default app;

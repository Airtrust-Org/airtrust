import { Hono } from 'hono';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { getTenantContext } from '../middleware/tenant';
import {
  buildFuncionarioScopeWhere,
  getEmployeeSectorAccess,
} from '../services/employee-sector-access';
import {
  evaluateRosterEligibility,
  resolveSimulatorPlanningConfig,
  type SimulatorPlanningConfigRow,
} from '../services/cae-planning-policy';
import {
  buildSimulatorTrainingClasses,
  canManuallyShareSimulatorTrainingSessions,
  canShareSimulatorTrainingSessions,
  pairSimulatorTrainingSessions,
  type SimulatorTrainingSessionBlock,
  type SimulatorTrainingSessionNeed,
} from '../services/cae-planning-session-proposal';
import {
  createEmployeeFortnightPairEligibility,
  loadEmployeeFortnightAssignments,
  loadOperationalFortnightWindows,
  resolveEmployeeFortnightDay,
  resolveEmployeeFortnightDayFromD1,
  type EmployeeFortnightAssignment,
} from '../services/cae-planning-employee-fortnight';
import type { OperationalFortnightWindow } from '../services/operational-fortnight-calendar';
import { scheduleSimulatorTrainingBlocks } from '../services/cae-planning-session-scheduler';
import { validateAndNormalizeCaeAvailability } from '../services/cae-availability';
import {
  curriculumReferenceYear,
  loadResolvedSimulatorCurriculum,
} from '../services/simulator-curriculum-cycles';
import { employeeHasCompletedQualification } from '../services/training-programs';

const app = new Hono<{ Bindings: Env }>();
app.use('*', auth());

const MAX_NEEDS = 160;
const MAX_CANDIDATES = 80;
const MAX_LOCKS = 80;

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

function addDaysIso(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysDistance(left: string, right: string): number {
  return Math.abs(
    Math.round((Date.parse(`${left}T00:00:00Z`) - Date.parse(`${right}T00:00:00Z`)) / 86_400_000),
  );
}

function parseNeed(value: unknown): SimulatorTrainingSessionNeed | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const employeeId = Number(row.employee_id);
  const qualificationTypeId = Number(row.qualification_type_id);
  const modelId = Number(row.session_model_id);
  const order = Number(row.session_order);
  const duration = Number(row.duration_minutes);
  const trainingCount = Number(row.training_session_count);
  const programIdRaw = Number(row.training_program_id);
  const programId = Number.isInteger(programIdRaw) && programIdRaw > 0 ? programIdRaw : null;
  const curriculumCycleRaw = Number(row.curriculum_cycle);
  const curriculumCycle =
    Number.isInteger(curriculumCycleRaw) && curriculumCycleRaw > 0 ? curriculumCycleRaw : null;
  const curriculumYearRaw = Number(row.curriculum_reference_year);
  const curriculumReferenceYearValue =
    Number.isInteger(curriculumYearRaw) && curriculumYearRaw >= 1900 ? curriculumYearRaw : null;
  const expiry = String(row.expiry_date || '').slice(0, 10);
  const needId = String(row.need_id || '');
  const requirementQualificationTypeIdRaw = Number(row.requirement_qualification_type_id);
  const requirementQualificationTypeId =
    Number.isInteger(requirementQualificationTypeIdRaw) && requirementQualificationTypeIdRaw > 0
      ? requirementQualificationTypeIdRaw
      : qualificationTypeId;
  const satisfiesQualificationTypeIds = Array.isArray(row.satisfies_qualification_type_ids)
    ? [
        ...new Set(
          row.satisfies_qualification_type_ids
            .map(Number)
            .filter((id) => Number.isInteger(id) && id > 0),
        ),
      ]
    : [qualificationTypeId];
  const coverageReason =
    row.coverage_reason === 'RECORRENTE_PRIORITARIO_SOBRE_SEMESTRAL'
      ? 'RECORRENTE_PRIORITARIO_SOBRE_SEMESTRAL'
      : null;
  const allowedNeedIds = new Set([
    `${employeeId}:${qualificationTypeId}:${modelId}`,
    `${employeeId}:${qualificationTypeId}:legacy:${modelId}`,
    ...(programId ? [`${employeeId}:${qualificationTypeId}:${programId}:${modelId}`] : []),
  ]);
  if (
    !Number.isInteger(employeeId) ||
    employeeId <= 0 ||
    !Number.isInteger(qualificationTypeId) ||
    qualificationTypeId <= 0 ||
    !Number.isInteger(modelId) ||
    modelId <= 0 ||
    !Number.isInteger(order) ||
    order <= 0 ||
    !Number.isFinite(duration) ||
    duration <= 0 ||
    duration > 24 * 60 ||
    !Number.isInteger(trainingCount) ||
    trainingCount <= 0 ||
    !isIsoDate(expiry) ||
    !allowedNeedIds.has(needId)
  )
    return null;

  return {
    need_id: needId,
    employee_id: employeeId,
    employee_name: String(row.employee_name || '').trim(),
    employee_role: row.employee_role == null ? null : String(row.employee_role),
    qualification_type_id: qualificationTypeId,
    qualification_code: row.qualification_code == null ? null : String(row.qualification_code),
    qualification_name: String(row.qualification_name || '').trim(),
    expiry_date: expiry,
    equipment: normalizeEquipment(row.equipment),
    session_model_id: modelId,
    session_code: String(row.session_code || '').trim(),
    session_name: String(row.session_name || '').trim(),
    session_order: order,
    duration_minutes: duration,
    training_session_count: trainingCount,
    curriculum_cycle: curriculumCycle,
    curriculum_reference_year: curriculumReferenceYearValue,
    training_program_id: programId,
    training_program_type:
      row.training_program_type == null ? null : String(row.training_program_type),
    training_program_name:
      row.training_program_name == null ? null : String(row.training_program_name),
    requirement_qualification_type_id: requirementQualificationTypeId,
    requirement_qualification_code:
      row.requirement_qualification_code == null
        ? row.qualification_code == null
          ? null
          : String(row.qualification_code)
        : String(row.requirement_qualification_code),
    requirement_qualification_name:
      row.requirement_qualification_name == null
        ? String(row.qualification_name || '').trim()
        : String(row.requirement_qualification_name),
    coverage_reason: coverageReason,
    satisfies_qualification_type_ids:
      satisfiesQualificationTypeIds.length > 0
        ? satisfiesQualificationTypeIds
        : [qualificationTypeId],
  };
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

type NeedValidationFailure = {
  need: SimulatorTrainingSessionNeed;
  error: string;
};

type NeedValidationResult = {
  valid: SimulatorTrainingSessionNeed[];
  invalid: NeedValidationFailure[];
};

async function validateNeedsInTenantAndScope(params: {
  c: Parameters<typeof getEmployeeSectorAccess>[0];
  db: D1Database;
  empresaId: number;
  needs: SimulatorTrainingSessionNeed[];
}): Promise<NeedValidationResult> {
  const employeeIds = [...new Set(params.needs.map((item) => item.employee_id))];
  const modelIds = [...new Set(params.needs.map((item) => item.session_model_id))];
  if (employeeIds.length === 0 || modelIds.length === 0) {
    return {
      valid: [],
      invalid: params.needs.map((need) => ({ need, error: 'Nenhuma sessão válida informada' })),
    };
  }

  const access = await getEmployeeSectorAccess(params.c, params.empresaId);
  const scope = buildFuncionarioScopeWhere(access, 'f');
  const employeePlaceholders = employeeIds.map(() => '?').join(', ');
  const employees = await params.db
    .prepare(
      `SELECT f.id
         FROM funcionarios f
        WHERE f.empresa_id = ?
          AND f.id IN (${employeePlaceholders})
          AND f.deleted_at IS NULL
          AND COALESCE(f.ativo, 1) = 1
          AND ${scope.clause}`,
    )
    .bind(params.empresaId, ...employeeIds, ...scope.bindings)
    .all<{ id: number }>();
  const allowedEmployees = new Set((employees.results || []).map((row) => Number(row.id)));

  const modelPlaceholders = modelIds.map(() => '?').join(', ');
  const models = await params.db
    .prepare(
      `SELECT id, qualificacao_tipo_id, duracao_estimada, ordem_no_treinamento, modelo_aeronave
         FROM modelos_sessao
        WHERE empresa_id = ?
          AND id IN (${modelPlaceholders})
          AND deleted_at IS NULL
          AND COALESCE(ativo, 1) = 1`,
    )
    .bind(params.empresaId, ...modelIds)
    .all<{
      id: number;
      qualificacao_tipo_id: number | null;
      duracao_estimada: number | null;
      ordem_no_treinamento: number | null;
      modelo_aeronave: string | null;
    }>();
  const modelById = new Map((models.results || []).map((row) => [Number(row.id), row]));
  const resolvedCurriculumCache = new Map<
    string,
    Awaited<ReturnType<typeof loadResolvedSimulatorCurriculum>>
  >();
  const valid: SimulatorTrainingSessionNeed[] = [];
  const invalid: NeedValidationFailure[] = [];

  for (const need of params.needs) {
    if (!allowedEmployees.has(need.employee_id)) {
      invalid.push({ need, error: 'Tripulante fora do tenant/escopo permitido' });
      continue;
    }

    const model = modelById.get(need.session_model_id);
    const referenceYear = curriculumReferenceYear(need.expiry_date);
    if (
      need.curriculum_reference_year != null &&
      referenceYear != null &&
      Number(need.curriculum_reference_year) !== referenceYear
    ) {
      invalid.push({
        need,
        error: 'Sessão informada não corresponde ao ciclo curricular vigente do tenant',
      });
      continue;
    }

    const curriculumKey = `${need.qualification_type_id}:${need.training_program_id ?? 'auto'}:${referenceYear ?? 'none'}:${need.employee_id}`;
    let resolvedCurriculum = resolvedCurriculumCache.get(curriculumKey);
    if (!resolvedCurriculumCache.has(curriculumKey)) {
      resolvedCurriculum = referenceYear
        ? await loadResolvedSimulatorCurriculum({
            db: params.db,
            empresaId: params.empresaId,
            qualificationTypeId: need.qualification_type_id,
            referenceYear,
            employeeId: need.employee_id,
            requestedProgramId: need.training_program_id ?? null,
          })
        : null;
      resolvedCurriculumCache.set(curriculumKey, resolvedCurriculum);
    }

    if (resolvedCurriculum) {
      const curriculumModel = resolvedCurriculum.models.find(
        (row) => Number(row.id) === need.session_model_id,
      );
      const equipment = normalizeEquipment(curriculumModel?.modelo_aeronave);
      const programMismatch =
        need.training_program_id != null &&
        Number(resolvedCurriculum.program_id) !== Number(need.training_program_id);
      const cycleMismatch =
        need.curriculum_cycle != null &&
        Number(resolvedCurriculum.cycle) !== Number(need.curriculum_cycle);

      // Validate the exact clicked/planned session. A different unresolved row in
      // the same program/cycle must not make an otherwise canonical session
      // unusable for crew/session editing. Fresh proposal generation continues to
      // block globally incomplete curricula; this endpoint only revalidates the
      // concrete snapshot supplied by an already-generated proposal.
      if (
        !model ||
        !curriculumModel ||
        programMismatch ||
        cycleMismatch ||
        Number(curriculumModel.duracao_estimada) !== need.duration_minutes ||
        Number(curriculumModel.ordem_no_treinamento) !== need.session_order ||
        (equipment !== 'UNIVERSAL' && equipment !== need.equipment)
      ) {
        invalid.push({
          need,
          error: 'Sessão informada não corresponde ao ciclo curricular vigente do tenant',
        });
        continue;
      }
      valid.push(need);
      continue;
    }

    if (need.training_program_id != null) {
      invalid.push({
        need,
        error: 'Sessão informada não corresponde ao ciclo curricular vigente do tenant',
      });
      continue;
    }

    const modelEquipment = normalizeEquipment(model?.modelo_aeronave);
    if (
      !model ||
      Number(model.qualificacao_tipo_id) !== need.qualification_type_id ||
      Number(model.duracao_estimada) !== need.duration_minutes ||
      (model.ordem_no_treinamento != null &&
        Number(model.ordem_no_treinamento) !== need.session_order) ||
      (modelEquipment !== 'UNIVERSAL' && modelEquipment !== need.equipment)
    ) {
      invalid.push({
        need,
        error: 'Sessão informada não corresponde ao currículo vigente do tenant',
      });
      continue;
    }
    valid.push(need);
  }

  return { valid, invalid };
}

async function assertNeedsInTenantAndScope(params: {
  c: Parameters<typeof getEmployeeSectorAccess>[0];
  db: D1Database;
  empresaId: number;
  needs: SimulatorTrainingSessionNeed[];
}): Promise<void> {
  if (params.needs.length === 0) throw new Error('Nenhuma sessão válida informada');
  const validation = await validateNeedsInTenantAndScope(params);
  if (validation.invalid.length > 0) throw new Error(validation.invalid[0].error);
}

function findSharedWindow(params: {
  anchor: SimulatorTrainingSessionNeed;
  candidate: SimulatorTrainingSessionNeed;
  referenceDate: string;
  horizonDays: number;
  rosterPolicy: 'FOLGA' | 'TRABALHO' | 'AMBAS';
  assignments: Map<number, EmployeeFortnightAssignment>;
  windows: OperationalFortnightWindow[];
}) {
  const targetDate = [params.anchor.expiry_date, params.candidate.expiry_date].sort()[0];
  const earliestDate =
    params.referenceDate > addDaysIso(targetDate, -params.horizonDays)
      ? params.referenceDate
      : addDaysIso(targetDate, -params.horizonDays);
  for (let date = targetDate; date >= earliestDate; date = addDaysIso(date, -1)) {
    const anchorRoster = resolveEmployeeFortnightDay({
      employeeId: params.anchor.employee_id,
      date,
      assignments: params.assignments,
      windows: params.windows,
    });
    const candidateRoster = resolveEmployeeFortnightDay({
      employeeId: params.candidate.employee_id,
      date,
      assignments: params.assignments,
      windows: params.windows,
    });
    const anchorEligibility = evaluateRosterEligibility(params.rosterPolicy, anchorRoster.state);
    const candidateEligibility = evaluateRosterEligibility(
      params.rosterPolicy,
      candidateRoster.state,
    );
    if (anchorEligibility.eligible && candidateEligibility.eligible) {
      const window = params.windows.find(
        (item) => item.start_date <= date && item.end_date >= date,
      );
      return {
        window_start: window?.start_date || date,
        window_end: window?.end_date || date,
        common_date: date,
        anchor_state: anchorRoster.state,
        candidate_state: candidateRoster.state,
      };
    }
  }
  return null;
}

function pairKind(left: SimulatorTrainingSessionNeed, right: SimulatorTrainingSessionNeed) {
  return left.qualification_type_id === right.qualification_type_id
    ? ('MESMO_TREINAMENTO' as const)
    : ('TREINAMENTOS_COMPATIVEIS' as const);
}

type SessionAlternative =
  | {
      kind: 'SESSION_NEED';
      recommended: false;
      label: string;
      reason: string;
      selected_need: SimulatorTrainingSessionNeed;
      replacement_needs: null;
      availability: ReturnType<typeof findSharedWindow>;
    }
  | {
      kind: 'TRAINING_PROGRAM';
      recommended: true;
      label: string;
      reason: string;
      selected_need: SimulatorTrainingSessionNeed;
      replacement_needs: SimulatorTrainingSessionNeed[];
      availability: ReturnType<typeof findSharedWindow>;
    };

async function buildRecurringProgramAlternative(params: {
  db: D1Database;
  empresaId: number;
  anchor: SimulatorTrainingSessionNeed | null;
  current: SimulatorTrainingSessionNeed;
  referenceDate: string;
  config: Awaited<ReturnType<typeof loadConfig>>;
}): Promise<SessionAlternative | null> {
  const requirementQualificationTypeId =
    params.current.requirement_qualification_type_id || params.current.qualification_type_id;
  const rows = await params.db
    .prepare(
      `SELECT d.qualificacao_origem_id AS qualification_type_id,
              qt.codigo AS qualification_code,
              qt.nome AS qualification_name
         FROM treinamento_dependencias d
         JOIN qualificacoes_tipos qt
           ON qt.id=d.qualificacao_origem_id AND qt.empresa_id=d.empresa_id
          AND qt.deleted_at IS NULL AND COALESCE(qt.ativo,1)=1
        WHERE d.empresa_id=? AND d.qualificacao_destino_id=?
          AND d.ativo=1 AND d.deleted_at IS NULL
          AND EXISTS (
            SELECT 1 FROM treinamento_programas p
             WHERE p.empresa_id=d.empresa_id AND p.qualificacao_tipo_id=d.qualificacao_origem_id
               AND p.tipo_treinamento='RECORRENTE' AND p.ativo=1 AND p.deleted_at IS NULL
          )
        ORDER BY d.id`,
    )
    .bind(params.empresaId, requirementQualificationTypeId)
    .all<{
      qualification_type_id: number;
      qualification_code: string | null;
      qualification_name: string;
    }>();
  const sources = rows.results || [];
  if (sources.length !== 1) return null;
  const source = sources[0];
  const sourceQualificationTypeId = Number(source.qualification_type_id);
  if (
    sourceQualificationTypeId === params.current.qualification_type_id &&
    params.current.training_program_type === 'RECORRENTE'
  ) {
    return null;
  }
  const eligible = await employeeHasCompletedQualification({
    db: params.db,
    empresaId: params.empresaId,
    employeeId: params.current.employee_id,
    qualificationTypeId: sourceQualificationTypeId,
  });
  if (!eligible) return null;
  const referenceYear = curriculumReferenceYear(params.current.expiry_date);
  if (!referenceYear) return null;
  const resolved = await loadResolvedSimulatorCurriculum({
    db: params.db,
    empresaId: params.empresaId,
    qualificationTypeId: sourceQualificationTypeId,
    referenceYear,
    employeeId: params.current.employee_id,
    requestedType: 'RECORRENTE',
  });
  if (!resolved || resolved.unresolved_items > 0 || resolved.models.length === 0) return null;
  const programModels = [...resolved.models].sort(
    (a, b) => a.ordem_no_treinamento - b.ordem_no_treinamento || a.id - b.id,
  );
  if (
    programModels.some(
      (model) =>
        !Number.isFinite(Number(model.duracao_estimada)) || Number(model.duracao_estimada) <= 0,
    )
  ) {
    return null;
  }
  const replacementNeeds: SimulatorTrainingSessionNeed[] = programModels.map((model) => ({
    need_id: `${params.current.employee_id}:${sourceQualificationTypeId}:${resolved.program_id ?? 'legacy'}:${model.id}`,
    employee_id: params.current.employee_id,
    employee_name: params.current.employee_name,
    employee_role: params.current.employee_role,
    qualification_type_id: sourceQualificationTypeId,
    qualification_code: source.qualification_code,
    qualification_name: source.qualification_name,
    expiry_date: params.current.expiry_date,
    equipment: normalizeEquipment(model.modelo_aeronave),
    session_model_id: Number(model.id),
    session_code: model.codigo_canonico || model.codigo,
    session_name: model.nome,
    session_order: Number(model.ordem_no_treinamento),
    duration_minutes: Number(model.duracao_estimada),
    training_session_count: programModels.length,
    curriculum_cycle: resolved.cycle,
    curriculum_reference_year: referenceYear,
    training_program_id: resolved.program_id,
    training_program_type: resolved.program_type,
    training_program_name: resolved.program?.nome ?? source.qualification_name,
    requirement_qualification_type_id: requirementQualificationTypeId,
    requirement_qualification_code:
      params.current.requirement_qualification_code || params.current.qualification_code,
    requirement_qualification_name:
      params.current.requirement_qualification_name || params.current.qualification_name,
    coverage_reason: 'RECORRENTE_PRIORITARIO_SOBRE_SEMESTRAL',
    satisfies_qualification_type_ids: [sourceQualificationTypeId, requirementQualificationTypeId],
  }));
  const structural = params.anchor
    ? replacementNeeds.filter((need) =>
        canManuallyShareSimulatorTrainingSessions(
          params.anchor as SimulatorTrainingSessionNeed,
          need,
        ),
      )
    : replacementNeeds;
  if (structural.length === 0) return null;
  const orderedCandidates = [...structural].sort(
    (left, right) =>
      Number(left.session_order !== params.current.session_order) -
        Number(right.session_order !== params.current.session_order) ||
      left.session_order - right.session_order,
  );
  let selectedNeed: SimulatorTrainingSessionNeed | null = null;
  let availability: ReturnType<typeof findSharedWindow> = null;
  if (params.anchor) {
    const targetDates = orderedCandidates.map(
      (need) =>
        [params.anchor?.expiry_date || params.current.expiry_date, need.expiry_date].sort()[0],
    );
    const earliestTarget = [...targetDates].sort()[0];
    const latestTarget = [...targetDates].sort().at(-1) as string;
    const startDate =
      params.referenceDate > addDaysIso(earliestTarget, -params.config.planning_horizon_days)
        ? params.referenceDate
        : addDaysIso(earliestTarget, -params.config.planning_horizon_days);
    const [assignments, windows] = await Promise.all([
      loadEmployeeFortnightAssignments({
        db: params.db,
        empresaId: params.empresaId,
        employeeIds: [params.anchor.employee_id, params.current.employee_id],
      }),
      loadOperationalFortnightWindows({
        db: params.db,
        empresaId: params.empresaId,
        startDate,
        endDate: latestTarget,
      }),
    ]);
    for (const need of orderedCandidates) {
      const shared = findSharedWindow({
        anchor: params.anchor,
        candidate: need,
        referenceDate: params.referenceDate,
        horizonDays: params.config.planning_horizon_days,
        rosterPolicy: params.config.roster_policy,
        assignments,
        windows,
      });
      if (shared) {
        selectedNeed = need;
        availability = shared;
        break;
      }
    }
  } else {
    selectedNeed = orderedCandidates[0];
  }
  if (!selectedNeed) return null;
  return {
    kind: 'TRAINING_PROGRAM',
    recommended: true,
    label: resolved.program?.nome || `${source.qualification_name} — Periódico`,
    reason: 'Periódico prioritário: atende e renova a obrigação semestral.',
    selected_need: selectedNeed,
    replacement_needs: replacementNeeds,
    availability,
  };
}

app.post(
  '/alternativas-sessao',
  requirePermission('simuladores', 'visualizar', 'admin', 'manager'),
  async (c) => {
    const empresaId = getTenantContext(c).empresaId;
    const body = (await c.req.json().catch(() => null)) as {
      reference_date?: unknown;
      anchor?: unknown;
      current?: unknown;
      candidates?: unknown;
    } | null;
    const referenceDate = String(body?.reference_date || new Date().toISOString().slice(0, 10));
    const anchor = body?.anchor == null ? null : parseNeed(body.anchor);
    const current = parseNeed(body?.current);
    const candidateValues = Array.isArray(body?.candidates) ? body.candidates : [];
    const candidates = candidateValues
      .map(parseNeed)
      .filter((item): item is SimulatorTrainingSessionNeed => Boolean(item));
    if (
      !isIsoDate(referenceDate) ||
      !current ||
      (body?.anchor != null && !anchor) ||
      candidates.length > MAX_CANDIDATES ||
      candidates.length !== candidateValues.length ||
      candidates.some((candidate) => candidate.employee_id !== current.employee_id)
    ) {
      return c.json({ success: false, error: 'Consulta de alternativas de sessão inválida' }, 400);
    }
    const suppliedNeeds = [current, ...(anchor ? [anchor] : []), ...candidates];
    let validatedCandidates: SimulatorTrainingSessionNeed[] = [];
    try {
      const validation = await validateNeedsInTenantAndScope({
        c,
        db: c.env.DB,
        empresaId,
        needs: suppliedNeeds,
      });
      const requiredFailure = validation.invalid.find(
        (item) => item.need === current || item.need === anchor,
      );
      if (requiredFailure) throw new Error(requiredFailure.error);
      const validNeeds = new Set(validation.valid);
      validatedCandidates = candidates.filter((candidate) => validNeeds.has(candidate));
    } catch (error) {
      return c.json(
        { success: false, error: error instanceof Error ? error.message : 'Sessões inválidas' },
        400,
      );
    }
    const config = await loadConfig(c.env.DB, empresaId);
    const alternatives: SessionAlternative[] = [];

    if (anchor) {
      const structuralCandidates = validatedCandidates.filter(
        (candidate) =>
          candidate.need_id !== current.need_id &&
          canManuallyShareSimulatorTrainingSessions(anchor, candidate) &&
          daysDistance(anchor.expiry_date, candidate.expiry_date) <= config.planning_horizon_days,
      );
      if (structuralCandidates.length > 0) {
        const targetDates = structuralCandidates.map(
          (candidate) => [anchor.expiry_date, candidate.expiry_date].sort()[0],
        );
        const earliestTarget = [...targetDates].sort()[0];
        const latestTarget = [...targetDates].sort().at(-1) as string;
        const startDate =
          referenceDate > addDaysIso(earliestTarget, -config.planning_horizon_days)
            ? referenceDate
            : addDaysIso(earliestTarget, -config.planning_horizon_days);
        const [assignments, windows] = await Promise.all([
          loadEmployeeFortnightAssignments({
            db: c.env.DB,
            empresaId,
            employeeIds: [anchor.employee_id, current.employee_id],
          }),
          loadOperationalFortnightWindows({
            db: c.env.DB,
            empresaId,
            startDate,
            endDate: latestTarget,
          }),
        ]);
        for (const candidate of structuralCandidates) {
          const shared = findSharedWindow({
            anchor,
            candidate,
            referenceDate,
            horizonDays: config.planning_horizon_days,
            rosterPolicy: config.roster_policy,
            assignments,
            windows,
          });
          if (!shared) continue;
          alternatives.push({
            kind: 'SESSION_NEED',
            recommended: false,
            label: `S${candidate.session_order}/${candidate.training_session_count} · ${candidate.session_name}`,
            reason: 'Outra sessão pendente do mesmo tripulante, compatível com este bloco.',
            selected_need: candidate,
            replacement_needs: null,
            availability: shared,
          });
        }
      }
    }

    const recurringAlternative = await buildRecurringProgramAlternative({
      db: c.env.DB,
      empresaId,
      anchor,
      current,
      referenceDate,
      config,
    });
    if (recurringAlternative) alternatives.unshift(recurringAlternative);

    return c.json({ success: true, data: { alternatives } });
  },
);

app.post(
  '/candidatos',
  requirePermission('simuladores', 'visualizar', 'admin', 'manager'),
  async (c) => {
    const empresaId = getTenantContext(c).empresaId;
    const body = (await c.req.json().catch(() => null)) as {
      reference_date?: unknown;
      anchor?: unknown;
      candidates?: unknown;
    } | null;
    const referenceDate = String(body?.reference_date || new Date().toISOString().slice(0, 10));
    const anchor = parseNeed(body?.anchor);
    const candidateValues = Array.isArray(body?.candidates) ? body?.candidates : [];
    const candidates = candidateValues
      .map(parseNeed)
      .filter((item): item is SimulatorTrainingSessionNeed => Boolean(item));
    if (
      !isIsoDate(referenceDate) ||
      !anchor ||
      candidates.length > MAX_CANDIDATES ||
      candidates.length !== candidateValues.length
    ) {
      return c.json({ success: false, error: 'Consulta de tripulantes inválida' }, 400);
    }

    const needs = [anchor, ...candidates];
    let validatedCandidates: SimulatorTrainingSessionNeed[] = [];
    try {
      const validation = await validateNeedsInTenantAndScope({ c, db: c.env.DB, empresaId, needs });
      const anchorFailure = validation.invalid.find((item) => item.need === anchor);
      if (anchorFailure) throw new Error(anchorFailure.error);
      const validNeeds = new Set(validation.valid);
      validatedCandidates = candidates.filter((candidate) => validNeeds.has(candidate));
    } catch (error) {
      return c.json(
        { success: false, error: error instanceof Error ? error.message : 'Tripulantes inválidos' },
        400,
      );
    }

    const config = await loadConfig(c.env.DB, empresaId);
    const structurallyCompatible = validatedCandidates.filter(
      (candidate) =>
        canShareSimulatorTrainingSessions(anchor, candidate) &&
        daysDistance(anchor.expiry_date, candidate.expiry_date) <= config.planning_horizon_days,
    );
    if (structurallyCompatible.length === 0) {
      return c.json({ success: true, data: { candidates: [] } });
    }

    const targetDates = structurallyCompatible.map(
      (candidate) => [anchor.expiry_date, candidate.expiry_date].sort()[0],
    );
    const earliestTarget = targetDates.sort()[0];
    const latestTarget = targetDates.sort().at(-1) as string;
    const startDate =
      referenceDate > addDaysIso(earliestTarget, -config.planning_horizon_days)
        ? referenceDate
        : addDaysIso(earliestTarget, -config.planning_horizon_days);
    const employeeIds = [
      ...new Set([anchor.employee_id, ...structurallyCompatible.map((item) => item.employee_id)]),
    ];
    const [assignments, windows] = await Promise.all([
      loadEmployeeFortnightAssignments({ db: c.env.DB, empresaId, employeeIds }),
      loadOperationalFortnightWindows({
        db: c.env.DB,
        empresaId,
        startDate,
        endDate: latestTarget,
      }),
    ]);

    const available = structurallyCompatible
      .map((candidate) => {
        const shared = findSharedWindow({
          anchor,
          candidate,
          referenceDate,
          horizonDays: config.planning_horizon_days,
          rosterPolicy: config.roster_policy,
          assignments,
          windows,
        });
        return shared ? { ...candidate, availability: shared } : null;
      })
      .filter(Boolean);

    return c.json({ success: true, data: { candidates: available } });
  },
);

app.post('/reparear', requirePermission('simuladores', 'editar', 'admin', 'manager'), async (c) => {
  const empresaId = getTenantContext(c).empresaId;
  const body = (await c.req.json().catch(() => null)) as {
    reference_date?: unknown;
    session_needs?: unknown;
    locks?: unknown;
    cae_availability?: unknown;
  } | null;
  const referenceDate = String(body?.reference_date || new Date().toISOString().slice(0, 10));
  const rawNeeds = Array.isArray(body?.session_needs) ? body?.session_needs : [];
  const needs = rawNeeds
    .map(parseNeed)
    .filter((item): item is SimulatorTrainingSessionNeed => Boolean(item));
  const rawLocks = Array.isArray(body?.locks) ? body?.locks : [];
  if (
    !isIsoDate(referenceDate) ||
    rawNeeds.length === 0 ||
    rawNeeds.length > MAX_NEEDS ||
    needs.length !== rawNeeds.length ||
    rawLocks.length > MAX_LOCKS
  ) {
    return c.json({ success: false, error: 'Repareamento inválido' }, 400);
  }

  try {
    await assertNeedsInTenantAndScope({ c, db: c.env.DB, empresaId, needs });
  } catch (error) {
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Sessões inválidas' },
      400,
    );
  }

  const config = await loadConfig(c.env.DB, empresaId);
  const needById = new Map(needs.map((need) => [need.need_id, need]));
  const used = new Set<string>();
  const lockedBlocks: SimulatorTrainingSessionBlock[] = [];
  const parsedLocks: Array<{
    anchor: SimulatorTrainingSessionNeed;
    partner: SimulatorTrainingSessionNeed;
  }> = [];

  for (const raw of rawLocks) {
    if (!raw || typeof raw !== 'object')
      return c.json({ success: false, error: 'Override de dupla inválido' }, 400);
    const value = raw as Record<string, unknown>;
    const anchor = needById.get(String(value.anchor_need_id || ''));
    const partner = needById.get(String(value.partner_need_id || ''));
    if (
      !anchor ||
      !partner ||
      anchor.need_id === partner.need_id ||
      used.has(anchor.need_id) ||
      used.has(partner.need_id) ||
      !canManuallyShareSimulatorTrainingSessions(anchor, partner) ||
      daysDistance(anchor.expiry_date, partner.expiry_date) > config.planning_horizon_days
    ) {
      return c.json(
        { success: false, error: 'Dupla manual incompatível com currículo/equipamento/horizonte' },
        400,
      );
    }
    used.add(anchor.need_id);
    used.add(partner.need_id);
    parsedLocks.push({ anchor, partner });
  }

  if (parsedLocks.length > 0) {
    const targetDates = parsedLocks.map(
      ({ anchor, partner }) => [anchor.expiry_date, partner.expiry_date].sort()[0],
    );
    const earliestTarget = [...targetDates].sort()[0];
    const latestTarget = [...targetDates].sort().at(-1) as string;
    const startDate =
      referenceDate > addDaysIso(earliestTarget, -config.planning_horizon_days)
        ? referenceDate
        : addDaysIso(earliestTarget, -config.planning_horizon_days);
    const employeeIds = [
      ...new Set(
        parsedLocks.flatMap(({ anchor, partner }) => [anchor.employee_id, partner.employee_id]),
      ),
    ];
    const [assignments, windows] = await Promise.all([
      loadEmployeeFortnightAssignments({ db: c.env.DB, empresaId, employeeIds }),
      loadOperationalFortnightWindows({
        db: c.env.DB,
        empresaId,
        startDate,
        endDate: latestTarget,
      }),
    ]);

    for (const { anchor, partner } of parsedLocks) {
      const shared = findSharedWindow({
        anchor,
        candidate: partner,
        referenceDate,
        horizonDays: config.planning_horizon_days,
        rosterPolicy: config.roster_policy,
        assignments,
        windows,
      });
      if (!shared) {
        return c.json(
          {
            success: false,
            error: `Dupla ${anchor.employee_name} / ${partner.employee_name} sem disponibilidade comum na quinzena permitida`,
          },
          400,
        );
      }
      const sessions = [anchor, partner];
      lockedBlocks.push({
        block_id: sessions
          .map((session) => session.need_id)
          .sort()
          .join('+'),
        equipment: anchor.equipment,
        duration_minutes: anchor.duration_minutes,
        target_date: sessions.map((session) => session.expiry_date).sort()[0],
        pairing: pairKind(anchor, partner),
        sessions,
      });
    }
  }

  const remaining = needs.filter((need) => !used.has(need.need_id));
  const remainingEmployeeIds = [...new Set(remaining.map((need) => need.employee_id))];
  const remainingLatestTarget =
    remaining
      .map((need) => need.expiry_date)
      .sort()
      .at(-1) || referenceDate;
  const [remainingAssignments, remainingWindows] = await Promise.all([
    loadEmployeeFortnightAssignments({
      db: c.env.DB,
      empresaId,
      employeeIds: remainingEmployeeIds,
    }),
    loadOperationalFortnightWindows({
      db: c.env.DB,
      empresaId,
      startDate: referenceDate,
      endDate: remainingLatestTarget,
    }),
  ]);
  const automaticRoster = createEmployeeFortnightPairEligibility({
    needs: remaining,
    referenceDate,
    horizonDays: config.planning_horizon_days,
    rosterPolicy: config.roster_policy,
    assignments: remainingAssignments,
    windows: remainingWindows,
  });
  const automaticBlocks = pairSimulatorTrainingSessions(
    remaining,
    config.planning_horizon_days,
    config.allow_shared_session,
    automaticRoster.pairEligibility,
  );
  const blocks = [...lockedBlocks, ...automaticBlocks];
  const baseClasses = buildSimulatorTrainingClasses(blocks);
  let classes: unknown = baseClasses;
  let caeComparison: unknown = null;

  if (body?.cae_availability !== undefined && body?.cae_availability !== null) {
    const validation = validateAndNormalizeCaeAvailability(body.cae_availability);
    if (!validation.ok) {
      return c.json(
        { success: false, error: 'Disponibilidade CAE inválida', details: validation.errors },
        400,
      );
    }
    const rosterCache = new Map<
      string,
      Awaited<ReturnType<typeof resolveEmployeeFortnightDayFromD1>>
    >();
    const schedule = await scheduleSimulatorTrainingBlocks({
      blocks,
      slots: validation.data.slots,
      referenceDate,
      preferredSessionsPerDay: config.preferred_sessions_per_day,
      checkRoster: async (employeeId, _employeeName, date) => {
        const key = `${employeeId}:${date}`;
        let roster = rosterCache.get(key);
        if (!roster) {
          roster = await resolveEmployeeFortnightDayFromD1({
            db: c.env.DB,
            empresaId,
            employeeId,
            date,
          });
          rosterCache.set(key, roster);
        }
        const eligibility = evaluateRosterEligibility(config.roster_policy, roster.state);
        return {
          eligible: eligibility.eligible,
          state: roster.state,
          reason: `${eligibility.reason} ${roster.reason}`.trim(),
        };
      },
    });
    const scheduledById = new Map(schedule.scheduled.map((block) => [block.block_id, block]));
    classes = baseClasses.map((trainingClass) => ({
      ...trainingClass,
      blocks: trainingClass.blocks.map((block) => scheduledById.get(block.block_id) || block),
    }));
    caeComparison = {
      source_slots: validation.data.slots.length,
      scheduled_blocks: schedule.scheduled.filter((block) => block.schedule_status === 'SCHEDULED')
        .length,
      unmatched_crew_blocks: schedule.scheduled.filter(
        (block) => block.schedule_status === 'UNMATCHED_CREW',
      ).length,
      no_slot_blocks: schedule.scheduled.filter((block) => block.schedule_status === 'NO_CAE_SLOT')
        .length,
      remaining_slots: schedule.remaining_slots,
      warnings: validation.warnings,
    };
  }

  const unmatched = blocks.filter((block) => block.pairing === 'SEM_DUPLA').length;
  return c.json({
    success: true,
    data: {
      classes,
      cae_comparison: caeComparison,
      summary: {
        session_requirements: needs.length,
        paired_blocks: blocks.length - unmatched,
        unmatched_blocks: unmatched,
        classes: baseClasses.length,
      },
    },
  });
});

/**
 * Compara uma proposta já formada com a disponibilidade CAE sem recalcular
 * duplas. `pairing_blocks` é a partição exata da proposta salva/visível:
 * blocos com 2 necessidades permanecem como dupla e blocos com 1 necessidade
 * permanecem sem dupla. A CAE entra apenas para definir datas/horários.
 */
app.post(
  '/comparar-cae',
  requirePermission('simuladores', 'editar', 'admin', 'manager'),
  async (c) => {
    const empresaId = getTenantContext(c).empresaId;
    const body = (await c.req.json().catch(() => null)) as {
      reference_date?: unknown;
      session_needs?: unknown;
      pairing_blocks?: unknown;
      cae_availability?: unknown;
    } | null;
    const referenceDate = String(body?.reference_date || new Date().toISOString().slice(0, 10));
    const rawNeeds = Array.isArray(body?.session_needs) ? body.session_needs : [];
    const needs = rawNeeds
      .map(parseNeed)
      .filter((item): item is SimulatorTrainingSessionNeed => Boolean(item));
    const rawBlocks = Array.isArray(body?.pairing_blocks) ? body.pairing_blocks : [];
    if (
      !isIsoDate(referenceDate) ||
      rawNeeds.length === 0 ||
      rawNeeds.length > MAX_NEEDS ||
      needs.length !== rawNeeds.length ||
      rawBlocks.length === 0 ||
      rawBlocks.length > MAX_NEEDS ||
      body?.cae_availability == null
    ) {
      return c.json({ success: false, error: 'Comparação CAE inválida' }, 400);
    }

    try {
      await assertNeedsInTenantAndScope({ c, db: c.env.DB, empresaId, needs });
    } catch (error) {
      return c.json(
        { success: false, error: error instanceof Error ? error.message : 'Sessões inválidas' },
        400,
      );
    }

    const config = await loadConfig(c.env.DB, empresaId);
    const needById = new Map(needs.map((need) => [need.need_id, need]));
    const used = new Set<string>();
    const blocks: SimulatorTrainingSessionBlock[] = [];

    for (const raw of rawBlocks) {
      if (!raw || typeof raw !== 'object') {
        return c.json({ success: false, error: 'Bloco da proposta inválido' }, 400);
      }
      const ids = Array.isArray((raw as Record<string, unknown>).need_ids)
        ? ((raw as Record<string, unknown>).need_ids as unknown[]).map((value) =>
            String(value || ''),
          )
        : [];
      if (ids.length < 1 || ids.length > 2 || new Set(ids).size !== ids.length) {
        return c.json(
          { success: false, error: 'Bloco da proposta deve conter uma ou duas sessões' },
          400,
        );
      }
      const sessions = ids.map((id) => needById.get(id));
      if (sessions.some((session) => !session) || ids.some((id) => used.has(id))) {
        return c.json(
          { success: false, error: 'Bloco da proposta contém sessão ausente ou duplicada' },
          400,
        );
      }
      const resolved = sessions as SimulatorTrainingSessionNeed[];
      const first = resolved[0];
      if (resolved.length === 2) {
        const second = resolved[1];
        if (
          !canManuallyShareSimulatorTrainingSessions(first, second) ||
          daysDistance(first.expiry_date, second.expiry_date) > config.planning_horizon_days
        ) {
          return c.json(
            {
              success: false,
              error: 'Dupla preservada incompatível com currículo/equipamento/horizonte',
            },
            400,
          );
        }
      }
      ids.forEach((id) => used.add(id));
      blocks.push({
        block_id: ids.slice().sort().join('+'),
        equipment: first.equipment,
        duration_minutes: first.duration_minutes,
        target_date: resolved.map((session) => session.expiry_date).sort()[0],
        pairing: resolved.length === 2 ? pairKind(resolved[0], resolved[1]) : 'SEM_DUPLA',
        sessions: resolved,
      });
    }

    if (used.size !== needs.length) {
      return c.json(
        { success: false, error: 'A proposta informada não contém todas as sessões' },
        400,
      );
    }

    const validation = validateAndNormalizeCaeAvailability(body.cae_availability);
    if (!validation.ok) {
      return c.json(
        {
          success: false,
          error: 'Disponibilidade CAE inválida',
          code: 'CAE_AVAILABILITY_INVALID',
          details: validation.errors,
          warnings: validation.warnings,
        },
        400,
      );
    }

    const baseClasses = buildSimulatorTrainingClasses(blocks);
    const rosterCache = new Map<
      string,
      Awaited<ReturnType<typeof resolveEmployeeFortnightDayFromD1>>
    >();
    const schedule = await scheduleSimulatorTrainingBlocks({
      blocks,
      slots: validation.data.slots,
      referenceDate,
      preferredSessionsPerDay: config.preferred_sessions_per_day,
      checkRoster: async (employeeId, _employeeName, date) => {
        const key = `${employeeId}:${date}`;
        let roster = rosterCache.get(key);
        if (!roster) {
          roster = await resolveEmployeeFortnightDayFromD1({
            db: c.env.DB,
            empresaId,
            employeeId,
            date,
          });
          rosterCache.set(key, roster);
        }
        const eligibility = evaluateRosterEligibility(config.roster_policy, roster.state);
        return {
          eligible: eligibility.eligible,
          state: roster.state,
          reason: `${eligibility.reason} ${roster.reason}`.trim(),
        };
      },
    });
    const scheduledById = new Map(schedule.scheduled.map((block) => [block.block_id, block]));
    const classes = baseClasses.map((trainingClass) => ({
      ...trainingClass,
      blocks: trainingClass.blocks.map((block) => scheduledById.get(block.block_id) || block),
    }));
    const unmatched = blocks.filter((block) => block.pairing === 'SEM_DUPLA').length;

    return c.json({
      success: true,
      data: {
        classes,
        cae_comparison: {
          source_slots: validation.data.slots.length,
          scheduled_blocks: schedule.scheduled.filter(
            (block) => block.schedule_status === 'SCHEDULED',
          ).length,
          unmatched_crew_blocks: schedule.scheduled.filter(
            (block) => block.schedule_status === 'UNMATCHED_CREW',
          ).length,
          no_slot_blocks: schedule.scheduled.filter(
            (block) => block.schedule_status === 'NO_CAE_SLOT',
          ).length,
          remaining_slots: schedule.remaining_slots,
          warnings: validation.warnings,
        },
        summary: {
          session_requirements: needs.length,
          paired_blocks: blocks.length - unmatched,
          unmatched_blocks: unmatched,
          classes: baseClasses.length,
        },
      },
    });
  },
);

export default app;

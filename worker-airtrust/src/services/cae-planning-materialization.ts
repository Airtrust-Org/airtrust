import type { D1Database } from '@cloudflare/workers-types';
import { executeSharedSessionCreation } from '../routes/simuladores-shared-session-helpers';
import { validateAndNormalizeSharedSessionRequest } from '../routes/simuladores-shared-session-logic';
import { canMaterializeSimulatorSessions } from './cae-planning-approval';
import { executeNormalSessionCreation } from './cae-planning-normal-session';
import type { SimulatorPlanningSourceSnapshot } from './cae-planning-revalidation';
import type { SimulatorPairingMode } from './cae-planning-policy';

export type ApprovedPlanningParticipant = {
  employee_id: number;
  planned_training_id: string | number;
  session_model_id: string | number;
  session_order: number;
  generate_ficha: boolean;
};

export type ApprovedPlanningBlock = {
  proposal_id: string | number;
  proposal_status: 'CONFIRMADO';
  slot_key: string;
  equipment: string;
  date: string;
  start_time: string;
  end_time: string;
  simulator_id?: string | number | null;
  instructor_id?: number | null;
  examiner_id?: number | null;
  mode: SimulatorPairingMode;
  participants: ApprovedPlanningParticipant[];
};

export type SimulatorMaterializationPlan =
  | {
      kind: 'NORMAL_SESSION';
      source_proposal_id: string | number;
      block: ApprovedPlanningBlock;
      planned_training_id: string | number;
      session_model_id: string | number;
      participant_ids: number[];
    }
  | {
      kind: 'SHARED_SESSION';
      source_proposal_id: string | number;
      block: ApprovedPlanningBlock;
      curricular_assignments: Array<{
        employee_id: number;
        planned_training_id: string | number;
        session_model_id: string | number;
        generate_ficha: boolean;
      }>;
    };

export type PlanningMaterializationSnapshot = SimulatorPlanningSourceSnapshot & {
  mode?: SimulatorPairingMode;
  simulator_id?: number | null;
  instructor_id?: number | null;
  materialized_session_id?: number | null;
};

const materializationMarker = (planningId: number) => `[cae-planning:${planningId}]`;

export function buildSimulatorMaterializationPlan(
  block: ApprovedPlanningBlock,
): SimulatorMaterializationPlan {
  if (block.proposal_status !== 'CONFIRMADO') {
    throw new Error('PLANNING_NOT_CONFIRMED');
  }
  if (block.participants.length === 0 || block.participants.length > 2) {
    throw new Error('INVALID_PARTICIPANT_COUNT');
  }

  if (block.mode === 'NORMAL') {
    const first = block.participants[0];
    const sameTraining = block.participants.every(
      (participant) => String(participant.planned_training_id) === String(first.planned_training_id),
    );
    const sameSession = block.participants.every(
      (participant) => String(participant.session_model_id) === String(first.session_model_id),
    );
    if (!sameTraining || !sameSession) {
      throw new Error('NORMAL_SESSION_REQUIRES_SAME_CURRICULAR_ASSIGNMENT');
    }

    return {
      kind: 'NORMAL_SESSION',
      source_proposal_id: block.proposal_id,
      block,
      planned_training_id: first.planned_training_id,
      session_model_id: first.session_model_id,
      participant_ids: block.participants.map((participant) => participant.employee_id),
    };
  }

  return {
    kind: 'SHARED_SESSION',
    source_proposal_id: block.proposal_id,
    block,
    curricular_assignments: block.participants.map((participant) => ({
      employee_id: participant.employee_id,
      planned_training_id: participant.planned_training_id,
      session_model_id: participant.session_model_id,
      generate_ficha: participant.generate_ficha,
    })),
  };
}


function asPositiveInt(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function parsePlanningMaterializationSnapshot(
  raw: string | null,
): PlanningMaterializationSnapshot {
  if (!raw) {
    throw new Error('PLANNING_SNAPSHOT_MISSING');
  }
  try {
    return JSON.parse(raw) as PlanningMaterializationSnapshot;
  } catch {
    throw new Error('PLANNING_SNAPSHOT_INVALID');
  }
}

function assertSharedPlan(plan: Extract<SimulatorMaterializationPlan, { kind: 'SHARED_SESSION' }>) {
  if (plan.curricular_assignments.length !== 2) {
    throw new Error('SHARED_SESSION_REQUIRES_TWO_PILOTS');
  }
  for (const assignment of plan.curricular_assignments) {
    if (!asPositiveInt(assignment.employee_id)) {
      throw new Error('SHARED_SESSION_INCONSISTENT_EMPLOYEE');
    }
    if (!asPositiveInt(assignment.session_model_id)) {
      throw new Error('SHARED_SESSION_INCONSISTENT_SESSION_MODEL');
    }
    if (assignment.planned_training_id == null || String(assignment.planned_training_id) === '') {
      throw new Error('SHARED_SESSION_INCONSISTENT_TRAINING');
    }
  }
  if (plan.curricular_assignments[0].employee_id === plan.curricular_assignments[1].employee_id) {
    throw new Error('SHARED_SESSION_INCONSISTENT_EMPLOYEE');
  }
  if (!asPositiveInt(plan.block.simulator_id) || !asPositiveInt(plan.block.instructor_id)) {
    throw new Error('SHARED_SESSION_REQUIRES_SIMULATOR_AND_INSTRUCTOR');
  }
}

async function findExistingMaterializedSession(
  db: D1Database,
  empresaId: number,
  planningId: number,
): Promise<number | null> {
  const row = await db
    .prepare(
      `SELECT id
         FROM simulador_agendamentos
        WHERE empresa_id = ?
          AND deleted_at IS NULL
          AND observacoes LIKE ?
        ORDER BY id
        LIMIT 1`,
    )
    .bind(empresaId, `%${materializationMarker(planningId)}%`)
    .first<{ id: number }>();
  return row?.id ? Number(row.id) : null;
}

export async function materializeSimulatorPlanning(params: {
  db: D1Database;
  empresaId: number;
  planningId: number;
  userId: number;
}): Promise<{ success: boolean; sessao_id?: number; reused?: boolean; error?: string; code?: string }> {
  const { db, empresaId, planningId } = params;

  const row = await db
    .prepare(
      `SELECT planejamento_status, planejamento_aprovacao_status, planejamento_snapshot_json
         FROM treinamentos_planejados
        WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
    )
    .bind(planningId, empresaId)
    .first<{
      planejamento_status: string;
      planejamento_aprovacao_status: string | null;
      planejamento_snapshot_json: string | null;
    }>();

  if (!row) {
    return { success: false, error: 'Proposta não encontrada', code: 'NOT_FOUND' };
  }

  if (
    !canMaterializeSimulatorSessions({
      planning_status: row.planejamento_status as 'CONFIRMADO',
      approval_status: (row.planejamento_aprovacao_status || 'RASCUNHO') as 'APROVADO',
    })
  ) {
    return {
      success: false,
      error: 'Proposta não está confirmada/aprovada para materializar',
      code: 'NOT_APPROVED',
    };
  }

  const existing = await findExistingMaterializedSession(db, empresaId, planningId);
  if (existing) {
    return { success: true, sessao_id: existing, reused: true };
  }

  let snapshot: PlanningMaterializationSnapshot;
  try {
    snapshot = parsePlanningMaterializationSnapshot(row.planejamento_snapshot_json);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Snapshot inválido',
      code: 'SNAPSHOT_INVALID',
    };
  }

  if (asPositiveInt(snapshot.materialized_session_id)) {
    return { success: true, sessao_id: Number(snapshot.materialized_session_id), reused: true };
  }

  const inferredMode = (() => {
    const rows = (snapshot.participants || []).map((participant: any) => ({
      training_id: participant.training_id,
      session_model_id: participant.session_model_ids?.[0],
    }));
    if (rows.length <= 1) return 'NORMAL' as const;
    const sameTraining = rows.every(
      (item) => String(item.training_id || '') === String(rows[0].training_id || ''),
    );
    const sameSession = rows.every(
      (item) => String(item.session_model_id || '') === String(rows[0].session_model_id || ''),
    );
    return sameTraining && sameSession ? ('NORMAL' as const) : ('COMPARTILHADA' as const);
  })();
  const mode = snapshot.mode || inferredMode;
  if (mode !== 'NORMAL' && mode !== 'COMPARTILHADA') {
    return { success: false, error: 'Tipo da proposta ausente no snapshot', code: 'SNAPSHOT_MODE_MISSING' };
  }

  const slot = snapshot.cae_slots?.[0];
  if (!slot) {
    return { success: false, error: 'Snapshot sem slot CAE para materializar', code: 'SNAPSHOT_SLOT_MISSING' };
  }

  const participants = (snapshot.participants || []).map((participant: any, index) => ({
    employee_id: Number(participant.employee_id ?? participant.funcionario_id),
    planned_training_id:
      participant.training_id ?? participant.planned_training_id ?? participant.qualificacao_tipo_id ?? planningId,
    session_model_id: participant.session_model_ids?.[0] ?? participant.modelo_sessao_id,
    session_order: index + 1,
    generate_ficha: true,
  }));

  if (participants.some((participant) => !asPositiveInt(participant.session_model_id))) {
    return { success: false, error: 'Snapshot sem modelo_sessao_id individual', code: 'SNAPSHOT_SESSION_MODEL_MISSING' };
  }

  let plan: SimulatorMaterializationPlan;
  try {
    plan = buildSimulatorMaterializationPlan({
      proposal_id: planningId,
      proposal_status: 'CONFIRMADO',
      slot_key: slot.slot_key,
      equipment: slot.equipment,
      date: slot.date,
      start_time: slot.start_time,
      end_time: slot.end_time,
      simulator_id: snapshot.simulator_id ?? null,
      instructor_id: snapshot.instructor_id ?? null,
      mode,
      participants,
    });
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Falha ao montar plano de materialização',
      code: 'PLAN_INVALID',
    };
  }

  const notes = `Materializado do planejamento CAE ${materializationMarker(planningId)}`;

  try {
    let sessaoId: number;
    if (plan.kind === 'NORMAL_SESSION') {
      const created = await executeNormalSessionCreation(db, empresaId, {
        date: plan.block.date,
        start_time: plan.block.start_time,
        end_time: plan.block.end_time,
        simulator_id: asPositiveInt(plan.block.simulator_id) || 0,
        instructor_id: asPositiveInt(plan.block.instructor_id) || 0,
        session_model_id: Number(plan.session_model_id),
        theme: 'Planejamento CAE',
        notes,
        participants: plan.participant_ids.map((employeeId, index) => ({
          employee_id: employeeId,
          role: index === 0 ? 'PIC' : 'SIC',
        })),
      });
      sessaoId = created.sessaoId;
    } else {
      assertSharedPlan(plan);
      const assignments = plan.curricular_assignments;
      const payload = validateAndNormalizeSharedSessionRequest({
        data: plan.block.date,
        hora_inicio: plan.block.start_time,
        hora_fim: plan.block.end_time,
        simulador_id: Number(plan.block.simulator_id),
        instrutor_id: Number(plan.block.instructor_id),
        observacoes: notes,
        tema_sessao: 'Sessão compartilhada — planejamento CAE',
        participantes: assignments.map((assignment) => ({
          funcionario_id: assignment.employee_id,
          cumpre_treinamento: true,
          gera_ficha: assignment.generate_ficha,
          treinamento_planejado_id: Number(assignment.planned_training_id) || planningId,
          modelo_sessao_id: Number(assignment.session_model_id),
        })),
        segmentos: [
          {
            inicio: plan.block.start_time,
            fim: plan.block.end_time,
            atribuicao_funcionario_id: assignments[0].employee_id,
            atribuicao_funcionario_ids: assignments.map((assignment) => assignment.employee_id),
            finalidade_codigo: 'SOP_NORMAL',
            funcoes: [
              { funcionario_id: assignments[0].employee_id, funcao: 'PF' },
              { funcionario_id: assignments[1].employee_id, funcao: 'PM' },
            ],
          },
        ],
      });
      const shared = await executeSharedSessionCreation(db, empresaId, payload);
      sessaoId = shared.created.sessaoId;
    }

    const nextSnapshot: PlanningMaterializationSnapshot = {
      ...snapshot,
      materialized_session_id: sessaoId,
    };

    await db
      .prepare(
        `UPDATE treinamentos_planejados
            SET planejamento_status = 'AGENDADO',
                status = 'AGENDADO',
                planejamento_snapshot_json = ?,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
      )
      .bind(JSON.stringify(nextSnapshot), planningId, empresaId)
      .run();

    return { success: true, sessao_id: sessaoId, reused: false };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Falha ao materializar sessão',
      code: 'MATERIALIZATION_FAILED',
    };
  }
}

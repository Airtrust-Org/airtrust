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

/**
 * Converte somente planejamento já CONFIRMADO em instrução de materialização.
 * Não grava banco. O adaptador local deve chamar os fluxos canônicos atuais:
 * - sessão normal existente; ou
 * - shared session existente (simulador_atribuicoes_curriculares etc.).
 */
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

import type { SimulatorPairingMode } from './cae-planning-policy';

export type SimulatorPlanningApprovalReportParticipant = {
  employee_id: number;
  employee_name: string;
  qualification_label?: string | null;
  expiry_date?: string | null;
  training_label: string;
  session_label: string;
  session_order: number;
  roster_state: string;
};

export type SimulatorPlanningApprovalReportBlock = {
  slot_key: string;
  equipment: string;
  date: string;
  start_time: string;
  end_time: string;
  mode: SimulatorPairingMode;
  participants: SimulatorPlanningApprovalReportParticipant[];
  cae_source_ref?: string | null;
};

export type SimulatorPlanningApprovalReport = {
  proposal_id: string | number;
  generated_at: string;
  company_name: string;
  status: string;
  planning_horizon_days: number;
  roster_policy: string;
  source_document_name?: string | null;
  blocks: SimulatorPlanningApprovalReportBlock[];
  warnings: string[];
  approval: {
    required: boolean;
    approver_name?: string | null;
    approved_at?: string | null;
    observations?: string | null;
  };
};

/**
 * Payload neutro para o PDF/Excel atual do frontend.
 * Não cria PDF no Worker e não replica regra de negócio; apenas organiza dados já validados.
 */
export function buildSimulatorPlanningApprovalReport(
  input: SimulatorPlanningApprovalReport,
): SimulatorPlanningApprovalReport {
  return {
    ...input,
    blocks: [...input.blocks]
      .map((block) => ({
        ...block,
        participants: [...block.participants].sort(
          (a, b) => a.session_order - b.session_order || a.employee_name.localeCompare(b.employee_name),
        ),
      }))
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) ||
          a.start_time.localeCompare(b.start_time) ||
          a.equipment.localeCompare(b.equipment) ||
          a.slot_key.localeCompare(b.slot_key),
      ),
    warnings: [...new Set(input.warnings)],
  };
}

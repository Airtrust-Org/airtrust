import type {
  SimulatorPlanningConfig,
  SimulatorRosterDayState,
} from './cae-planning-policy';
import { evaluateRosterEligibility } from './cae-planning-policy';

export type ProposalParticipantSnapshot = {
  employee_id: number;
  employee_active: boolean;
  equipment: string;
  qualification_history_id?: number | null;
  qualification_expiry_date?: string | null;
  training_id: string | number;
  session_model_ids: Array<string | number>;
  roster_by_date: Record<string, SimulatorRosterDayState>;
};

export type ProposalCaeSlotSnapshot = {
  slot_key: string;
  state: string;
  equipment: string;
  date: string;
  start_time: string;
  end_time: string;
};

export type SimulatorPlanningSourceSnapshot = {
  generated_at: string;
  config: SimulatorPlanningConfig;
  participants: ProposalParticipantSnapshot[];
  cae_slots: ProposalCaeSlotSnapshot[];
  canonical_session_fingerprint: string;
  pairing_fingerprint: string;
};

export type LiveParticipantState = ProposalParticipantSnapshot;
export type LiveCaeSlotState = ProposalCaeSlotSnapshot;

export type SimulatorPlanningLiveState = {
  config: SimulatorPlanningConfig;
  participants: LiveParticipantState[];
  cae_slots: LiveCaeSlotState[];
  canonical_session_fingerprint: string;
  pairing_fingerprint: string;
};

export type RevalidationIssueSeverity = 'BLOCK' | 'WARN';
export type RevalidationIssue = {
  code: string;
  severity: RevalidationIssueSeverity;
  message: string;
  employee_id?: number;
  date?: string;
};

export type RevalidationResult = {
  ok: boolean;
  issues: RevalidationIssue[];
};

function stableConfigComparable(config: SimulatorPlanningConfig): string {
  return JSON.stringify({
    planning_horizon_days: config.planning_horizon_days,
    roster_policy: config.roster_policy,
    preferred_sessions_per_day: config.preferred_sessions_per_day,
    preferred_minutes_per_day: config.preferred_minutes_per_day,
    allow_preference_break: config.allow_preference_break,
    allow_shared_session: config.allow_shared_session,
    prefer_same_training: config.prefer_same_training,
    prefer_same_session: config.prefer_same_session,
    approval_required: config.approval_required,
  });
}

/**
 * Revalidação obrigatória imediatamente antes da aprovação.
 * O snapshot serve para auditoria; a decisão usa o LIVE STATE recém-resolvido das fontes canônicas.
 */
export function revalidateSimulatorPlanningProposal(
  snapshot: SimulatorPlanningSourceSnapshot,
  live: SimulatorPlanningLiveState,
): RevalidationResult {
  const issues: RevalidationIssue[] = [];

  if (stableConfigComparable(snapshot.config) !== stableConfigComparable(live.config)) {
    issues.push({
      code: 'PLANNING_CONFIG_CHANGED',
      severity: 'BLOCK',
      message: 'A configuração de planejamento da empresa mudou após a geração da proposta.',
    });
  }

  if (snapshot.canonical_session_fingerprint !== live.canonical_session_fingerprint) {
    issues.push({
      code: 'SESSION_MODELS_CHANGED',
      severity: 'BLOCK',
      message: 'Os modelos/carga das sessões mudaram após a geração da proposta.',
    });
  }

  if (snapshot.pairing_fingerprint !== live.pairing_fingerprint) {
    issues.push({
      code: 'PAIRING_RULE_CHANGED',
      severity: 'BLOCK',
      message: 'A compatibilidade normal/compartilhada mudou após a geração da proposta.',
    });
  }

  const liveParticipants = new Map(live.participants.map((item) => [item.employee_id, item]));
  for (const before of snapshot.participants) {
    const current = liveParticipants.get(before.employee_id);
    if (!current) {
      issues.push({
        code: 'PARTICIPANT_NOT_FOUND',
        severity: 'BLOCK',
        employee_id: before.employee_id,
        message: 'Tripulante não foi encontrado na fonte canônica atual.',
      });
      continue;
    }
    if (!current.employee_active) {
      issues.push({
        code: 'PARTICIPANT_INACTIVE',
        severity: 'BLOCK',
        employee_id: before.employee_id,
        message: 'Tripulante não está ativo no momento da aprovação.',
      });
    }
    if (before.equipment !== current.equipment) {
      issues.push({
        code: 'PARTICIPANT_EQUIPMENT_CHANGED',
        severity: 'BLOCK',
        employee_id: before.employee_id,
        message: 'Equipamento operacional do tripulante mudou.',
      });
    }
    if (before.qualification_history_id !== current.qualification_history_id ||
        before.qualification_expiry_date !== current.qualification_expiry_date) {
      issues.push({
        code: 'QUALIFICATION_STATE_CHANGED',
        severity: 'BLOCK',
        employee_id: before.employee_id,
        message: 'A qualificação/vencimento atual diverge do estado usado na proposta.',
      });
    }
    if (String(before.training_id) !== String(current.training_id)) {
      issues.push({
        code: 'TRAINING_CHANGED',
        severity: 'BLOCK',
        employee_id: before.employee_id,
        message: 'O treinamento aplicável mudou.',
      });
    }
    if (before.session_model_ids.map(String).join('|') !== current.session_model_ids.map(String).join('|')) {
      issues.push({
        code: 'PARTICIPANT_CURRICULUM_CHANGED',
        severity: 'BLOCK',
        employee_id: before.employee_id,
        message: 'O currículo/sessões aplicáveis ao tripulante mudou.',
      });
    }

    for (const date of Object.keys(before.roster_by_date)) {
      const liveDayState = current.roster_by_date[date] || 'DESCONHECIDO';
      const roster = evaluateRosterEligibility(live.config.roster_policy, liveDayState);
      if (!roster.eligible) {
        issues.push({
          code: 'ROSTER_POLICY_NO_LONGER_SATISFIED',
          severity: 'BLOCK',
          employee_id: before.employee_id,
          date,
          message: roster.reason,
        });
      } else if (before.roster_by_date[date] !== liveDayState) {
        issues.push({
          code: 'ROSTER_STATE_CHANGED_BUT_STILL_ELIGIBLE',
          severity: 'WARN',
          employee_id: before.employee_id,
          date,
          message: `A escala mudou de ${before.roster_by_date[date]} para ${liveDayState}, mas a política atual ainda permite a data.`,
        });
      }
    }
  }

  const liveSlots = new Map(live.cae_slots.map((slot) => [slot.slot_key, slot]));
  for (const before of snapshot.cae_slots) {
    const current = liveSlots.get(before.slot_key);
    if (!current) {
      issues.push({
        code: 'CAE_SLOT_NOT_FOUND',
        severity: 'BLOCK',
        date: before.date,
        message: `Slot CAE ${before.slot_key} não existe mais na disponibilidade atual.`,
      });
      continue;
    }
    if (!['OFFERED', 'HELD', 'CONFIRMED'].includes(current.state)) {
      issues.push({
        code: 'CAE_SLOT_NOT_AVAILABLE',
        severity: 'BLOCK',
        date: before.date,
        message: `Slot CAE ${before.slot_key} não está mais disponível.`,
      });
    }
    if (
      current.equipment !== before.equipment ||
      current.date !== before.date ||
      current.start_time !== before.start_time ||
      current.end_time !== before.end_time
    ) {
      issues.push({
        code: 'CAE_SLOT_CHANGED',
        severity: 'BLOCK',
        date: before.date,
        message: `Dados do slot CAE ${before.slot_key} mudaram.`,
      });
    }
  }

  return {
    ok: !issues.some((issue) => issue.severity === 'BLOCK'),
    issues,
  };
}

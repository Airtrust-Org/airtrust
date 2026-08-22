import type { RevalidationResult } from './cae-planning-revalidation';

export type SimulatorProposalStatus =
  | 'PROPOSTO'
  | 'PLANEJADO'
  | 'AGUARDANDO_DISPONIBILIDADE'
  | 'CONFIRMADO'
  | 'AGENDADO'
  | 'REALIZADO'
  | 'REPLANEJAR'
  | 'CANCELADO';

/**
 * Approval is kept separate from planejamento_status so the existing 0460 CHECK
 * does not need a risky table rebuild just to add AGUARDANDO_APROVACAO.
 */
export type SimulatorApprovalStatus =
  | 'RASCUNHO'
  | 'PENDENTE'
  | 'APROVADO'
  | 'DEVOLVIDO'
  | 'NAO_EXIGIDO';

export type SimulatorApprovalDecision = 'APROVAR' | 'DEVOLVER';

export type SimulatorApprovalActor = {
  user_id: number;
  employee_id?: number | null;
  role: string;
};

export type SimulatorApprovalRecord = {
  proposal_id: string | number;
  decision: SimulatorApprovalDecision;
  decided_at: string;
  actor: SimulatorApprovalActor;
  observations?: string | null;
  revalidation: RevalidationResult;
};

export type SimulatorApprovalOutcome = {
  ok: boolean;
  next_planning_status: SimulatorProposalStatus;
  next_approval_status: SimulatorApprovalStatus;
  record: SimulatorApprovalRecord;
  blockers: string[];
};

export function submitSimulatorProposalForApproval(params: {
  planning_status: SimulatorProposalStatus;
  approval_required: boolean;
}): { planning_status: SimulatorProposalStatus; approval_status: SimulatorApprovalStatus } {
  if (!params.approval_required) {
    return { planning_status: params.planning_status, approval_status: 'NAO_EXIGIDO' };
  }
  if (!['PROPOSTO', 'PLANEJADO', 'REPLANEJAR'].includes(params.planning_status)) {
    throw new Error(`INVALID_APPROVAL_SUBMISSION_STATE:${params.planning_status}`);
  }
  return {
    planning_status: params.planning_status === 'REPLANEJAR' ? 'PROPOSTO' : params.planning_status,
    approval_status: 'PENDENTE',
  };
}

/**
 * Aprovação nunca confia apenas no snapshot. O chamador deve executar a revalidação live
 * imediatamente antes desta função e fornecer o resultado.
 */
export function decideSimulatorProposal(params: {
  proposal_id: string | number;
  current_planning_status: SimulatorProposalStatus;
  current_approval_status: SimulatorApprovalStatus;
  decision: SimulatorApprovalDecision;
  actor: SimulatorApprovalActor;
  decided_at: string;
  observations?: string | null;
  revalidation: RevalidationResult;
}): SimulatorApprovalOutcome {
  if (params.current_approval_status !== 'PENDENTE') {
    throw new Error(`INVALID_APPROVAL_STATE:${params.current_approval_status}`);
  }

  const record: SimulatorApprovalRecord = {
    proposal_id: params.proposal_id,
    decision: params.decision,
    decided_at: params.decided_at,
    actor: params.actor,
    observations: params.observations || null,
    revalidation: params.revalidation,
  };

  if (params.decision === 'DEVOLVER') {
    return {
      ok: true,
      next_planning_status: 'REPLANEJAR',
      next_approval_status: 'DEVOLVIDO',
      record,
      blockers: [],
    };
  }

  const blockers = params.revalidation.issues
    .filter((issue) => issue.severity === 'BLOCK')
    .map((issue) => issue.code);

  if (!params.revalidation.ok || blockers.length > 0) {
    return {
      ok: false,
      next_planning_status: 'REPLANEJAR',
      next_approval_status: 'DEVOLVIDO',
      record,
      blockers,
    };
  }

  return {
    ok: true,
    next_planning_status: 'CONFIRMADO',
    next_approval_status: 'APROVADO',
    record,
    blockers: [],
  };
}

export function canMaterializeSimulatorSessions(params: {
  planning_status: SimulatorProposalStatus;
  approval_status: SimulatorApprovalStatus;
}): boolean {
  return (
    params.planning_status === 'CONFIRMADO' &&
    (params.approval_status === 'APROVADO' || params.approval_status === 'NAO_EXIGIDO')
  );
}

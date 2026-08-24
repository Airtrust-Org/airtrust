import type { RevalidationResult } from './cae-planning-revalidation';
import { resolveIndividualNextModel } from './cae-planning-participant-model-resolver';

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

import type { D1Database } from '@cloudflare/workers-types';
import {
  revalidateSimulatorPlanningProposal,
  type SimulatorPlanningLiveState,
  type SimulatorPlanningSourceSnapshot,
} from './cae-planning-revalidation';
import { resolveSimulatorPlanningConfig, type SimulatorPlanningConfigRow } from './cae-planning-policy';
import { resolvePublishedRosterDayFromD1 } from './cae-planning-roster-d1';
import { validateInstructorAssignment } from './cae-planning-resource-assignment';

async function writePlanningAudit(params: {
  db: D1Database;
  empresaId: number;
  planningId: number;
  action: string;
  status: string | null;
  before?: unknown;
  after?: unknown;
  userId: number | null;
}) {
  await params.db
    .prepare(
      `INSERT INTO simulador_planejamento_auditoria (
         empresa_id, treinamento_planejado_id, acao, planejamento_status,
         snapshot_antes_json, snapshot_depois_json, realizado_por, realizado_em
       ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    )
    .bind(
      params.empresaId,
      params.planningId,
      params.action,
      params.status,
      params.before == null ? null : JSON.stringify(params.before),
      params.after == null ? null : JSON.stringify(params.after),
      params.userId,
    )
    .run();
}

export async function resolveSimulatorPlanningLiveState(params: {
  db: D1Database;
  empresaId: number;
  snapshot: SimulatorPlanningSourceSnapshot;
}): Promise<SimulatorPlanningLiveState> {
  const { db, empresaId, snapshot } = params;
  const configRow = await db
    .prepare('SELECT * FROM empresas_config WHERE empresa_id = ?')
    .bind(empresaId)
    .first<SimulatorPlanningConfigRow>();
  const config = resolveSimulatorPlanningConfig(configRow || {});

  const liveParticipants = [];
  for (const participant of snapshot.participants) {
    const employee = await db
      .prepare(
        `SELECT id, status
           FROM funcionarios
          WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
      )
      .bind(participant.employee_id, empresaId)
      .first<{ id: number; status: string | null }>();

    let qualificationExpiry = participant.qualification_expiry_date;
    let qualificationHistoryId = participant.qualification_history_id;
    let cycleStartDate: string | null = null;
    if (participant.qualification_history_id) {
      const qualification = await db
        .prepare(
          `SELECT id, data_vencimento, data_conclusao
             FROM qualificacoes_historico
            WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
        )
        .bind(participant.qualification_history_id, empresaId)
        .first<{ id: number; data_vencimento: string | null; data_conclusao: string | null }>();
      if (qualification) {
        qualificationHistoryId = qualification.id;
        qualificationExpiry = qualification.data_vencimento;
        cycleStartDate = qualification.data_conclusao;
      }
    }

    // Recalcula a mesma resolução individual usada em /recalcular (nunca o
    // grupo inteiro de modelos) para que a revalidação compare o currículo
    // individual atual do tripulante contra o que foi aprovado, e não um
    // falso positivo por causa de outros modelos existirem na qualificação.
    let liveSessionModelIds = participant.session_model_ids;
    try {
      const sessionModels = await db
        .prepare(
          `SELECT id, ordem_no_treinamento
             FROM modelos_sessao
            WHERE empresa_id = ?
              AND qualificacao_tipo_id = ?
              AND deleted_at IS NULL
            ORDER BY COALESCE(ordem_no_treinamento, 9999), id`,
        )
        .bind(empresaId, participant.training_id)
        .all<{ id: number; ordem_no_treinamento: number | null }>();
      const liveModels = (sessionModels.results || [])
        .map((model) => ({ id: Number(model.id), ordem_no_treinamento: model.ordem_no_treinamento }))
        .filter((model) => Number.isInteger(model.id) && model.id > 0);
      const resolved = await resolveIndividualNextModel({
        db,
        empresaId,
        employeeId: participant.employee_id,
        cycleStartDate,
        models: liveModels,
      });
      if (resolved) {
        liveSessionModelIds = [resolved.modelId];
      }
    } catch {
      // Fail-closed rules still rely on the snapshot; this fallback avoids masking
      // tenant/schema drifts in lightweight test doubles.
      liveSessionModelIds = participant.session_model_ids;
    }

    const rosterByDate: SimulatorPlanningLiveState['participants'][number]['roster_by_date'] = {
      ...participant.roster_by_date,
    };
    for (const date of Object.keys(participant.roster_by_date)) {
      const roster = await resolvePublishedRosterDayFromD1({
        db,
        empresaId,
        employeeId: participant.employee_id,
        date,
      });
      rosterByDate[date] = roster.state;
    }

    liveParticipants.push({
      ...participant,
      employee_active: employee ? String(employee.status || '').toUpperCase() === 'ATIVO' : false,
      qualification_history_id: qualificationHistoryId,
      qualification_expiry_date: qualificationExpiry,
      session_model_ids: liveSessionModelIds,
      roster_by_date: rosterByDate,
    });
  }

  return {
    config,
    participants: liveParticipants,
    cae_slots: snapshot.cae_slots,
    canonical_session_fingerprint: snapshot.canonical_session_fingerprint,
    pairing_fingerprint: snapshot.pairing_fingerprint,
  };
}

export async function executeSimulatorPlanningApproval(params: {
  db: D1Database;
  empresaId: number;
  planningId: number;
  action: 'APPROVE' | 'RETURN' | 'SUBMIT';
  userId: number;
  userName: string;
  observations?: string | null;
}): Promise<{
  success: boolean;
  error?: string;
  blockers?: string[];
  issues?: unknown;
  planning_status?: string;
  approval_status?: string;
}> {
  const { db, empresaId, planningId, action } = params;

  const row = await db
    .prepare(
      `SELECT planejamento_status, planejamento_aprovacao_status, planejamento_snapshot_json
         FROM treinamentos_planejados
        WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
    )
    .bind(planningId, empresaId)
    .first<{
      planejamento_status: SimulatorProposalStatus;
      planejamento_aprovacao_status: SimulatorApprovalStatus | null;
      planejamento_snapshot_json: string | null;
    }>();

  if (!row) {
    return { success: false, error: 'Proposta não encontrada' };
  }

  const before = { ...row };

  if (action === 'SUBMIT') {
    const configRow = await db
      .prepare('SELECT * FROM empresas_config WHERE empresa_id = ?')
      .bind(empresaId)
      .first<SimulatorPlanningConfigRow>();
    const config = resolveSimulatorPlanningConfig(configRow || {});
    let submitted: { planning_status: SimulatorProposalStatus; approval_status: SimulatorApprovalStatus };
    try {
      submitted = submitSimulatorProposalForApproval({
        planning_status: row.planejamento_status,
        approval_required: config.approval_required,
      });
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Estado inválido para submissão',
      };
    }

    await db
      .prepare(
        `UPDATE treinamentos_planejados
            SET planejamento_status = ?,
                planejamento_aprovacao_status = ?,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
      )
      .bind(submitted.planning_status, submitted.approval_status, planningId, empresaId)
      .run();

    await writePlanningAudit({
      db,
      empresaId,
      planningId,
      action: 'SUBMETER',
      status: submitted.planning_status,
      before,
      after: { ...submitted, submitted_by: params.userId, submitted_at: new Date().toISOString() },
      userId: params.userId,
    });

    return {
      success: true,
      planning_status: submitted.planning_status,
      approval_status: submitted.approval_status,
    };
  }

  if (!row.planejamento_snapshot_json) {
    return { success: false, error: 'Snapshot da proposta ausente', blockers: ['SNAPSHOT_MISSING'] };
  }

  let snapshot: SimulatorPlanningSourceSnapshot & {
    simulator_id?: unknown;
    instructor_id?: unknown;
  };
  try {
    snapshot = JSON.parse(row.planejamento_snapshot_json);
  } catch {
    return { success: false, error: 'Snapshot da proposta inválido', blockers: ['SNAPSHOT_INVALID'] };
  }

  // Uma proposta APROVADA precisa ser, por definição, materializável: exige
  // simulador e instrutor/examinador já atribuídos (via POST /:id/recursos)
  // antes de permitir a aprovação. DEVOLVER nunca é bloqueado por isso —
  // devolver uma proposta incompleta é sempre válido.
  if (action === 'APPROVE') {
    const pending: string[] = [];
    if (!Number.isInteger(snapshot.simulator_id) || Number(snapshot.simulator_id) <= 0) {
      pending.push('simulator_id');
    }
    if (!Number.isInteger(snapshot.instructor_id) || Number(snapshot.instructor_id) <= 0) {
      pending.push('instructor_id');
    }
    if (pending.length > 0) {
      return {
        success: false,
        error: 'RESOURCE_ASSIGNMENT_INCOMPLETE',
        blockers: pending.map((resource) => `RESOURCE_ASSIGNMENT_INCOMPLETE:${resource}`),
      };
    }

    // Revalidação live dos recursos: o instrutor pode ter sido desativado ou
    // removido do tenant, e o simulador pode ter sido desativado, entre a
    // atribuição e a aprovação.
    const instructorEligibility = await validateInstructorAssignment(
      db,
      empresaId,
      Number(snapshot.instructor_id),
    );
    if (!instructorEligibility.eligible) {
      return {
        success: false,
        error: 'RESOURCE_ASSIGNMENT_STALE',
        blockers: [`INSTRUCTOR_NO_LONGER_ELIGIBLE:${instructorEligibility.reason}`],
      };
    }
    const simulatorRow = await db
      .prepare("SELECT status FROM simuladores WHERE id = ? AND deleted_at IS NULL")
      .bind(Number(snapshot.simulator_id))
      .first<{ status: string | null }>();
    if (!simulatorRow || String(simulatorRow.status || '').toUpperCase() !== 'ATIVO') {
      return {
        success: false,
        error: 'RESOURCE_ASSIGNMENT_STALE',
        blockers: ['SIMULATOR_NO_LONGER_ACTIVE'],
      };
    }
  }

  const liveState = await resolveSimulatorPlanningLiveState({ db, empresaId, snapshot });
  const revalidation = revalidateSimulatorPlanningProposal(snapshot, liveState);
  let decision: SimulatorApprovalOutcome;
  try {
    decision = decideSimulatorProposal({
      proposal_id: planningId,
      current_planning_status: row.planejamento_status,
      current_approval_status: row.planejamento_aprovacao_status || 'RASCUNHO',
      decision: action === 'APPROVE' ? 'APROVAR' : 'DEVOLVER',
      actor: { user_id: params.userId, role: 'manager' },
      decided_at: new Date().toISOString(),
      observations: params.observations,
      revalidation,
    });
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Estado inválido para aprovação/devolução',
    };
  }

  const observations =
    params.observations ||
    (decision.blockers.length > 0 ? `Bloqueado por: ${decision.blockers.join(', ')}` : null);

  await db
    .prepare(
      `UPDATE treinamentos_planejados
          SET planejamento_status = ?,
              planejamento_aprovacao_status = ?,
              planejamento_aprovacao_observacoes = ?,
              planejamento_aprovado_por = ?,
              planejamento_aprovado_em = CURRENT_TIMESTAMP,
              planejamento_revalidado_em = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
    )
    .bind(
      decision.next_planning_status,
      decision.next_approval_status,
      observations,
      params.userId,
      planningId,
      empresaId,
    )
    .run();

  await writePlanningAudit({
    db,
    empresaId,
    planningId,
    action: action === 'APPROVE' ? 'APROVAR' : 'DEVOLVER',
    status: decision.next_planning_status,
    before,
    after: {
      decision,
      snapshot_analyzed: snapshot,
      live_state: liveState,
      actor: { user_id: params.userId, user_name: params.userName },
    },
    userId: params.userId,
  });

  if (!decision.ok) {
    return {
      success: false,
      error: 'Revalidação live impediu a aprovação. A proposta foi devolvida para replanejamento.',
      blockers: decision.blockers,
      issues: revalidation.issues,
      planning_status: decision.next_planning_status,
      approval_status: decision.next_approval_status,
    };
  }

  return {
    success: true,
    planning_status: decision.next_planning_status,
    approval_status: decision.next_approval_status,
  };
}

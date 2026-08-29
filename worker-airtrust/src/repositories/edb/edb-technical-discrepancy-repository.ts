import { canonicalJson } from '../../services/edb/canonicalization';
import type { EdbPersonIdentity } from '../../services/edb/contracts';
import {
  appendCorrectiveAction,
  appendDeferredActionAuthorization,
  appendReturnToServiceApproval,
  createTechnicalDiscrepancyCase,
  type EdbCorrectiveAction,
  type EdbDeferredActionAuthorization,
  type EdbReturnToServiceApproval,
  type EdbTechnicalDiscrepancyCase,
} from '../../services/edb/technical-discrepancy-workflow';

export interface EdbStoredDiscrepancyRow {
  id: string;
  empresa_id: number;
  revision_id: string;
  descricao: string;
  detectado_por_funcionario_id: number | null;
  detectado_por_nome: string;
  detectado_por_codigo_anac: string | null;
  detectado_em: string;
  created_at: string;
}

export interface EdbStoredMaintenanceActionRow {
  id: string;
  empresa_id: number;
  discrepancia_id: string;
  tipo: 'CORRECTIVE_ACTION' | 'DEFERRED_ACTION_AUTHORIZATION' | 'RTS_APPROVAL';
  referencia_acao_id: string | null;
  descricao: string;
  executado_por_funcionario_id: number | null;
  executado_por_nome: string;
  executado_em: string;
  evidencia_json: string | null;
  created_at: string;
}

interface StoredMaintenanceEvidence {
  reference: string | null;
  limitationOrControl?: string | null;
  actorAnacCode: string | null;
}

function requireText(value: string, code: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(code);
  return normalized;
}

function parseTimestamp(value: string, code: string): string {
  const normalized = requireText(value, code);
  if (!Number.isFinite(Date.parse(normalized))) throw new Error(code);
  return normalized;
}

function parseEvidence(value: string | null): StoredMaintenanceEvidence {
  if (value === null) return { reference: null, actorAnacCode: null };
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('EDB_MAINTENANCE_EVIDENCE_INVALID_JSON');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('EDB_MAINTENANCE_EVIDENCE_INVALID');
  }
  const candidate = parsed as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(candidate, 'reference')) {
    throw new Error('EDB_MAINTENANCE_EVIDENCE_REFERENCE_MISSING');
  }
  if (!Object.prototype.hasOwnProperty.call(candidate, 'actorAnacCode')) {
    throw new Error('EDB_MAINTENANCE_EVIDENCE_ANAC_CODE_MISSING');
  }
  if (candidate.reference !== null && typeof candidate.reference !== 'string') {
    throw new Error('EDB_MAINTENANCE_EVIDENCE_REFERENCE_INVALID');
  }
  if (candidate.actorAnacCode !== null && typeof candidate.actorAnacCode !== 'string') {
    throw new Error('EDB_MAINTENANCE_EVIDENCE_ANAC_CODE_INVALID');
  }
  if (
    candidate.limitationOrControl !== undefined &&
    candidate.limitationOrControl !== null &&
    typeof candidate.limitationOrControl !== 'string'
  ) {
    throw new Error('EDB_MAINTENANCE_EVIDENCE_LIMITATION_INVALID');
  }
  return {
    reference: candidate.reference as string | null,
    actorAnacCode: candidate.actorAnacCode as string | null,
    limitationOrControl: candidate.limitationOrControl as string | null | undefined,
  };
}

function personFromRow(row: EdbStoredMaintenanceActionRow): EdbPersonIdentity {
  const evidence = parseEvidence(row.evidencia_json);
  return {
    employeeId: row.executado_por_funcionario_id,
    fullName: requireText(row.executado_por_nome, 'EDB_MAINTENANCE_ACTOR_NAME_INVALID'),
    anacCode: evidence.actorAnacCode,
  };
}

function evidenceForPerson(
  person: EdbPersonIdentity,
  reference: string | null,
  limitationOrControl?: string | null,
): StoredMaintenanceEvidence {
  return {
    reference,
    actorAnacCode: person.anacCode,
    ...(limitationOrControl === undefined ? {} : { limitationOrControl }),
  };
}

export function hydrateEdbTechnicalDiscrepancyCase(params: {
  empresaId: number;
  discrepancy: EdbStoredDiscrepancyRow;
  actions: readonly EdbStoredMaintenanceActionRow[];
}): EdbTechnicalDiscrepancyCase {
  const { discrepancy: row } = params;
  if (row.empresa_id !== params.empresaId) throw new Error('EDB_DISCREPANCY_SCOPE_MISMATCH');

  let discrepancy = createTechnicalDiscrepancyCase({
    discrepancyId: row.id,
    revisionId: row.revision_id,
    description: row.descricao,
    detectedBy: {
      employeeId: row.detectado_por_funcionario_id,
      fullName: row.detectado_por_nome,
      anacCode: row.detectado_por_codigo_anac,
    },
    detectedAt: parseTimestamp(row.detectado_em, 'EDB_DISCREPANCY_TIMESTAMP_INVALID'),
    createdAt: parseTimestamp(row.created_at, 'EDB_DISCREPANCY_CREATED_AT_INVALID'),
  });

  for (const actionRow of params.actions) {
    if (
      actionRow.empresa_id !== params.empresaId ||
      actionRow.discrepancia_id !== discrepancy.identity.discrepancyId
    ) {
      throw new Error('EDB_MAINTENANCE_ACTION_SCOPE_MISMATCH');
    }
    requireText(actionRow.id, 'EDB_MAINTENANCE_ACTION_ID_INVALID');
    const evidence = parseEvidence(actionRow.evidencia_json);
    const actor = personFromRow(actionRow);
    const executedAt = parseTimestamp(
      actionRow.executado_em,
      'EDB_MAINTENANCE_ACTION_TIMESTAMP_INVALID',
    );

    if (actionRow.tipo === 'CORRECTIVE_ACTION') {
      discrepancy = appendCorrectiveAction(discrepancy, {
        actionId: actionRow.id,
        description: actionRow.descricao,
        performedBy: actor,
        performedAt: executedAt,
        reference: evidence.reference,
      });
      continue;
    }

    if (actionRow.tipo === 'DEFERRED_ACTION_AUTHORIZATION') {
      discrepancy = appendDeferredActionAuthorization(discrepancy, {
        actionId: actionRow.id,
        reason: actionRow.descricao,
        limitationOrControl: evidence.limitationOrControl ?? null,
        authorizedBy: actor,
        authorizedAt: executedAt,
        reference: evidence.reference,
      });
      continue;
    }

    if (!actionRow.referencia_acao_id?.trim()) {
      throw new Error('EDB_RTS_CORRECTIVE_ACTION_REFERENCE_INVALID');
    }
    discrepancy = appendReturnToServiceApproval(discrepancy, {
      approvalId: actionRow.id,
      correctiveActionId: actionRow.referencia_acao_id,
      description: actionRow.descricao,
      approvedBy: actor,
      approvedAt: executedAt,
      reference: evidence.reference,
    });
  }

  return discrepancy;
}

async function assertRevisionScope(params: {
  db: D1Database;
  empresaId: number;
  revisionId: string;
}): Promise<void> {
  const row = await params.db
    .prepare('SELECT id FROM edb_registro_revisoes WHERE empresa_id = ? AND id = ? LIMIT 1')
    .bind(params.empresaId, params.revisionId)
    .first<{ id: string }>();
  if (!row || row.id !== params.revisionId) {
    throw new Error('EDB_DISCREPANCY_REVISION_NOT_FOUND_OR_SCOPE_MISMATCH');
  }
}

export async function createEdbTechnicalDiscrepancy(params: {
  db: D1Database;
  empresaId: number;
  discrepancyId: string;
  revisionId: string;
  description: string;
  detectedBy: EdbPersonIdentity;
  detectedAt: string;
  createdAt: string;
}): Promise<EdbTechnicalDiscrepancyCase> {
  const discrepancy = createTechnicalDiscrepancyCase({
    discrepancyId: params.discrepancyId,
    revisionId: params.revisionId,
    description: params.description,
    detectedBy: params.detectedBy,
    detectedAt: params.detectedAt,
    createdAt: params.createdAt,
  });
  await assertRevisionScope({
    db: params.db,
    empresaId: params.empresaId,
    revisionId: discrepancy.identity.revisionId,
  });

  await params.db
    .prepare(
      `
      INSERT INTO edb_discrepancias_tecnicas (
        id, empresa_id, revision_id, descricao,
        detectado_por_funcionario_id, detectado_por_nome, detectado_por_codigo_anac,
        detectado_em, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    )
    .bind(
      discrepancy.identity.discrepancyId,
      params.empresaId,
      discrepancy.identity.revisionId,
      discrepancy.identity.description,
      discrepancy.identity.detectedBy.employeeId,
      discrepancy.identity.detectedBy.fullName,
      discrepancy.identity.detectedBy.anacCode,
      discrepancy.identity.detectedAt,
      discrepancy.identity.createdAt,
    )
    .run();

  return discrepancy;
}

export async function loadEdbTechnicalDiscrepancyCase(params: {
  db: D1Database;
  empresaId: number;
  discrepancyId: string;
}): Promise<EdbTechnicalDiscrepancyCase | null> {
  const discrepancyId = requireText(params.discrepancyId, 'EDB_DISCREPANCY_ID_REQUIRED');
  const row = await params.db
    .prepare(
      `
      SELECT id, empresa_id, revision_id, descricao,
             detectado_por_funcionario_id, detectado_por_nome, detectado_por_codigo_anac,
             detectado_em, created_at
      FROM edb_discrepancias_tecnicas
      WHERE empresa_id = ? AND id = ?
      LIMIT 1
    `,
    )
    .bind(params.empresaId, discrepancyId)
    .first<EdbStoredDiscrepancyRow>();
  if (!row) return null;
  if (row.id !== discrepancyId) throw new Error('EDB_DISCREPANCY_SCOPE_MISMATCH');

  const actions = await params.db
    .prepare(
      `
      SELECT id, empresa_id, discrepancia_id, tipo, referencia_acao_id, descricao,
             executado_por_funcionario_id, executado_por_nome, executado_em,
             evidencia_json, created_at
      FROM edb_acoes_manutencao
      WHERE empresa_id = ? AND discrepancia_id = ?
      ORDER BY datetime(executado_em) ASC, datetime(created_at) ASC, rowid ASC
    `,
    )
    .bind(params.empresaId, discrepancyId)
    .all<EdbStoredMaintenanceActionRow>();

  return hydrateEdbTechnicalDiscrepancyCase({
    empresaId: params.empresaId,
    discrepancy: row,
    actions: actions.results ?? [],
  });
}

async function requireDiscrepancy(params: {
  db: D1Database;
  empresaId: number;
  discrepancyId: string;
}): Promise<EdbTechnicalDiscrepancyCase> {
  const discrepancy = await loadEdbTechnicalDiscrepancyCase(params);
  if (!discrepancy) throw new Error('EDB_DISCREPANCY_NOT_FOUND_OR_SCOPE_MISMATCH');
  return discrepancy;
}

export async function appendEdbCorrectiveAction(params: {
  db: D1Database;
  empresaId: number;
  discrepancyId: string;
  action: Omit<EdbCorrectiveAction, 'kind'>;
}): Promise<EdbTechnicalDiscrepancyCase> {
  const current = await requireDiscrepancy(params);
  const next = appendCorrectiveAction(current, params.action);
  const action = next.maintenanceActions.at(-1);
  if (!action || action.kind !== 'CORRECTIVE_ACTION') {
    throw new Error('EDB_CORRECTIVE_ACTION_NORMALIZATION_FAILED');
  }

  await params.db
    .prepare(
      `
      INSERT INTO edb_acoes_manutencao (
        id, empresa_id, discrepancia_id, tipo, referencia_acao_id, descricao,
        executado_por_funcionario_id, executado_por_nome, executado_em,
        evidencia_json, created_at
      ) VALUES (?, ?, ?, 'CORRECTIVE_ACTION', NULL, ?, ?, ?, ?, ?, datetime('now'))
    `,
    )
    .bind(
      action.actionId,
      params.empresaId,
      current.identity.discrepancyId,
      action.description,
      action.performedBy.employeeId,
      action.performedBy.fullName,
      action.performedAt,
      canonicalJson(evidenceForPerson(action.performedBy, action.reference)),
    )
    .run();
  return next;
}

export async function appendEdbDeferredActionAuthorization(params: {
  db: D1Database;
  empresaId: number;
  discrepancyId: string;
  action: Omit<EdbDeferredActionAuthorization, 'kind'>;
}): Promise<EdbTechnicalDiscrepancyCase> {
  const current = await requireDiscrepancy(params);
  const next = appendDeferredActionAuthorization(current, params.action);
  const action = next.maintenanceActions.at(-1);
  if (!action || action.kind !== 'DEFERRED_ACTION_AUTHORIZATION') {
    throw new Error('EDB_DEFERRED_ACTION_NORMALIZATION_FAILED');
  }

  await params.db
    .prepare(
      `
      INSERT INTO edb_acoes_manutencao (
        id, empresa_id, discrepancia_id, tipo, referencia_acao_id, descricao,
        executado_por_funcionario_id, executado_por_nome, executado_em,
        evidencia_json, created_at
      ) VALUES (?, ?, ?, 'DEFERRED_ACTION_AUTHORIZATION', NULL, ?, ?, ?, ?, ?, datetime('now'))
    `,
    )
    .bind(
      action.actionId,
      params.empresaId,
      current.identity.discrepancyId,
      action.reason,
      action.authorizedBy.employeeId,
      action.authorizedBy.fullName,
      action.authorizedAt,
      canonicalJson(
        evidenceForPerson(action.authorizedBy, action.reference, action.limitationOrControl),
      ),
    )
    .run();
  return next;
}

export async function appendEdbReturnToServiceApproval(params: {
  db: D1Database;
  empresaId: number;
  discrepancyId: string;
  approval: EdbReturnToServiceApproval;
}): Promise<EdbTechnicalDiscrepancyCase> {
  const current = await requireDiscrepancy(params);
  const next = appendReturnToServiceApproval(current, params.approval);
  const approval = next.returnToServiceApprovals.at(-1);
  if (!approval) throw new Error('EDB_RTS_APPROVAL_NORMALIZATION_FAILED');

  await params.db
    .prepare(
      `
      INSERT INTO edb_acoes_manutencao (
        id, empresa_id, discrepancia_id, tipo, referencia_acao_id, descricao,
        executado_por_funcionario_id, executado_por_nome, executado_em,
        evidencia_json, created_at
      ) VALUES (?, ?, ?, 'RTS_APPROVAL', ?, ?, ?, ?, ?, ?, datetime('now'))
    `,
    )
    .bind(
      approval.approvalId,
      params.empresaId,
      current.identity.discrepancyId,
      approval.correctiveActionId,
      approval.description,
      approval.approvedBy.employeeId,
      approval.approvedBy.fullName,
      approval.approvedAt,
      canonicalJson(evidenceForPerson(approval.approvedBy, approval.reference)),
    )
    .run();
  return next;
}

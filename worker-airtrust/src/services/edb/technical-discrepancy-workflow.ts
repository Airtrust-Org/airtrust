import type { EdbPersonIdentity } from './contracts';

export type EdbDiscrepancyStatus =
  | 'OPEN'
  | 'DEFERRED_ACTION_AUTHORIZED'
  | 'CORRECTIVE_ACTION_RECORDED'
  | 'RETURN_TO_SERVICE_RECORDED';

export interface EdbDiscrepancyIdentity {
  discrepancyId: string;
  revisionId: string;
  sourceStageId: number | null;
  description: string;
  detectedBy: EdbPersonIdentity;
  detectedAt: string;
  createdAt: string;
}

export interface EdbCorrectiveAction {
  kind: 'CORRECTIVE_ACTION';
  actionId: string;
  description: string;
  performedBy: EdbPersonIdentity;
  performedAt: string;
  reference: string | null;
}

export interface EdbDeferredActionAuthorization {
  kind: 'DEFERRED_ACTION_AUTHORIZATION';
  actionId: string;
  reason: string;
  limitationOrControl: string | null;
  authorizedBy: EdbPersonIdentity;
  authorizedAt: string;
  reference: string | null;
}

export type EdbDiscrepancyMaintenanceAction =
  | EdbCorrectiveAction
  | EdbDeferredActionAuthorization;

export interface EdbReturnToServiceApproval {
  approvalId: string;
  correctiveActionId: string;
  description: string;
  approvedBy: EdbPersonIdentity;
  approvedAt: string;
  reference: string | null;
}

/**
 * Append-only domain representation for Res. 773/2025 art. 8.
 *
 * Flight discrepancies belong to one immutable final-record revision.
 * Maintenance actions are appended afterwards; they never rewrite the
 * discrepancy as if it had not existed on the signed revision.
 */
export interface EdbTechnicalDiscrepancyCase {
  identity: EdbDiscrepancyIdentity;
  maintenanceActions: EdbDiscrepancyMaintenanceAction[];
  returnToServiceApprovals: EdbReturnToServiceApproval[];
}

function required(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} is required`);
  return normalized;
}

function assertPerson(person: EdbPersonIdentity, field: string) {
  required(person.fullName, `${field}.fullName`);
}

function assertIsoTimestamp(value: string, field: string): string {
  const normalized = required(value, field);
  if (!Number.isFinite(Date.parse(normalized))) throw new Error(`${field} must be a valid timestamp`);
  return normalized;
}

function assertNotBeforeDetection(
  discrepancy: EdbTechnicalDiscrepancyCase,
  timestamp: string,
  field: string,
): void {
  if (Date.parse(timestamp) < Date.parse(discrepancy.identity.detectedAt)) {
    throw new Error(`${field} cannot predate discrepancy detection`);
  }
}

export function createTechnicalDiscrepancyCase(params: {
  discrepancyId: string;
  revisionId: string;
  sourceStageId?: number | null;
  description: string;
  detectedBy: EdbPersonIdentity;
  detectedAt: string;
  createdAt: string;
}): EdbTechnicalDiscrepancyCase {
  assertPerson(params.detectedBy, 'detectedBy');
  const detectedAt = assertIsoTimestamp(params.detectedAt, 'detectedAt');
  const createdAt = assertIsoTimestamp(params.createdAt, 'createdAt');
  if (Date.parse(createdAt) < Date.parse(detectedAt)) {
    throw new Error('createdAt cannot predate detectedAt');
  }
  return {
    identity: {
      discrepancyId: required(params.discrepancyId, 'discrepancyId'),
      revisionId: required(params.revisionId, 'revisionId'),
      sourceStageId: params.sourceStageId ?? null,
      description: required(params.description, 'description'),
      detectedBy: { ...params.detectedBy },
      detectedAt,
      createdAt,
    },
    maintenanceActions: [],
    returnToServiceApprovals: [],
  };
}

export function appendCorrectiveAction(
  discrepancy: EdbTechnicalDiscrepancyCase,
  action: Omit<EdbCorrectiveAction, 'kind'>,
): EdbTechnicalDiscrepancyCase {
  assertPerson(action.performedBy, 'performedBy');
  const performedAt = assertIsoTimestamp(action.performedAt, 'performedAt');
  assertNotBeforeDetection(discrepancy, performedAt, 'performedAt');
  const normalized: EdbCorrectiveAction = {
    kind: 'CORRECTIVE_ACTION',
    actionId: required(action.actionId, 'actionId'),
    description: required(action.description, 'description'),
    performedBy: { ...action.performedBy },
    performedAt,
    reference: action.reference?.trim() || null,
  };

  if (discrepancy.maintenanceActions.some((item) => item.actionId === normalized.actionId)) {
    throw new Error('Duplicate maintenance actionId');
  }

  return {
    ...discrepancy,
    identity: { ...discrepancy.identity, detectedBy: { ...discrepancy.identity.detectedBy } },
    maintenanceActions: [...discrepancy.maintenanceActions, normalized],
    returnToServiceApprovals: [...discrepancy.returnToServiceApprovals],
  };
}

export function appendDeferredActionAuthorization(
  discrepancy: EdbTechnicalDiscrepancyCase,
  action: Omit<EdbDeferredActionAuthorization, 'kind'>,
): EdbTechnicalDiscrepancyCase {
  assertPerson(action.authorizedBy, 'authorizedBy');
  const authorizedAt = assertIsoTimestamp(action.authorizedAt, 'authorizedAt');
  assertNotBeforeDetection(discrepancy, authorizedAt, 'authorizedAt');
  const normalized: EdbDeferredActionAuthorization = {
    kind: 'DEFERRED_ACTION_AUTHORIZATION',
    actionId: required(action.actionId, 'actionId'),
    reason: required(action.reason, 'reason'),
    limitationOrControl: action.limitationOrControl?.trim() || null,
    authorizedBy: { ...action.authorizedBy },
    authorizedAt,
    reference: action.reference?.trim() || null,
  };

  if (discrepancy.maintenanceActions.some((item) => item.actionId === normalized.actionId)) {
    throw new Error('Duplicate maintenance actionId');
  }

  return {
    ...discrepancy,
    identity: { ...discrepancy.identity, detectedBy: { ...discrepancy.identity.detectedBy } },
    maintenanceActions: [...discrepancy.maintenanceActions, normalized],
    returnToServiceApprovals: [...discrepancy.returnToServiceApprovals],
  };
}

export function appendReturnToServiceApproval(
  discrepancy: EdbTechnicalDiscrepancyCase,
  approval: EdbReturnToServiceApproval,
): EdbTechnicalDiscrepancyCase {
  const correctiveAction = discrepancy.maintenanceActions.find(
    (item): item is EdbCorrectiveAction =>
      item.kind === 'CORRECTIVE_ACTION' && item.actionId === approval.correctiveActionId,
  );
  if (!correctiveAction) throw new Error('Return-to-service approval must reference an existing corrective action');
  if (discrepancy.returnToServiceApprovals.some((item) => item.approvalId === approval.approvalId)) {
    throw new Error('Duplicate return-to-service approvalId');
  }
  if (discrepancy.returnToServiceApprovals.some((item) => item.correctiveActionId === approval.correctiveActionId)) {
    throw new Error('Corrective action already has a return-to-service approval');
  }

  assertPerson(approval.approvedBy, 'approvedBy');
  const approvedAt = assertIsoTimestamp(approval.approvedAt, 'approvedAt');
  if (Date.parse(approvedAt) < Date.parse(correctiveAction.performedAt)) {
    throw new Error('Return-to-service approval cannot predate the corrective action');
  }

  const normalized: EdbReturnToServiceApproval = {
    approvalId: required(approval.approvalId, 'approvalId'),
    correctiveActionId: required(approval.correctiveActionId, 'correctiveActionId'),
    description: required(approval.description, 'description'),
    approvedBy: { ...approval.approvedBy },
    approvedAt,
    reference: approval.reference?.trim() || null,
  };

  return {
    ...discrepancy,
    identity: { ...discrepancy.identity, detectedBy: { ...discrepancy.identity.detectedBy } },
    maintenanceActions: [...discrepancy.maintenanceActions],
    returnToServiceApprovals: [...discrepancy.returnToServiceApprovals, normalized],
  };
}

export function getTechnicalDiscrepancyStatus(
  discrepancy: EdbTechnicalDiscrepancyCase,
): EdbDiscrepancyStatus {
  const latest = discrepancy.maintenanceActions.at(-1);
  if (!latest) return 'OPEN';

  if (latest.kind === 'DEFERRED_ACTION_AUTHORIZATION') {
    return 'DEFERRED_ACTION_AUTHORIZED';
  }

  const hasRts = discrepancy.returnToServiceApprovals.some(
    (approval) => approval.correctiveActionId === latest.actionId,
  );
  return hasRts ? 'RETURN_TO_SERVICE_RECORDED' : 'CORRECTIVE_ACTION_RECORDED';
}

export function isTechnicalDiscrepancyClosedForReturnToService(
  discrepancy: EdbTechnicalDiscrepancyCase,
): boolean {
  return getTechnicalDiscrepancyStatus(discrepancy) === 'RETURN_TO_SERVICE_RECORDED';
}

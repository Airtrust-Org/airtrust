export type EdbRegulatedLifecycleStatus =
  | 'DRAFT'
  | 'READY_FOR_PIC_SIGNATURE'
  | 'PIC_SIGNED'
  | 'OPERATOR_SIGNED'
  | 'SUPERSEDED'
  | 'CANCELLED';

export type EdbRegulatedSignatureIntent =
  | 'PIC_TECHNICAL_ACK'
  | 'PIC_FLIGHT_RECORD'
  | 'OPERATOR_RECORD';

export type EdbRegulatedSignatureTarget =
  | 'TECHNICAL_SITUATION'
  | 'FINAL_RECORD_REVISION';

export interface EdbRegulatedSignatureProof {
  signatureId: string;
  intent: EdbRegulatedSignatureIntent;
  targetType: EdbRegulatedSignatureTarget;
  targetId: string;
  signerRef: string;
  signedAt: string;
  boundContentHashSha256: string;
}

export interface EdbRegulatedRevision {
  logicalRecordId: string;
  revisionId: string;
  revisionNumber: number;
  status: EdbRegulatedLifecycleStatus;
  technicalSituationId: string;
  technicalSituationHashSha256: string;
  contentHashSha256: string;
  capturedAt: string;
  signatures: {
    picTechnicalAcknowledgement: EdbRegulatedSignatureProof | null;
    picFlightRecord: EdbRegulatedSignatureProof | null;
    operatorRecord: EdbRegulatedSignatureProof | null;
  };
  correction: {
    supersedesRevisionId: string | null;
    correctionReason: string | null;
  };
}

export type EdbRegulatedLifecycleAction =
  | 'MARK_READY_FOR_PIC_SIGNATURE'
  | 'CONFIRM_PIC_SIGNED'
  | 'CONFIRM_OPERATOR_SIGNED'
  | 'SUPERSEDE'
  | 'CANCEL';

export interface EdbRegulatedLifecycleContext {
  replacementRevisionId?: string | null;
  correctionReason?: string | null;
}

export interface EdbRegulatedLifecycleDecision {
  allowed: boolean;
  from: EdbRegulatedLifecycleStatus;
  to: EdbRegulatedLifecycleStatus | null;
  reasons: string[];
}

const SIGNED_OR_LATER = new Set<EdbRegulatedLifecycleStatus>([
  'PIC_SIGNED',
  'OPERATOR_SIGNED',
  'SUPERSEDED',
]);

const SHA256 = /^[0-9a-f]{64}$/i;

function required(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} is required`);
  return normalized;
}

function validSha256(value: string, field: string): string {
  const normalized = required(value, field).toLowerCase();
  if (!SHA256.test(normalized)) throw new Error(`${field} must be a SHA-256 hex digest`);
  return normalized;
}

function decision(
  revision: EdbRegulatedRevision,
  allowed: boolean,
  to: EdbRegulatedLifecycleStatus | null,
  reasons: string[],
): EdbRegulatedLifecycleDecision {
  return { allowed, from: revision.status, to, reasons };
}

function invalidState(
  revision: EdbRegulatedRevision,
  expected: EdbRegulatedLifecycleStatus,
): EdbRegulatedLifecycleDecision {
  return decision(revision, false, null, [`EDB_INVALID_STATE_EXPECTED_${expected}`]);
}

function signatureMatches(
  signature: EdbRegulatedSignatureProof | null,
  expected: {
    intent: EdbRegulatedSignatureIntent;
    targetType: EdbRegulatedSignatureTarget;
    targetId: string;
    contentHashSha256: string;
  },
): boolean {
  if (!signature) return false;
  return (
    signature.intent === expected.intent &&
    signature.targetType === expected.targetType &&
    signature.targetId === expected.targetId &&
    signature.boundContentHashSha256.toLowerCase() === expected.contentHashSha256.toLowerCase()
  );
}

/**
 * Pure lifecycle policy for regulated eDB evidence.
 *
 * No persistence, routes or external ANAC semantics live here. Once the final
 * record is PIC-signed, its content is immutable. Corrections create a new
 * revision and preserve the superseded revision as historical evidence.
 */
export function isEdbRegulatedContentLocked(revision: EdbRegulatedRevision): boolean {
  return revision.signatures.picFlightRecord !== null || SIGNED_OR_LATER.has(revision.status);
}

export function canEditEdbRegulatedContent(revision: EdbRegulatedRevision): boolean {
  return !isEdbRegulatedContentLocked(revision) && revision.status !== 'CANCELLED';
}

export function evaluateEdbRegulatedLifecycleAction(
  revision: EdbRegulatedRevision,
  action: EdbRegulatedLifecycleAction,
  context: EdbRegulatedLifecycleContext = {},
): EdbRegulatedLifecycleDecision {
  if (revision.status === 'SUPERSEDED' || revision.status === 'CANCELLED') {
    return decision(revision, false, null, ['EDB_TERMINAL_STATE']);
  }

  if (action === 'MARK_READY_FOR_PIC_SIGNATURE') {
    if (revision.status !== 'DRAFT') return invalidState(revision, 'DRAFT');

    const technicalAckMatches = signatureMatches(revision.signatures.picTechnicalAcknowledgement, {
      intent: 'PIC_TECHNICAL_ACK',
      targetType: 'TECHNICAL_SITUATION',
      targetId: revision.technicalSituationId,
      contentHashSha256: revision.technicalSituationHashSha256,
    });

    if (!technicalAckMatches) {
      return decision(revision, false, null, ['EDB_VALID_PIC_TECHNICAL_ACK_REQUIRED']);
    }

    return decision(revision, true, 'READY_FOR_PIC_SIGNATURE', []);
  }

  if (action === 'CONFIRM_PIC_SIGNED') {
    if (revision.status !== 'READY_FOR_PIC_SIGNATURE') {
      return invalidState(revision, 'READY_FOR_PIC_SIGNATURE');
    }

    const picSignatureMatches = signatureMatches(revision.signatures.picFlightRecord, {
      intent: 'PIC_FLIGHT_RECORD',
      targetType: 'FINAL_RECORD_REVISION',
      targetId: revision.revisionId,
      contentHashSha256: revision.contentHashSha256,
    });

    if (!picSignatureMatches) {
      return decision(revision, false, null, ['EDB_PIC_FLIGHT_SIGNATURE_BINDING_INVALID']);
    }

    return decision(revision, true, 'PIC_SIGNED', []);
  }

  if (action === 'CONFIRM_OPERATOR_SIGNED') {
    if (revision.status !== 'PIC_SIGNED') return invalidState(revision, 'PIC_SIGNED');

    const operatorSignatureMatches = signatureMatches(revision.signatures.operatorRecord, {
      intent: 'OPERATOR_RECORD',
      targetType: 'FINAL_RECORD_REVISION',
      targetId: revision.revisionId,
      contentHashSha256: revision.contentHashSha256,
    });

    if (!operatorSignatureMatches) {
      return decision(revision, false, null, ['EDB_OPERATOR_SIGNATURE_BINDING_INVALID']);
    }

    return decision(revision, true, 'OPERATOR_SIGNED', []);
  }

  if (action === 'SUPERSEDE') {
    if (!SIGNED_OR_LATER.has(revision.status)) {
      return decision(revision, false, null, ['EDB_ONLY_SIGNED_RECORD_CAN_BE_SUPERSEDED']);
    }

    const reasons: string[] = [];
    if (!context.replacementRevisionId?.trim()) {
      reasons.push('EDB_REPLACEMENT_REVISION_ID_REQUIRED');
    }
    if (!context.correctionReason?.trim()) {
      reasons.push('EDB_CORRECTION_REASON_REQUIRED');
    }
    if (context.replacementRevisionId?.trim() === revision.revisionId) {
      reasons.push('EDB_REPLACEMENT_REVISION_ID_MUST_DIFFER');
    }

    return decision(
      revision,
      reasons.length === 0,
      reasons.length === 0 ? 'SUPERSEDED' : null,
      reasons,
    );
  }

  if (action === 'CANCEL') {
    if (isEdbRegulatedContentLocked(revision)) {
      return decision(revision, false, null, ['EDB_SIGNED_RECORD_CANNOT_BE_CANCELLED']);
    }
    return decision(revision, true, 'CANCELLED', []);
  }

  const exhaustive: never = action;
  throw new Error(`Unsupported eDB regulated lifecycle action: ${exhaustive}`);
}

export function createEdbCorrectionRevision(params: {
  original: EdbRegulatedRevision;
  newRevisionId: string;
  newContentHashSha256: string;
  correctionReason: string;
  capturedAt: string;
  preserveTechnicalAcknowledgement?: boolean;
}): EdbRegulatedRevision {
  const {
    original,
    newRevisionId,
    newContentHashSha256,
    correctionReason,
    capturedAt,
    preserveTechnicalAcknowledgement = true,
  } = params;

  if (!isEdbRegulatedContentLocked(original)) {
    throw new Error('Correction revision is only required for signed/locked evidence');
  }

  const normalizedRevisionId = required(newRevisionId, 'newRevisionId');
  if (normalizedRevisionId === original.revisionId) {
    throw new Error('newRevisionId must differ from the superseded revision');
  }

  return {
    logicalRecordId: required(original.logicalRecordId, 'original.logicalRecordId'),
    revisionId: normalizedRevisionId,
    revisionNumber: original.revisionNumber + 1,
    status: 'DRAFT',
    technicalSituationId: required(original.technicalSituationId, 'original.technicalSituationId'),
    technicalSituationHashSha256: validSha256(
      original.technicalSituationHashSha256,
      'original.technicalSituationHashSha256',
    ),
    contentHashSha256: validSha256(newContentHashSha256, 'newContentHashSha256'),
    capturedAt: required(capturedAt, 'capturedAt'),
    signatures: {
      picTechnicalAcknowledgement: preserveTechnicalAcknowledgement
        ? original.signatures.picTechnicalAcknowledgement
          ? { ...original.signatures.picTechnicalAcknowledgement }
          : null
        : null,
      picFlightRecord: null,
      operatorRecord: null,
    },
    correction: {
      supersedesRevisionId: original.revisionId,
      correctionReason: required(correctionReason, 'correctionReason'),
    },
  };
}

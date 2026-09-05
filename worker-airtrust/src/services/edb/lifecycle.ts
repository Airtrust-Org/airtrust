import type { EdbFlightRecord, EdbLifecycleStatus } from './contracts';
import {
  validateForOperatorSignature,
  validateForPicFlightSignature,
} from './regulatory-validation';

export type EdbLifecycleAction =
  | 'MARK_READY_FOR_PIC_SIGNATURE'
  | 'CONFIRM_PIC_SIGNED'
  | 'CONFIRM_OPERATOR_SIGNED'
  | 'QUEUE_ANAC_SYNC'
  | 'CONFIRM_ANAC_SYNCED'
  | 'SUPERSEDE'
  | 'CANCEL';

export interface EdbLifecycleContext {
  replacementRevisionId?: string | null;
  correctionReason?: string | null;
}

export interface EdbLifecycleDecision {
  allowed: boolean;
  from: EdbLifecycleStatus;
  to: EdbLifecycleStatus | null;
  reasons: string[];
}

const SIGNED_OR_LATER: ReadonlySet<EdbLifecycleStatus> = new Set([
  'PIC_SIGNED',
  'OPERATOR_SIGNED',
  'ANAC_PENDING',
  'ANAC_SYNCED',
  'SUPERSEDED',
]);

export function isEdbContentLocked(record: EdbFlightRecord): boolean {
  return record.signatures.picFlightRecord !== null || SIGNED_OR_LATER.has(record.status);
}

export function canEditEdbFlightContent(record: EdbFlightRecord): boolean {
  return !isEdbContentLocked(record) && record.status !== 'CANCELLED';
}

function decision(
  record: EdbFlightRecord,
  allowed: boolean,
  to: EdbLifecycleStatus | null,
  reasons: string[],
): EdbLifecycleDecision {
  return { allowed, from: record.status, to, reasons };
}

function invalidState(record: EdbFlightRecord, expected: EdbLifecycleStatus): EdbLifecycleDecision {
  return decision(record, false, null, [`EDB_INVALID_STATE_EXPECTED_${expected}`]);
}

function hasFinalRevisionIdentity(record: EdbFlightRecord): boolean {
  return Boolean(record.logicalRecordId?.trim() && record.revisionId?.trim());
}

export function evaluateEdbLifecycleAction(
  record: EdbFlightRecord,
  action: EdbLifecycleAction,
  context: EdbLifecycleContext = {},
): EdbLifecycleDecision {
  if (record.status === 'SUPERSEDED' || record.status === 'CANCELLED') {
    return decision(record, false, null, ['EDB_TERMINAL_STATE']);
  }

  if (action === 'MARK_READY_FOR_PIC_SIGNATURE') {
    if (record.status !== 'DRAFT') return invalidState(record, 'DRAFT');
    if (!hasFinalRevisionIdentity(record)) {
      return decision(record, false, null, ['EDB_FINAL_REVISION_IDENTITY_REQUIRED']);
    }
    if (!record.signatures.picTechnicalAcknowledgement) {
      return decision(record, false, null, ['EDB_PIC_TECHNICAL_ACK_REQUIRED']);
    }
    const validation = validateForPicFlightSignature(record);
    const blocking = validation.issues.filter((issue) => issue.severity === 'BLOCKING');
    return decision(
      record,
      blocking.length === 0,
      blocking.length === 0 ? 'READY_FOR_PIC_SIGNATURE' : null,
      blocking.map((issue) => issue.code),
    );
  }

  if (action === 'CONFIRM_PIC_SIGNED') {
    if (record.status !== 'READY_FOR_PIC_SIGNATURE') return invalidState(record, 'READY_FOR_PIC_SIGNATURE');
    if (!record.signatures.picFlightRecord) {
      return decision(record, false, null, ['EDB_PIC_FLIGHT_SIGNATURE_REQUIRED']);
    }
    if (
      record.signatures.picFlightRecord.targetType !== 'FINAL_RECORD_REVISION' ||
      record.signatures.picFlightRecord.targetId !== record.revisionId
    ) {
      return decision(record, false, null, ['EDB_PIC_FLIGHT_SIGNATURE_TARGET_MISMATCH']);
    }
    const validation = validateForPicFlightSignature(record);
    const blocking = validation.issues.filter((issue) => issue.severity === 'BLOCKING');
    return decision(
      record,
      blocking.length === 0,
      blocking.length === 0 ? 'PIC_SIGNED' : null,
      blocking.map((issue) => issue.code),
    );
  }

  if (action === 'CONFIRM_OPERATOR_SIGNED') {
    if (record.status !== 'PIC_SIGNED') return invalidState(record, 'PIC_SIGNED');
    if (!record.signatures.operatorRecord) {
      return decision(record, false, null, ['EDB_OPERATOR_SIGNATURE_REQUIRED']);
    }
    if (
      record.signatures.operatorRecord.targetType !== 'FINAL_RECORD_REVISION' ||
      record.signatures.operatorRecord.targetId !== record.revisionId
    ) {
      return decision(record, false, null, ['EDB_OPERATOR_SIGNATURE_TARGET_MISMATCH']);
    }
    const validation = validateForOperatorSignature(record);
    const blocking = validation.issues.filter((issue) => issue.severity === 'BLOCKING');
    return decision(
      record,
      blocking.length === 0,
      blocking.length === 0 ? 'OPERATOR_SIGNED' : null,
      blocking.map((issue) => issue.code),
    );
  }

  if (action === 'QUEUE_ANAC_SYNC') {
    if (record.status !== 'OPERATOR_SIGNED') return invalidState(record, 'OPERATOR_SIGNED');
    return decision(record, true, 'ANAC_PENDING', []);
  }

  if (action === 'CONFIRM_ANAC_SYNCED') {
    if (record.status !== 'ANAC_PENDING') return invalidState(record, 'ANAC_PENDING');
    return decision(record, false, null, ['EDB_ANAC_ACCEPTANCE_ADAPTER_REQUIRED']);
  }

  if (action === 'SUPERSEDE') {
    if (!SIGNED_OR_LATER.has(record.status)) {
      return decision(record, false, null, ['EDB_ONLY_SIGNED_RECORD_CAN_BE_SUPERSEDED']);
    }
    const reasons: string[] = [];
    if (!record.revisionId?.trim()) reasons.push('EDB_REVISION_ID_REQUIRED');
    if (!context.replacementRevisionId?.trim()) reasons.push('EDB_REPLACEMENT_REVISION_ID_REQUIRED');
    if (!context.correctionReason?.trim()) reasons.push('EDB_CORRECTION_REASON_REQUIRED');
    return decision(record, reasons.length === 0, reasons.length === 0 ? 'SUPERSEDED' : null, reasons);
  }

  if (action === 'CANCEL') {
    if (isEdbContentLocked(record)) {
      return decision(record, false, null, ['EDB_SIGNED_RECORD_CANNOT_BE_CANCELLED']);
    }
    return decision(record, true, 'CANCELLED', []);
  }

  const exhaustive: never = action;
  throw new Error(`Unsupported eDB lifecycle action: ${exhaustive}`);
}

export function createCorrectionRevision(params: {
  original: EdbFlightRecord;
  newRevisionId: string;
  correctionReason: string;
  capturedAt: string;
}): EdbFlightRecord {
  const { original, newRevisionId, correctionReason, capturedAt } = params;
  if (!original.logicalRecordId?.trim()) throw new Error('Original signed record must have logicalRecordId');
  if (!original.revisionId?.trim()) throw new Error('Original signed record must have revisionId');
  if (!isEdbContentLocked(original)) throw new Error('Correction revision is only required for signed/locked records');
  if (!newRevisionId.trim()) throw new Error('New correction revisionId is required');
  if (newRevisionId === original.revisionId) throw new Error('Correction revisionId must differ from original revisionId');
  if (!correctionReason.trim()) throw new Error('Correction reason is required');

  return {
    ...original,
    logicalRecordId: original.logicalRecordId,
    revisionId: newRevisionId,
    status: 'DRAFT',
    identity: {
      ...original.identity,
      aircraft: {
        ...original.identity.aircraft,
        owners: original.identity.aircraft.owners ? [...original.identity.aircraft.owners] : null,
        operators: original.identity.aircraft.operators ? [...original.identity.aircraft.operators] : null,
      },
    },
    flight: {
      ...original.flight,
      times: { ...original.flight.times },
      duration: { ...original.flight.duration },
      occurrences: original.flight.occurrences ? [...original.flight.occurrences] : original.flight.occurrences,
      technicalDiscrepancies: original.flight.technicalDiscrepancies
        ? original.flight.technicalDiscrepancies.map((item) => ({
            ...item,
            detectedBy: { ...item.detectedBy },
          }))
        : original.flight.technicalDiscrepancies,
      crew: original.flight.crew.map((member) => ({ ...member })),
    },
    maintenance: {
      lastIntervention: { ...original.maintenance.lastIntervention },
      nextIntervention: { ...original.maintenance.nextIntervention },
    },
    signatures: {
      picTechnicalAcknowledgement: original.signatures.picTechnicalAcknowledgement
        ? {
            ...original.signatures.picTechnicalAcknowledgement,
            signer: { ...original.signatures.picTechnicalAcknowledgement.signer },
          }
        : null,
      picFlightRecord: null,
      operatorRecord: null,
    },
    correction: {
      revision: original.correction.revision + 1,
      supersedesRevisionId: original.revisionId,
      correctionReason: correctionReason.trim(),
    },
    source: {
      ...original.source,
      capturedAt,
    },
  };
}

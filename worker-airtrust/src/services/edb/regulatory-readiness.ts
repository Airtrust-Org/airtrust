import type { EdbFlightRecord } from './contracts';
import {
  operatorSignatureDeadlineAt,
  validateForOperatorSignature,
  validateForPicFlightSignature,
  validateForPicTechnicalAcknowledgement,
  type EdbValidationIssue,
} from './regulatory-validation';
import { verifyEdbSignaturePayloadBinding } from './signature-integrity';
import {
  technicalSituationMatches,
  verifyPicTechnicalAcknowledgementBinding,
  type EdbPicTechnicalAcknowledgement,
  type EdbTechnicalSituationSnapshot,
} from './technical-awareness';

export type EdbReadinessStepId =
  | 'TECHNICAL_SNAPSHOT'
  | 'PIC_TECHNICAL_ACK'
  | 'FLIGHT_RECORD'
  | 'PIC_FLIGHT_SIGNATURE'
  | 'OPERATOR_SIGNATURE'
  | 'ANAC_SYNC';

export type EdbReadinessStepStatus =
  | 'COMPLETE'
  | 'ACTION_REQUIRED'
  | 'BLOCKED'
  | 'PENDING_EXTERNAL';

export interface EdbReadinessStep {
  id: EdbReadinessStepId;
  status: EdbReadinessStepStatus;
  blockingCodes: string[];
  warningCodes: string[];
  deadlineAt: string | null;
}

export interface EdbRegulatoryReadiness {
  logicalRecordId: string | null;
  revisionId: string | null;
  lifecycleStatus: EdbFlightRecord['status'];
  internalRecordComplete: boolean;
  readyForExternalAnacIntegration: boolean;
  steps: EdbReadinessStep[];
  nextAction: EdbReadinessStepId | null;
}

export interface EdbReadinessPreflightEvidence {
  technicalSituation: EdbTechnicalSituationSnapshot | null;
  technicalAcknowledgement: EdbPicTechnicalAcknowledgement | null;
}

const NO_PREFLIGHT_EVIDENCE: EdbReadinessPreflightEvidence = {
  technicalSituation: null,
  technicalAcknowledgement: null,
};

function codes(issues: EdbValidationIssue[], severity: EdbValidationIssue['severity']): string[] {
  return issues.filter((issue) => issue.severity === severity).map((issue) => issue.code);
}

function firstRequiredAction(steps: EdbReadinessStep[]): EdbReadinessStepId | null {
  return steps.find((step) => step.status === 'ACTION_REQUIRED' || step.status === 'BLOCKED')?.id ?? null;
}

/**
 * Read-only readiness model for UI/operations use. It does not mutate lifecycle
 * state and does not imply ANAC transmission, acceptance or authorization.
 */
export async function assessEdbRegulatoryReadiness(
  record: EdbFlightRecord,
  now = new Date(),
  preflight: EdbReadinessPreflightEvidence = NO_PREFLIGHT_EVIDENCE,
): Promise<EdbRegulatoryReadiness> {
  const technicalValidation = validateForPicTechnicalAcknowledgement(record);
  const technicalBlocking = codes(technicalValidation.issues, 'BLOCKING');
  const technicalWarnings = codes(technicalValidation.issues, 'WARNING');

  const technicalSituationMatchesRecord = preflight.technicalSituation
    ? await technicalSituationMatches({
        snapshot: preflight.technicalSituation,
        operatorCompanyId: record.identity.operatorCompanyId,
        sourceFlightId: record.source.sourceFlightId,
        aircraft: record.identity.aircraft,
        maintenance: record.maintenance,
      })
    : false;

  const technicalAckBinding = preflight.technicalSituation
    ? await verifyPicTechnicalAcknowledgementBinding({
        snapshot: preflight.technicalSituation,
        acknowledgement: preflight.technicalAcknowledgement,
      })
    : null;

  const technicalSnapshotComplete =
    technicalBlocking.length === 0 &&
    Boolean(preflight.technicalSituation) &&
    technicalSituationMatchesRecord &&
    technicalAckBinding?.snapshotIntegrity === true;

  const embeddedTechnicalAcknowledgement = record.signatures.picTechnicalAcknowledgement;
  const preflightTechnicalAcknowledgement = preflight.technicalAcknowledgement?.signature;
  const technicalAckComplete =
    technicalSnapshotComplete &&
    technicalAckBinding?.matchesSnapshot === true &&
    Boolean(embeddedTechnicalAcknowledgement) &&
    embeddedTechnicalAcknowledgement?.signatureId === preflightTechnicalAcknowledgement?.signatureId &&
    embeddedTechnicalAcknowledgement?.targetType === 'TECHNICAL_SITUATION' &&
    embeddedTechnicalAcknowledgement?.targetId === preflight.technicalSituation?.snapshotId &&
    embeddedTechnicalAcknowledgement?.canonicalPayloadHashSha256 ===
      preflightTechnicalAcknowledgement?.canonicalPayloadHashSha256;

  const flightValidation = validateForPicFlightSignature(record);
  const flightBlocking = codes(flightValidation.issues, 'BLOCKING').filter(
    (code) => code !== 'EDB_PIC_TECHNICAL_ACK_REQUIRED',
  );
  if (!record.logicalRecordId?.trim()) flightBlocking.unshift('EDB_LOGICAL_RECORD_ID_REQUIRED');
  if (!record.revisionId?.trim()) flightBlocking.unshift('EDB_REVISION_ID_REQUIRED');
  const flightWarnings = codes(flightValidation.issues, 'WARNING');

  const finalRevisionTargetId = record.revisionId ?? undefined;
  const picBinding = record.signatures.picFlightRecord
    ? await verifyEdbSignaturePayloadBinding(record, 'PIC_FLIGHT_RECORD', finalRevisionTargetId)
    : null;

  const operatorValidation = validateForOperatorSignature(record, now);
  const operatorBlocking = codes(operatorValidation.issues, 'BLOCKING');
  const operatorWarnings = codes(operatorValidation.issues, 'WARNING');
  const operatorBinding = record.signatures.operatorRecord
    ? await verifyEdbSignaturePayloadBinding(record, 'OPERATOR_RECORD', finalRevisionTargetId)
    : null;

  const operatorDeadline = record.signatures.picFlightRecord
    ? operatorSignatureDeadlineAt(
        record.signatures.picFlightRecord,
        record.identity.operatorRegulation,
      ).toISOString()
    : null;

  const operatorSignatureComplete =
    Boolean(record.revisionId?.trim()) &&
    Boolean(record.signatures.operatorRecord) &&
    operatorBinding?.matchesPayload === true &&
    operatorBlocking.length === 0;

  const internalRecordComplete =
    technicalAckComplete &&
    operatorSignatureComplete &&
    (record.status === 'OPERATOR_SIGNED' || record.status === 'SUPERSEDED');

  const technicalSnapshotCodes = technicalSnapshotComplete
    ? []
    : technicalBlocking.length > 0
      ? technicalBlocking
      : !preflight.technicalSituation
        ? ['EDB_TECHNICAL_SNAPSHOT_REQUIRED']
        : !technicalAckBinding?.snapshotIntegrity
          ? ['EDB_TECHNICAL_SNAPSHOT_HASH_MISMATCH']
          : !technicalSituationMatchesRecord
            ? ['EDB_TECHNICAL_SITUATION_CHANGED']
            : [];

  const technicalAckCodes =
    technicalSnapshotComplete && !technicalAckComplete
      ? [
          !preflight.technicalAcknowledgement
            ? 'EDB_PIC_TECHNICAL_ACK_REQUIRED'
            : !technicalAckBinding?.matchesSnapshot
              ? 'EDB_PIC_TECHNICAL_ACK_SNAPSHOT_MISMATCH'
              : !embeddedTechnicalAcknowledgement
                ? 'EDB_PIC_TECHNICAL_ACK_NOT_EMBEDDED_IN_FINAL_RECORD'
                : embeddedTechnicalAcknowledgement.signatureId !== preflightTechnicalAcknowledgement?.signatureId
                  ? 'EDB_PIC_TECHNICAL_ACK_ID_MISMATCH'
                  : embeddedTechnicalAcknowledgement.targetType !== 'TECHNICAL_SITUATION' ||
                      embeddedTechnicalAcknowledgement.targetId !== preflight.technicalSituation?.snapshotId
                    ? 'EDB_PIC_TECHNICAL_ACK_TARGET_MISMATCH'
                    : 'EDB_PIC_TECHNICAL_ACK_HASH_MISMATCH',
        ]
      : [];

  const picSignatureCodes =
    picBinding && !picBinding.matchesPayload
      ? [
          !picBinding.targetMatches
            ? 'EDB_PIC_FLIGHT_SIGNATURE_TARGET_MISMATCH'
            : 'EDB_PIC_FLIGHT_SIGNATURE_PAYLOAD_CHANGED',
        ]
      : [];

  const operatorSignatureCodes =
    operatorBinding && !operatorBinding.matchesPayload
      ? [
          ...operatorBlocking,
          !operatorBinding.targetMatches
            ? 'EDB_OPERATOR_SIGNATURE_TARGET_MISMATCH'
            : 'EDB_OPERATOR_SIGNATURE_PAYLOAD_CHANGED',
        ]
      : operatorBlocking;

  const steps: EdbReadinessStep[] = [
    {
      id: 'TECHNICAL_SNAPSHOT',
      status: technicalSnapshotComplete ? 'COMPLETE' : 'ACTION_REQUIRED',
      blockingCodes: technicalSnapshotCodes,
      warningCodes: technicalWarnings,
      deadlineAt: null,
    },
    {
      id: 'PIC_TECHNICAL_ACK',
      status: !technicalSnapshotComplete
        ? 'BLOCKED'
        : technicalAckComplete
          ? 'COMPLETE'
          : 'ACTION_REQUIRED',
      blockingCodes: technicalAckCodes,
      warningCodes: [],
      deadlineAt: null,
    },
    {
      id: 'FLIGHT_RECORD',
      status: flightBlocking.length === 0 ? 'COMPLETE' : 'ACTION_REQUIRED',
      blockingCodes: flightBlocking,
      warningCodes: flightWarnings,
      deadlineAt: null,
    },
    {
      id: 'PIC_FLIGHT_SIGNATURE',
      status:
        !technicalAckComplete || flightBlocking.length > 0
          ? 'BLOCKED'
          : !record.signatures.picFlightRecord
            ? 'ACTION_REQUIRED'
            : picBinding?.matchesPayload
              ? 'COMPLETE'
              : 'ACTION_REQUIRED',
      blockingCodes: picSignatureCodes,
      warningCodes: [],
      deadlineAt: null,
    },
    {
      id: 'OPERATOR_SIGNATURE',
      status: !record.signatures.picFlightRecord
        ? 'BLOCKED'
        : !record.signatures.operatorRecord
          ? 'ACTION_REQUIRED'
          : operatorSignatureComplete
            ? 'COMPLETE'
            : 'ACTION_REQUIRED',
      blockingCodes: operatorSignatureCodes,
      warningCodes: operatorWarnings,
      deadlineAt: operatorDeadline,
    },
    {
      id: 'ANAC_SYNC',
      status:
        record.status === 'OPERATOR_SIGNED' &&
        operatorSignatureComplete &&
        technicalAckComplete
          ? 'PENDING_EXTERNAL'
          : 'BLOCKED',
      blockingCodes: [],
      warningCodes: [],
      deadlineAt: null,
    },
  ];

  return {
    logicalRecordId: record.logicalRecordId,
    revisionId: record.revisionId,
    lifecycleStatus: record.status,
    internalRecordComplete,
    readyForExternalAnacIntegration:
      record.status === 'OPERATOR_SIGNED' && operatorSignatureComplete && technicalAckComplete,
    steps,
    nextAction: firstRequiredAction(steps),
  };
}

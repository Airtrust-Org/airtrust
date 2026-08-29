import type { EdbFlightRecord } from './contracts';
import {
  operatorSignatureDeadlineAt,
  validateForOperatorSignature,
  validateForPicFlightSignature,
  validateForPicTechnicalAcknowledgement,
  type EdbValidationIssue,
} from './regulatory-validation';
import { verifyEdbSignaturePayloadBinding } from './signature-integrity';

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
  recordId: string | null;
  lifecycleStatus: EdbFlightRecord['status'];
  readyForAnacQueue: boolean;
  steps: EdbReadinessStep[];
  nextAction: EdbReadinessStepId | null;
}

function codes(issues: EdbValidationIssue[], severity: EdbValidationIssue['severity']): string[] {
  return issues.filter((issue) => issue.severity === severity).map((issue) => issue.code);
}

function firstIncomplete(steps: EdbReadinessStep[]): EdbReadinessStepId | null {
  return steps.find((step) => step.status !== 'COMPLETE')?.id ?? null;
}

/**
 * Read-only readiness model for future UI/operations use. This does not mutate
 * lifecycle status and does not imply ANAC acceptance or transmission.
 */
export async function assessEdbRegulatoryReadiness(
  record: EdbFlightRecord,
  now = new Date(),
): Promise<EdbRegulatoryReadiness> {
  const technicalValidation = validateForPicTechnicalAcknowledgement(record);
  const technicalBlocking = codes(technicalValidation.issues, 'BLOCKING');
  const technicalWarnings = codes(technicalValidation.issues, 'WARNING');

  const technicalAckBinding = record.signatures.picTechnicalAcknowledgement
    ? await verifyEdbSignaturePayloadBinding(record, 'PIC_TECHNICAL_ACK')
    : null;

  const flightValidation = validateForPicFlightSignature(record);
  const flightBlocking = codes(flightValidation.issues, 'BLOCKING').filter(
    (code) => code !== 'EDB_PIC_TECHNICAL_ACK_REQUIRED',
  );
  const flightWarnings = codes(flightValidation.issues, 'WARNING');

  const picBinding = record.signatures.picFlightRecord
    ? await verifyEdbSignaturePayloadBinding(record, 'PIC_FLIGHT_RECORD')
    : null;

  const operatorValidation = validateForOperatorSignature(record, now);
  const operatorBlocking = codes(operatorValidation.issues, 'BLOCKING');
  const operatorWarnings = codes(operatorValidation.issues, 'WARNING');
  const operatorBinding = record.signatures.operatorRecord
    ? await verifyEdbSignaturePayloadBinding(record, 'OPERATOR_RECORD')
    : null;

  const operatorDeadline = record.signatures.picFlightRecord
    ? operatorSignatureDeadlineAt(record.signatures.picFlightRecord, record.identity.operatorRegulation).toISOString()
    : null;

  const steps: EdbReadinessStep[] = [
    {
      id: 'TECHNICAL_SNAPSHOT',
      status: technicalBlocking.length === 0 ? 'COMPLETE' : 'ACTION_REQUIRED',
      blockingCodes: technicalBlocking,
      warningCodes: technicalWarnings,
      deadlineAt: null,
    },
    {
      id: 'PIC_TECHNICAL_ACK',
      status:
        technicalBlocking.length > 0
          ? 'BLOCKED'
          : !record.signatures.picTechnicalAcknowledgement
            ? 'ACTION_REQUIRED'
            : technicalAckBinding?.matchesPayload
              ? 'COMPLETE'
              : 'ACTION_REQUIRED',
      blockingCodes:
        technicalBlocking.length > 0
          ? technicalBlocking
          : technicalAckBinding && !technicalAckBinding.matchesPayload
            ? ['EDB_PIC_TECHNICAL_ACK_PAYLOAD_CHANGED']
            : [],
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
        technicalBlocking.length > 0 || !record.signatures.picTechnicalAcknowledgement || flightBlocking.length > 0
          ? 'BLOCKED'
          : !record.signatures.picFlightRecord
            ? 'ACTION_REQUIRED'
            : picBinding?.matchesPayload
              ? 'COMPLETE'
              : 'ACTION_REQUIRED',
      blockingCodes:
        picBinding && !picBinding.matchesPayload
          ? ['EDB_PIC_FLIGHT_SIGNATURE_PAYLOAD_CHANGED']
          : [],
      warningCodes: [],
      deadlineAt: null,
    },
    {
      id: 'OPERATOR_SIGNATURE',
      status:
        !record.signatures.picFlightRecord
          ? 'BLOCKED'
          : !record.signatures.operatorRecord
            ? 'ACTION_REQUIRED'
            : operatorBinding?.matchesPayload && operatorBlocking.length === 0
              ? 'COMPLETE'
              : 'ACTION_REQUIRED',
      blockingCodes:
        operatorBinding && !operatorBinding.matchesPayload
          ? [...operatorBlocking, 'EDB_OPERATOR_SIGNATURE_PAYLOAD_CHANGED']
          : operatorBlocking,
      warningCodes: operatorWarnings,
      deadlineAt: operatorDeadline,
    },
    {
      id: 'ANAC_SYNC',
      status:
        record.status === 'ANAC_SYNCED'
          ? 'COMPLETE'
          : record.status === 'ANAC_PENDING'
            ? 'PENDING_EXTERNAL'
            : record.signatures.operatorRecord && operatorBinding?.matchesPayload
              ? 'ACTION_REQUIRED'
              : 'BLOCKED',
      blockingCodes: [],
      warningCodes: [],
      deadlineAt: null,
    },
  ];

  return {
    recordId: record.recordId,
    lifecycleStatus: record.status,
    readyForAnacQueue:
      steps.find((step) => step.id === 'OPERATOR_SIGNATURE')?.status === 'COMPLETE' &&
      record.status !== 'ANAC_SYNCED' &&
      record.status !== 'ANAC_PENDING',
    steps,
    nextAction: firstIncomplete(steps),
  };
}

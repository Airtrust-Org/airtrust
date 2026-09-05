import type { EdbFlightRecord } from './contracts';
import { validateForPicFlightSignature } from './regulatory-validation';
import {
  technicalSituationMatches,
  verifyPicTechnicalAcknowledgementBinding,
  type EdbPicTechnicalAcknowledgement,
  type EdbTechnicalSituationSnapshot,
} from './technical-awareness';

export interface FinalizedPostflightRecord {
  record: EdbFlightRecord;
  logicalRecordId: string;
  revisionId: string;
  technicalSituationId: string;
  technicalAcknowledgementSignatureId: string;
}

function cloneRecord(record: EdbFlightRecord): EdbFlightRecord {
  return {
    ...record,
    identity: {
      ...record.identity,
      aircraft: {
        ...record.identity.aircraft,
        owners: record.identity.aircraft.owners ? [...record.identity.aircraft.owners] : null,
        operators: record.identity.aircraft.operators ? [...record.identity.aircraft.operators] : null,
      },
    },
    flight: {
      ...record.flight,
      times: { ...record.flight.times },
      duration: { ...record.flight.duration },
      occurrences: record.flight.occurrences ? [...record.flight.occurrences] : record.flight.occurrences,
      technicalDiscrepancies: record.flight.technicalDiscrepancies
        ? record.flight.technicalDiscrepancies.map((item) => ({
            ...item,
            detectedBy: { ...item.detectedBy },
          }))
        : record.flight.technicalDiscrepancies,
      crew: record.flight.crew.map((member) => ({ ...member })),
    },
    maintenance: {
      lastIntervention: { ...record.maintenance.lastIntervention },
      nextIntervention: { ...record.maintenance.nextIntervention },
    },
    signatures: {
      picTechnicalAcknowledgement: record.signatures.picTechnicalAcknowledgement
        ? {
            ...record.signatures.picTechnicalAcknowledgement,
            signer: { ...record.signatures.picTechnicalAcknowledgement.signer },
          }
        : null,
      picFlightRecord: record.signatures.picFlightRecord
        ? { ...record.signatures.picFlightRecord, signer: { ...record.signatures.picFlightRecord.signer } }
        : null,
      operatorRecord: record.signatures.operatorRecord
        ? { ...record.signatures.operatorRecord, signer: { ...record.signatures.operatorRecord.signer } }
        : null,
    },
    correction: { ...record.correction },
    source: { ...record.source },
  };
}

function assertAcknowledgementBeforeFlight(record: EdbFlightRecord, acknowledgement: EdbPicTechnicalAcknowledgement): void {
  const engineStartAt = record.flight.times.engineStartAt;
  if (!engineStartAt) return;

  const signedAt = Date.parse(acknowledgement.signature.signedAt);
  const engineStart = Date.parse(engineStartAt);
  if (Number.isFinite(signedAt) && Number.isFinite(engineStart) && signedAt > engineStart) {
    throw new Error('EDB_TECHNICAL_ACK_NOT_BEFORE_FLIGHT');
  }
}

/**
 * Freezes the postflight regulatory record only after proving that the PIC
 * acknowledged the exact aircraft/maintenance situation that existed before
 * the flight. The logical/revision identity must already be assigned so the
 * immutable revision can be hashed and signed without a later identifier swap.
 */
export async function finalizePostflightEdbRecord(params: {
  draftRecord: EdbFlightRecord;
  technicalSituation: EdbTechnicalSituationSnapshot;
  technicalAcknowledgement: EdbPicTechnicalAcknowledgement;
}): Promise<FinalizedPostflightRecord> {
  const { draftRecord, technicalSituation, technicalAcknowledgement } = params;
  if (draftRecord.status !== 'DRAFT') throw new Error('EDB_POSTFLIGHT_FINALIZATION_REQUIRES_DRAFT');
  if (draftRecord.source.sourceStageId === null) throw new Error('EDB_POSTFLIGHT_STAGE_REQUIRED');
  const logicalRecordId = draftRecord.logicalRecordId?.trim();
  const revisionId = draftRecord.revisionId?.trim();
  if (!logicalRecordId) throw new Error('EDB_LOGICAL_RECORD_ID_REQUIRED');
  if (!revisionId) throw new Error('EDB_REVISION_ID_REQUIRED');

  const acknowledgementBinding = await verifyPicTechnicalAcknowledgementBinding({
    snapshot: technicalSituation,
    acknowledgement: technicalAcknowledgement,
  });
  if (!acknowledgementBinding.snapshotIntegrity) {
    throw new Error('EDB_TECHNICAL_SNAPSHOT_HASH_MISMATCH');
  }
  if (!acknowledgementBinding.matchesSnapshot) {
    throw new Error('EDB_TECHNICAL_ACK_HASH_MISMATCH');
  }

  const situationStillMatches = await technicalSituationMatches({
    snapshot: technicalSituation,
    operatorCompanyId: draftRecord.identity.operatorCompanyId,
    sourceFlightId: draftRecord.source.sourceFlightId,
    aircraft: draftRecord.identity.aircraft,
    maintenance: draftRecord.maintenance,
  });
  if (!situationStillMatches) throw new Error('EDB_TECHNICAL_SITUATION_CHANGED_AFTER_ACK');

  assertAcknowledgementBeforeFlight(draftRecord, technicalAcknowledgement);

  const record = cloneRecord(draftRecord);
  record.logicalRecordId = logicalRecordId;
  record.revisionId = revisionId;
  record.identity.aircraft = {
    ...technicalSituation.aircraft,
    owners: technicalSituation.aircraft.owners ? [...technicalSituation.aircraft.owners] : null,
    operators: technicalSituation.aircraft.operators ? [...technicalSituation.aircraft.operators] : null,
  };
  record.maintenance = {
    lastIntervention: { ...technicalSituation.maintenance.lastIntervention },
    nextIntervention: { ...technicalSituation.maintenance.nextIntervention },
  };
  record.signatures.picTechnicalAcknowledgement = {
    ...technicalAcknowledgement.signature,
    signer: { ...technicalAcknowledgement.signature.signer },
  };

  const validation = validateForPicFlightSignature(record);
  const blockingCodes = validation.issues
    .filter((issue) => issue.severity === 'BLOCKING')
    .map((issue) => issue.code);
  if (blockingCodes.length > 0) {
    throw new Error(`EDB_POSTFLIGHT_NOT_READY:${blockingCodes.join(',')}`);
  }

  return {
    record,
    logicalRecordId,
    revisionId,
    technicalSituationId: technicalSituation.snapshotId,
    technicalAcknowledgementSignatureId: technicalAcknowledgement.signature.signatureId,
  };
}

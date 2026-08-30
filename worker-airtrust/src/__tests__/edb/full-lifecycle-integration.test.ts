import { describe, expect, it } from 'vitest';
import {
  appendEdbAuditEvent,
  verifyEdbAuditChain,
  type EdbAuditEvent,
} from '../../services/edb/audit-chain';
import { hashSignableEdbPayload } from '../../services/edb/canonicalization';
import {
  createEmptyEdbFlightRecord,
  type EdbFlightRecord,
  type EdbPersonIdentity,
  type EdbSignatureProof,
  type EdbSignatureType,
} from '../../services/edb/contracts';
import {
  closeEdbDiaryVolume,
  createEdbInformationLossIncident,
  isEdbInformationLossIncidentRegulatorilyDocumented,
  openEdbDiaryVolume,
  recordAnacInformationLossNotification,
  recordPoliceOccurrence,
  recordSuccessfulReconstitution,
} from '../../services/edb/diary-governance';
import {
  createCorrectionRevision,
  evaluateEdbLifecycleAction,
} from '../../services/edb/lifecycle';
import { finalizePostflightEdbRecord } from '../../services/edb/postflight-finalization';
import { assessEdbRegulatoryReadiness } from '../../services/edb/regulatory-readiness';
import {
  bindPicTechnicalAcknowledgement,
  createTechnicalSituationSnapshot,
} from '../../services/edb/technical-awareness';
import {
  appendCorrectiveAction,
  appendDeferredActionAuthorization,
  appendReturnToServiceApproval,
  createTechnicalDiscrepancyCase,
  getTechnicalDiscrepancyStatus,
  isTechnicalDiscrepancyClosedForReturnToService,
} from '../../services/edb/technical-discrepancy-workflow';

const pic: EdbPersonIdentity = {
  employeeId: 91001,
  fullName: 'QA eDB PIC',
  anacCode: 'QA91001',
};

const operator: EdbPersonIdentity = {
  employeeId: 91002,
  fullName: 'QA eDB Operator',
  anacCode: null,
};

const mechanic: EdbPersonIdentity = {
  employeeId: 91003,
  fullName: 'QA eDB Maintenance',
  anacCode: null,
};

const DIARY_ID = 91001;
const FLIGHT_ID = 91001;
const STAGE_ID = 91002;
const REVISION_1 = 'qa-edb-flight-91001-stage-91002-r1';
const REVISION_2 = 'qa-edb-flight-91001-stage-91002-r2';

function draftRecord(): EdbFlightRecord {
  const record = createEmptyEdbFlightRecord({
    operatorCompanyId: 999002,
    operatorRegulation: 'RBAC135',
    sourceFlightId: FLIGHT_ID,
    sourceRdvId: 91004,
    sourceRdvVersion: 1,
    sourceStageId: STAGE_ID,
    capturedAt: '2026-08-30T12:05:00.000Z',
    logicalRecordId: 'qa-edb-flight-91001-stage-91002',
    revisionId: REVISION_1,
  });

  record.identity.aircraft = {
    aircraftId: 91005,
    manufacturer: 'QA Manufacturer',
    model: 'QA Model',
    serialNumber: 'QA-SN-91005',
    registrationMarks: 'QA-EDB',
    owners: ['QA Synthetic Owner'],
    operators: ['QA Synthetic Operator'],
  };
  record.maintenance = {
    lastIntervention: {
      type: 'QA synthetic scheduled inspection',
      date: '2026-08-29',
      returnToServiceApprovedBy: mechanic.fullName,
    },
    nextIntervention: {
      type: 'QA synthetic next inspection',
      dueAtAirframeHours: 2000,
    },
  };
  record.flight = {
    date: '2026-08-30',
    origin: 'SBJR',
    destination: 'SBJR',
    times: {
      engineStartAt: '2026-08-30T11:00:00.000Z',
      takeoffAt: '2026-08-30T11:05:00.000Z',
      landingAt: '2026-08-30T11:55:00.000Z',
      engineShutdownAt: '2026-08-30T12:00:00.000Z',
    },
    landingsTotal: 1,
    cycles: 1,
    duration: {
      dayMinutes: 50,
      nightMinutes: 0,
      totalMinutes: 50,
      ifrActualMinutes: 0,
      ifrSimulatedMinutes: 0,
    },
    fuelBeforeEngineStart: 900,
    personsOnBoard: 2,
    cargoKg: 0,
    nature: 'QA_SYNTHETIC',
    occurrences: [],
    technicalDiscrepancies: [],
    crew: [
      {
        ...pic,
        operationalRole: 'PIC',
        regulatoryFunctionCode: null,
      },
    ],
  };
  return record;
}

function finalSignature(
  type: Extract<EdbSignatureType, 'PIC_FLIGHT_RECORD' | 'OPERATOR_RECORD'>,
  targetId: string,
  signer: EdbPersonIdentity,
  hash: string,
  signedAt: string,
): EdbSignatureProof {
  return {
    signatureId: `qa-sig-${type.toLowerCase()}-${targetId}`,
    type,
    targetType: 'FINAL_RECORD_REVISION',
    targetId,
    signer: { ...signer },
    signedAt,
    canonicalPayloadHashSha256: hash,
    method: 'ASYMMETRIC_DIGITAL_SIGNATURE',
    proofReference: `qa-proof/${type.toLowerCase()}/${targetId}`,
  };
}

async function signFinalRevision(record: EdbFlightRecord, picAt: string, operatorAt: string) {
  const ready = evaluateEdbLifecycleAction(record, 'MARK_READY_FOR_PIC_SIGNATURE');
  expect(ready).toMatchObject({ allowed: true, to: 'READY_FOR_PIC_SIGNATURE' });

  const picHash = await hashSignableEdbPayload(record, 'PIC_FLIGHT_RECORD');
  record.status = 'READY_FOR_PIC_SIGNATURE';
  record.signatures.picFlightRecord = finalSignature(
    'PIC_FLIGHT_RECORD',
    record.revisionId!,
    pic,
    picHash,
    picAt,
  );
  const picDecision = evaluateEdbLifecycleAction(record, 'CONFIRM_PIC_SIGNED');
  expect(picDecision).toMatchObject({ allowed: true, to: 'PIC_SIGNED' });

  record.status = 'PIC_SIGNED';
  const operatorHash = await hashSignableEdbPayload(record, 'OPERATOR_RECORD');
  record.signatures.operatorRecord = finalSignature(
    'OPERATOR_RECORD',
    record.revisionId!,
    operator,
    operatorHash,
    operatorAt,
  );
  const operatorDecision = evaluateEdbLifecycleAction(record, 'CONFIRM_OPERATOR_SIGNED');
  expect(operatorDecision).toMatchObject({ allowed: true, to: 'OPERATOR_SIGNED' });
  record.status = 'OPERATOR_SIGNED';
}

describe('eDB full lifecycle integration in isolated memory', () => {
  it('runs preflight, postflight, signatures, correction, maintenance, audit, diary and reconstitution without external side effects', async () => {
    const volume = openEdbDiaryVolume({
      diaryId: DIARY_ID,
      volumeId: 'qa-edb-volume-91001',
      aircraftRegistrationMarks: 'QA-EDB',
      sequence: 1,
      openedAt: '2026-08-30T08:00:00.000Z',
      openedBy: operator,
      observations: 'QA synthetic isolated lifecycle volume',
    });
    expect(volume.status).toBe('OPEN');

    const draft = draftRecord();
    const technicalSituation = await createTechnicalSituationSnapshot({
      snapshotId: 'qa-tech-91001',
      operatorCompanyId: draft.identity.operatorCompanyId,
      sourceFlightId: draft.source.sourceFlightId,
      aircraft: draft.identity.aircraft,
      maintenance: draft.maintenance,
      capturedAt: '2026-08-30T10:00:00.000Z',
    });
    const technicalSignature: EdbSignatureProof = {
      signatureId: 'qa-sig-tech-91001',
      type: 'PIC_TECHNICAL_ACK',
      targetType: 'TECHNICAL_SITUATION',
      targetId: technicalSituation.snapshotId,
      signer: { ...pic },
      signedAt: '2026-08-30T10:30:00.000Z',
      canonicalPayloadHashSha256: technicalSituation.canonicalSnapshotSha256,
      method: 'ASYMMETRIC_DIGITAL_SIGNATURE',
      proofReference: 'qa-proof/technical/91001',
    };
    const technicalAcknowledgement = bindPicTechnicalAcknowledgement({
      snapshot: technicalSituation,
      signature: technicalSignature,
    });

    let audit: EdbAuditEvent[] = [];
    const preflightScope = {
      diaryId: DIARY_ID,
      sourceFlightId: FLIGHT_ID,
      technicalSituationId: technicalSituation.snapshotId,
      revisionId: null,
    };
    audit = await appendEdbAuditEvent(audit, {
      eventId: 'qa-audit-1',
      scope: preflightScope,
      type: 'SOURCE_SNAPSHOT_CAPTURED',
      actor: operator,
      occurredAt: '2026-08-30T10:00:00.000Z',
      payload: { canonicalSnapshotSha256: technicalSituation.canonicalSnapshotSha256 },
    });
    audit = await appendEdbAuditEvent(audit, {
      eventId: 'qa-audit-2',
      scope: preflightScope,
      type: 'PIC_TECHNICAL_ACK_SIGNED',
      actor: pic,
      occurredAt: '2026-08-30T10:30:00.000Z',
      payload: { signatureId: technicalSignature.signatureId },
    });

    const finalized = await finalizePostflightEdbRecord({
      draftRecord: draft,
      technicalSituation,
      technicalAcknowledgement,
    });
    const revision1 = finalized.record;
    expect(revision1.signatures.picTechnicalAcknowledgement?.signatureId).toBe(
      technicalSignature.signatureId,
    );

    await signFinalRevision(
      revision1,
      '2026-08-30T12:10:00.000Z',
      '2026-08-30T12:20:00.000Z',
    );
    const readiness1 = await assessEdbRegulatoryReadiness(
      revision1,
      new Date('2026-08-30T12:21:00.000Z'),
      { technicalSituation, technicalAcknowledgement },
    );
    expect(readiness1.readyForAnacQueue).toBe(true);
    expect(readiness1.nextAction).toBe('ANAC_SYNC');
    expect(evaluateEdbLifecycleAction(revision1, 'QUEUE_ANAC_SYNC')).toMatchObject({
      allowed: true,
      to: 'ANAC_PENDING',
    });

    const revision2 = createCorrectionRevision({
      original: revision1,
      newRevisionId: REVISION_2,
      correctionReason: 'QA synthetic correction of POB after signed revision',
      capturedAt: '2026-08-30T12:30:00.000Z',
    });
    revision2.flight.personsOnBoard = 3;
    expect(revision2.status).toBe('DRAFT');
    expect(revision2.correction.supersedesRevisionId).toBe(REVISION_1);
    expect(revision2.signatures.picFlightRecord).toBeNull();
    expect(revision2.signatures.operatorRecord).toBeNull();
    expect(revision1.flight.personsOnBoard).toBe(2);
    expect(revision1.status).toBe('OPERATOR_SIGNED');

    await signFinalRevision(
      revision2,
      '2026-08-30T12:40:00.000Z',
      '2026-08-30T12:50:00.000Z',
    );
    const readiness2 = await assessEdbRegulatoryReadiness(
      revision2,
      new Date('2026-08-30T12:51:00.000Z'),
      { technicalSituation, technicalAcknowledgement },
    );
    expect(readiness2.readyForAnacQueue).toBe(true);
    expect(readiness2.revisionId).toBe(REVISION_2);

    const discrepancy = createTechnicalDiscrepancyCase({
      discrepancyId: 'qa-disc-91001',
      revisionId: REVISION_2,
      description: 'QA synthetic technical discrepancy',
      detectedBy: pic,
      detectedAt: '2026-08-30T11:50:00.000Z',
      createdAt: '2026-08-30T12:55:00.000Z',
    });
    const deferred = appendDeferredActionAuthorization(discrepancy, {
      actionId: 'qa-maint-deferred-91001',
      reason: 'QA synthetic deferred action authorization',
      limitationOrControl: 'QA synthetic operational limitation',
      authorizedBy: mechanic,
      authorizedAt: '2026-08-30T13:00:00.000Z',
      reference: 'QA-MEL-91001',
    });
    const corrected = appendCorrectiveAction(deferred, {
      actionId: 'qa-maint-corrective-91001',
      description: 'QA synthetic corrective action',
      performedBy: mechanic,
      performedAt: '2026-08-30T13:30:00.000Z',
      reference: 'QA-OS-91001',
    });
    const released = appendReturnToServiceApproval(corrected, {
      approvalId: 'qa-rts-91001',
      correctiveActionId: 'qa-maint-corrective-91001',
      description: 'QA synthetic return-to-service approval',
      approvedBy: mechanic,
      approvedAt: '2026-08-30T13:45:00.000Z',
      reference: 'QA-RTS-91001',
    });
    expect(getTechnicalDiscrepancyStatus(released)).toBe('RETURN_TO_SERVICE_RECORDED');
    expect(isTechnicalDiscrepancyClosedForReturnToService(released)).toBe(true);

    audit = await appendEdbAuditEvent(audit, {
      eventId: 'qa-audit-3',
      scope: { ...preflightScope, revisionId: REVISION_1 },
      type: 'RECORD_CREATED',
      actor: pic,
      occurredAt: '2026-08-30T12:05:00.000Z',
      payload: { revisionId: REVISION_1 },
    });
    audit = await appendEdbAuditEvent(audit, {
      eventId: 'qa-audit-4',
      scope: { ...preflightScope, revisionId: REVISION_2 },
      type: 'OPERATOR_RECORD_SIGNED',
      actor: operator,
      occurredAt: '2026-08-30T12:50:00.000Z',
      payload: { revisionId: REVISION_2 },
    });
    expect(await verifyEdbAuditChain(audit)).toEqual({ valid: true, issues: [] });

    let incident = createEdbInformationLossIncident({
      incidentId: 'qa-incident-91001',
      diaryId: DIARY_ID,
      kind: 'CORRUPTION',
      detectedAt: '2026-08-30T14:00:00.000Z',
      description: 'QA synthetic integrity incident',
    });
    incident = recordPoliceOccurrence(incident, {
      reference: 'QA-BO-91001',
      reportedAt: '2026-08-30T14:10:00.000Z',
    });
    incident = recordAnacInformationLossNotification(incident, {
      reference: 'QA-INTERNAL-ANAC-REF-91001',
      notifiedAt: '2026-08-30T14:20:00.000Z',
    });
    incident = recordSuccessfulReconstitution(incident, '2026-08-30T14:30:00.000Z');
    expect(isEdbInformationLossIncidentRegulatorilyDocumented(incident)).toBe(true);

    const closedVolume = closeEdbDiaryVolume(volume, {
      closedAt: '2026-08-30T15:00:00.000Z',
      closedBy: operator,
      observations: 'QA synthetic lifecycle completed',
    });
    expect(closedVolume.status).toBe('CLOSED');
    expect(volume.status).toBe('OPEN');

    const pending = { ...revision2, status: 'ANAC_PENDING' as const };
    expect(evaluateEdbLifecycleAction(pending, 'CONFIRM_ANAC_SYNCED')).toMatchObject({
      allowed: false,
      to: null,
      reasons: ['EDB_ANAC_ACCEPTANCE_ADAPTER_REQUIRED'],
    });
  });
});

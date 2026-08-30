import { describe, expect, it } from 'vitest';
import {
  createEmptyEdbFlightRecord,
  type EdbFlightRecord,
  type EdbPersonIdentity,
  type EdbSignatureProof,
  type EdbSignatureType,
} from '../../services/edb/contracts';
import {
  canEditEdbFlightContent,
  createCorrectionRevision,
  evaluateEdbLifecycleAction,
  isEdbContentLocked,
} from '../../services/edb/lifecycle';
import {
  appendCorrectiveAction,
  appendDeferredActionAuthorization,
  appendReturnToServiceApproval,
  createTechnicalDiscrepancyCase,
  getTechnicalDiscrepancyStatus,
  isTechnicalDiscrepancyClosedForReturnToService,
} from '../../services/edb/technical-discrepancy-workflow';

const pic: EdbPersonIdentity = {
  employeeId: 10,
  fullName: 'Piloto em Comando',
  anacCode: '123456',
};

const mechanic: EdbPersonIdentity = {
  employeeId: 20,
  fullName: 'Responsavel Manutencao',
  anacCode: null,
};

function signature(type: EdbSignatureType, signer = pic): EdbSignatureProof {
  return {
    signatureId: `sig-${type}`,
    type,
    targetType: type === 'PIC_TECHNICAL_ACK' ? 'TECHNICAL_SITUATION' : 'FINAL_RECORD_REVISION',
    targetId: type === 'PIC_TECHNICAL_ACK' ? 'tech-1' : 'edbrev-100-300-r1',
    signer: { ...signer },
    signedAt: '2026-08-28T09:30:00.000Z',
    canonicalPayloadHashSha256: 'a'.repeat(64),
    method: 'ASYMMETRIC_DIGITAL_SIGNATURE',
    proofReference: `proof/${type}`,
  };
}

function completeRecord(): EdbFlightRecord {
  const record = createEmptyEdbFlightRecord({
    operatorCompanyId: 1,
    operatorRegulation: 'RBAC135',
    sourceFlightId: 100,
    sourceRdvId: 200,
    sourceRdvVersion: 3,
    sourceStageId: 300,
    capturedAt: '2026-08-28T11:00:00.000Z',
    logicalRecordId: 'flight-100-stage-300',
    revisionId: 'edbrev-100-300-r1',
  });

  record.identity.aircraft = {
    aircraftId: 12,
    manufacturer: 'Leonardo',
    model: 'AW139',
    serialNumber: 'SN-001',
    registrationMarks: 'PR-ABC',
    owners: ['Empresa Proprietaria'],
    operators: ['Empresa Operadora'],
  };
  record.maintenance = {
    lastIntervention: {
      type: 'Inspecao programada',
      date: '2026-08-20',
      returnToServiceApprovedBy: 'Responsavel Manutencao',
    },
    nextIntervention: {
      type: 'Inspecao 50h',
      dueAtAirframeHours: 1520,
    },
  };
  record.flight = {
    date: '2026-08-28',
    origin: 'SBJR',
    destination: 'SSXX',
    times: {
      engineStartAt: '2026-08-28T10:00:00.000Z',
      takeoffAt: '2026-08-28T10:05:00.000Z',
      landingAt: '2026-08-28T10:55:00.000Z',
      engineShutdownAt: '2026-08-28T11:00:00.000Z',
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
    personsOnBoard: 8,
    cargoKg: 0,
    nature: 'TRANSPORTE',
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

describe('eDB lifecycle isolation', () => {
  it('starts the final-record lifecycle only after independent preflight awareness exists', () => {
    const record = completeRecord();
    const withoutAck = evaluateEdbLifecycleAction(record, 'MARK_READY_FOR_PIC_SIGNATURE');
    expect(withoutAck.allowed).toBe(false);
    expect(withoutAck.reasons).toContain('EDB_PIC_TECHNICAL_ACK_REQUIRED');

    record.signatures.picTechnicalAcknowledgement = signature('PIC_TECHNICAL_ACK');
    const flightReady = evaluateEdbLifecycleAction(record, 'MARK_READY_FOR_PIC_SIGNATURE');
    expect(flightReady).toMatchObject({ allowed: true, to: 'READY_FOR_PIC_SIGNATURE' });
  });

  it('locks signed content and requires correction by a new revision instead of overwrite', () => {
    const record = completeRecord();
    record.status = 'PIC_SIGNED';
    record.signatures.picTechnicalAcknowledgement = signature('PIC_TECHNICAL_ACK');
    record.signatures.picFlightRecord = signature('PIC_FLIGHT_RECORD');

    expect(isEdbContentLocked(record)).toBe(true);
    expect(canEditEdbFlightContent(record)).toBe(false);
    expect(evaluateEdbLifecycleAction(record, 'CANCEL').reasons).toContain(
      'EDB_SIGNED_RECORD_CANNOT_BE_CANCELLED',
    );

    const correction = createCorrectionRevision({
      original: record,
      newRevisionId: 'edbrev-100-300-r2',
      correctionReason: 'Correcao de horario registrada apos assinatura',
      capturedAt: '2026-08-28T13:00:00.000Z',
    });

    expect(correction.status).toBe('DRAFT');
    expect(correction.logicalRecordId).toBe('flight-100-stage-300');
    expect(correction.revisionId).toBe('edbrev-100-300-r2');
    expect(correction.correction).toEqual({
      revision: 2,
      supersedesRevisionId: 'edbrev-100-300-r1',
      correctionReason: 'Correcao de horario registrada apos assinatura',
    });
    expect(correction.signatures.picTechnicalAcknowledgement).toEqual(
      record.signatures.picTechnicalAcknowledgement,
    );
    expect(correction.signatures.picFlightRecord).toBeNull();
    expect(correction.signatures.operatorRecord).toBeNull();
    expect(record.status).toBe('PIC_SIGNED');
    expect(record.signatures.picFlightRecord).not.toBeNull();
  });

  it('rejects final signature confirmation when proof targets another revision', () => {
    const record = completeRecord();
    record.status = 'READY_FOR_PIC_SIGNATURE';
    record.signatures.picTechnicalAcknowledgement = signature('PIC_TECHNICAL_ACK');
    record.signatures.picFlightRecord = {
      ...signature('PIC_FLIGHT_RECORD'),
      targetId: 'edbrev-other',
    };

    const decision = evaluateEdbLifecycleAction(record, 'CONFIRM_PIC_SIGNED');
    expect(decision.allowed).toBe(false);
    expect(decision.reasons).toContain('EDB_PIC_FLIGHT_SIGNATURE_TARGET_MISMATCH');
  });

  it('does not equate receipt existence with ANAC acceptance/synchronization', () => {
    const record = completeRecord();
    record.status = 'ANAC_PENDING';
    const decision = evaluateEdbLifecycleAction(record, 'CONFIRM_ANAC_SYNCED');
    expect(decision.allowed).toBe(false);
    expect(decision.to).toBeNull();
    expect(decision.reasons).toContain('EDB_ANAC_ACCEPTANCE_ADAPTER_REQUIRED');
  });
});

describe('eDB technical discrepancy workflow', () => {
  it('keeps discrepancy history append-only through deferment, correction and RTS', () => {
    const original = createTechnicalDiscrepancyCase({
      discrepancyId: 'disc-1',
      revisionId: 'edbrev-100-300-r1',
      description: 'Vibracao anormal observada pela tripulacao',
      detectedBy: pic,
      detectedAt: '2026-08-28T10:50:00.000Z',
      createdAt: '2026-08-28T11:00:00.000Z',
    });
    expect(getTechnicalDiscrepancyStatus(original)).toBe('OPEN');

    const deferred = appendDeferredActionAuthorization(original, {
      actionId: 'maint-1',
      reason: 'Acao corretiva retardada conforme documento aplicavel',
      limitationOrControl: 'Operacao condicionada ao controle registrado',
      authorizedBy: mechanic,
      authorizedAt: '2026-08-28T11:30:00.000Z',
      reference: 'DOC-DEF-001',
    });
    expect(getTechnicalDiscrepancyStatus(deferred)).toBe('DEFERRED_ACTION_AUTHORIZED');
    expect(original.maintenanceActions).toHaveLength(0);

    const corrected = appendCorrectiveAction(deferred, {
      actionId: 'maint-2',
      description: 'Acao corretiva executada',
      performedBy: mechanic,
      performedAt: '2026-08-29T09:00:00.000Z',
      reference: 'OS-123',
    });
    expect(getTechnicalDiscrepancyStatus(corrected)).toBe('CORRECTIVE_ACTION_RECORDED');
    expect(corrected.maintenanceActions).toHaveLength(2);

    const released = appendReturnToServiceApproval(corrected, {
      approvalId: 'rts-1',
      correctiveActionId: 'maint-2',
      description: 'Aprovacao para retorno ao servico registrada pelo responsavel',
      approvedBy: mechanic,
      approvedAt: '2026-08-29T09:15:00.000Z',
      reference: 'RTS-123',
    });
    expect(getTechnicalDiscrepancyStatus(released)).toBe('RETURN_TO_SERVICE_RECORDED');
    expect(isTechnicalDiscrepancyClosedForReturnToService(released)).toBe(true);
    expect(released.maintenanceActions).toHaveLength(2);
    expect(released.returnToServiceApprovals[0].description).toContain('retorno ao servico');
  });

  it('rejects an RTS approval that does not reference a recorded corrective action', () => {
    const discrepancy = createTechnicalDiscrepancyCase({
      discrepancyId: 'disc-2',
      revisionId: 'edbrev-100-300-r1',
      description: 'Discrepancia de teste',
      detectedBy: pic,
      detectedAt: '2026-08-28T10:50:00.000Z',
      createdAt: '2026-08-28T11:00:00.000Z',
    });

    expect(() =>
      appendReturnToServiceApproval(discrepancy, {
        approvalId: 'rts-orphan',
        correctiveActionId: 'missing-action',
        description: 'Tentativa de RTS sem acao corretiva',
        approvedBy: mechanic,
        approvedAt: '2026-08-28T12:00:00.000Z',
        reference: null,
      }),
    ).toThrow('existing corrective action');
  });

  it('rejects maintenance actions recorded before the discrepancy was detected', () => {
    const discrepancy = createTechnicalDiscrepancyCase({
      discrepancyId: 'disc-3',
      revisionId: 'edbrev-100-300-r1',
      description: 'Discrepancia cronologica',
      detectedBy: pic,
      detectedAt: '2026-08-28T10:50:00.000Z',
      createdAt: '2026-08-28T11:00:00.000Z',
    });

    expect(() =>
      appendCorrectiveAction(discrepancy, {
        actionId: 'maint-before',
        description: 'Acao impossivel',
        performedBy: mechanic,
        performedAt: '2026-08-28T10:40:00.000Z',
        reference: null,
      }),
    ).toThrow('cannot predate discrepancy detection');
  });
});

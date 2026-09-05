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

const pic: EdbPersonIdentity = {
  employeeId: 10,
  fullName: 'Piloto em Comando',
  anacCode: '123456',
};

function signature(type: EdbSignatureType): EdbSignatureProof {
  return {
    signatureId: `sig-${type}`,
    type,
    targetType: type === 'PIC_TECHNICAL_ACK' ? 'TECHNICAL_SITUATION' : 'FINAL_RECORD_REVISION',
    targetId: type === 'PIC_TECHNICAL_ACK' ? 'tech-1' : 'edbrev-100-300-r1',
    signer: { ...pic },
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

describe('eDB lifecycle boundary', () => {
  it('requires independent preflight technical acknowledgement before final-record readiness', () => {
    const record = completeRecord();
    const withoutAck = evaluateEdbLifecycleAction(record, 'MARK_READY_FOR_PIC_SIGNATURE');
    expect(withoutAck.allowed).toBe(false);
    expect(withoutAck.reasons).toContain('EDB_PIC_TECHNICAL_ACK_REQUIRED');

    record.signatures.picTechnicalAcknowledgement = signature('PIC_TECHNICAL_ACK');
    expect(evaluateEdbLifecycleAction(record, 'MARK_READY_FOR_PIC_SIGNATURE')).toMatchObject({
      allowed: true,
      to: 'READY_FOR_PIC_SIGNATURE',
    });
  });

  it('rejects a PIC final signature proof targeting another immutable revision', () => {
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

  it('locks signed content and requires a new correction revision instead of overwrite', () => {
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
      correctionReason: 'Correcao registrada apos assinatura',
      capturedAt: '2026-08-28T13:00:00.000Z',
    });

    expect(correction).toMatchObject({
      status: 'DRAFT',
      logicalRecordId: 'flight-100-stage-300',
      revisionId: 'edbrev-100-300-r2',
      correction: {
        revision: 2,
        supersedesRevisionId: 'edbrev-100-300-r1',
        correctionReason: 'Correcao registrada apos assinatura',
      },
    });
    expect(correction.signatures.picFlightRecord).toBeNull();
    expect(correction.signatures.operatorRecord).toBeNull();
    expect(record.status).toBe('PIC_SIGNED');
  });

  it('keeps ANAC acceptance fail-closed without an official acceptance adapter', () => {
    const record = completeRecord();
    record.status = 'ANAC_PENDING';

    const decision = evaluateEdbLifecycleAction(record, 'CONFIRM_ANAC_SYNCED');
    expect(decision).toEqual({
      allowed: false,
      from: 'ANAC_PENDING',
      to: null,
      reasons: ['EDB_ANAC_ACCEPTANCE_ADAPTER_REQUIRED'],
    });
  });
});

import { describe, expect, it } from 'vitest';
import {
  createEmptyEdbFlightRecord,
  type EdbFlightRecord,
  type EdbSignatureProof,
  type EdbSignatureType,
} from '../../services/edb/contracts';
import {
  operatorSignatureDeadlineAt,
  operatorSignatureDeadlineDays,
  validateForOperatorSignature,
  validateForPicFlightSignature,
  validateForPicTechnicalAcknowledgement,
} from '../../services/edb/regulatory-validation';

const REVISION_ID = 'edbrev-100-300-r1';

function signature(type: EdbSignatureType, signedAt = '2026-08-28T12:00:00.000Z'): EdbSignatureProof {
  return {
    signatureId: `sig-${type}`,
    type,
    targetType: type === 'PIC_TECHNICAL_ACK' ? 'TECHNICAL_SITUATION' : 'FINAL_RECORD_REVISION',
    targetId: type === 'PIC_TECHNICAL_ACK' ? 'tech-1' : REVISION_ID,
    signer: {
      employeeId: 10,
      fullName: type === 'OPERATOR_RECORD' ? 'Operador Designado' : 'Piloto em Comando',
      anacCode: type === 'OPERATOR_RECORD' ? null : '123456',
    },
    signedAt,
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
    capturedAt: '2026-08-28T10:00:00.000Z',
    logicalRecordId: 'flight-100-stage-300',
    revisionId: REVISION_ID,
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
      returnToServiceApprovedBy: 'Mecanico Responsavel',
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
    crew: [{
      employeeId: 10,
      fullName: 'Piloto em Comando',
      anacCode: '123456',
      operationalRole: 'PIC',
      regulatoryFunctionCode: null,
    }],
  };
  record.signatures.picTechnicalAcknowledgement = signature('PIC_TECHNICAL_ACK');
  return record;
}

describe('eDB regulatory validation foundation', () => {
  it('accepts explicit zero values and complete data for PIC final signature', () => {
    const result = validateForPicFlightSignature(completeRecord());
    expect(result.valid).toBe(true);
    expect(result.issues.filter((issue) => issue.severity === 'BLOCKING')).toEqual([]);
  });

  it('fails closed when the preflight PIC technical acknowledgement is absent', () => {
    const record = completeRecord();
    record.signatures.picTechnicalAcknowledgement = null;
    const result = validateForPicFlightSignature(record);
    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain('EDB_PIC_TECHNICAL_ACK_REQUIRED');
  });

  it('validates aircraft and maintenance readiness independently before flight', () => {
    const record = completeRecord();
    expect(validateForPicTechnicalAcknowledgement(record).valid).toBe(true);
    record.maintenance.nextIntervention.dueAtAirframeHours = null;
    expect(validateForPicTechnicalAcknowledgement(record).issues.map((issue) => issue.code)).toContain(
      'EDB_NEXT_MAINTENANCE_HOURS_REQUIRED',
    );
  });

  it('blocks out-of-order flight chronology', () => {
    const record = completeRecord();
    record.flight.times.landingAt = '2026-08-28T09:55:00.000Z';
    const result = validateForPicFlightSignature(record);
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'EDB_FLIGHT_TIME_ORDER_INVALID', severity: 'BLOCKING' }),
    ]));
  });

  it('keeps operator signature deadline breach as a warning after valid PIC signature', () => {
    expect(operatorSignatureDeadlineDays('RBAC121')).toBe(2);
    expect(operatorSignatureDeadlineDays('RBAC135')).toBe(15);
    expect(operatorSignatureDeadlineDays('OTHER')).toBe(30);

    const pic = signature('PIC_FLIGHT_RECORD', '2026-08-01T12:00:00.000Z');
    expect(operatorSignatureDeadlineAt(pic, 'RBAC135').toISOString()).toBe('2026-08-16T12:00:00.000Z');

    const record = completeRecord();
    record.signatures.picFlightRecord = pic;
    const result = validateForOperatorSignature(record, new Date('2026-08-20T12:00:00.000Z'));
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'EDB_OPERATOR_SIGNATURE_OVERDUE', severity: 'WARNING' }),
    ]));
  });

  it('fails closed when operator signature is attempted without a PIC final signature', () => {
    const result = validateForOperatorSignature(completeRecord());
    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain('EDB_PIC_FLIGHT_SIGNATURE_REQUIRED');
  });

  it('rejects invalid PIC signature timestamps instead of synthesizing a deadline', () => {
    expect(() => operatorSignatureDeadlineAt(signature('PIC_FLIGHT_RECORD', 'not-a-date'), 'RBAC135'))
      .toThrow('Invalid PIC signature timestamp');
  });
});

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
import {
  canonicalJson,
  hashSignableEdbPayload,
} from '../../services/edb/canonicalization';
import { projectRdvToEdbShadow } from '../../services/edb/rdv-shadow-projection';

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
    crew: [
      {
        employeeId: 10,
        fullName: 'Piloto em Comando',
        anacCode: '123456',
        operationalRole: 'PIC',
        regulatoryFunctionCode: null,
      },
      {
        employeeId: 11,
        fullName: 'Segundo em Comando',
        anacCode: '654321',
        operationalRole: 'SIC',
        regulatoryFunctionCode: null,
      },
    ],
  };
  record.signatures.picTechnicalAcknowledgement = signature('PIC_TECHNICAL_ACK');
  return record;
}

describe('eDB regulatory foundation', () => {
  it('accepts explicit zero values instead of treating them as missing', () => {
    const record = completeRecord();
    const result = validateForPicFlightSignature(record);
    expect(result.valid).toBe(true);
    expect(result.issues.filter((issue) => issue.severity === 'BLOCKING')).toEqual([]);
  });

  it('requires the PIC pre-flight technical acknowledgement', () => {
    const record = completeRecord();
    record.signatures.picTechnicalAcknowledgement = null;
    const result = validateForPicFlightSignature(record);
    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain('EDB_PIC_TECHNICAL_ACK_REQUIRED');
  });

  it('validates the aircraft and maintenance snapshot independently before flight', () => {
    const record = completeRecord();
    expect(validateForPicTechnicalAcknowledgement(record).valid).toBe(true);
    record.maintenance.nextIntervention.dueAtAirframeHours = null;
    expect(validateForPicTechnicalAcknowledgement(record).issues.map((issue) => issue.code)).toContain(
      'EDB_NEXT_MAINTENANCE_HOURS_REQUIRED',
    );
  });

  it('uses the operator signature deadlines from Res. 773 art. 10', () => {
    expect(operatorSignatureDeadlineDays('RBAC121')).toBe(2);
    expect(operatorSignatureDeadlineDays('RBAC135')).toBe(15);
    expect(operatorSignatureDeadlineDays('OTHER')).toBe(30);

    const pic = signature('PIC_FLIGHT_RECORD', '2026-08-01T12:00:00.000Z');
    expect(operatorSignatureDeadlineAt(pic, 'RBAC135').toISOString()).toBe(
      '2026-08-16T12:00:00.000Z',
    );
  });

  it('allows a late operator signature but reports the regulatory deadline breach', () => {
    const record = completeRecord();
    record.signatures.picFlightRecord = signature('PIC_FLIGHT_RECORD', '2026-08-01T12:00:00.000Z');
    const result = validateForOperatorSignature(record, new Date('2026-08-20T12:00:00.000Z'));
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'EDB_OPERATOR_SIGNATURE_OVERDUE', severity: 'WARNING' }),
      ]),
    );
  });

  it('canonicalizes JSON deterministically and hashes logical + immutable revision identity', async () => {
    expect(canonicalJson({ z: 1, nested: { b: 2, a: 1 }, a: 3 })).toBe(
      '{"a":3,"nested":{"a":1,"b":2},"z":1}',
    );
    const record = completeRecord();
    const first = await hashSignableEdbPayload(record, 'PIC_FLIGHT_RECORD');
    const second = await hashSignableEdbPayload(record, 'PIC_FLIGHT_RECORD');
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(second).toBe(first);

    record.revisionId = 'edbrev-100-300-r2';
    expect(await hashSignableEdbPayload(record, 'PIC_FLIGHT_RECORD')).not.toBe(first);
  });

  it('keeps ambiguous RDV fields out of the regulatory record', () => {
    const projection = projectRdvToEdbShadow({
      operatorCompanyId: 1,
      operatorRegulation: 'RBAC135',
      flightId: 100,
      rdvId: 200,
      rdvVersion: 3,
      date: '2026-08-28',
      nature: 'TRANSPORTE',
      occurrences: '',
      divergences: 'Divergencia operacional qualquer',
      aircraft: completeRecord().identity.aircraft,
      maintenance: completeRecord().maintenance,
      capturedAt: '2026-08-28T12:00:00.000Z',
      stages: [
        {
          stageId: 300,
          origin: 'SBJR',
          destination: 'SSXX',
          engineStartAt: '2026-08-28T10:00:00.000Z',
          takeoffAt: '2026-08-28T10:05:00.000Z',
          landingAt: '2026-08-28T10:55:00.000Z',
          engineShutdownAt: '2026-08-28T11:00:00.000Z',
          totalMinutes: 50,
          nightMinutes: 0,
          landingsDay: 1,
          landingsNight: 0,
          starts: 2,
          ifrUnclassifiedMinutes: 20,
          fuelAtStageStart: 900,
          passengers: 6,
          payloadKg: 120,
          crew: completeRecord().flight.crew,
        },
      ],
    });

    expect(projection.records).toHaveLength(1);
    const flight = projection.records[0].flight;
    expect(flight.landingsTotal).toBe(1);
    expect(flight.cycles).toBeNull();
    expect(flight.duration.dayMinutes).toBeNull();
    expect(flight.duration.ifrActualMinutes).toBeNull();
    expect(flight.duration.ifrSimulatedMinutes).toBeNull();
    expect(flight.fuelBeforeEngineStart).toBeNull();
    expect(flight.personsOnBoard).toBeNull();
    expect(flight.cargoKg).toBeNull();
    expect(flight.technicalDiscrepancies).toBeNull();

    const gapCodes = projection.gaps.map((gap) => gap.code);
    expect(gapCodes).toEqual(
      expect.arrayContaining([
        'CYCLES_NOT_MAPPED_FROM_STARTS',
        'DAY_TIME_NOT_AVAILABLE',
        'IFR_SPLIT_REQUIRED',
        'FUEL_PRESTART_SEMANTICS_UNCONFIRMED',
        'POB_SEMANTICS_UNCONFIRMED',
        'CARGO_SEMANTICS_UNCONFIRMED',
        'TECH_DISCREPANCY_NOT_MAPPED_FROM_DIVERGENCES',
      ]),
    );
  });

  it('does not distribute one RDV occurrence across multiple stages', () => {
    const baseStage = {
      origin: 'SBJR',
      destination: 'SSXX',
      engineStartAt: null,
      takeoffAt: null,
      landingAt: null,
      engineShutdownAt: null,
      totalMinutes: null,
      nightMinutes: null,
      landingsDay: null,
      landingsNight: null,
      starts: null,
      ifrUnclassifiedMinutes: null,
      fuelAtStageStart: null,
      passengers: null,
      payloadKg: null,
      crew: completeRecord().flight.crew,
    };
    const projection = projectRdvToEdbShadow({
      operatorCompanyId: 1,
      operatorRegulation: 'RBAC135',
      flightId: 100,
      rdvId: 200,
      rdvVersion: 3,
      date: '2026-08-28',
      nature: 'TRANSPORTE',
      occurrences: 'Ocorrencia geral do RDV',
      divergences: null,
      aircraft: completeRecord().identity.aircraft,
      maintenance: completeRecord().maintenance,
      capturedAt: '2026-08-28T12:00:00.000Z',
      stages: [
        { ...baseStage, stageId: 1 },
        { ...baseStage, stageId: 2, origin: 'SSXX', destination: 'SBJR' },
      ],
    });
    expect(projection.records.every((record) => record.flight.occurrences === null)).toBe(true);
    expect(projection.gaps.map((gap) => gap.code)).toContain('OCCURRENCES_STAGE_SCOPE_UNCONFIRMED');
  });
});

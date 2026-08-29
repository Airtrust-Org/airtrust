import { describe, expect, it } from 'vitest';
import { hashSignableEdbPayload } from '../../services/edb/canonicalization';
import {
  createEmptyEdbFlightRecord,
  type EdbFlightRecord,
  type EdbSignatureProof,
  type EdbSignatureType,
} from '../../services/edb/contracts';
import { assessEdbRegulatoryReadiness } from '../../services/edb/regulatory-readiness';

function proof(type: EdbSignatureType, hash: string, signedAt: string): EdbSignatureProof {
  return {
    signatureId: `sig-${type}`,
    type,
    signer: {
      employeeId: 10,
      fullName: type === 'OPERATOR_RECORD' ? 'Operador Designado' : 'Piloto em Comando',
      anacCode: type === 'OPERATOR_RECORD' ? null : '123456',
    },
    signedAt,
    canonicalPayloadHashSha256: hash,
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
    sourceRdvVersion: 1,
    sourceStageId: 300,
    capturedAt: '2026-08-28T10:00:00.000Z',
  });
  record.recordId = 'edb-1-r1';
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
        employeeId: 10,
        fullName: 'Piloto em Comando',
        anacCode: '123456',
        operationalRole: 'PIC',
        regulatoryFunctionCode: null,
      },
    ],
  };
  return record;
}

async function operatorSignedRecord(): Promise<EdbFlightRecord> {
  const record = completeRecord();
  const technicalHash = await hashSignableEdbPayload(record, 'PIC_TECHNICAL_ACK');
  record.signatures.picTechnicalAcknowledgement = proof(
    'PIC_TECHNICAL_ACK',
    technicalHash,
    '2026-08-28T09:55:00.000Z',
  );

  const picHash = await hashSignableEdbPayload(record, 'PIC_FLIGHT_RECORD');
  record.signatures.picFlightRecord = proof(
    'PIC_FLIGHT_RECORD',
    picHash,
    '2026-08-28T11:05:00.000Z',
  );

  const operatorHash = await hashSignableEdbPayload(record, 'OPERATOR_RECORD');
  record.signatures.operatorRecord = proof(
    'OPERATOR_RECORD',
    operatorHash,
    '2026-08-28T12:00:00.000Z',
  );
  record.status = 'OPERATOR_SIGNED';
  return record;
}

describe('eDB regulatory readiness', () => {
  it('shows the technical snapshot as the first action for an empty draft', async () => {
    const record = createEmptyEdbFlightRecord({
      operatorCompanyId: 1,
      operatorRegulation: 'RBAC135',
      sourceFlightId: 100,
      capturedAt: '2026-08-28T10:00:00.000Z',
    });
    const readiness = await assessEdbRegulatoryReadiness(record, new Date('2026-08-28T12:00:00.000Z'));
    expect(readiness.readyForAnacQueue).toBe(false);
    expect(readiness.nextAction).toBe('TECHNICAL_SNAPSHOT');
    expect(readiness.steps.find((step) => step.id === 'PIC_TECHNICAL_ACK')?.status).toBe('BLOCKED');
  });

  it('becomes ready for the future ANAC queue only after valid operator signature and lifecycle state', async () => {
    const record = await operatorSignedRecord();
    const readiness = await assessEdbRegulatoryReadiness(record, new Date('2026-08-28T12:01:00.000Z'));
    expect(readiness.steps.find((step) => step.id === 'OPERATOR_SIGNATURE')?.status).toBe('COMPLETE');
    expect(readiness.steps.find((step) => step.id === 'ANAC_SYNC')?.status).toBe('ACTION_REQUIRED');
    expect(readiness.readyForAnacQueue).toBe(true);
    expect(readiness.nextAction).toBe('ANAC_SYNC');
  });

  it('fails closed when signed flight data changes after the signatures were stored', async () => {
    const record = await operatorSignedRecord();
    record.flight.personsOnBoard = 9;
    const readiness = await assessEdbRegulatoryReadiness(record, new Date('2026-08-28T12:01:00.000Z'));
    expect(readiness.readyForAnacQueue).toBe(false);
    expect(readiness.steps.find((step) => step.id === 'PIC_FLIGHT_SIGNATURE')?.status).toBe('ACTION_REQUIRED');
    expect(readiness.steps.find((step) => step.id === 'OPERATOR_SIGNATURE')?.status).toBe('ACTION_REQUIRED');
  });
});

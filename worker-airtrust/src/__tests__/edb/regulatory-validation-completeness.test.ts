import { describe, expect, it } from 'vitest';
import {
  createEmptyEdbFlightRecord,
  type EdbFlightRecord,
  type EdbSignatureProof,
} from '../../services/edb/contracts';
import { validateForPicFlightSignature } from '../../services/edb/regulatory-validation';

const REVISION_ID = 'edbrev-qa-completeness-r1';

function technicalAck(): EdbSignatureProof {
  return {
    signatureId: 'sig-PIC_TECHNICAL_ACK',
    type: 'PIC_TECHNICAL_ACK',
    targetType: 'TECHNICAL_SITUATION',
    targetId: 'tech-qa-1',
    signer: {
      employeeId: 10,
      fullName: 'Piloto em Comando',
      anacCode: '123456',
    },
    signedAt: '2026-09-05T10:00:00.000Z',
    canonicalPayloadHashSha256: 'a'.repeat(64),
    method: 'ASYMMETRIC_DIGITAL_SIGNATURE',
    proofReference: 'proof/PIC_TECHNICAL_ACK',
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
    capturedAt: '2026-09-05T10:00:00.000Z',
    logicalRecordId: 'flight-100-stage-300',
    revisionId: REVISION_ID,
  });

  record.identity.aircraft = {
    aircraftId: 12,
    manufacturer: 'Leonardo',
    model: 'AW139',
    serialNumber: 'SN-QA-001',
    registrationMarks: 'PR-QAA',
    owners: ['Empresa Proprietaria'],
    operators: ['Empresa Operadora'],
  };
  record.maintenance = {
    lastIntervention: {
      type: 'Inspecao programada',
      date: '2026-09-01',
      returnToServiceApprovedBy: 'Mecanico Responsavel',
    },
    nextIntervention: {
      type: 'Inspecao 50h',
      dueAtAirframeHours: 1520,
    },
  };
  record.flight = {
    date: '2026-09-05',
    origin: 'SBJR',
    destination: 'SSXX',
    times: {
      engineStartAt: '2026-09-05T10:00:00.000Z',
      takeoffAt: '2026-09-05T10:05:00.000Z',
      landingAt: '2026-09-05T10:55:00.000Z',
      engineShutdownAt: '2026-09-05T11:00:00.000Z',
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
  record.signatures.picTechnicalAcknowledgement = technicalAck();
  return record;
}

type MutationCase = {
  name: string;
  code: string;
  mutate: (record: EdbFlightRecord) => void;
};

const blockingCases: MutationCase[] = [
  { name: 'aircraft manufacturer', code: 'EDB_AIRCRAFT_MANUFACTURER_REQUIRED', mutate: (r) => { r.identity.aircraft.manufacturer = '   '; } },
  { name: 'aircraft model', code: 'EDB_AIRCRAFT_MODEL_REQUIRED', mutate: (r) => { r.identity.aircraft.model = ''; } },
  { name: 'aircraft serial number', code: 'EDB_AIRCRAFT_SERIAL_REQUIRED', mutate: (r) => { r.identity.aircraft.serialNumber = ''; } },
  { name: 'aircraft registration marks', code: 'EDB_AIRCRAFT_MARKS_REQUIRED', mutate: (r) => { r.identity.aircraft.registrationMarks = ''; } },
  { name: 'aircraft owner', code: 'EDB_AIRCRAFT_OWNER_REQUIRED', mutate: (r) => { r.identity.aircraft.owners = []; } },
  { name: 'aircraft operator', code: 'EDB_AIRCRAFT_OPERATOR_REQUIRED', mutate: (r) => { r.identity.aircraft.operators = []; } },
  { name: 'last maintenance type', code: 'EDB_LAST_MAINTENANCE_TYPE_REQUIRED', mutate: (r) => { r.maintenance.lastIntervention.type = ''; } },
  { name: 'last maintenance date', code: 'EDB_LAST_MAINTENANCE_DATE_REQUIRED', mutate: (r) => { r.maintenance.lastIntervention.date = ''; } },
  { name: 'last maintenance RTS approver', code: 'EDB_LAST_MAINTENANCE_RTS_REQUIRED', mutate: (r) => { r.maintenance.lastIntervention.returnToServiceApprovedBy = ''; } },
  { name: 'next maintenance type', code: 'EDB_NEXT_MAINTENANCE_TYPE_REQUIRED', mutate: (r) => { r.maintenance.nextIntervention.type = ''; } },
  { name: 'next maintenance hours', code: 'EDB_NEXT_MAINTENANCE_HOURS_REQUIRED', mutate: (r) => { r.maintenance.nextIntervention.dueAtAirframeHours = null; } },
  { name: 'crew', code: 'EDB_CREW_REQUIRED', mutate: (r) => { r.flight.crew = []; } },
  { name: 'PIC role', code: 'EDB_PIC_REQUIRED', mutate: (r) => { r.flight.crew[0].operationalRole = 'SIC'; } },
  { name: 'crew full name', code: 'EDB_CREW_NAME_REQUIRED', mutate: (r) => { r.flight.crew[0].fullName = ''; } },
  { name: 'flight date', code: 'EDB_DATE_REQUIRED', mutate: (r) => { r.flight.date = ''; } },
  { name: 'origin', code: 'EDB_ORIGIN_REQUIRED', mutate: (r) => { r.flight.origin = ''; } },
  { name: 'destination', code: 'EDB_DESTINATION_REQUIRED', mutate: (r) => { r.flight.destination = ''; } },
  { name: 'engine start', code: 'EDB_ENGINE_START_REQUIRED', mutate: (r) => { r.flight.times.engineStartAt = ''; } },
  { name: 'takeoff', code: 'EDB_TAKEOFF_REQUIRED', mutate: (r) => { r.flight.times.takeoffAt = ''; } },
  { name: 'landing', code: 'EDB_LANDING_REQUIRED', mutate: (r) => { r.flight.times.landingAt = ''; } },
  { name: 'engine shutdown', code: 'EDB_ENGINE_SHUTDOWN_REQUIRED', mutate: (r) => { r.flight.times.engineShutdownAt = ''; } },
  { name: 'landings', code: 'EDB_LANDINGS_REQUIRED', mutate: (r) => { r.flight.landingsTotal = null; } },
  { name: 'cycles', code: 'EDB_CYCLES_REQUIRED', mutate: (r) => { r.flight.cycles = null; } },
  { name: 'day time', code: 'EDB_DAY_TIME_REQUIRED', mutate: (r) => { r.flight.duration.dayMinutes = null; } },
  { name: 'night time', code: 'EDB_NIGHT_TIME_REQUIRED', mutate: (r) => { r.flight.duration.nightMinutes = null; } },
  { name: 'total time', code: 'EDB_TOTAL_TIME_REQUIRED', mutate: (r) => { r.flight.duration.totalMinutes = null; } },
  { name: 'IFR actual', code: 'EDB_IFR_ACTUAL_REQUIRED', mutate: (r) => { r.flight.duration.ifrActualMinutes = null; } },
  { name: 'IFR simulated', code: 'EDB_IFR_SIMULATED_REQUIRED', mutate: (r) => { r.flight.duration.ifrSimulatedMinutes = null; } },
  { name: 'fuel before start', code: 'EDB_FUEL_PRESTART_REQUIRED', mutate: (r) => { r.flight.fuelBeforeEngineStart = null; } },
  { name: 'persons on board', code: 'EDB_POB_REQUIRED', mutate: (r) => { r.flight.personsOnBoard = null; } },
  { name: 'cargo', code: 'EDB_CARGO_REQUIRED', mutate: (r) => { r.flight.cargoKg = null; } },
  { name: 'nature', code: 'EDB_NATURE_REQUIRED', mutate: (r) => { r.flight.nature = ''; } },
  { name: 'occurrences recording', code: 'EDB_OCCURRENCES_NOT_RECORDED', mutate: (r) => { r.flight.occurrences = null; } },
  { name: 'technical discrepancies recording', code: 'EDB_TECH_DISCREPANCIES_NOT_RECORDED', mutate: (r) => { r.flight.technicalDiscrepancies = null; } },
  {
    name: 'technical discrepancy description',
    code: 'EDB_TECH_DISCREPANCY_DESCRIPTION_REQUIRED',
    mutate: (r) => {
      r.flight.technicalDiscrepancies = [{
        description: '',
        detectedBy: { employeeId: 10, fullName: 'Piloto em Comando', anacCode: '123456' },
      }];
    },
  },
  {
    name: 'technical discrepancy detector',
    code: 'EDB_TECH_DISCREPANCY_DETECTOR_REQUIRED',
    mutate: (r) => {
      r.flight.technicalDiscrepancies = [{
        description: 'Indicacao anormal',
        detectedBy: { employeeId: 10, fullName: '', anacCode: '123456' },
      }];
    },
  },
];

describe('eDB regulatory completeness fail-closed matrix', () => {
  it.each(blockingCases)('blocks missing $name', ({ mutate, code }) => {
    const record = completeRecord();
    mutate(record);

    const result = validateForPicFlightSignature(record);

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code, severity: 'BLOCKING' }),
    ]));
  });

  it('preserves explicit zero values as recorded evidence rather than treating them as missing', () => {
    const record = completeRecord();
    record.flight.landingsTotal = 0;
    record.flight.cycles = 0;
    record.flight.duration.dayMinutes = 0;
    record.flight.duration.nightMinutes = 0;
    record.flight.duration.totalMinutes = 0;
    record.flight.duration.ifrActualMinutes = 0;
    record.flight.duration.ifrSimulatedMinutes = 0;
    record.flight.fuelBeforeEngineStart = 0;
    record.flight.personsOnBoard = 0;
    record.flight.cargoKg = 0;

    const result = validateForPicFlightSignature(record);

    expect(result.issues.filter((issue) => issue.code.endsWith('_REQUIRED'))).toEqual([]);
  });
});

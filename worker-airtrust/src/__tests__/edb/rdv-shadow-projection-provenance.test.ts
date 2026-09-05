import { describe, expect, it } from 'vitest';
import { projectRdvToEdbShadow, type EdbRdvShadowSource } from '../../services/edb/rdv-shadow-projection';

function source(): EdbRdvShadowSource {
  return {
    operatorCompanyId: 6,
    operatorRegulation: 'RBAC135',
    flightId: 100,
    rdvId: 200,
    rdvVersion: 3,
    date: '2026-09-05',
    nature: 'TRANSPORTE',
    occurrences: null,
    divergences: null,
    aircraft: {
      aircraftId: 12,
      manufacturer: 'Leonardo',
      model: 'AW139',
      serialNumber: 'SN-001',
      registrationMarks: 'PR-ABC',
      owners: ['Empresa Proprietaria'],
      operators: ['Empresa Operadora'],
    },
    maintenance: {
      lastIntervention: {
        type: 'INSPECAO',
        date: '2026-09-01',
        returnToServiceApprovedBy: 'Mecanico Responsavel',
      },
      nextIntervention: {
        type: 'INSPECAO PROGRAMADA',
        dueAtAirframeHours: 1500,
      },
    },
    capturedAt: '2026-09-05T12:00:00.000Z',
    stages: [
      {
        stageId: 300,
        origin: 'SBJR',
        destination: 'SSXX',
        engineStartAt: '2026-09-05T10:00:00.000Z',
        takeoffAt: '2026-09-05T10:05:00.000Z',
        landingAt: '2026-09-05T10:55:00.000Z',
        engineShutdownAt: '2026-09-05T11:00:00.000Z',
        totalMinutes: 50,
        nightMinutes: 0,
        landingsDay: 1,
        landingsNight: 0,
        starts: null,
        ifrUnclassifiedMinutes: null,
        fuelAtStageStart: null,
        passengers: null,
        payloadKg: null,
        crew: [
          {
            employeeId: 10,
            fullName: 'PIC Etapa 300',
            anacCode: '123456',
            operationalRole: 'PIC',
            regulatoryFunctionCode: null,
          },
        ],
      },
      {
        stageId: 301,
        origin: 'SSXX',
        destination: 'SBJR',
        engineStartAt: '2026-09-05T11:30:00.000Z',
        takeoffAt: '2026-09-05T11:35:00.000Z',
        landingAt: '2026-09-05T12:20:00.000Z',
        engineShutdownAt: '2026-09-05T12:25:00.000Z',
        totalMinutes: 45,
        nightMinutes: 0,
        landingsDay: 0,
        landingsNight: 0,
        starts: null,
        ifrUnclassifiedMinutes: null,
        fuelAtStageStart: null,
        passengers: null,
        payloadKg: null,
        crew: [
          {
            employeeId: 11,
            fullName: 'PIC Etapa 301',
            anacCode: '654321',
            operationalRole: 'PIC',
            regulatoryFunctionCode: null,
          },
        ],
      },
    ],
  };
}

describe('RDV shadow projection provenance isolation', () => {
  it('binds every projected record to the exact tenant, RDV version and stage source', () => {
    const projection = projectRdvToEdbShadow(source());

    expect(projection.records).toHaveLength(2);
    expect(projection.records.map((record) => record.source)).toEqual([
      {
        sourceSystem: 'AIRTRUST',
        sourceType: 'CONTROLE_VOOS_RDV',
        sourceFlightId: 100,
        sourceRdvId: 200,
        sourceRdvVersion: 3,
        sourceStageId: 300,
        capturedAt: '2026-09-05T12:00:00.000Z',
      },
      {
        sourceSystem: 'AIRTRUST',
        sourceType: 'CONTROLE_VOOS_RDV',
        sourceFlightId: 100,
        sourceRdvId: 200,
        sourceRdvVersion: 3,
        sourceStageId: 301,
        capturedAt: '2026-09-05T12:00:00.000Z',
      },
    ]);
    expect(projection.records.every((record) => record.identity.operatorCompanyId === 6)).toBe(true);
  });

  it('keeps stage-specific flight and crew evidence isolated between projected records', () => {
    const projection = projectRdvToEdbShadow(source());
    const [first, second] = projection.records;

    expect(first.flight.origin).toBe('SBJR');
    expect(first.flight.destination).toBe('SSXX');
    expect(first.flight.crew[0].employeeId).toBe(10);
    expect(first.flight.landingsTotal).toBe(1);

    expect(second.flight.origin).toBe('SSXX');
    expect(second.flight.destination).toBe('SBJR');
    expect(second.flight.crew[0].employeeId).toBe(11);
    expect(second.flight.landingsTotal).toBe(0);
  });

  it('copies shared evidence so projected-record mutation cannot rewrite the source or sibling record', () => {
    const input = source();
    const projection = projectRdvToEdbShadow(input);
    const [first, second] = projection.records;

    first.identity.aircraft.owners?.push('Mutacao local');
    first.identity.aircraft.operators?.push('Mutacao local');
    first.maintenance.lastIntervention.type = 'ALTERADO';
    first.flight.crew[0].fullName = 'ALTERADO';

    expect(input.aircraft.owners).toEqual(['Empresa Proprietaria']);
    expect(input.aircraft.operators).toEqual(['Empresa Operadora']);
    expect(input.maintenance?.lastIntervention.type).toBe('INSPECAO');
    expect(input.stages[0].crew[0].fullName).toBe('PIC Etapa 300');

    expect(second.identity.aircraft.owners).toEqual(['Empresa Proprietaria']);
    expect(second.identity.aircraft.operators).toEqual(['Empresa Operadora']);
    expect(second.maintenance.lastIntervention.type).toBe('INSPECAO');
    expect(second.flight.crew[0].fullName).toBe('PIC Etapa 301');
  });
});

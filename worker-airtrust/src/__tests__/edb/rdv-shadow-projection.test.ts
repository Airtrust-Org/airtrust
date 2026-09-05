import { describe, expect, it } from 'vitest';
import { projectRdvToEdbShadow, type EdbRdvShadowSource } from '../../services/edb/rdv-shadow-projection';

function source(overrides: Partial<EdbRdvShadowSource> = {}): EdbRdvShadowSource {
  return {
    operatorCompanyId: 6,
    operatorRegulation: 'RBAC135',
    flightId: 100,
    rdvId: 200,
    rdvVersion: 1,
    date: '2026-09-05',
    nature: 'TRANSPORTE',
    occurrences: '',
    divergences: 'Divergencia operacional',
    aircraft: {
      aircraftId: 12,
      manufacturer: 'Leonardo',
      model: 'AW139',
      serialNumber: 'SN-001',
      registrationMarks: 'PR-ABC',
      owners: ['Empresa Proprietaria'],
      operators: ['Empresa Operadora'],
    },
    maintenance: null,
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
        starts: 2,
        ifrUnclassifiedMinutes: 20,
        fuelAtStageStart: 900,
        passengers: 6,
        payloadKg: 120,
        crew: [
          {
            employeeId: 10,
            fullName: 'Piloto em Comando',
            anacCode: '123456',
            operationalRole: 'PIC',
            regulatoryFunctionCode: null,
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe('RDV shadow projection', () => {
  it('keeps ambiguous operational values out of regulatory fields', () => {
    const projection = projectRdvToEdbShadow(source());
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

    expect(projection.gaps.map((gap) => gap.code)).toEqual(
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
    const first = source().stages[0];
    const projection = projectRdvToEdbShadow(
      source({
        occurrences: 'Ocorrencia geral do RDV',
        stages: [first, { ...first, stageId: 301, origin: 'SSXX', destination: 'SBJR' }],
      }),
    );

    expect(projection.records.every((record) => record.flight.occurrences === null)).toBe(true);
    expect(projection.gaps.map((gap) => gap.code)).toContain('OCCURRENCES_STAGE_SCOPE_UNCONFIRMED');
  });

  it('reports incomplete aircraft identity instead of inferring missing evidence', () => {
    const incomplete = source();
    incomplete.aircraft = { ...incomplete.aircraft, serialNumber: null };

    expect(projectRdvToEdbShadow(incomplete).gaps.map((gap) => gap.code)).toContain(
      'AIRCRAFT_IDENTITY_INCOMPLETE',
    );
  });
});

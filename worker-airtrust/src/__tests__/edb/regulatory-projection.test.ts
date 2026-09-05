import { describe, expect, it } from 'vitest';
import { projectRdvToEdbWithExplicitRegulatoryData } from '../../services/edb/regulatory-projection';
import type { EdbRdvShadowSource } from '../../services/edb/rdv-shadow-projection';

function source(): EdbRdvShadowSource {
  return {
    operatorCompanyId: 1,
    operatorRegulation: 'RBAC135',
    flightId: 10,
    rdvId: 20,
    rdvVersion: 3,
    date: '2026-08-28',
    nature: 'TRANSPORTE',
    occurrences: 'legacy flight-level occurrence',
    divergences: 'legacy operational divergence',
    aircraft: {
      aircraftId: 7,
      manufacturer: 'Leonardo',
      model: 'AW139',
      serialNumber: 'SN-001',
      registrationMarks: 'PR-ABC',
      owners: ['Owner'],
      operators: ['Operator'],
    },
    maintenance: {
      lastIntervention: {
        type: 'Inspection',
        date: '2026-08-20',
        returnToServiceApprovedBy: 'RTS Person',
      },
      nextIntervention: {
        type: '50h inspection',
        dueAtAirframeHours: 1520,
      },
    },
    capturedAt: '2026-08-28T12:00:00Z',
    stages: [
      {
        stageId: 30,
        origin: 'SBJR',
        destination: 'SSXX',
        engineStartAt: '2026-08-28T10:00:00Z',
        takeoffAt: '2026-08-28T10:05:00Z',
        landingAt: '2026-08-28T10:55:00Z',
        engineShutdownAt: '2026-08-28T11:00:00Z',
        totalMinutes: null,
        nightMinutes: 0,
        landingsDay: 1,
        landingsNight: 0,
        starts: 2,
        ifrUnclassifiedMinutes: 20,
        fuelAtStageStart: 900,
        passengers: 6,
        payloadKg: 100,
        crew: [
          {
            employeeId: 101,
            fullName: 'PIC Test',
            anacCode: '123456',
            operationalRole: 'PIC',
            regulatoryFunctionCode: null,
          },
        ],
      },
    ],
  };
}

describe('eDB explicit regulatory overlay', () => {
  it('resolves legacy semantic gaps only from explicitly named regulatory data', () => {
    const projection = projectRdvToEdbWithExplicitRegulatoryData({
      source: source(),
      stageOverrides: [
        {
          stageId: 30,
          data: {
            dayMinutes: 60,
            nightMinutes: 0,
            totalMinutes: 60,
            ifrActualMinutes: 20,
            ifrSimulatedMinutes: 0,
            ifrUnclassifiedMinutes: 20,
            landingsTotal: 1,
            cycles: 1,
            fuelBeforeEngineStart: 900,
            personsOnBoard: 8,
            cargoKg: 100,
            occurrences: [],
            technicalDiscrepancies: [],
          },
        },
      ],
      crewFunctionOverrides: [
        {
          stageId: 30,
          employeeId: 101,
          regulatoryFunctionCode: 'P1',
        },
      ],
    });

    const record = projection.records[0];
    expect(record.flight.duration).toEqual({
      dayMinutes: 60,
      nightMinutes: 0,
      totalMinutes: 60,
      ifrActualMinutes: 20,
      ifrSimulatedMinutes: 0,
    });
    expect(record.flight.cycles).toBe(1);
    expect(record.flight.personsOnBoard).toBe(8);
    expect(record.flight.occurrences).toEqual([]);
    expect(record.flight.technicalDiscrepancies).toEqual([]);
    expect(record.flight.crew[0].regulatoryFunctionCode).toBe('P1');

    expect(projection.gaps.map((gap) => gap.code)).not.toContain(
      'CYCLES_NOT_MAPPED_FROM_STARTS',
    );
    expect(projection.gaps.map((gap) => gap.code)).not.toContain('IFR_SPLIT_REQUIRED');
    expect(projection.gaps.map((gap) => gap.code)).not.toContain('POB_SEMANTICS_UNCONFIRMED');
    expect(projection.gaps.map((gap) => gap.code)).not.toContain(
      'TECH_DISCREPANCY_NOT_MAPPED_FROM_DIVERGENCES',
    );
  });

  it('does not resolve a gap from an override for another stage', () => {
    const projection = projectRdvToEdbWithExplicitRegulatoryData({
      source: source(),
      stageOverrides: [
        {
          stageId: 999,
          data: {
            dayMinutes: 60,
            nightMinutes: 0,
            totalMinutes: 60,
            ifrActualMinutes: 20,
            ifrSimulatedMinutes: 0,
            ifrUnclassifiedMinutes: 0,
            landingsTotal: 1,
            cycles: 1,
            fuelBeforeEngineStart: 900,
            personsOnBoard: 8,
            cargoKg: 100,
            occurrences: [],
            technicalDiscrepancies: [],
          },
        },
      ],
      crewFunctionOverrides: [
        {
          stageId: 999,
          employeeId: 101,
          regulatoryFunctionCode: 'P1',
        },
      ],
    });

    expect(projection.records[0].flight.cycles).toBeNull();
    expect(projection.records[0].flight.crew[0].regulatoryFunctionCode).toBeNull();
    expect(projection.gaps.map((gap) => gap.code)).toContain('CYCLES_NOT_MAPPED_FROM_STARTS');
    expect(projection.gaps.map((gap) => gap.code)).toContain('IFR_SPLIT_REQUIRED');
  });

  it('keeps a gap when the explicit field itself is still null', () => {
    const projection = projectRdvToEdbWithExplicitRegulatoryData({
      source: source(),
      stageOverrides: [
        {
          stageId: 30,
          data: {
            dayMinutes: null,
            nightMinutes: 0,
            totalMinutes: null,
            ifrActualMinutes: null,
            ifrSimulatedMinutes: null,
            ifrUnclassifiedMinutes: 20,
            landingsTotal: 1,
            cycles: null,
            fuelBeforeEngineStart: null,
            personsOnBoard: null,
            cargoKg: null,
            occurrences: null,
            technicalDiscrepancies: null,
          },
        },
      ],
    });

    expect(projection.gaps.map((gap) => gap.code)).toContain('DAY_TIME_NOT_AVAILABLE');
    expect(projection.gaps.map((gap) => gap.code)).toContain('IFR_SPLIT_REQUIRED');
    expect(projection.gaps.map((gap) => gap.code)).toContain('CYCLES_NOT_MAPPED_FROM_STARTS');
  });
});

import { describe, expect, it } from 'vitest';
import {
  ControlFlightProjectionError,
  projectControlFlightToEdbDraft,
  type ControlFlightDraftProjectionInput,
} from '../../services/edb/control-flight-draft-projection';

function buildInput(): ControlFlightDraftProjectionInput {
  return {
    draftId: '00000000-0000-4000-8000-000000000004',
    tenantId: 7,
    flightId: 88,
    createdAt: '2026-08-02T22:00:00-03:00',
    operationalDate: '2026-08-02',
    timezone: 'America/Sao_Paulo',
    sourceFlightReference: 'cv_voos:88',
    volumeNumber: null,
    flightNatureCode: 'TRANSPORTE',
    operator: {
      legalName: 'Synthetic Operator',
      legalIdentifier: '00000000000000',
      operatingCertificate: 'COA-SYNTHETIC',
    },
    owner: {
      legalName: 'Synthetic Owner',
      legalIdentifier: '11111111111111',
    },
    aircraft: {
      manufacturer: 'Synthetic Manufacturer',
      model: 'SYNTHETIC-MODEL',
      serialNumber: 'SERIAL-0003',
      registration: 'PR-TST',
    },
    legs: [
      {
        id: 881,
        empresa_id: 7,
        voo_id: 88,
        numero_etapa: 1,
        origem_icao: 'SBXX',
        destino_icao: 'PLAT-01',
        horario_motor_ligado: '23:30',
        horario_decolagem: '23:40',
        horario_pouso: '00:20',
        horario_motor_desligado: '00:30',
        tempo_decolagem_pouso: '00:40',
        tempo_total: '01:00',
        tempo_ifr: '00:20',
        tempo_noturno: '01:00',
        pousos_diurnos: 0,
        pousos_noturnos: 1,
        starts: 1,
        pax: 6,
        payload: null,
        combustivel_inicio: 800,
        combustivel_fim: 620,
        unidade_combustivel: 'KG',
        origem_dados: 'MANUAL',
        sigvoos_importado_em: null,
      },
      {
        id: 882,
        empresa_id: 7,
        voo_id: 88,
        numero_etapa: 2,
        origem_icao: 'PLAT-01',
        destino_icao: 'SBXX',
        horario_motor_ligado: '00:50',
        horario_decolagem: '01:00',
        horario_pouso: '01:40',
        horario_motor_desligado: '01:50',
        tempo_decolagem_pouso: '00:40',
        tempo_total: '01:00',
        tempo_ifr: '00:15',
        tempo_noturno: '01:00',
        pousos_diurnos: 0,
        pousos_noturnos: 1,
        starts: 1,
        pax: 5,
        payload: null,
        combustivel_inicio: 600,
        combustivel_fim: 430,
        unidade_combustivel: 'KG',
        origem_dados: 'MANUAL',
        sigvoos_importado_em: null,
      },
    ],
    crew: [],
    technicalStatus: {
      lastMaintenanceIntervention: 'Synthetic inspection completed',
      nextMaintenanceIntervention: 'Synthetic inspection due',
      airframeHoursRemaining: 30,
      returnToServiceReference: 'RTS-SYNTHETIC-003',
      openDiscrepancyCount: 0,
      sourceReference: 'maintenance:synthetic-reference-3',
      observedAt: '2026-08-02T21:00:00-03:00',
    },
  };
}

describe('Control Flights projection rollover and RDV summaries', () => {
  it('advances the leg operational date when the ordered event timeline crosses midnight', () => {
    const result = projectControlFlightToEdbDraft(buildInput());

    expect(result.draft.legs.map((leg) => leg.operationalDate)).toEqual([
      '2026-08-02',
      '2026-08-03',
    ]);
  });

  it('projects flight-level RDV occurrence and discrepancy summaries only onto the final leg', () => {
    const input = buildInput();
    input.rdv = {
      id: 990,
      empresa_id: 7,
      voo_id: 88,
      ocorrencias: '  Synthetic operational occurrence  ',
      divergencias: 'Synthetic technical discrepancy',
      updated_at: '2026-08-03T02:00:00-03:00',
    };

    const result = projectControlFlightToEdbDraft(input);

    expect(result.draft.legs[0]).toMatchObject({
      occurrenceSummary: null,
      technicalDiscrepancySummary: null,
    });
    expect(result.draft.legs[1]).toMatchObject({
      occurrenceSummary: 'Synthetic operational occurrence',
      technicalDiscrepancySummary: null,
    });
    expect(result.fieldSources).toEqual([
      {
        path: 'legs.1.occurrenceSummary',
        source: {
          kind: 'AIRTRUST_CONTROL_FLIGHTS',
          reference: 'cv_rdv_operacional:990',
          observedAt: '2026-08-03T02:00:00-03:00',
        },
      },
    ]);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        {
          code: 'TECHNICAL_DISCREPANCY_SOURCE_REQUIRED',
          path: 'legs.*.technicalDiscrepancySummary',
        },
        { code: 'CYCLES_SEMANTICS_UNCONFIRMED', path: 'legs.*.cycles' },
        {
          code: 'IFR_CLASSIFICATION_REQUIRED',
          path: 'legs.*.times.ifrActualMinutes',
        },
      ]),
    );
  });

  it('rejects an RDV row from another tenant or flight', () => {
    const tenantMismatch = buildInput();
    tenantMismatch.rdv = {
      id: 991,
      empresa_id: 8,
      voo_id: 88,
      ocorrencias: null,
      divergencias: null,
      updated_at: null,
    };

    expect(() => projectControlFlightToEdbDraft(tenantMismatch)).toThrowError(
      new ControlFlightProjectionError('TENANT_MISMATCH'),
    );

    const flightMismatch = buildInput();
    flightMismatch.rdv = {
      id: 992,
      empresa_id: 7,
      voo_id: 89,
      ocorrencias: null,
      divergencias: null,
      updated_at: null,
    };

    expect(() => projectControlFlightToEdbDraft(flightMismatch)).toThrowError(
      new ControlFlightProjectionError('FLIGHT_MISMATCH'),
    );
  });

  it('reports RDV text that cannot fit the shadow contract instead of truncating it', () => {
    const input = buildInput();
    input.rdv = {
      id: 993,
      empresa_id: 7,
      voo_id: 88,
      ocorrencias: 'x'.repeat(4001),
      divergencias: null,
      updated_at: null,
    };

    const result = projectControlFlightToEdbDraft(input);

    expect(result.draft.legs[1].occurrenceSummary).toBeNull();
    expect(result.findings).toContainEqual({
      code: 'RDV_TEXT_TOO_LONG',
      path: 'rdv.ocorrencias',
    });
  });

  it('reports an RDV summary that cannot be associated because no leg was provided', () => {
    const input = buildInput();
    input.legs = [];
    input.rdv = {
      id: 994,
      empresa_id: 7,
      voo_id: 88,
      ocorrencias: 'Synthetic occurrence without a leg',
      divergencias: null,
      updated_at: null,
    };

    const result = projectControlFlightToEdbDraft(input);

    expect(result.draft.legs).toEqual([]);
    expect(result.findings).toContainEqual({
      code: 'RDV_SUMMARY_WITHOUT_LEG',
      path: 'rdv',
    });
  });
});

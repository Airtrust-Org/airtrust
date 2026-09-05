import { describe, expect, it } from 'vitest';
import {
  ControlFlightProjectionError,
  projectControlFlightToEdbDraft,
  type ControlFlightDraftProjectionInput,
} from '../../services/edb/control-flight-draft-projection';

function buildProjectionInput(): ControlFlightDraftProjectionInput {
  return {
    draftId: '00000000-0000-4000-8000-000000000002',
    tenantId: 7,
    flightId: 42,
    createdAt: '2026-08-02T03:00:00-03:00',
    operationalDate: '2026-08-02',
    timezone: 'America/Sao_Paulo',
    sourceFlightReference: 'cv_voos:42',
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
      serialNumber: 'SERIAL-0001',
      registration: 'PR-TST',
    },
    legs: [
      {
        id: 102,
        empresa_id: 7,
        voo_id: 42,
        numero_etapa: 2,
        origem_icao: 'plat-01',
        destino_icao: 'sbxx',
        horario_motor_ligado: '09:30',
        horario_decolagem: '09:40',
        horario_pouso: '10:25',
        horario_motor_desligado: '10:35',
        tempo_decolagem_pouso: '00:45',
        tempo_total: '01:05',
        tempo_ifr: '00:25',
        tempo_noturno: '00:00',
        pousos_diurnos: 1,
        pousos_noturnos: 0,
        starts: 1,
        pax: 7,
        payload: null,
        combustivel_inicio: 600,
        combustivel_fim: 410,
        unidade_combustivel: 'KG',
        origem_dados: 'SIGVOOS',
        sigvoos_importado_em: '2026-08-02T02:30:00-03:00',
      },
      {
        id: 101,
        empresa_id: 7,
        voo_id: 42,
        numero_etapa: 1,
        origem_icao: 'sbxx',
        destino_icao: 'plat-01',
        horario_motor_ligado: '08:00',
        horario_decolagem: '08:10',
        horario_pouso: '09:00',
        horario_motor_desligado: '09:10',
        tempo_decolagem_pouso: '00:50',
        tempo_total: '01:10',
        tempo_ifr: '00:30',
        tempo_noturno: '00:00',
        pousos_diurnos: 1,
        pousos_noturnos: 0,
        starts: 1,
        pax: 8,
        payload: null,
        combustivel_inicio: 850,
        combustivel_fim: 610,
        unidade_combustivel: 'KG',
        origem_dados: 'MANUAL',
        sigvoos_importado_em: null,
      },
    ],
    crew: [
      {
        id: 201,
        empresa_id: 7,
        voo_id: 42,
        etapa_id: 101,
        funcionario_id: 10,
        nome: 'Synthetic PIC',
        canac: '123456',
        funcao: 'PIC',
        horario_apresentacao: '07:20',
        base_contratual: 'SBXX',
        funcao_origem: 'MANUAL',
      },
      {
        id: 202,
        empresa_id: 7,
        voo_id: 42,
        etapa_id: 101,
        funcionario_id: 11,
        nome: 'Synthetic SIC',
        canac: '654321',
        funcao: 'SIC',
        horario_apresentacao: '07:20',
        base_contratual: 'SBXX',
        funcao_origem: 'SIGVOOS',
      },
      {
        id: 203,
        empresa_id: 7,
        voo_id: 42,
        etapa_id: 102,
        funcionario_id: 12,
        nome: 'Synthetic Cabin Crew',
        canac: '111111',
        funcao: 'COM',
        horario_apresentacao: '07:20',
        base_contratual: 'SBXX',
        funcao_origem: 'SIGVOOS',
      },
      {
        id: 204,
        empresa_id: 7,
        voo_id: 42,
        etapa_id: 102,
        funcionario_id: 13,
        nome: 'Synthetic Mechanic',
        canac: '222222',
        funcao: 'MEC',
        horario_apresentacao: '07:20',
        base_contratual: 'SBXX',
        funcao_origem: 'MANUAL',
      },
    ],
    technicalStatus: {
      lastMaintenanceIntervention: 'Synthetic inspection completed',
      nextMaintenanceIntervention: 'Synthetic inspection due',
      airframeHoursRemaining: 42.5,
      returnToServiceReference: 'RTS-SYNTHETIC-001',
      openDiscrepancyCount: 0,
      sourceReference: 'maintenance:synthetic-reference',
      observedAt: '2026-08-02T01:00:00-03:00',
    },
  };
}

describe('Control Flights to eDB shadow draft projection', () => {
  it('sorts legs and maps operational values without making regulatory assumptions', () => {
    const result = projectControlFlightToEdbDraft(buildProjectionInput());

    expect(result.draft.status).toBe('shadow_draft');
    expect(result.draft.legs.map((leg) => leg.sequence)).toEqual([1, 2]);
    expect(result.draft.legs[0]).toMatchObject({
      origin: 'SBXX',
      destination: 'PLAT-01',
      times: {
        blockMinutes: 70,
        takeoffToLandingMinutes: 50,
        dayMinutes: null,
        nightMinutes: 0,
        vfrMinutes: null,
        ifrActualMinutes: null,
        ifrSimulatedMinutes: null,
      },
      fuelConsumed: {
        value: 240,
        unit: 'KG',
      },
      payloadUnit: null,
      cycles: null,
    });
    expect(result.draft.legs[0].crew.map((member) => member.function)).toEqual(['P1', 'P2']);
    expect(result.draft.legs[1].crew.map((member) => member.function)).toEqual(['C', 'M']);
    expect(result.draft.legs[1].source.kind).toBe('SIGVOOS');
    expect(result.findings).toEqual(
      expect.arrayContaining([
        { code: 'CYCLES_SEMANTICS_UNCONFIRMED', path: 'legs.*.cycles' },
        {
          code: 'IFR_CLASSIFICATION_REQUIRED',
          path: 'legs.*.times.ifrActualMinutes',
        },
      ]),
    );
  });

  it('keeps unscoped crew out of every leg and reports the missing association', () => {
    const input = buildProjectionInput();
    input.crew[0].etapa_id = null;

    const result = projectControlFlightToEdbDraft(input);

    expect(result.draft.legs[0].crew.map((member) => member.personReference)).not.toContain(
      'funcionarios:10',
    );
    expect(result.findings).toContainEqual({
      code: 'CREW_WITHOUT_LEG',
      path: 'crew.0.etapa_id',
    });
  });

  it('keeps crew linked to an absent leg out and reports the original source path', () => {
    const input = buildProjectionInput();
    input.crew[2].etapa_id = 999;

    const result = projectControlFlightToEdbDraft(input);
    const projectedCrew = result.draft.legs.flatMap((leg) => leg.crew);

    expect(projectedCrew.map((member) => member.personReference)).not.toContain('funcionarios:12');
    expect(result.findings).toContainEqual({
      code: 'CREW_LEG_NOT_FOUND',
      path: 'crew.2.etapa_id',
    });
  });

  it('does not invent fuel or payload units and reports both gaps', () => {
    const input = buildProjectionInput();
    input.legs[0].unidade_combustivel = 'GAL';
    input.legs[0].payload = 100;

    const result = projectControlFlightToEdbDraft(input);
    const leg = result.draft.legs.find((candidate) => candidate.sequence === 2);

    expect(leg?.fuelAtEngineStart.unit).toBeNull();
    expect(leg?.payloadUnit).toBeNull();
    expect(result.findings).toEqual(
      expect.arrayContaining([
        {
          code: 'FUEL_UNIT_UNKNOWN',
          path: 'legs.1.fuelAtEngineStart.unit',
        },
        {
          code: 'PAYLOAD_UNIT_UNKNOWN',
          path: 'legs.1.payloadUnit',
        },
      ]),
    );
  });

  it('rejects source rows from another tenant', () => {
    const input = buildProjectionInput();
    input.legs[0].empresa_id = 8;

    expect(() => projectControlFlightToEdbDraft(input)).toThrowError(
      new ControlFlightProjectionError('TENANT_MISMATCH'),
    );
  });

  it('rejects source rows from another flight', () => {
    const input = buildProjectionInput();
    input.crew[0].voo_id = 99;

    expect(() => projectControlFlightToEdbDraft(input)).toThrowError(
      new ControlFlightProjectionError('FLIGHT_MISMATCH'),
    );
  });

  it('reports invalid durations and leaves the projected value null', () => {
    const input = buildProjectionInput();
    input.legs[1].tempo_total = '1h10';

    const result = projectControlFlightToEdbDraft(input);

    expect(result.draft.legs[0].times.blockMinutes).toBeNull();
    expect(result.findings).toContainEqual({
      code: 'DURATION_INVALID',
      path: 'legs.0.times.blockMinutes',
    });
  });

  it('reports impossible fuel consumption instead of producing a negative value', () => {
    const input = buildProjectionInput();
    input.legs[1].combustivel_inicio = 500;
    input.legs[1].combustivel_fim = 600;

    const result = projectControlFlightToEdbDraft(input);

    expect(result.draft.legs[0].fuelConsumed.value).toBeNull();
    expect(result.findings).toContainEqual({
      code: 'FUEL_CONSUMPTION_UNAVAILABLE',
      path: 'legs.0.fuelConsumed.value',
    });
  });

  it('deep-clones the projected draft from later source mutations', () => {
    const input = buildProjectionInput();
    const result = projectControlFlightToEdbDraft(input);

    input.legs[1].origem_icao = 'ZZZZ';
    input.crew[0].nome = 'Changed later';

    expect(result.draft.legs[0].origin).toBe('SBXX');
    expect(result.draft.legs[0].crew[0].displayName).toBe('Synthetic PIC');
  });

  it('keeps unmapped roles explicit and never promotes them to a regulated function', () => {
    const input = buildProjectionInput();
    input.crew[0].funcao = 'OUTRO';

    const result = projectControlFlightToEdbDraft(input);

    expect(result.draft.legs[0].crew[0].function).toBeNull();
    expect(result.findings).toContainEqual({
      code: 'CREW_ROLE_UNMAPPED',
      path: 'legs.0.crew.0.function',
    });
  });
});

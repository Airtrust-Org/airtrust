import { describe, expect, it } from 'vitest';
import { validateEdbDraftCompleteness } from '../../services/edb/domain-contracts';
import {
  ControlFlightProjectionError,
  projectControlFlightToEdbDraft,
  type ControlFlightDraftProjectionInput,
} from '../../services/edb/control-flight-draft-projection';

function buildInput(): ControlFlightDraftProjectionInput {
  return {
    draftId: '00000000-0000-4000-8000-000000000003',
    tenantId: 7,
    flightId: 77,
    createdAt: '2026-08-02T07:50:00-03:00',
    operationalDate: '2026-08-02',
    timezone: 'America/Sao_Paulo',
    sourceFlightReference: 'cv_voos:77',
    volumeNumber: '01/PR-TST/2026',
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
      serialNumber: 'SERIAL-0002',
      registration: 'PR-TST',
    },
    legs: [
      {
        id: 701,
        empresa_id: 7,
        voo_id: 77,
        numero_etapa: 1,
        origem_icao: 'SBXX',
        destino_icao: 'PLAT-01',
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
      {
        id: 702,
        empresa_id: 7,
        voo_id: 77,
        numero_etapa: 2,
        origem_icao: 'PLAT-01',
        destino_icao: 'SBXX',
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
        sigvoos_importado_em: '2026-08-02T07:20:00-03:00',
      },
    ],
    crew: [
      {
        id: 801,
        empresa_id: 7,
        voo_id: 77,
        etapa_id: 701,
        funcionario_id: 21,
        nome: 'Synthetic PIC A',
        canac: '210001',
        funcao: 'PIC',
        horario_apresentacao: '07:20',
        base_contratual: 'SBXX',
        funcao_origem: 'MANUAL',
      },
      {
        id: 802,
        empresa_id: 7,
        voo_id: 77,
        etapa_id: 701,
        funcionario_id: 22,
        nome: 'Synthetic SIC A',
        canac: '220001',
        funcao: 'SIC',
        horario_apresentacao: '07:20',
        base_contratual: 'SBXX',
        funcao_origem: 'MANUAL',
      },
      {
        id: 803,
        empresa_id: 7,
        voo_id: 77,
        etapa_id: 702,
        funcionario_id: 23,
        nome: 'Synthetic PIC B',
        canac: '230001',
        funcao: 'PIC',
        horario_apresentacao: '09:15',
        base_contratual: 'SBXX',
        funcao_origem: 'SIGVOOS',
      },
      {
        id: 804,
        empresa_id: 7,
        voo_id: 77,
        etapa_id: 702,
        funcionario_id: 24,
        nome: 'Synthetic SIC B',
        canac: '240001',
        funcao: 'SIC',
        horario_apresentacao: '09:15',
        base_contratual: 'SBXX',
        funcao_origem: 'SIGVOOS',
      },
    ],
    technicalStatus: {
      lastMaintenanceIntervention: 'Synthetic inspection completed',
      nextMaintenanceIntervention: 'Synthetic inspection due',
      airframeHoursRemaining: 42.5,
      returnToServiceReference: 'RTS-SYNTHETIC-002',
      openDiscrepancyCount: 0,
      sourceReference: 'maintenance:synthetic-reference-2',
      observedAt: '2026-08-02T07:00:00-03:00',
    },
  };
}

describe('Control Flights projection requirements', () => {
  it('preserves a PIC change per leg instead of applying one crew to the whole flight', () => {
    const result = projectControlFlightToEdbDraft(buildInput());

    expect(result.draft.legs[0].crew).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ displayName: 'Synthetic PIC A', function: 'P1' }),
        expect.objectContaining({ displayName: 'Synthetic SIC A', function: 'P2' }),
      ]),
    );
    expect(result.draft.legs[1].crew).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ displayName: 'Synthetic PIC B', function: 'P1' }),
        expect.objectContaining({ displayName: 'Synthetic SIC B', function: 'P2' }),
      ]),
    );
    expect(result.draft.legs[0].crew.map((member) => member.displayName)).not.toContain(
      'Synthetic PIC B',
    );
  });

  it('keeps an unresolved employee as a flight-crew source reference without inventing an identity', () => {
    const input = buildInput();
    input.crew[0].funcionario_id = null;

    const result = projectControlFlightToEdbDraft(input);

    expect(result.draft.legs[0].crew[0]).toMatchObject({
      personReference: 'cv_voo_tripulantes:801',
      displayName: 'Synthetic PIC A',
      canac: '210001',
      function: 'P1',
    });
  });

  it('leaves absent locations explicit and delegates regulatory gaps to completeness validation', () => {
    const input = buildInput();
    input.legs[0].origem_icao = null;
    input.legs[0].destino_icao = null;

    const result = projectControlFlightToEdbDraft(input);
    const completeness = validateEdbDraftCompleteness(result.draft);

    expect(result.draft.legs[0].origin).toBeNull();
    expect(result.draft.legs[0].destination).toBeNull();
    expect(completeness).toEqual(
      expect.arrayContaining([
        { code: 'LEG_ORIGIN_REQUIRED', path: 'legs.0.origin' },
        { code: 'LEG_DESTINATION_REQUIRED', path: 'legs.0.destination' },
      ]),
    );
  });

  it('reports an open AirTrust and SIGVOOS conflict without exposing either source value', () => {
    const input = buildInput();
    input.conflicts = [
      {
        id: 901,
        empresa_id: 7,
        entidade_tipo: 'etapa',
        entidade_id: 701,
        campo: 'origem_icao',
        severidade: 'ALTA',
        status: 'ABERTO',
      },
      {
        id: 902,
        empresa_id: 7,
        entidade_tipo: 'voo',
        entidade_id: 77,
        campo: 'sigvoos_report_number',
        severidade: 'BAIXA',
        status: 'RESOLVIDO',
      },
    ];

    const result = projectControlFlightToEdbDraft(input);

    expect(result.findings).toContainEqual({
      code: 'SOURCE_CONFLICT_OPEN',
      path: 'conflicts.0',
    });
    expect(result.findings).not.toContainEqual({
      code: 'SOURCE_CONFLICT_OPEN',
      path: 'conflicts.1',
    });
    expect(JSON.stringify(result.findings)).not.toContain('origem_icao');
    expect(JSON.stringify(result.findings)).not.toContain('sigvoos_report_number');
  });

  it('rejects a conflict row that points outside the projected flight', () => {
    const input = buildInput();
    input.conflicts = [
      {
        id: 903,
        empresa_id: 7,
        entidade_tipo: 'etapa',
        entidade_id: 999,
        campo: 'destino_icao',
        severidade: 'CRITICA',
        status: 'ABERTO',
      },
    ];

    expect(() => projectControlFlightToEdbDraft(input)).toThrowError(
      new ControlFlightProjectionError('CONFLICT_SCOPE_MISMATCH'),
    );
  });

  it('keeps legacy or unknown provenance explicit instead of attributing it to AirTrust', () => {
    const input = buildInput();
    input.legs[0].origem_dados = 'LEGACY_IMPORT';
    input.crew[0].funcao_origem = 'LEGACY_IMPORT';

    const result = projectControlFlightToEdbDraft(input);

    expect(result.draft.legs[0].source.kind).toBe('UNKNOWN');
    expect(result.draft.legs[0].crew[0].source.kind).toBe('UNKNOWN');
  });
});

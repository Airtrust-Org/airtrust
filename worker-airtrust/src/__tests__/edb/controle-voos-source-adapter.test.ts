import { describe, expect, it } from 'vitest';
import type {
  FlightRow,
  RdvRow,
} from '../../repositories/controle-voos/rdv-repository';
import type { EtapaRow } from '../../services/controle-voos/rdv-etapas';
import { adaptControleVoosToEdbShadowSource } from '../../services/edb/controle-voos-source-adapter';
import { projectRdvToEdbShadow } from '../../services/edb/rdv-shadow-projection';

function flight(): FlightRow {
  return {
    id: 10,
    empresa_id: 1,
    prefixo: 'PR-ABC',
    data_programacao: '2026-09-05',
    origem_id: 1,
    destino_id: 2,
    tipo_voo_id: 1,
    natureza_voo_id: 1,
    aeronave_id: 7,
    horario_previsto_partida: '2026-09-05T10:00:00.000Z',
    horario_previsto_chegada: '2026-09-05T11:00:00.000Z',
    horario_real_partida: null,
    horario_real_chegada: null,
    status: 'concluido_operacionalmente',
    observacoes: null,
    cancelado_motivo_id: null,
    alternado_destino_id: null,
    versao: 4,
    created_at: '2026-09-05T09:00:00.000Z',
    updated_at: '2026-09-05T11:10:00.000Z',
  };
}

function rdv(): RdvRow {
  return {
    id: 20,
    empresa_id: 1,
    voo_id: 10,
    numero: 'RDV-SYNTHETIC-20',
    data_voo: '2026-09-05',
    horario_decolagem_real: '2026-09-05T10:05:00.000Z',
    horario_pouso_real: '2026-09-05T10:55:00.000Z',
    horas_voadas: 0.83,
    numero_pousos: 1,
    ciclos: 99,
    combustivel_decolagem: 850,
    combustivel_pouso: 600,
    combustivel_consumo: 250,
    pob: 99,
    carga_kg: 999,
    ocorrencias: '',
    divergencias: 'Texto operacional que nao e discrepancia tecnica',
    status: 'preenchimento_finalizado',
    responsavel_preenchimento_id: 99,
    preenchido_em: '2026-09-05T11:05:00.000Z',
    finalizado_operacionalmente_por: 99,
    finalizado_operacionalmente_em: '2026-09-05T11:06:00.000Z',
    workflow_status: 'finalizado',
    versao: 3,
    enviado_por: 99,
    enviado_em: '2026-09-05T11:06:00.000Z',
    revisao_iniciada_por: 100,
    revisao_iniciada_em: '2026-09-05T11:07:00.000Z',
    devolvido_por: null,
    devolvido_em: null,
    aprovado_coordenacao_por: 100,
    aprovado_coordenacao_em: '2026-09-05T11:08:00.000Z',
    finalizado_workflow_em: '2026-09-05T11:09:00.000Z',
    reaberto_por: null,
    reaberto_em: null,
    motivo_devolucao: null,
    motivo_cancelamento: null,
    created_at: '2026-09-05T09:00:00.000Z',
    updated_at: '2026-09-05T11:09:00.000Z',
  };
}

function stage(id = 30): EtapaRow {
  return {
    id,
    empresa_id: 1,
    voo_id: 10,
    numero_etapa: id === 30 ? 1 : 2,
    sigvoos_leg_number: id === 30 ? 1 : 2,
    origem_icao: id === 30 ? 'SBJR' : 'SSXX',
    destino_icao: id === 30 ? 'SSXX' : 'SBJR',
    horario_motor_ligado: '10:00',
    horario_decolagem: '10:05',
    horario_pouso: '10:55',
    horario_motor_desligado: '11:00',
    tempo_decolagem_pouso: '00:50',
    tempo_total: '01:00',
    tempo_navegacao: '00:50',
    tempo_ifr: '00:20',
    tempo_noturno: '00:00',
    pousos_diurnos: 1,
    pousos_noturnos: 0,
    starts: 2,
    pax: 6,
    payload: 100,
    combustivel_inicio: 900,
    combustivel_fim: 600,
    unidade_combustivel: 'KG',
    origem_dados: 'SIGVOOS',
    created_by: null,
    updated_by: null,
    created_at: '2026-09-05T09:00:00.000Z',
    updated_at: '2026-09-05T11:00:00.000Z',
    deleted_at: null,
  };
}

const aircraft = {
  aircraftId: 7,
  manufacturer: 'Leonardo',
  model: 'AW139',
  serialNumber: 'SN-001',
  registrationMarks: 'PR-ABC',
  owners: ['Empresa Proprietaria'],
  operators: ['Empresa Operadora'],
};

const maintenance = {
  lastIntervention: {
    type: 'Inspecao programada',
    date: '2026-09-01',
    returnToServiceApprovedBy: 'Responsavel RTS',
  },
  nextIntervention: {
    type: 'Inspecao 50h',
    dueAtAirframeHours: 1520,
  },
};

function crew(overrides: Partial<{
  empresa_id: number;
  voo_id: number;
  etapa_id: number | null;
}> = {}) {
  return {
    empresa_id: 1,
    voo_id: 10,
    etapa_id: null,
    funcionario_id: 101,
    funcao: 'PIC',
    funcionario_nome: 'Comandante Sintetico',
    funcionario_codigo_anac: '123456',
    ...overrides,
  };
}

describe('Controle de Voos -> eDB regulatory shadow adapter', () => {
  it('preserves ambiguous source evidence while the projector remains fail-closed', () => {
    const source = adaptControleVoosToEdbShadowSource({
      flight: flight(),
      rdv: rdv(),
      stages: [stage()],
      crew: [crew()],
      aircraft,
      maintenance,
      operatorRegulation: 'RBAC135',
      natureLabel: 'TRANSPORTE',
      capturedAt: '2026-09-05T12:00:00.000Z',
    });

    expect(source.stages[0]).toMatchObject({
      stageId: 30,
      totalMinutes: null,
      nightMinutes: 0,
      starts: 2,
      ifrUnclassifiedMinutes: 20,
      fuelAtStageStart: 900,
      passengers: 6,
      payloadKg: 100,
    });
    expect(source.stages[0].crew[0]).toMatchObject({
      employeeId: 101,
      operationalRole: 'PIC',
      regulatoryFunctionCode: null,
    });

    const projected = projectRdvToEdbShadow(source);
    expect(projected.records[0].flight.cycles).toBeNull();
    expect(projected.records[0].flight.duration.ifrActualMinutes).toBeNull();
    expect(projected.records[0].flight.duration.ifrSimulatedMinutes).toBeNull();
    expect(projected.records[0].flight.personsOnBoard).toBeNull();
    expect(projected.records[0].flight.cargoKg).toBeNull();
    expect(projected.records[0].flight.technicalDiscrepancies).toBeNull();
    expect(projected.gaps.map((gap) => gap.code)).toEqual(
      expect.arrayContaining([
        'CYCLES_NOT_MAPPED_FROM_STARTS',
        'IFR_SPLIT_REQUIRED',
        'POB_SEMANTICS_UNCONFIRMED',
        'CARGO_SEMANTICS_UNCONFIRMED',
        'TECH_DISCREPANCY_NOT_MAPPED_FROM_DIVERGENCES',
      ]),
    );

    expect(rdv().ciclos).toBe(99);
    expect(rdv().pob).toBe(99);
    expect(rdv().carga_kg).toBe(999);
  });

  it('applies flight-level crew to every stage and leg-scoped crew only to its leg', () => {
    const source = adaptControleVoosToEdbShadowSource({
      flight: flight(),
      rdv: rdv(),
      stages: [stage(30), stage(31)],
      crew: [
        crew(),
        {
          ...crew({ etapa_id: 31 }),
          funcionario_id: 102,
          funcao: 'SIC',
          funcionario_nome: 'Copiloto Sintetico',
        },
      ],
      aircraft,
      maintenance,
      operatorRegulation: 'RBAC135',
      natureLabel: 'TRANSPORTE',
      capturedAt: '2026-09-05T12:00:00.000Z',
    });

    expect(source.stages[0].crew.map((member) => member.employeeId)).toEqual([101]);
    expect(source.stages[1].crew.map((member) => member.employeeId)).toEqual([101, 102]);
  });

  it('rejects cross-tenant, cross-flight and orphan-stage crew evidence', () => {
    const base = {
      flight: flight(),
      rdv: rdv(),
      stages: [stage()],
      aircraft,
      maintenance,
      operatorRegulation: 'RBAC135' as const,
      natureLabel: 'TRANSPORTE',
      capturedAt: '2026-09-05T12:00:00.000Z',
    };

    expect(() =>
      adaptControleVoosToEdbShadowSource({ ...base, crew: [crew({ empresa_id: 2 })] }),
    ).toThrow('EDB_SHADOW_CREW_TENANT_MISMATCH');

    expect(() =>
      adaptControleVoosToEdbShadowSource({ ...base, crew: [crew({ voo_id: 99 })] }),
    ).toThrow('EDB_SHADOW_CREW_FLIGHT_MISMATCH');

    expect(() =>
      adaptControleVoosToEdbShadowSource({ ...base, crew: [crew({ etapa_id: 999 })] }),
    ).toThrow('EDB_SHADOW_CREW_STAGE_MISMATCH');
  });

  it('rejects stage and RDV scope mixing before projection', () => {
    const base = {
      flight: flight(),
      rdv: rdv(),
      crew: [crew()],
      aircraft,
      maintenance,
      operatorRegulation: 'RBAC135' as const,
      natureLabel: 'TRANSPORTE',
      capturedAt: '2026-09-05T12:00:00.000Z',
    };

    expect(() =>
      adaptControleVoosToEdbShadowSource({
        ...base,
        stages: [{ ...stage(), empresa_id: 2 }],
      }),
    ).toThrow('EDB_SHADOW_STAGE_SCOPE_MISMATCH');

    expect(() =>
      adaptControleVoosToEdbShadowSource({
        ...base,
        rdv: { ...rdv(), empresa_id: 2 },
        stages: [stage()],
      }),
    ).toThrow('EDB_SHADOW_RDV_SCOPE_MISMATCH');
  });

  it('rejects duplicate stage identity before any projection', () => {
    expect(() =>
      adaptControleVoosToEdbShadowSource({
        flight: flight(),
        rdv: rdv(),
        stages: [stage(30), { ...stage(31), id: 30 }],
        crew: [crew()],
        aircraft,
        maintenance,
        operatorRegulation: 'RBAC135',
        natureLabel: 'TRANSPORTE',
        capturedAt: '2026-09-05T12:00:00.000Z',
      }),
    ).toThrow('EDB_SHADOW_STAGE_DUPLICATED');
  });

  it('defensively copies mutable aircraft and maintenance evidence', () => {
    const inputAircraft = {
      ...aircraft,
      owners: [...aircraft.owners],
      operators: [...aircraft.operators],
    };
    const inputMaintenance = {
      lastIntervention: { ...maintenance.lastIntervention },
      nextIntervention: { ...maintenance.nextIntervention },
    };

    const source = adaptControleVoosToEdbShadowSource({
      flight: flight(),
      rdv: rdv(),
      stages: [stage()],
      crew: [crew()],
      aircraft: inputAircraft,
      maintenance: inputMaintenance,
      operatorRegulation: 'RBAC135',
      natureLabel: 'TRANSPORTE',
      capturedAt: '2026-09-05T12:00:00.000Z',
    });

    inputAircraft.owners[0] = 'Mutated owner';
    inputAircraft.operators[0] = 'Mutated operator';
    inputMaintenance.lastIntervention.type = 'Mutated maintenance';
    inputMaintenance.nextIntervention.type = 'Mutated next maintenance';

    expect(source.aircraft.owners).toEqual(['Empresa Proprietaria']);
    expect(source.aircraft.operators).toEqual(['Empresa Operadora']);
    expect(source.maintenance?.lastIntervention.type).toBe('Inspecao programada');
    expect(source.maintenance?.nextIntervention.type).toBe('Inspecao 50h');
  });
});

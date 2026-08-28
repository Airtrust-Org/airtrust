import { describe, expect, it } from 'vitest';
import type {
  FlightRow,
  RdvRow,
} from '../../repositories/controle-voos/rdv-repository';
import type { EtapaRow } from '../../services/controle-voos/rdv-etapas';
import { adaptControleVoosToEdbShadowSource } from '../../services/edb/controle-voos-source-adapter';

function flight(): FlightRow {
  return {
    id: 10,
    empresa_id: 1,
    prefixo: 'PR-ABC',
    data_programacao: '2026-08-28',
    origem_id: 1,
    destino_id: 2,
    tipo_voo_id: 1,
    natureza_voo_id: 1,
    aeronave_id: 7,
    horario_previsto_partida: '2026-08-28T10:00:00.000Z',
    horario_previsto_chegada: '2026-08-28T11:00:00.000Z',
    horario_real_partida: null,
    horario_real_chegada: null,
    status: 'concluido_operacionalmente',
    observacoes: null,
    cancelado_motivo_id: null,
    alternado_destino_id: null,
    versao: 4,
    created_at: '2026-08-28T09:00:00.000Z',
    updated_at: '2026-08-28T11:10:00.000Z',
  };
}

function rdv(): RdvRow {
  return {
    id: 20,
    empresa_id: 1,
    voo_id: 10,
    numero: 'RDV-20260828-PRABC',
    data_voo: '2026-08-28',
    horario_decolagem_real: '2026-08-28T10:05:00.000Z',
    horario_pouso_real: '2026-08-28T10:55:00.000Z',
    horas_voadas: 0.83,
    numero_pousos: 1,
    ciclos: 1,
    combustivel_decolagem: 850,
    combustivel_pouso: 600,
    combustivel_consumo: 250,
    pob: 8,
    carga_kg: 100,
    ocorrencias: '',
    divergencias: 'Texto operacional que nao e discrepancia tecnica',
    status: 'preenchimento_finalizado',
    responsavel_preenchimento_id: 99,
    preenchido_em: '2026-08-28T11:05:00.000Z',
    finalizado_operacionalmente_por: 99,
    finalizado_operacionalmente_em: '2026-08-28T11:06:00.000Z',
    workflow_status: 'finalizado',
    versao: 3,
    enviado_por: 99,
    enviado_em: '2026-08-28T11:06:00.000Z',
    revisao_iniciada_por: 100,
    revisao_iniciada_em: '2026-08-28T11:07:00.000Z',
    devolvido_por: null,
    devolvido_em: null,
    aprovado_coordenacao_por: 100,
    aprovado_coordenacao_em: '2026-08-28T11:08:00.000Z',
    finalizado_workflow_em: '2026-08-28T11:09:00.000Z',
    reaberto_por: null,
    reaberto_em: null,
    motivo_devolucao: null,
    motivo_cancelamento: null,
    created_at: '2026-08-28T09:00:00.000Z',
    updated_at: '2026-08-28T11:09:00.000Z',
  };
}

function stage(): EtapaRow {
  return {
    id: 30,
    empresa_id: 1,
    voo_id: 10,
    numero_etapa: 1,
    sigvoos_leg_number: 1,
    origem_icao: 'SBJR',
    destino_icao: 'SSXX',
    horario_motor_ligado: '2026-08-28T10:00:00.000Z',
    horario_decolagem: '2026-08-28T10:05:00.000Z',
    horario_pouso: '2026-08-28T10:55:00.000Z',
    horario_motor_desligado: '2026-08-28T11:00:00.000Z',
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
    created_at: '2026-08-28T09:00:00.000Z',
    updated_at: '2026-08-28T11:00:00.000Z',
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
    date: '2026-08-20',
    returnToServiceApprovedBy: 'Responsavel RTS',
  },
  nextIntervention: {
    type: 'Inspecao 50h',
    dueAtAirframeHours: 1520,
  },
};

describe('Controle de Voos → eDB shadow source adapter', () => {
  it('preserves existing values but refuses unsafe regulatory equivalences', () => {
    const source = adaptControleVoosToEdbShadowSource({
      flight: flight(),
      rdv: rdv(),
      stages: [stage()],
      crew: [
        {
          voo_id: 10,
          etapa_id: null,
          funcionario_id: 101,
          funcao: 'PIC',
          funcionario_nome: 'Comandante Teste',
          funcionario_codigo_anac: '123456',
        },
      ],
      aircraft,
      maintenance,
      operatorRegulation: 'RBAC135',
      natureLabel: 'TRANSPORTE',
      capturedAt: '2026-08-28T12:00:00.000Z',
    });

    expect(source.stages).toHaveLength(1);
    const mapped = source.stages[0];
    expect(mapped.origin).toBe('SBJR');
    expect(mapped.destination).toBe('SSXX');
    expect(mapped.nightMinutes).toBe(0);
    expect(mapped.ifrUnclassifiedMinutes).toBe(20);
    expect(mapped.starts).toBe(2);
    expect(mapped.passengers).toBe(6);
    expect(mapped.payloadKg).toBe(100);
    expect(mapped.fuelAtStageStart).toBe(900);

    // Current `tempo_total` is motor-on → motor-off; do not call it regulatory flight time.
    expect(mapped.totalMinutes).toBeNull();
    // RDV summary values are not silently distributed into a stage.
    expect(source.rdvId).toBe(20);
    expect(source.divergences).toContain('nao e discrepancia tecnica');
    expect(mapped.crew[0]).toEqual(
      expect.objectContaining({
        employeeId: 101,
        operationalRole: 'PIC',
        regulatoryFunctionCode: null,
      }),
    );
  });

  it('applies flight-level crew to every stage and stage-level crew only to its stage', () => {
    const secondStage = { ...stage(), id: 31, numero_etapa: 2, origem_icao: 'SSXX', destino_icao: 'SBJR' };
    const source = adaptControleVoosToEdbShadowSource({
      flight: flight(),
      rdv: rdv(),
      stages: [stage(), secondStage],
      crew: [
        {
          voo_id: 10,
          etapa_id: null,
          funcionario_id: 101,
          funcao: 'PIC',
          funcionario_nome: 'Comandante Teste',
          funcionario_codigo_anac: '123456',
        },
        {
          voo_id: 10,
          etapa_id: 31,
          funcionario_id: 102,
          funcao: 'SIC',
          funcionario_nome: 'Copiloto Teste',
          funcionario_codigo_anac: '654321',
        },
      ],
      aircraft,
      maintenance,
      operatorRegulation: 'RBAC135',
      natureLabel: 'TRANSPORTE',
      capturedAt: '2026-08-28T12:00:00.000Z',
    });

    expect(source.stages[0].crew.map((member) => member.employeeId)).toEqual([101]);
    expect(source.stages[1].crew.map((member) => member.employeeId)).toEqual([101, 102]);
  });

  it('fails closed on cross-flight or cross-tenant source mixing', () => {
    const badStage = { ...stage(), empresa_id: 2 };
    expect(() =>
      adaptControleVoosToEdbShadowSource({
        flight: flight(),
        rdv: rdv(),
        stages: [badStage],
        crew: [],
        aircraft,
        maintenance,
        operatorRegulation: 'RBAC135',
        natureLabel: 'TRANSPORTE',
        capturedAt: '2026-08-28T12:00:00.000Z',
      }),
    ).toThrow('does not belong to the supplied flight/tenant');
  });
});

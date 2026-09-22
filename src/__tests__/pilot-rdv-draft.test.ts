import { describe, expect, it } from 'vitest';
// @ts-expect-error public Pilot App module is plain JS by design.
import {
  applySafeStageAggregates,
  applyStageContinuity,
  buildCommonFlightFields,
  buildStageDraftsFromPackage,
  calcClockDurationHhMm,
  calcTotalBlockTimeHhMm,
  calcStageTotalWeight,
  formatDurationDigits,
  payloadToKg,
  plannedFlightMinutes,
  realizedFlightMinutes,
  realizedTotalMinutes,
  requiredJustificationMinutes,
  totalJustificationMinutes,
  toDurationInput,
  validateStageDrafts,
} from '../../public/pilot/pilot-rdv-draft.js';

describe('Pilot RDV operational calculations', () => {
  it('calcula tempo de voo e total em HH:MM inclusive cruzando meia-noite', () => {
    expect(calcClockDurationHhMm('08:10', '09:45')).toBe('01:35');
    expect(calcClockDurationHhMm('23:50', '00:20')).toBe('00:30');
  });

  it('insere dois-pontos automaticamente ao completar quatro dígitos da duração', () => {
    expect(formatDurationDigits('0')).toBe('0');
    expect(formatDurationDigits('01')).toBe('01');
    expect(formatDurationDigits('013')).toBe('013');
    expect(formatDurationDigits('0130')).toBe('01:30');
    expect(formatDurationDigits('01 30')).toBe('01:30');
    expect(formatDurationDigits('01:30')).toBe('01:30');
  });

  it('normaliza durações digitadas como tempo decorrido para HH:MM', () => {
    expect(toDurationInput('1.5')).toBe('01:30');
    expect(toDurationInput('1,5')).toBe('01:30');
    expect(toDurationInput('1h30')).toBe('01:30');
    expect(toDurationInput('1 h 30')).toBe('01:30');
    expect(toDurationInput('00:45')).toBe('00:45');
  });

  it('converte payload em lb para o campo canônico de kg', () => {
    expect(payloadToKg('220.46226218', 'LB')).toBe(100);
    expect(payloadToKg('100', 'KG')).toBe(100);
  });

  it('agrega horas, pousos, POB e carga das pernas sem derivar ciclos', () => {
    const form = { ciclos: '3', horas_voadas: '', numero_pousos: '', pob: '', carga_kg: '' };
    const next = applySafeStageAggregates(form, [
      {
        horario_decolagem: '23:30',
        horario_pouso: '00:15',
        pousos_diurnos: '0',
        pousos_noturnos: '1',
        pax: '8',
        payload: '220.46226218',
        unidade_payload: 'LB',
        combustivel_inicio: '',
        combustivel_fim: '',
      },
      {
        horario_decolagem: '01:00',
        horario_pouso: '01:45',
        pousos_diurnos: '1',
        pousos_noturnos: '0',
        pax: '7',
        payload: '90',
        unidade_payload: 'KG',
        combustivel_inicio: '',
        combustivel_fim: '',
      },
    ]);
    expect(next.horas_voadas).toBe('1.5');
    expect(next.numero_pousos).toBe('2');
    expect(next.pob).toBe('7');
    expect(next.carga_kg).toBe('90');
    expect(next.ciclos).toBe('3');
  });

  it('encadeia pouso sem corte como partida da próxima perna sem sobrescrever valor manual', () => {
    const stages = [
      {
        fields: { destino_icao: 'P-01', horario_pouso: '09:40', horario_motor_desligado: '' },
      },
      {
        fields: { origem_icao: 'P-01', horario_motor_ligado: '', horario_decolagem: '09:50' },
      },
    ];

    applyStageContinuity(stages);
    expect(stages[1].fields.horario_motor_ligado).toBe('09:40');
    expect(stages[1].continuity_start_derived).toBe(true);
    expect(
      calcClockDurationHhMm(
        stages[1].fields.horario_motor_ligado,
        stages[1].fields.horario_decolagem,
      ),
    ).toBe('00:10');

    stages[0].fields.horario_pouso = '09:42';
    applyStageContinuity(stages);
    expect(stages[1].fields.horario_motor_ligado).toBe('09:42');

    stages[1].continuity_start_derived = false;
    stages[1].fields.horario_motor_ligado = '09:44';
    stages[0].fields.horario_pouso = '09:45';
    applyStageContinuity(stages);
    expect(stages[1].fields.horario_motor_ligado).toBe('09:44');
  });

  it('conta pousos automaticamente pela existência da hora de pouso', () => {
    const next = applySafeStageAggregates({}, [
      { horario_decolagem: '08:00', horario_pouso: '08:30', pousos_diurnos: '9', pousos_noturnos: '9' },
      { horario_decolagem: '09:00', horario_pouso: '', pousos_diurnos: '7', pousos_noturnos: '7' },
      { horario_decolagem: '10:00', horario_pouso: '10:20', pousos_diurnos: '', pousos_noturnos: '' },
    ]);
    expect(next.numero_pousos).toBe('2');
  });

  it('calcula exatamente o desvio planejado e a soma de justificativas', () => {
    const packageData = {
      voo: {
        horario_previsto_partida: '2026-09-20T10:00:00.000Z',
        horario_previsto_chegada: '2026-09-20T11:30:00.000Z',
      },
    };
    const stages = [
      { horario_motor_ligado: '10:00', horario_decolagem: '10:05', horario_pouso: '11:00', horario_motor_desligado: '' },
      { horario_motor_ligado: '11:00', horario_decolagem: '11:10', horario_pouso: '12:00', horario_motor_desligado: '12:05' },
    ];
    expect(plannedFlightMinutes(packageData)).toBe(90);
    expect(realizedFlightMinutes(stages)).toBe(105);
    expect(realizedTotalMinutes(stages)).toBe(125);
    expect(requiredJustificationMinutes(packageData, stages)).toBe(35);
    expect(totalJustificationMinutes([{ minutos: '10' }, { minutos: 10 }, { minutos: '15' }])).toBe(35);
  });

  it('encadeia combustível final como inicial da perna seguinte', () => {
    const stages = [
      {
        fields: {
          destino_icao: '9PAA',
          combustivel_inicio: '2400',
          combustivel_fim: '1900',
          unidade_combustivel: 'LB',
        },
      },
      {
        fields: {
          origem_icao: '9PAA',
          combustivel_inicio: '999',
          combustivel_fim: '1500',
          unidade_combustivel: 'KG',
        },
      },
    ];

    applyStageContinuity(stages);
    expect(stages[1].fields.combustivel_inicio).toBe('1900');
    expect(stages[1].fields.unidade_combustivel).toBe('LB');
  });

  it('calcula peso total na unidade operacional da perna', () => {
    expect(
      calcStageTotalWeight({
        unidade_peso: 'LB',
        peso_vazio: '9000',
        peso_tripulacao: '400',
        peso_passageiros: '1200',
        peso_bagagem: '250',
        payload: '100',
        unidade_payload: 'KG',
        combustivel_inicio: '1800',
        unidade_combustivel: 'LB',
      }),
    ).toBeCloseTo(12870.462, 3);
  });

  it('limpa a partida derivada quando passa a existir corte na perna anterior', () => {
    const stages = [
      { fields: { destino_icao: 'P-01', horario_pouso: '09:40', horario_motor_desligado: '' } },
      { fields: { origem_icao: 'P-01', horario_motor_ligado: '' } },
    ];
    applyStageContinuity(stages);
    stages[0].fields.horario_motor_desligado = '09:43';
    applyStageContinuity(stages);
    expect(stages[1].fields.horario_motor_ligado).toBe('');
    expect(stages[1].continuity_start_derived).toBe(false);
  });

  it('usa lb como default de carga, combustível e pesos e concentra pesos comuns no voo', () => {
    const packageData = {
      voo: { id: 10, numero_voo: 'V123', numero_db: 'RV456', data_programacao: '2026-09-19' },
      aeronave: { peso_vazio: 9000, unidade_peso: 'LB' },
      etapas: [{ id: 1, numero_etapa: 1, origem_icao: 'SBME', destino_icao: '9PAA' }],
    };
    const common = buildCommonFlightFields(packageData);
    expect(common).toMatchObject({ numero_voo: 'V123', numero_db: 'RV456', peso_vazio: '9000', unidade_peso: 'LB' });
    const stages = buildStageDraftsFromPackage(packageData);
    expect(stages[0]).toMatchObject({ unidade_payload: 'LB', unidade_combustivel: 'LB', unidade_peso: 'LB' });
    expect(stages[0].peso_tripulacao).toBe('');
  });

  it('usa pouso como fechamento provisório do tempo total quando ainda não há corte', () => {
    const firstLeg = [
      { horario_motor_ligado: '08:00', horario_decolagem: '08:10', horario_pouso: '08:40', horario_motor_desligado: '' },
    ];
    expect(calcTotalBlockTimeHhMm(firstLeg)).toBe('00:40');

    const form = applySafeStageAggregates({}, firstLeg);
    expect(form.tempo_voo_total_hhmm).toBe('00:30');
    expect(form.tempo_total_hhmm).toBe('00:40');
  });

  it('exige justificativa pelo tempo total, e não pelo tempo de decolagem a pouso', () => {
    const packageData = {
      voo: {
        horario_previsto_partida: '2026-09-20T10:00:00.000Z',
        horario_previsto_chegada: '2026-09-20T11:00:00.000Z',
      },
    };
    const stages = [
      { horario_motor_ligado: '10:00', horario_decolagem: '10:10', horario_pouso: '11:00', horario_motor_desligado: '11:10' },
    ];
    expect(realizedFlightMinutes(stages)).toBe(50);
    expect(realizedTotalMinutes(stages)).toBe(70);
    expect(requiredJustificationMinutes(packageData, stages)).toBe(10);
  });

  it('soma tempo de voo por etapa e tempo total por ciclos de motor contínuos', () => {
    const stages = [
      { horario_motor_ligado: '08:00', horario_decolagem: '08:10', horario_pouso: '08:40', horario_motor_desligado: '' },
      { horario_motor_ligado: '08:40', horario_decolagem: '08:50', horario_pouso: '09:20', horario_motor_desligado: '09:25' },
    ];
    expect(calcTotalBlockTimeHhMm(stages)).toBe('01:25');
    const result = applySafeStageAggregates({}, stages);
    expect(result.tempo_voo_total_hhmm).toBe('01:00');
    expect(result.tempo_total_hhmm).toBe('01:25');
  });

  it('mostra validações específicas para duração e unidade de combustível', () => {
    const errors = validateStageDrafts([
      {
        origem_icao: 'SBME',
        destino_icao: 'SBCB',
        tempo_ifr: '1.5',
        tempo_noturno: '00:20',
        combustivel_inicio: '1200',
        combustivel_fim: '1100',
        unidade_combustivel: '',
      },
    ]);
    expect(errors).toContain('Etapa 1: IFR deve estar em HH:MM.');
    expect(errors).toContain('Etapa 1: selecione a unidade do combustível.');
  });
});

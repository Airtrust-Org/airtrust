import { describe, expect, it } from 'vitest';
import {
  buildDailyPetrobrasRveXml,
  buildPetrobrasRveAttendanceFromFlight,
  type PetrobrasRveFlightRow,
  type PetrobrasRveStageRow,
} from '../../services/controle-voos/petrobras-rve-daily-export';

const flight = (overrides: Partial<PetrobrasRveFlightRow> = {}): PetrobrasRveFlightRow => ({
  voo_id: 601,
  data_voo: '2026-09-19',
  prefixo: 'PS-CDV',
  petrobras_equipamento: '30131647',
  petrobras_atendimento: '509573593',
  sigvoos_flight_report_id: null,
  sigvoos_flight_report_id_confident: 0,
  ...overrides,
});

const stages: PetrobrasRveStageRow[] = [
  {
    numero_etapa: 1,
    origem_icao: 'SBME',
    destino_icao: 'SKNT',
    horario_motor_ligado: '06:40',
    horario_decolagem: '06:50',
    horario_pouso: '07:34',
    horario_motor_desligado: '07:36',
  },
  {
    numero_etapa: 2,
    origem_icao: 'SKNT',
    destino_icao: 'SBME',
    horario_motor_ligado: '07:36',
    horario_decolagem: '07:34',
    horario_pouso: '08:23',
    horario_motor_desligado: '08:28',
  },
];

describe('Petrobras RVE daily export', () => {
  it('converte um voo finalizado no contrato RVE de seis registros', () => {
    const built = buildDailyPetrobrasRveXml([{ flight: flight(), stages }]);
    expect(built.records).toHaveLength(6);
    expect(built.records.map((row) => row.ITEM)).toEqual([
      '0001', '0002', '0003', '0004', '0005', '0006',
    ]);
    expect(built.records.map((row) => row.CODIGO_OPERACAO)).toEqual([
      'OA30', 'PA01', 'OA08', 'OA08', 'PA03', 'OA31',
    ]);
    expect(built.records.map((row) => row.ESCALA)).toEqual([
      'SBME', 'SBME', 'SKNT', 'SBME', 'SBME', 'SBME',
    ]);
    expect(built.records[0]).toMatchObject({
      EQUIPAMENTO: '30131647',
      ATENDIMENTO: '509573593',
      HORA_INICIAL: '06:40:00',
      HORA_FINAL: '06:50:00',
    });
  });
  it('usa flight_report_id somente quando SIGVOOS marcou a identidade como confiante', () => {
    const attendance = buildPetrobrasRveAttendanceFromFlight(
      flight({
        petrobras_atendimento: null,
        sigvoos_flight_report_id: 509573593,
        sigvoos_flight_report_id_confident: 1,
      }),
      stages,
    );
    expect(attendance.atendimento).toBe('509573593');
  });

  it('falha fechado quando EQUIPAMENTO ou ATENDIMENTO não foram identificados', () => {
    expect(() =>
      buildPetrobrasRveAttendanceFromFlight(
        flight({ petrobras_equipamento: null, petrobras_atendimento: null }),
        stages,
      ),
    ).toThrow(/EQUIPAMENTO, ATENDIMENTO/);
  });

  it('bloqueia datas impossiveis, minutos/segundos invalidos e sufixos ambiguos', () => {
    const bad = [
      { horario_motor_ligado: '25:10' },
      { horario_motor_ligado: '06:60' },
      { horario_motor_ligado: '06:40:60' },
      { horario_motor_ligado: '2026-09-19T06:40:00BAD' },
      { horario_motor_ligado: '2026-09-19T06:40:00-03:00' },
      { horario_motor_ligado: '2026-02-31T06:40:00' },
    ];
    for (const override of bad) {
      expect(() => buildPetrobrasRveAttendanceFromFlight(flight(), [
        { ...stages[0], ...override },
      ])).toThrow();
    }
    expect(() => buildPetrobrasRveAttendanceFromFlight(
      flight({ data_voo: '2026-02-29' }), stages,
    )).toThrow('Data operacional invalida para XML Petrobras');
  });

  it('mantem timestamp operacional valido com segundos/fracao e ano bissexto', () => {
    const result = buildPetrobrasRveAttendanceFromFlight(
      flight({ data_voo: '2028-02-29' }),
      [{ ...stages[0],
        horario_motor_ligado: '2028-02-29T06:40:00.000Z',
        horario_decolagem: '2028-02-29 06:50:30',
        horario_pouso: '2028-02-29 07:34',
        horario_motor_desligado: '2028-02-29T07:39:00.000Z',
      }],
    );
    expect(result.acionamento).toEqual({ data: '29/02/2028', hora: '06:40:00' });
    expect(result.decolagem).toEqual({ data: '29/02/2028', hora: '06:50:30' });
  });

  it('falha fechado quando uma etapa final não tem horários completos', () => {
    expect(() =>
      buildPetrobrasRveAttendanceFromFlight(
        flight(),
        stages.map((stage, index) =>
          index === 1 ? { ...stage, horario_motor_desligado: null } : stage,
        ),
      ),
    ).toThrow(/Horario operacional ausente/);
  });
});

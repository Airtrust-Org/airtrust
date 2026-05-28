import { describe, expect, it } from 'vitest';
import {
  buildFrmsOperationalSnapshot,
  type BuildOperationalSnapshotInput,
  type FrmsOperationalSnapshotItem,
} from '../../lib/frms/operational-snapshot';

function createBaseInput(): BuildOperationalSnapshotInput {
  return {
    empresaId: 77,
    rows: {
      escalas: [],
      jornadas: [],
      checkins: [],
      effectiveness: [],
      funcionarios: [
        {
          id: 10,
          nome: 'Tripulante Dez',
          nome_guerra: 'DEZ',
          funcao: 'PILOTO',
          cargo: 'COMANDANTE',
          base: 'SBJR',
          aeronave: 'AW139',
        },
        {
          id: 11,
          nome: 'Tripulante Onze',
          nome_guerra: 'ONZE',
          funcao: 'COPILOTO',
          cargo: 'SIC',
          base: 'SBJR',
          aeronave: 'SK76',
        },
      ],
    },
  };
}

function getByKey(items: FrmsOperationalSnapshotItem[], data: string, funcionarioId: number) {
  return items.find(
    (item) => item.data_operacional === data && item.funcionario_id === funcionarioId,
  );
}

describe('frms operational snapshot builder', () => {
  it('1) escalado com check-in real e fatorização', () => {
    const input = createBaseInput();

    input.rows.escalas.push({
      data_operacional: '2026-05-25',
      funcionario_id: 10,
      hora_apresentacao: '08:00',
      hora_termino: '15:00',
      aeronave_prefixo: 'PR-ATX',
      aeronave_modelo: 'AW139',
    });

    input.rows.jornadas.push({
      data_operacional: '2026-05-25',
      funcionario_id: 10,
      hora_apresentacao: '08:00',
      hora_termino: '15:00',
      horas_voo_minutos: 180,
      duracao_jornada_minutos: 420,
      origem: 'SIGVOOS',
      has_operational_data: 1,
      is_manual_empty: 0,
    });

    input.rows.checkins.push({
      data_operacional: '2026-05-25',
      funcionario_id: 10,
      hora_checkin: '06:45',
      kss_score: 4,
      horas_sono: 7,
      qualidade_sono: 4,
      wake_time: '06:10',
      score_fadiga: 28,
      nivel_fadiga: 'VERDE',
      status_operacional: 'APTO',
      computed_risk_level: 'normal',
    });

    input.rows.effectiveness.push({
      data_operacional: '2026-05-25',
      funcionario_id: 10,
      effectiveness_pct: 95.3,
      effectiveness_nivel: 'VERDE',
    });

    const result = buildFrmsOperationalSnapshot(input);
    const item = getByKey(result.items, '2026-05-25', 10);

    expect(item).toBeTruthy();
    expect(item?.escalado).toBe(true);
    expect(item?.checkin_status).toBe('RECEBIDO');
    expect(item?.sleep_data_source).toBe('REAL');
    expect(item?.effectiveness_pct).toBe(95.3);
    expect(item?.fatorizacao_status).toBe('CALCULADA');
  });

  it('2) escalado sem check-in gera CHECKIN_PENDENTE', () => {
    const input = createBaseInput();

    input.rows.escalas.push({
      data_operacional: '2026-05-26',
      funcionario_id: 10,
      hora_apresentacao: '08:00',
      hora_termino: '14:00',
      aeronave_prefixo: 'PR-ATX',
      aeronave_modelo: 'AW139',
    });

    const result = buildFrmsOperationalSnapshot(input);
    const item = getByKey(result.items, '2026-05-26', 10);

    expect(item).toBeTruthy();
    expect(item?.checkin_status).toBe('PENDENTE');
    expect(item?.alertas).toContain('CHECKIN_PENDENTE');
  });

  it('3) jornada FRMS sem escala gera alerta de divergência', () => {
    const input = createBaseInput();

    input.rows.jornadas.push({
      data_operacional: '2026-05-26',
      funcionario_id: 11,
      hora_apresentacao: '07:00',
      hora_termino: '10:00',
      horas_voo_minutos: 90,
      duracao_jornada_minutos: 180,
      origem: 'FIRA',
      has_operational_data: 1,
      is_manual_empty: 0,
    });

    const result = buildFrmsOperationalSnapshot(input);
    const item = getByKey(result.items, '2026-05-26', 11);

    expect(item).toBeTruthy();
    expect(item?.escalado).toBe(false);
    expect(item?.teve_jornada).toBe(true);
    expect(item?.alertas).toContain('JORNADA_FRMS_SEM_ESCALA');
  });

  it('4) check-in sem jornada permanece visível como sinal operacional', () => {
    const input = createBaseInput();

    input.rows.checkins.push({
      data_operacional: '2026-05-27',
      funcionario_id: 11,
      hora_checkin: '06:10',
      kss_score: 5,
      horas_sono: 6.5,
      qualidade_sono: 3,
      wake_time: '05:40',
      score_fadiga: 36,
      nivel_fadiga: 'AMARELO',
      status_operacional: 'MONITORAR',
      computed_risk_level: 'attention',
    });

    const result = buildFrmsOperationalSnapshot(input);
    const item = getByKey(result.items, '2026-05-27', 11);

    expect(item).toBeTruthy();
    expect(item?.escalado).toBe(false);
    expect(item?.teve_jornada).toBe(false);
    expect(item?.checkin_status).toBe('RECEBIDO');
  });

  it('5) diferencia sono REAL vs ESTIMADO', () => {
    const input = createBaseInput();

    input.rows.jornadas.push({
      data_operacional: '2026-05-28',
      funcionario_id: 10,
      hora_apresentacao: '08:00',
      hora_termino: '13:00',
      horas_voo_minutos: 120,
      duracao_jornada_minutos: 300,
      origem: 'SIGVOOS',
      has_operational_data: 1,
      is_manual_empty: 0,
    });

    input.rows.checkins.push({
      data_operacional: '2026-05-28',
      funcionario_id: 10,
      hora_checkin: '06:30',
      kss_score: 4,
      horas_sono: 7.2,
      qualidade_sono: 4,
      wake_time: '05:55',
      score_fadiga: 20,
      nivel_fadiga: 'VERDE',
      status_operacional: 'APTO',
      computed_risk_level: 'normal',
    });

    input.rows.jornadas.push({
      data_operacional: '2026-05-28',
      funcionario_id: 11,
      hora_apresentacao: '09:00',
      hora_termino: '12:00',
      horas_voo_minutos: 60,
      duracao_jornada_minutos: 180,
      origem: 'MANUAL',
      has_operational_data: 1,
      is_manual_empty: 0,
    });

    const result = buildFrmsOperationalSnapshot(input);
    const realSleep = getByKey(result.items, '2026-05-28', 10);
    const estimatedSleep = getByKey(result.items, '2026-05-28', 11);

    expect(realSleep?.sleep_data_source).toBe('REAL');
    expect(estimatedSleep?.sleep_data_source).toBe('ESTIMADO');
    expect(estimatedSleep?.alertas).toContain('SONO_ESTIMADO');
  });

  it('6) jornada sem effectiveness_pct gera JORNADA_SEM_FATORIZACAO', () => {
    const input = createBaseInput();

    input.rows.jornadas.push({
      data_operacional: '2026-05-29',
      funcionario_id: 10,
      hora_apresentacao: '10:00',
      hora_termino: '14:00',
      horas_voo_minutos: 120,
      duracao_jornada_minutos: 240,
      origem: 'SIGVOOS',
      has_operational_data: 1,
      is_manual_empty: 0,
    });

    const result = buildFrmsOperationalSnapshot(input);
    const item = getByKey(result.items, '2026-05-29', 10);

    expect(item).toBeTruthy();
    expect(item?.effectiveness_pct).toBeNull();
    expect(item?.alertas).toContain('JORNADA_SEM_FATORIZACAO');
    expect(item?.fatorizacao_status).toBe('AUSENTE');
  });
});

import { describe, expect, it } from 'vitest';
import { buildFrmsFortnightIndicatorMap } from '../../lib/frms/fortnight-indicator';

describe('frms fortnight indicator', () => {
  it('calcula dia N/M e acumulados do periodo quando ciclo embarcado existe', () => {
    const indicatorMap = buildFrmsFortnightIndicatorMap({
      windowStart: '2026-05-01',
      windowEnd: '2026-05-31',
      items: [
        {
          data_operacional: '2026-05-16',
          funcionario_id: 10,
          snapshot_status: 'OK',
          checkin_status: 'RECEBIDO',
          sleep_data_source: 'REAL',
          wake_data_source: 'REAL',
          jornada_data_source: 'REAL',
          hora_apresentacao: '05:30',
          hora_termino: '15:00',
          duracao_jornada_minutos: 570,
          horas_voo_minutos: 180,
          teve_jornada: true,
          dia_periodo_embarcado: 1,
          total_dias_periodo: 14,
        },
        {
          data_operacional: '2026-05-17',
          funcionario_id: 10,
          snapshot_status: 'ATENCAO',
          checkin_status: 'PENDENTE',
          sleep_data_source: 'ESTIMADO',
          wake_data_source: 'ESTIMADO',
          jornada_data_source: 'REAL',
          hora_apresentacao: '06:20',
          hora_termino: '14:00',
          duracao_jornada_minutos: 460,
          horas_voo_minutos: 150,
          teve_jornada: true,
          dia_periodo_embarcado: 2,
          total_dias_periodo: 14,
        },
        {
          data_operacional: '2026-05-18',
          funcionario_id: 10,
          snapshot_status: 'OK',
          checkin_status: 'RECEBIDO',
          sleep_data_source: 'REAL',
          wake_data_source: 'REAL',
          jornada_data_source: 'REAL',
          hora_apresentacao: '07:10',
          hora_termino: '13:30',
          duracao_jornada_minutos: 380,
          horas_voo_minutos: 120,
          teve_jornada: true,
          dia_periodo_embarcado: 3,
          total_dias_periodo: 14,
        },
      ],
    });

    const indicator = indicatorMap.get('2026-05-18::10');
    expect(indicator).toBeTruthy();
    expect(indicator?.dia_periodo).toBe(3);
    expect(indicator?.total_dias_periodo).toBe(14);
    expect(indicator?.periodo_inicio).toBe('2026-05-16');
    expect(indicator?.periodo_fim).toBe('2026-05-29');
    expect(indicator?.duty_time_periodo_min).toBe(1410);
    expect(indicator?.horas_voo_periodo_min).toBe(450);
    expect(indicator?.jornadas_periodo).toBe(3);
    expect(indicator?.dias_consecutivos_com_jornada).toBe(3);
    expect(indicator?.apresentacoes_antes_0600).toBe(1);
    expect(indicator?.apresentacoes_antes_0700).toBe(2);
    expect(indicator?.dias_com_checkin_pendente).toBe(1);
    expect(indicator?.dias_com_dado_estimado).toBe(1);
    expect(indicator?.setores_periodo).toBeNull();
    expect(indicator?.sit_periods_estimados).toBeNull();
  });

  it('marca INCOMPLETO quando a janela consultada nao cobre toda a quinzena', () => {
    const indicatorMap = buildFrmsFortnightIndicatorMap({
      windowStart: '2026-05-18',
      windowEnd: '2026-05-18',
      items: [
        {
          data_operacional: '2026-05-18',
          funcionario_id: 10,
          snapshot_status: 'OK',
          checkin_status: 'RECEBIDO',
          sleep_data_source: 'REAL',
          wake_data_source: 'REAL',
          jornada_data_source: 'REAL',
          hora_apresentacao: '08:00',
          hora_termino: '16:00',
          duracao_jornada_minutos: 480,
          horas_voo_minutos: 120,
          teve_jornada: true,
          dia_periodo_embarcado: 3,
          total_dias_periodo: 14,
        },
      ],
    });

    const indicator = indicatorMap.get('2026-05-18::10');
    expect(indicator?.fonte_periodo).toBe('INCOMPLETO');
    expect(indicator?.status_quinzena).toBe('INCOMPLETO');
    expect(indicator?.alertas_quinzena).toContain('PERIODO_PARCIAL_NA_CONSULTA');
  });

  it('marca AUSENTE quando nao ha dia/total de periodo', () => {
    const indicatorMap = buildFrmsFortnightIndicatorMap({
      windowStart: '2026-05-18',
      windowEnd: '2026-05-18',
      items: [
        {
          data_operacional: '2026-05-18',
          funcionario_id: 10,
          snapshot_status: 'OK',
          checkin_status: 'RECEBIDO',
          sleep_data_source: 'REAL',
          wake_data_source: 'REAL',
          jornada_data_source: 'REAL',
          hora_apresentacao: '08:00',
          hora_termino: '16:00',
          duracao_jornada_minutos: 480,
          horas_voo_minutos: 120,
          teve_jornada: true,
          dia_periodo_embarcado: null,
          total_dias_periodo: null,
        },
      ],
    });

    const indicator = indicatorMap.get('2026-05-18::10');
    expect(indicator?.fonte_periodo).toBe('AUSENTE');
    expect(indicator?.status_quinzena).toBe('INCOMPLETO');
    expect(indicator?.alertas_quinzena).toContain('PERIODO_QUINZENA_AUSENTE');
  });
});

import { describe, expect, it } from 'vitest';
import {
  buildFrmsFortnightIndicatorMap,
  type FrmsFortnightIndicatorItemSeed,
} from '../../lib/frms/fortnight-indicator';

function seed(
  data_operacional: string,
  dia_periodo_embarcado: number,
  overrides: Partial<FrmsFortnightIndicatorItemSeed> = {},
): FrmsFortnightIndicatorItemSeed {
  return {
    data_operacional,
    funcionario_id: 10,
    snapshot_status: 'OK',
    checkin_status: 'RECEBIDO',
    sleep_data_source: 'REAL',
    wake_data_source: 'REAL',
    jornada_data_source: 'REAL',
    hora_apresentacao: '08:00',
    hora_termino: '13:00',
    duracao_jornada_minutos: 300,
    horas_voo_minutos: 120,
    teve_jornada: true,
    horas_sono: 8,
    kss_score: 3,
    effectiveness_pct: 88,
    dia_periodo_embarcado,
    total_dias_periodo: 14,
    ...overrides,
  };
}

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
    expect(indicator?.score_acumulado).toBeGreaterThan(0);
    expect(indicator?.tendencia).toBe('ESTAVEL');
    expect(indicator?.freshness_dado).toBe('ESTIMADO');
    expect(indicator?.agravantes_aplicados.map((item) => item.codigo)).toContain(
      'CHECKIN_PENDENTE_NO_PERIODO',
    );
    expect(indicator?.atenuadores_aplicados.map((item) => item.codigo)).toContain(
      'DIAS_SEM_JORNADA_NO_PERIODO',
    );
    expect(indicator?.explicacao_operacional).toContain('score acumulado');
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
    expect(indicator?.freshness_dado).toBe('PARCIAL');
    expect(indicator?.status_quinzena).toBe('INCOMPLETO');
    expect(indicator?.natureza_dado).toBe('JORNADA_REALIZADA');
    expect(indicator?.decisao).toBe('ALERTA');
    expect(indicator?.mitigacao_recomendada).toBe('AGUARDAR_SIGVOOS');
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
    expect(indicator?.score_acumulado).toBeNull();
    expect(indicator?.tendencia).toBe('INDETERMINADA');
    expect(indicator?.limite_referencia).toBeNull();
    expect(indicator?.status_quinzena).toBe('INCOMPLETO');
    expect(indicator?.alertas_quinzena).toContain('PERIODO_QUINZENA_AUSENTE');
  });

  it('eleva quinzena completa para CRITICO quando acumulado e sequencia crescem', () => {
    const items = Array.from({ length: 14 }, (_, index) =>
      seed(`2026-05-${String(index + 1).padStart(2, '0')}`, index + 1, {
        hora_apresentacao: '05:00',
        hora_termino: '15:00',
        duracao_jornada_minutos: 600,
        horas_voo_minutos: 240,
      }),
    );

    const indicator = buildFrmsFortnightIndicatorMap({
      windowStart: '2026-05-01',
      windowEnd: '2026-05-14',
      items,
    }).get('2026-05-14::10');

    expect(indicator?.fonte_periodo).toBe('DERIVADO');
    expect(indicator?.freshness_dado).toBe('COMPLETO');
    expect(indicator?.status_quinzena).toBe('CRITICO');
    expect(indicator?.natureza_dado).toBe('ACUMULADO_LEGAL');
    expect(indicator?.score_acumulado).toBeGreaterThanOrEqual(75);
    expect(indicator?.tendencia).toBe('CRESCENTE');
    expect(indicator?.decisao).toBe('EXIGE_OVERRIDE');
    expect(indicator?.limite_referencia?.tipo).toBe('QUINZENA_DUTY');
    expect(indicator?.agravantes_aplicados.map((item) => item.codigo)).toContain(
      'SEQUENCIA_5_DIAS_OU_MAIS',
    );
    expect(indicator?.alertas_quinzena).toContain('SCORE_QUINZENAL_CRITICO');
  });

  it('mantem OK quando acumulado baixo tem descanso e dias sem missao como atenuadores', () => {
    const indicator = buildFrmsFortnightIndicatorMap({
      windowStart: '2026-05-01',
      windowEnd: '2026-05-14',
      items: [
        seed('2026-05-01', 1, {
          hora_apresentacao: '08:00',
          hora_termino: '12:00',
          duracao_jornada_minutos: 240,
          horas_voo_minutos: 90,
        }),
        seed('2026-05-02', 2, {
          hora_apresentacao: '08:30',
          hora_termino: '12:30',
          duracao_jornada_minutos: 240,
          horas_voo_minutos: 90,
        }),
      ],
    }).get('2026-05-02::10');

    expect(indicator?.status_quinzena).toBe('OK');
    expect(indicator?.score_acumulado).toBe(0);
    expect(indicator?.mitigacao_recomendada).toBe('SEM_ACAO');
    expect(indicator?.atenuadores_aplicados.map((item) => item.codigo)).toEqual(
      expect.arrayContaining([
        'DIAS_SEM_JORNADA_NO_PERIODO',
        'REPOUSO_ENTRE_JORNADAS_MAIOR_13H',
        'JORNADA_MEDIA_CURTA',
      ]),
    );
  });

  it('rotula apenas data futura como PROJECAO', () => {
    const indicator = buildFrmsFortnightIndicatorMap({
      windowStart: '2026-05-01',
      windowEnd: '2026-05-14',
      today: '2026-05-10',
      items: [
        seed('2026-05-12', 12, {
          jornada_data_source: 'ESTIMADO',
          sleep_data_source: 'ESTIMADO',
          wake_data_source: 'ESTIMADO',
        }),
      ],
    }).get('2026-05-12::10');

    expect(indicator?.natureza_dado).toBe('PROJECAO');
    expect(indicator?.decisao).toBe('ALERTA');
  });
});

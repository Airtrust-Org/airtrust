import { describe, expect, it } from 'vitest';
import type { FrmsOperationalSnapshotItem } from '@/react-app/hooks/useFrmsOperationalSnapshot';
import { buildFortnightTimeline } from '../fortnightOperationalTimeline';

function buildSnapshotItem(
  overrides: Partial<FrmsOperationalSnapshotItem> = {},
): FrmsOperationalSnapshotItem {
  return {
    empresa_id: 1,
    data_operacional: '2026-06-16',
    funcionario_id: 10,
    tripulante_id: 10,
    nome: 'Max Monteiro',
    nome_guerra: 'Max',
    funcao: 'PIC',
    base: 'SBSP',
    aeronave: 'AW139',
    escalado: true,
    escala_source: 'EVD',
    hora_apresentacao: '08:00',
    hora_termino: '16:00',
    horas_voo_minutos: 180,
    duracao_jornada_minutos: 480,
    teve_jornada: true,
    checkin_status: 'RECEBIDO',
    checkin_horario: '06:30',
    kss_score: 3,
    horas_sono: 7,
    qualidade_sono: 4,
    hora_acordar: '05:10',
    fadiga_score: 18,
    status_operacional_checkin: 'OK',
    effectiveness_pct: 91,
    nivel_fadiga_calculado: 'VERDE',
    fatorizacao_status: 'CALCULADA',
    sleep_data_source: 'REAL',
    wake_data_source: 'REAL',
    jornada_data_source: 'REAL',
    jornada_origem: 'SIGVOOS',
    snapshot_status: 'OK',
    fortnight_indicator: {
      periodo_inicio: '2026-06-16',
      periodo_fim: '2026-06-20',
      dia_periodo: 1,
      total_dias_periodo: 5,
      dias_consecutivos_com_jornada: 1,
      dias_com_checkin_pendente: 0,
      dias_com_dado_estimado: 0,
      duty_time_periodo_min: 480,
      duty_time_168h_min: 480,
      horas_voo_periodo_min: 180,
      horas_voo_168h_min: 180,
      jornadas_periodo: 1,
      apresentacoes_antes_0600: 0,
      apresentacoes_antes_0700: 0,
      menor_descanso_entre_jornadas_min: null,
      setores_periodo: null,
      sit_periods_estimados: null,
      fonte_periodo: 'DERIVADO',
      freshness_dado: 'COMPLETO',
      status_quinzena: 'OK',
      score_acumulado: 24,
      tendencia: 'ESTAVEL',
      atenuadores_aplicados: [],
      agravantes_aplicados: [],
      natureza_dado: 'JORNADA_REALIZADA',
      explicacao_operacional: 'Acúmulo ainda baixo.',
      mitigacao_recomendada: 'SEM_ACAO',
      decisao: 'INFORMA',
      limite_referencia: null,
      alertas_quinzena: [],
      limitation_notes: [],
    },
    alertas: [],
    ...overrides,
  };
}

describe('buildFortnightTimeline', () => {
  it('acumula jornada e voo dia a dia e preserva gaps do período', () => {
    const result = buildFortnightTimeline(
      [
        buildSnapshotItem(),
        buildSnapshotItem({
          data_operacional: '2026-06-17',
          duracao_jornada_minutos: 300,
          horas_voo_minutos: 120,
          snapshot_status: 'ATENCAO',
          checkin_status: 'PENDENTE',
          sleep_data_source: 'ESTIMADO',
          fortnight_indicator: {
            ...buildSnapshotItem().fortnight_indicator!,
            dia_periodo: 2,
            tendencia: 'CRESCENTE',
            mitigacao_recomendada: 'REVISAR_CHECKIN',
          },
          alertas: ['CHECKIN_PENDENTE', 'SONO_ESTIMADO'],
        }),
        buildSnapshotItem({
          data_operacional: '2026-06-19',
          duracao_jornada_minutos: 360,
          horas_voo_minutos: 90,
          snapshot_status: 'CRITICO',
          effectiveness_pct: 64,
          fortnight_indicator: {
            ...buildSnapshotItem().fortnight_indicator!,
            dia_periodo: 4,
            tendencia: 'CRESCENTE',
            mitigacao_recomendada: 'REDUZIR_JORNADA',
          },
          alertas: ['EFETIVIDADE_BAIXA'],
        }),
      ],
      {
        periodStart: '2026-06-16',
        periodEnd: '2026-06-20',
        focusDate: '2026-06-19',
      },
    );

    expect(result.days).toHaveLength(5);
    expect(result.days[0]).toMatchObject({
      data_operacional: '2026-06-16',
      jornada_acumulada_min: 480,
      voo_acumulada_min: 180,
      snapshot_status: 'OK',
    });
    expect(result.days[1]).toMatchObject({
      data_operacional: '2026-06-17',
      jornada_acumulada_min: 780,
      voo_acumulada_min: 300,
      snapshot_status: 'ATENCAO',
    });
    expect(result.days[2]).toMatchObject({
      data_operacional: '2026-06-18',
      jornada_min: 0,
      voo_min: 0,
      snapshot_status: 'SEM_REGISTRO',
      highlights: ['Sem dado confirmado no snapshot'],
    });
    expect(result.days[3]).toMatchObject({
      data_operacional: '2026-06-19',
      jornada_acumulada_min: 1140,
      voo_acumulada_min: 390,
      is_focus_day: true,
      snapshot_status: 'CRITICO',
    });
    expect(result.summary).toMatchObject({
      visible_days: 5,
      jornadas_days: 3,
      pending_checkins: 1,
      estimated_days: 1,
      attention_days: 1,
      critical_days: 1,
      cumulative_duty_min: 1140,
      cumulative_flight_min: 390,
    });
  });
});

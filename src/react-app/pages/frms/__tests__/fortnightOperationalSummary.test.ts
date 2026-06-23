import { describe, expect, it } from 'vitest';
import type { FrmsOperationalSnapshotItem } from '@/react-app/hooks/useFrmsOperationalSnapshot';
import { buildFortnightOperationalSummary } from '../fortnightOperationalSummary';

function buildSnapshotItem(
  overrides: Partial<FrmsOperationalSnapshotItem> = {},
): FrmsOperationalSnapshotItem {
  return {
    empresa_id: 1,
    data_operacional: '2026-06-23',
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
      periodo_fim: '2026-06-30',
      dia_periodo: 8,
      total_dias_periodo: 15,
      dias_consecutivos_com_jornada: 3,
      dias_com_checkin_pendente: 0,
      dias_com_dado_estimado: 0,
      duty_time_periodo_min: 1800,
      duty_time_168h_min: 900,
      horas_voo_periodo_min: 600,
      horas_voo_168h_min: 260,
      jornadas_periodo: 3,
      apresentacoes_antes_0600: 0,
      apresentacoes_antes_0700: 1,
      menor_descanso_entre_jornadas_min: 720,
      setores_periodo: null,
      sit_periods_estimados: null,
      fonte_periodo: 'REAL',
      freshness_dado: 'COMPLETO',
      status_quinzena: 'OK',
      score_acumulado: 42,
      tendencia: 'ESTAVEL',
      atenuadores_aplicados: [],
      agravantes_aplicados: [],
      natureza_dado: 'PROJECAO',
      explicacao_operacional: null,
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

describe('buildFortnightOperationalSummary', () => {
  it('consolida acumulados, status e lista de atencao sem inventar dados', () => {
    const summary = buildFortnightOperationalSummary(
      [
        buildSnapshotItem(),
        buildSnapshotItem({
          funcionario_id: 20,
          tripulante_id: 20,
          nome: 'Ana Paula Souza',
          nome_guerra: 'Ana',
          funcao: 'SIC',
          aeronave: 'SK76',
          checkin_status: 'PENDENTE',
          sleep_data_source: 'ESTIMADO',
          wake_data_source: 'ESTIMADO',
          jornada_data_source: 'AUSENTE',
          effectiveness_pct: 71,
          snapshot_status: 'ATENCAO',
          alertas: ['CHECKIN_PENDENTE'],
          fortnight_indicator: {
            ...buildSnapshotItem().fortnight_indicator!,
            duty_time_periodo_min: 2100,
            horas_voo_periodo_min: 720,
            status_quinzena: 'ATENCAO',
            tendencia: 'CRESCENTE',
            mitigacao_recomendada: 'REVISAR_CHECKIN',
          },
        }),
        buildSnapshotItem({
          funcionario_id: 30,
          tripulante_id: 30,
          nome: 'Carla Nunes',
          nome_guerra: 'Carla',
          funcao: 'SIC',
          aeronave: 'H145',
          checkin_status: 'AUSENTE',
          snapshot_status: 'CRITICO',
          alertas: ['CHECKIN_CRITICO', 'DADO_INCONSISTENTE'],
          jornada_data_source: 'INCONSISTENTE',
          fortnight_indicator: {
            ...buildSnapshotItem().fortnight_indicator!,
            duty_time_periodo_min: 2400,
            horas_voo_periodo_min: 820,
            status_quinzena: 'CRITICO',
            mitigacao_recomendada: 'REDUZIR_JORNADA',
          },
        }),
      ],
      '2026-06-23',
    );

    expect(summary.monitoredCount).toBe(3);
    expect(summary.attentionCount).toBe(1);
    expect(summary.criticalCount).toBe(1);
    expect(summary.criticalCheckinsCount).toBe(1);
    expect(summary.estimatedOrIncompleteCount).toBe(2);
    expect(summary.periodStatus).toBe('INCOMPLETA');
    expect(summary.topDutyCrew?.displayName).toBe('Carla');
    expect(summary.topFlightCrew?.displayName).toBe('Carla');
    expect(summary.attentionItems.map((item) => item.displayName)).toEqual(['Carla', 'Ana']);
    expect(summary.attentionItems[0]?.recommendedAction).toBe('Reduzir jornada');
    expect(summary.attentionItems[1]?.primaryReason).toBe('Check-in pendente');
  });

  it('retorna quinzena nao confirmada quando nao ha indicador localizado', () => {
    const summary = buildFortnightOperationalSummary(
      [
        buildSnapshotItem({
          funcionario_id: 90,
          tripulante_id: 90,
          fortnight_indicator: {
            ...buildSnapshotItem().fortnight_indicator!,
            periodo_inicio: null,
            periodo_fim: null,
            fonte_periodo: 'AUSENTE',
          },
        }),
      ],
      '2026-06-23',
    );

    expect(summary.periodStatus).toBe('NAO_CONFIRMADA');
    expect(summary.topDutyCrew).toBeNull();
    expect(summary.topFlightCrew).toBeNull();
  });
});

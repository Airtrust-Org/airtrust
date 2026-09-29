import { describe, expect, it } from 'vitest';
import type { FrmsOperationalSnapshotItem } from '@/react-app/hooks/useFrmsOperationalSnapshot';
import {
  classifyOperationalItem,
  isOperationallyRelevant,
  operationalConfidence,
  resolveOperationalDataMoment,
  trustedEffectiveness,
} from '../frmsOperationalDecision';

function item(overrides: Partial<FrmsOperationalSnapshotItem> = {}): FrmsOperationalSnapshotItem {
  return {
    empresa_id: 1,
    data_operacional: '2026-08-27',
    funcionario_id: 10,
    tripulante_id: 10,
    nome: 'Tripulante Teste',
    nome_guerra: 'Teste',
    funcao: 'PIC',
    base: 'SBJR',
    aeronave: 'AW139',
    escalado: true,
    operacao_requer_decisao: true,
    escala_source: 'SIGVOOS',
    hora_apresentacao: '08:00',
    hora_termino: '17:00',
    horas_voo_minutos: 180,
    duracao_jornada_minutos: 540,
    teve_jornada: true,
    checkin_status: 'RECEBIDO',
    checkin_horario: '06:30',
    kss_score: 3,
    horas_sono: 7.5,
    qualidade_sono: 4,
    hora_acordar: '05:30',
    fadiga_score: 20,
    status_operacional_checkin: 'APTO',
    effectiveness_pct: 92,
    nivel_fadiga_calculado: 'BAIXO',
    fatorizacao_status: 'CALCULADA',
    sleep_data_source: 'REAL',
    wake_data_source: 'REAL',
    jornada_data_source: 'REAL',
    jornada_origem: 'SIGVOOS',
    snapshot_status: 'OK',
    fortnight_indicator: null,
    alertas: [],
    estado_operacional: 'NORMAL',
    motivos_principais: [],
    acao_recomendada_texto: 'Nenhuma ação imediata.',
    ...overrides,
  };
}

describe('frmsOperationalDecision', () => {
  it('nunca classifica snapshot incompleto como normal', () => {
    expect(
      classifyOperationalItem(
        item({
          snapshot_status: 'INCOMPLETO',
          estado_operacional: 'NAO_AVALIADO',
          effectiveness_pct: 0,
        }),
      ),
    ).toBe('CONFIRMAR');
  });

  it('manda ausência de fatorização para confirmação', () => {
    expect(
      classifyOperationalItem(
        item({
          fatorizacao_status: 'AUSENTE',
          effectiveness_pct: 0,
        }),
      ),
    ).toBe('CONFIRMAR');
  });

  it('prioriza violação crítica como bloqueio', () => {
    expect(
      classifyOperationalItem(
        item({
          estado_operacional: 'CRITICO_VIOLACAO',
          snapshot_status: 'CRITICO',
        }),
      ),
    ).toBe('BLOQUEIO');
  });

  it('classifica atenção ou mitigação como decisão', () => {
    expect(
      classifyOperationalItem(
        item({
          estado_operacional: 'MITIGACAO_NECESSARIA',
          snapshot_status: 'ATENCAO',
        }),
      ),
    ).toBe('DECISAO');
  });

  it('não apresenta efetividade numérica quando o dado não é confiável', () => {
    expect(
      trustedEffectiveness(
        item({
          fatorizacao_status: 'AUSENTE',
          effectiveness_pct: 0,
        }),
      ),
    ).toBeNull();
  });

  it('mantém a efetividade projetada visível antes do fechamento da jornada', () => {
    expect(
      trustedEffectiveness(
        item({
          effectiveness_pct: 89.4,
          effectiveness_source: 'PROJETADA_APRESENTACAO',
          fatorizacao_status: 'PROJETADA',
          jornada_data_source: 'AUSENTE',
          jornada_origem: null,
          teve_jornada: false,
          snapshot_status: 'ATENCAO',
        }),
      ),
    ).toBe(89.4);
  });

  it('preserva zero legítimo quando houve cálculo com dados completos', () => {
    expect(trustedEffectiveness(item({ effectiveness_pct: 0 }))).toBe(0);
  });

  it('expõe confiança alta, média e baixa conforme a procedência dos dados', () => {
    expect(operationalConfidence(item())).toBe('ALTA');
    expect(operationalConfidence(item({ sleep_data_source: 'ESTIMADO' }))).toBe('MEDIA');
    expect(
      operationalConfidence(
        item({
          jornada_data_source: 'AUSENTE',
          fatorizacao_status: 'AUSENTE',
        }),
      ),
    ).toBe('BAIXA');
  });

  it('não trata ausência de jornada como pendência quando não há atividade prevista', () => {
    expect(
      classifyOperationalItem(
        item({
          operacao_requer_decisao: false,
          escalado: false,
          teve_jornada: false,
          jornada_data_source: 'AUSENTE',
          fatorizacao_status: 'AUSENTE',
          effectiveness_pct: null,
          estado_operacional: 'NORMAL',
        }),
      ),
    ).toBe('NORMAL');
  });

  it('mantém na fila o tripulante que pertence à quinzena mesmo sem atividade no dia', () => {
    const rosterOnly = item({
      operacao_requer_decisao: false,
      escalado: false,
      teve_jornada: false,
      jornada_data_source: 'AUSENTE',
      fatorizacao_status: 'AUSENTE',
      effectiveness_pct: null,
      checkin_status: 'NAO_APLICAVEL',
      estado_operacional: 'NORMAL',
      alertas: [],
      fortnight_indicator: {
        periodo_inicio: '2026-08-16',
        periodo_fim: '2026-08-30',
        dia_periodo: 12,
        total_dias_periodo: 15,
        dias_consecutivos_com_jornada: 0,
        dias_com_checkin_pendente: 0,
        dias_com_dado_estimado: 0,
        duty_time_periodo_min: 0,
        duty_time_168h_min: 0,
        horas_voo_periodo_min: 0,
        horas_voo_168h_min: 0,
        atividade_frms_periodo_min: 0,
        horas_voo_frms_periodo_min: 0,
        simulador_periodo_min: 0,
        treinamento_periodo_min: 0,
        dias_atividade_periodo: 0,
        dias_consecutivos_com_atividade: 0,
        jornadas_periodo: 0,
        apresentacoes_antes_0600: 0,
        apresentacoes_antes_0700: 0,
        menor_descanso_entre_jornadas_min: null,
        setores_periodo: null,
        sit_periods_estimados: null,
        fonte_periodo: 'DERIVADO',
        freshness_dado: 'COMPLETO',
        status_quinzena: 'OK',
        score_acumulado: 0,
        tendencia: 'ESTAVEL',
        atenuadores_aplicados: [],
        agravantes_aplicados: [],
        natureza_dado: 'ACUMULADO_LEGAL',
        explicacao_operacional: 'Sem agravantes no período.',
        mitigacao_recomendada: 'SEM_ACAO',
        decisao: 'INFORMA',
        limite_referencia: null,
        alertas_quinzena: [],
        limitation_notes: [],
      },
    });

    expect(isOperationallyRelevant(rosterOnly)).toBe(true);
    expect(classifyOperationalItem(rosterOnly)).toBe('NORMAL');
  });

  it('não coloca na fila check-in isolado quando a quinzena não foi resolvida', () => {
    const checkinOnly = item({
      escalado: false,
      teve_jornada: false,
      teve_atividade_frms: false,
      operacao_requer_decisao: true,
      escala_source: 'AUSENTE',
      jornada_data_source: 'AUSENTE',
      fatorizacao_status: 'PROJETADA',
      effectiveness_source: 'PROJETADA_APRESENTACAO',
      effectiveness_pct: 87,
      snapshot_status: 'ATENCAO',
      estado_operacional: 'ATENCAO',
      alertas: ['CHECKIN_CRITICO'],
      fortnight_indicator: {
        periodo_inicio: null,
        periodo_fim: null,
        status_quinzena: 'INCOMPLETO',
      } as FrmsOperationalSnapshotItem['fortnight_indicator'],
    });

    expect(isOperationallyRelevant(checkinOnly)).toBe(false);
  });

  it('mantém atividade operacional sem quinzena na fila como extensão a confirmar', () => {
    const extension = item({
      escalado: false,
      teve_jornada: true,
      teve_atividade_frms: true,
      operacao_requer_decisao: true,
      jornada_data_source: 'REAL',
      snapshot_status: 'OK',
      estado_operacional: 'NORMAL',
      alertas: [],
      fortnight_indicator: {
        periodo_inicio: null,
        periodo_fim: null,
        status_quinzena: 'INCOMPLETO',
      } as FrmsOperationalSnapshotItem['fortnight_indicator'],
    });

    expect(isOperationallyRelevant(extension)).toBe(true);
    expect(classifyOperationalItem(extension)).toBe('CONFIRMAR');
    expect(operationalConfidence(extension)).toBe('BAIXA');
  });

  it('separa o dia em aberto da pendência retrospectiva sem tornar o alerta verde', () => {
    const openDay = item({
      data_operacional: '2026-08-27',
      teve_jornada: false,
      teve_atividade_frms: false,
      jornada_data_source: 'AUSENTE',
      fatorizacao_status: 'AUSENTE',
      snapshot_status: 'INCOMPLETO',
      estado_operacional: 'NAO_AVALIADO',
    });

    expect(resolveOperationalDataMoment(openDay, '2026-08-27')).toBe('DIA_EM_ABERTO');
    expect(resolveOperationalDataMoment(openDay, '2026-08-28')).toBe('FECHAMENTO_RETROSPECTIVO_PENDENTE');
    expect(classifyOperationalItem(openDay)).toBe('CONFIRMAR');
  });
});

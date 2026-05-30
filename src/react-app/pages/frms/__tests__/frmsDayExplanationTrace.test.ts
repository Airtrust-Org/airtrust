import { describe, expect, it } from 'vitest';
import type {
  FrmsDayExplanationResponse,
  FrmsEffectivenessJornadaRow,
} from '@/react-app/hooks/useFrms';
import { buildFrmsDayExplanationTrace } from '../frmsDayExplanationTrace';

function makeExplanation(
  partial?: Partial<FrmsDayExplanationResponse>,
): FrmsDayExplanationResponse {
  return {
    tripulante: {
      id: '41',
      nome: 'Tripulante Teste',
      cargo: 'Piloto',
    },
    jornada: {
      data: '2026-05-28',
      hora_apresentacao: '07:30',
      hora_acordou: '06:00',
      effectiveness_pct: 82.4,
      effectiveness_nivel: 'atencao',
      tempo_abaixo_limiar_min: 45,
      dias_criticos_consecutivos: 0,
      duracao_sono_efetiva_min: 420,
      hora_despertar_estimada: '06:00',
      hora_inicio_sono_estimado: '23:00',
      dia_periodo_embarcado: 3,
      total_dias_periodo: 14,
    },
    diagnostico: {
      faixa: 'amarelo',
      resumo_executivo: 'Resumo',
      explicacao_tecnica: 'Explicação técnica',
      explicacao_didatica: 'Explicação didática',
      fator_principal: 'Repouso',
      fatores: [
        {
          codigo: 'repouso',
          titulo: 'Repouso',
          impacto_pct: -8.2,
          impacto_abs_pct: 8.2,
          direcao: 'penaliza',
          resumo: 'Repouso insuficiente reduziu a margem.',
        },
        {
          codigo: 'duracao',
          titulo: 'Duração',
          impacto_pct: -1.6,
          impacto_abs_pct: 1.6,
          direcao: 'penaliza',
          resumo: 'Jornada longa consumiu margem adicional.',
        },
      ],
      recomendacoes: [],
    },
    copiloto: {
      texto: 'Texto',
      provider: 'rule-engine',
      model: 'frms-day-explainer-v1',
    },
    explanation_trace: undefined,
    ...partial,
  };
}

function makeTimelineRow(partial?: Partial<FrmsEffectivenessJornadaRow>): FrmsEffectivenessJornadaRow {
  return {
    id: 'fj-1',
    jornada_id: 'j-1',
    processado_com_bug: 0,
    data_apresentacao: '2026-05-28',
    data_liberacao: '2026-05-28',
    effectiveness_pct: 82.4,
    effectiveness_nivel: 'ATENCAO',
    effectiveness_componentes_json: null,
    total_fatorizado_jornada: -0.15,
    fator_basica_pct: -0.03,
    fator_repouso_pct: -0.08,
    fator_noturno_dep_pct: -0.02,
    fator_noturno_arr_pct: 0,
    fator_hv_quantidade_pct: -0.01,
    fator_apresentacao_pct: -0.02,
    fator_ciclo_embarcado_pct: -0.01,
    duracao_sono_efetiva_min: 420,
    hora_despertar_estimada: '06:00',
    hora_inicio_sono_estimado: '23:00',
    tempo_abaixo_limiar_min: 45,
    dia_periodo_embarcado: 3,
    total_dias_periodo: 14,
    ...partial,
  };
}

describe('buildFrmsDayExplanationTrace', () => {
  it('prioriza explanation_trace do backend quando disponível', () => {
    const trace = buildFrmsDayExplanationTrace({
      explanation: makeExplanation({
        explanation_trace: {
          version: 'frms-day-trace-v1',
          dataQuality: {
            data_source: 'crew_reported',
            confidence: 'reported',
            sourceSummary: 'informed',
            limitations: ['Limitação backend explícita.'],
          },
          sleep: {
            durationMinutes: 400,
            source: 'INFORMADO',
            wakeTime: '06:10',
            wakeTimeSource: 'crew_reported',
            sleepStartEstimated: '23:20',
            wakeTimeEstimated: '06:10',
          },
          duty: {
            date: '2026-05-28',
            reportTime: '07:30',
            minutesAwakeBeforeReport: 80,
            missingReportTime: false,
          },
          calculation: {
            effectivenessPct: 82.4,
            readinessPct: 80.8,
            level: 'ATENCAO',
            timeBelowThresholdMinutes: 45,
            mainFactor: 'repouso',
            mainFactorImpact: '-8.2 pp',
            components: {
              basica: 0.7,
              processo_s: -0.2,
              processo_c: -0.5,
              repouso: -0.8,
              hv: -0.1,
              duracao: -1.6,
            },
          },
          sourceFlags: {
            informedData: true,
            estimatedData: false,
            legacyPreC2: false,
            c2Corrected: true,
            recalculationPending: false,
          },
          windows: {
            daily: {
              available: true,
              date: '2026-05-28',
              effectivenessPct: 82.4,
              explanation: 'daily ok',
            },
            sevenDays: {
              available: true,
              worstDay: '2026-05-26',
              worstEffectivenessPct: 79.1,
              explanation: '7d ok',
            },
            twentyEightDays: {
              available: false,
              worstDay: null,
              worstEffectivenessPct: null,
              explanation: '28d indisponível',
            },
          },
        },
      }),
      timelineRow: makeTimelineRow({ processado_com_bug: 1 }),
      displayedEffectivenessLabel: 'Atenção',
    });

    expect(trace.inputs.wakeTimeSource).toBe('crew_reported');
    expect(trace.windowsUsed.find((w) => w.key === '7d')?.used).toBe(true);
    expect(trace.windowsUsed.find((w) => w.key === '28d')?.used).toBe(false);
    expect(trace.sourceFlags.legacyPreC2).toBe(false);
    expect(trace.operatorExplanation.limitationsText).toContain('Limitação backend explícita');
  });

  it('marca dado informado e C2 corrigido quando há hora acordada informada', () => {
    const trace = buildFrmsDayExplanationTrace({
      explanation: makeExplanation(),
      timelineRow: makeTimelineRow({ processado_com_bug: 0 }),
      displayedEffectivenessLabel: 'Atenção',
    });

    expect(trace.sourceFlags.informedData).toBe(true);
    expect(trace.sourceFlags.estimatedData).toBe(false);
    expect(trace.sourceFlags.c2Corrected).toBe(true);
    expect(trace.sourceFlags.legacyPreC2).toBe(false);
    expect(trace.inputs.wakeTimeSource).toBe('crew_reported');
    expect(trace.operatorExplanation.limitationsText).toContain('triagem operacional');
    expect(trace.operatorExplanation.limitationsText).toMatch(/não é diagnóstico médico/i);
    expect(trace.operatorExplanation.limitationsText).toContain('não é decisão automática');
  });

  it('marca dado estimado e legado pré-C2 quando faltar hora acordada informada', () => {
    const trace = buildFrmsDayExplanationTrace({
      explanation: makeExplanation({
        jornada: {
          ...makeExplanation().jornada,
          hora_acordou: null,
          duracao_sono_efetiva_min: 390,
        },
      }),
      timelineRow: makeTimelineRow({ processado_com_bug: 1 }),
      displayedEffectivenessLabel: 'Crítico',
    });

    expect(trace.sourceFlags.informedData).toBe(false);
    expect(trace.sourceFlags.estimatedData).toBe(true);
    expect(trace.sourceFlags.legacyPreC2).toBe(true);
    expect(trace.sourceFlags.c2Corrected).toBe(false);
    expect(trace.inputs.sleepSource).toBe('dado estimado');
    expect(trace.limitations.legacyRecord).toBe(true);
  });

  it('marca recálculo pendente quando faltar hora de apresentação', () => {
    const trace = buildFrmsDayExplanationTrace({
      explanation: makeExplanation({
        jornada: {
          ...makeExplanation().jornada,
          hora_apresentacao: null,
          hora_acordou: null,
          duracao_sono_efetiva_min: null,
        },
      }),
      timelineRow: makeTimelineRow({
        hora_despertar_estimada: null,
        duracao_sono_efetiva_min: null,
      }),
      displayedEffectivenessLabel: 'Sem classificação',
    });

    expect(trace.sourceFlags.recalculationPending).toBe(true);
    expect(trace.limitations.missingReportTime).toBe(true);
    expect(trace.limitations.insufficientData).toBe(true);
  });

  it('explica diferença entre tripulantes quando os dados de entrada mudam', () => {
    const traceA = buildFrmsDayExplanationTrace({
      explanation: makeExplanation({
        tripulante: { id: '41', nome: 'Trip A', cargo: 'Piloto' },
        jornada: { ...makeExplanation().jornada, hora_acordou: '05:30' },
      }),
      timelineRow: makeTimelineRow({ processado_com_bug: 0 }),
      displayedEffectivenessLabel: 'Atenção',
    });
    const traceB = buildFrmsDayExplanationTrace({
      explanation: makeExplanation({
        tripulante: { id: '42', nome: 'Trip B', cargo: 'Piloto' },
        jornada: { ...makeExplanation().jornada, hora_acordou: null, duracao_sono_efetiva_min: 360 },
      }),
      timelineRow: makeTimelineRow({ processado_com_bug: 1 }),
      displayedEffectivenessLabel: 'Crítico',
    });

    expect(traceA.inputs.sleepSource).toBe('dado informado');
    expect(traceB.inputs.sleepSource).toBe('dado estimado');
    expect(traceA.sourceFlags.legacyPreC2).toBe(false);
    expect(traceB.sourceFlags.legacyPreC2).toBe(true);
    expect(traceA.operatorExplanation.whatToCheck).toContain('diferenças');
    expect(traceB.operatorExplanation.limitationsText).not.toMatch(
      /apto|inapto|SAFTE-FAST validado|cientificamente validado/i,
    );
  });

  it('faz fallback para trace frontend quando backend trace não vier', () => {
    const trace = buildFrmsDayExplanationTrace({
      explanation: makeExplanation({ explanation_trace: undefined }),
      timelineRow: makeTimelineRow({ processado_com_bug: 1 }),
      displayedEffectivenessLabel: 'Crítico',
    });

    expect(trace.windowsUsed.find((w) => w.key === '7d')?.used).toBe(false);
    expect(trace.sourceFlags.legacyPreC2).toBe(true);
    expect(trace.inputs.priorDaysWindow).toContain('não disponível');
  });
});

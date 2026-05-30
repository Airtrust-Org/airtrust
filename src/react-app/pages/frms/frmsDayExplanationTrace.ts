import type {
  FrmsDayExplanationResponse,
  FrmsEffectivenessJornadaRow,
} from '@/react-app/hooks/useFrms';

export interface FrmsDayExplanationTraceWindow {
  key: 'dia' | '7d' | '28d';
  used: boolean;
  source: 'backend' | 'frontend';
  notes: string;
}

export interface FrmsDayExplanationTraceFactor {
  code: string;
  impactPct: number | null;
  direction: 'penaliza' | 'favorece' | 'neutro';
  summary: string;
}

export interface FrmsDayExplanationTraceLimitations {
  missingReportTime: boolean;
  estimatedSleep: boolean;
  legacyRecord: boolean;
  insufficientData: boolean;
}

export interface FrmsDayExplanationTrace {
  date: string;
  crewMemberLabel: string;
  finalReadinessPct: number | null;
  finalReadinessLabel: string;
  effectivenessPct: number | null;
  fatigueAccumulationPct: number | null;
  windowsUsed: FrmsDayExplanationTraceWindow[];
  inputs: {
    sleepDurationMinutes: number | null;
    sleepSource: string;
    wakeTime: string | null;
    wakeTimeSource: string;
    reportTime: string | null;
    minutesAwakeBeforeReport: number | null;
    dutyStart: string | null;
    hv: number | null;
    priorDaysWindow: string;
  };
  factors: {
    sleepFactor: FrmsDayExplanationTraceFactor | null;
    wakeFactor: FrmsDayExplanationTraceFactor | null;
    dutyFactor: FrmsDayExplanationTraceFactor | null;
    accumulationFactor: FrmsDayExplanationTraceFactor | null;
    worstDayFactor: FrmsDayExplanationTraceFactor | null;
    legacyDataFactor: FrmsDayExplanationTraceFactor | null;
  };
  sourceFlags: {
    informedData: boolean;
    estimatedData: boolean;
    legacyPreC2: boolean;
    c2Corrected: boolean;
    recalculationPending: boolean;
  };
  limitations: FrmsDayExplanationTraceLimitations;
  operatorExplanation: {
    simpleSummary: string;
    whatInfluenced: string;
    howToInterpret: string;
    whatToCheck: string;
    limitationsText: string;
  };
}

interface BuildTraceInput {
  explanation: FrmsDayExplanationResponse;
  timelineRow?: FrmsEffectivenessJornadaRow | null;
  displayedEffectivenessLabel?: string | null;
}

function toMinutes(hhmm: string | null | undefined): number | null {
  if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return null;
  const [hh, mm] = hhmm.split(':').map(Number);
  if (!Number.isInteger(hh) || !Number.isInteger(mm)) return null;
  return hh * 60 + mm;
}

function factorByCode(explanation: FrmsDayExplanationResponse, code: string) {
  return explanation.diagnostico.fatores.find((factor) => factor.codigo === code) ?? null;
}

function toTraceFactor(
  explanation: FrmsDayExplanationResponse,
  code: string,
): FrmsDayExplanationTraceFactor | null {
  const factor = factorByCode(explanation, code);
  if (!factor) return null;
  return {
    code: factor.codigo,
    impactPct: Number.isFinite(factor.impacto_pct) ? factor.impacto_pct : null,
    direction: factor.direcao,
    summary: factor.resumo,
  };
}

export function buildFrmsDayExplanationTrace(input: BuildTraceInput): FrmsDayExplanationTrace {
  const { explanation, timelineRow, displayedEffectivenessLabel } = input;
  const journey = explanation.jornada;
  const duracaoFactor = toTraceFactor(explanation, 'duracao');
  const basePct = journey.effectiveness_pct;
  const finalPct =
    basePct != null && duracaoFactor?.impactPct != null
      ? Math.max(0, Math.min(100, Number((basePct + duracaoFactor.impactPct).toFixed(1))))
      : basePct;

  const reportMin = toMinutes(journey.hora_apresentacao);
  const wakeMin = toMinutes(journey.hora_acordou || journey.hora_despertar_estimada);
  const minutesAwakeBeforeReport =
    reportMin != null && wakeMin != null ? Math.max(0, reportMin - wakeMin) : null;

  const informedData = !!journey.hora_acordou;
  const estimatedData = !journey.hora_acordou && journey.duracao_sono_efetiva_min != null;
  const legacyPreC2 = timelineRow?.processado_com_bug === 1;
  const c2Corrected = timelineRow?.processado_com_bug === 0;
  const recalculationPending =
    !journey.hora_apresentacao ||
    (timelineRow?.hora_despertar_estimada == null && timelineRow?.duracao_sono_efetiva_min == null);

  const worstDayFactor =
    explanation.diagnostico.fatores.find(
      (factor) => factor.direcao === 'penaliza' && Math.abs(factor.impacto_pct) > 0,
    ) ?? explanation.diagnostico.fatores[0] ?? null;

  const limitations: FrmsDayExplanationTraceLimitations = {
    missingReportTime: !journey.hora_apresentacao,
    estimatedSleep: estimatedData,
    legacyRecord: legacyPreC2,
    insufficientData: finalPct == null || !journey.hora_apresentacao,
  };

  const label =
    displayedEffectivenessLabel ||
    journey.effectiveness_nivel ||
    explanation.diagnostico.faixa ||
    'Sem classificação';

  return {
    date: journey.data,
    crewMemberLabel: `Tripulante #${explanation.tripulante.id}`,
    finalReadinessPct: finalPct,
    finalReadinessLabel: label,
    effectivenessPct: basePct,
    fatigueAccumulationPct: null,
    windowsUsed: [
      {
        key: 'dia',
        used: true,
        source: 'backend',
        notes: 'Leitura diária de effectiveness do dia selecionado.',
      },
      {
        key: '7d',
        used: false,
        source: 'frontend',
        notes: 'Não há no payload do dia um breakdown determinístico de 7 dias.',
      },
      {
        key: '28d',
        used: false,
        source: 'frontend',
        notes: 'Não há no payload do dia um breakdown determinístico de 28 dias.',
      },
    ],
    inputs: {
      sleepDurationMinutes: journey.duracao_sono_efetiva_min,
      sleepSource: informedData ? 'dado informado' : estimatedData ? 'dado estimado' : 'sem dado',
      wakeTime: journey.hora_acordou || journey.hora_despertar_estimada,
      wakeTimeSource: informedData ? 'crew_reported' : estimatedData ? 'default_estimate' : 'missing',
      reportTime: journey.hora_apresentacao,
      minutesAwakeBeforeReport,
      dutyStart: journey.hora_apresentacao,
      hv: null,
      priorDaysWindow: 'não disponível no payload do dia',
    },
    factors: {
      sleepFactor: toTraceFactor(explanation, 'repouso'),
      wakeFactor: toTraceFactor(explanation, 'processo_c'),
      dutyFactor: toTraceFactor(explanation, 'duracao'),
      accumulationFactor: toTraceFactor(explanation, 'hv'),
      worstDayFactor: worstDayFactor
        ? {
            code: worstDayFactor.codigo,
            impactPct: worstDayFactor.impacto_pct,
            direction: worstDayFactor.direcao,
            summary: worstDayFactor.resumo,
          }
        : null,
      legacyDataFactor: null,
    },
    sourceFlags: {
      informedData,
      estimatedData,
      legacyPreC2,
      c2Corrected,
      recalculationPending,
    },
    limitations,
    operatorExplanation: {
      simpleSummary:
        finalPct == null
          ? 'Sem base suficiente para estimar o índice final com rastreabilidade completa.'
          : `Índice final estimado: ${finalPct.toFixed(1)}% (${label}).`,
      whatInfluenced: worstDayFactor
        ? `Maior influência observada: ${worstDayFactor.titulo} (${worstDayFactor.impacto_pct.toFixed(1)} pp).`
        : 'Não há fator dominante com impacto isolado visível no payload atual.',
      howToInterpret:
        'Trate o valor como indicador operacional de contexto; compare sempre com sono, horários e histórico do tripulante.',
      whatToCheck:
        'Verifique horário de apresentação, origem dos dados de sono/despertar e diferenças de pior dia/fatores entre tripulantes.',
      limitationsText:
        'Não é diagnóstico médico e não é decisão automática. Onde o payload não traz breakdown por janela/fonte, a limitação é exibida explicitamente.',
    },
  };
}


import { hhmmToMinutes } from './calculos';

export type FrmsExplanationComponentKey =
  | 'basica'
  | 'processo_s'
  | 'processo_c'
  | 'repouso'
  | 'hv'
  | 'duracao';
export type FrmsExplanationViewOrigin = 'dashboard' | 'ficha' | 'desconhecida';

export interface FrmsExplanationFactor {
  codigo: FrmsExplanationComponentKey;
  titulo: string;
  impacto_pct: number;
  impacto_abs_pct: number;
  direcao: 'penaliza' | 'favorece' | 'neutro';
  resumo: string;
}

export interface FrmsExplanationRecommendation {
  codigo: string;
  prioridade: 'alta' | 'media' | 'baixa';
  titulo: string;
  descricao: string;
}

export interface FrmsDayExplanationPayload {
  tripulante: {
    id: string;
    nome: string;
    cargo: string | null;
  };
  jornada: {
    data: string;
    hora_apresentacao: string | null;
    hora_acordou: string | null;
    effectiveness_pct: number | null;
    effectiveness_nivel: string | null;
    tempo_abaixo_limiar_min: number | null;
    dias_criticos_consecutivos: number;
    duracao_sono_efetiva_min: number | null;
    hora_despertar_estimada: string | null;
    hora_inicio_sono_estimado: string | null;
    dia_periodo_embarcado: number | null;
    total_dias_periodo: number | null;
  };
  diagnostico: {
    faixa: string;
    resumo_executivo: string;
    explicacao_tecnica: string;
    explicacao_didatica: string;
    fator_principal: string;
    fatores: FrmsExplanationFactor[];
    recomendacoes: FrmsExplanationRecommendation[];
  };
  copiloto: {
    texto: string;
    provider: string;
    model: string;
  };
  explanation_trace?: FrmsDayExplanationTrace;
}

export type FrmsExplanationTraceSourceSummary = 'informed' | 'estimated' | 'mixed' | 'legacy' | 'unknown';

export interface FrmsDayExplanationTrace {
  version: 'frms-day-trace-v1';
  dataQuality: {
    data_source: 'crew_reported' | 'missing_checkin' | 'default_estimate' | 'not_applicable' | null;
    confidence: 'reported' | 'incomplete' | 'unavailable' | 'reduced' | null;
    sourceSummary: FrmsExplanationTraceSourceSummary;
    limitations: string[];
  };
  sleep: {
    durationMinutes: number | null;
    source: string | null;
    wakeTime: string | null;
    wakeTimeSource: string | null;
    sleepStartEstimated: string | null;
    wakeTimeEstimated: string | null;
  };
  duty: {
    date: string;
    reportTime: string | null;
    minutesAwakeBeforeReport: number | null;
    missingReportTime: boolean;
  };
  calculation: {
    effectivenessPct: number | null;
    readinessPct: number | null;
    level: string | null;
    timeBelowThresholdMinutes: number | null;
    mainFactor: string | null;
    mainFactorImpact: string | null;
    components: {
      basica: number | null;
      processo_s: number | null;
      processo_c: number | null;
      repouso: number | null;
      hv: number | null;
      duracao: number | null;
    };
  };
  sourceFlags: {
    informedData: boolean;
    estimatedData: boolean;
    legacyPreC2: boolean;
    c2Corrected: boolean;
    recalculationPending: boolean;
  };
  windows: {
    daily: {
      available: boolean;
      date: string;
      effectivenessPct: number | null;
      explanation: string;
    };
    sevenDays: {
      available: boolean;
      worstDay: string | null;
      worstEffectivenessPct: number | null;
      explanation: string;
    };
    twentyEightDays: {
      available: boolean;
      worstDay: string | null;
      worstEffectivenessPct: number | null;
      explanation: string;
    };
  };
}

export interface FrmsTraceWindowWorst {
  available: boolean;
  worstDay: string | null;
  worstEffectivenessPct: number | null;
}

export interface FrmsDayExplanationTraceContext {
  dataSource: 'crew_reported' | 'missing_checkin' | 'default_estimate' | 'not_applicable' | null;
  confidence: 'reported' | 'incomplete' | 'unavailable' | 'reduced' | null;
  wakeTimeSource: string | null;
  recalculationPending: boolean;
  windows: {
    sevenDays: FrmsTraceWindowWorst;
    twentyEightDays: FrmsTraceWindowWorst;
  };
  limitations: string[];
}

export interface FrmsComparisonDay {
  data: string;
  effectiveness_pct: number | null;
  nivel: string;
  fatores: Array<{
    codigo: FrmsExplanationComponentKey;
    impacto_pts: number;
    motivo_simples: string;
  }>;
}

export function normalizeFrmsExplanationOrigin(raw: string | null | undefined): FrmsExplanationViewOrigin {
  const normalized = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (normalized === 'dashboard') return 'dashboard';
  if (normalized === 'ficha') return 'ficha';
  return 'desconhecida';
}

export function roundOne(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.round(value * 10) / 10;
}

export function parseEffectivenessComponents(raw: string | null | undefined): Record<string, number> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([, value]) => typeof value === 'number' && Number.isFinite(value),
      ),
    ) as Record<string, number>;
  } catch {
    return {};
  }
}

export function sanitizeCopilotoTexto(raw: string, fallback: string): string {
  const source = String(raw || '').trim();
  if (!source) return fallback;

  const withoutCodeFence = source.replace(/```[\s\S]*?```/g, ' ');
  const normalizedLines = withoutCodeFence
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) =>
      line.replace(/^[-*•\u2022\u25CF\u25AA\d.\)\s]+/u, '').replace(/^['"]+|['"]+$/g, ''),
    )
    .map((line) =>
      line.replace(
        /^(par[aá]grafo\s*\d*|bloco\s*\d*|resumo\s*executivo|recomenda[cç][aã]o\s*operacional)\s*:\s*/i,
        '',
      ),
    )
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const merged = normalizedLines.join('\n\n').trim();
  if (!merged) return fallback;

  const paragraphs = merged
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 3);
  const finalText = paragraphs
    .join('\n\n')
    .replace(/[\*`]/g, '')
    .replace(/\s+([.,;:!?])/g, '$1')
    .trim();

  // If AI output ends without a terminal punctuation, it is often token-truncated.
  // In that case, fallback to deterministic text to avoid broken sentences in UI.
  if (!/[.!?…]$/.test(finalText)) return fallback;

  return finalText || fallback;
}

function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

function formatDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function shiftDate(value: string, days: number): string {
  const date = parseDateOnly(value);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDateOnly(date);
}

export function normalizeHora(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = String(value).trim();
  if (!/^\d{2}:\d{2}$/.test(normalized)) return null;
  return normalized;
}

export function formatHoursAndMinutes(totalMinutes: number | null | undefined): string {
  if (totalMinutes == null || !Number.isFinite(totalMinutes)) return 'sem dado confiável';
  const rounded = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(rounded / 60);
  const minutes = rounded % 60;
  return `${hours}h${String(minutes).padStart(2, '0')}`;
}

export function formatEffectivenessBand(
  pct: number | null | undefined,
  limites: Record<string, number> | null | undefined,
): string {
  if (pct == null || !Number.isFinite(pct)) return 'sem classificação';
  const verdeMin = Number(limites?.EFFECTIV_VERDE_MIN ?? 90);
  const amareloMax = Number(limites?.EFFECTIV_AMARELO_MAX ?? 77);
  const vermelhoMax = Number(limites?.EFFECTIV_VERMELHO_MAX ?? 65);
  if (pct >= verdeMin) return 'verde';
  if (pct <= vermelhoMax) return 'vermelho';
  if (pct <= amareloMax) return 'amarelo';
  return 'transição';
}

function describeImpactMagnitude(absPct: number): string {
  if (absPct >= 10) return 'alto';
  if (absPct >= 5) return 'moderado';
  if (absPct > 0) return 'leve';
  return 'nulo';
}

export function buildExplanationFactor(
  codigo: FrmsExplanationComponentKey,
  impactoRaw: number,
): FrmsExplanationFactor {
  if (codigo === 'basica') {
    const coeficienteBasal = Number.isFinite(impactoRaw) ? Math.max(0, impactoRaw) : 0;
    return {
      codigo,
      titulo: 'Condição circadiana basal estimada',
      impacto_pct: 0,
      impacto_abs_pct: 0,
      direcao: 'neutro',
      resumo: `Contexto basal observado em coeficiente ${coeficienteBasal.toFixed(2)} (escala 0 a 1). Este valor orienta leitura contextual e não entra como impacto direto em pontos percentuais do dia.`,
    };
  }

  const impactoPct = roundOne(impactoRaw * 100);
  const impactoAbsPct = Math.abs(impactoPct);
  const direcao = impactoPct < 0 ? 'penaliza' : impactoPct > 0 ? 'favorece' : 'neutro';
  const intensidade = describeImpactMagnitude(impactoAbsPct);

  const definitions: Record<
    FrmsExplanationComponentKey,
    { titulo: string; penaliza: string; favorece: string }
  > = {
    basica: {
      titulo: 'Reserva basal do estado de vigília',
      penaliza:
        'a condição basal do estado de vigília já começou reduzida para o início da jornada',
      favorece: 'a condição basal do estado de vigília sustentou o início da jornada com margem',
    },
    processo_s: {
      titulo: 'Ciclo embarcado',
      penaliza:
        'o acúmulo de dias embarcado reduziu a margem operacional estimada do tripulante',
      favorece: 'o ciclo embarcado ainda não pressionou o índice de forma relevante',
    },
    processo_c: {
      titulo: 'Janela circadiana',
      penaliza: 'o horário da apresentação caiu em uma faixa circadiana desfavorável',
      favorece: 'o horário da jornada coincidiu com uma faixa circadiana mais favorável',
    },
    repouso: {
      titulo: 'Repouso e sono',
      penaliza: 'o descanso anterior informado reduziu a margem estimada de recuperação',
      favorece: 'o descanso anterior informado ajudou a sustentar o índice estimado',
    },
    hv: {
      titulo: 'Acúmulo de horas de voo',
      penaliza: 'o histórico recente de horas de voo adicionou desgaste ao dia avaliado',
      favorece: 'o histórico recente de horas de voo não pressionou o dia avaliado',
    },
    duracao: {
      titulo: 'Duração da jornada',
      penaliza: 'a duração prevista da jornada puxa a efetividade para baixo ao longo do dia',
      favorece: 'a duração prevista da jornada não traz perda relevante de efetividade',
    },
  };

  const base = definitions[codigo];
  const resumo =
    direcao === 'penaliza'
      ? `Impacto ${intensidade}: ${base.penaliza}.`
      : direcao === 'favorece'
        ? `Impacto ${intensidade}: ${base.favorece}.`
        : `Impacto nulo: ${base.titulo.toLowerCase()} não alterou materialmente o resultado.`;

  return {
    codigo,
    titulo: base.titulo,
    impacto_pct: impactoPct,
    impacto_abs_pct: impactoAbsPct,
    direcao,
    resumo,
  };
}

export function buildFrmsRecommendations(
  row: Record<string, unknown>,
  faixa: string,
): FrmsExplanationRecommendation[] {
  const recommendations: FrmsExplanationRecommendation[] = [];
  const tempoAbaixo = Number(row.tempo_abaixo_limiar_min ?? 0);
  const sono = Number(row.duracao_sono_efetiva_min ?? 0);
  const diaEmbarcado = Number(row.dia_periodo_embarcado ?? 0);
  const totalEmbarcado = Number(row.total_dias_periodo ?? 0);
  const hvImpact = roundOne(Number(row.hv_component ?? 0) * 100);
  const circImpact = roundOne(Number(row.processo_c_component ?? 0) * 100);
  const isCriticalBand = faixa === 'vermelho' || tempoAbaixo > 0;
  const isAttentionBand = faixa === 'amarelo' || faixa === 'transição';

  if (isCriticalBand) {
    recommendations.push({
      codigo: 'replanejar-dia-critico',
      prioridade: 'alta',
      titulo: 'Verificar o dia operacional',
      descricao:
        tempoAbaixo > 0
          ? `Há cerca de ${formatHoursAndMinutes(tempoAbaixo)} abaixo do limiar configurado. A coordenação deve conferir a jornada, os dados de origem e a composição operacional do dia.`
          : 'O índice estimado ficou em faixa vermelha. A coordenação deve conferir a composição da jornada e os dados disponíveis antes de qualquer ação.',
    });
  }

  if (sono > 0 && sono < 360) {
    recommendations.push({
      codigo: 'proteger-sono',
      prioridade: isCriticalBand ? 'alta' : isAttentionBand ? 'media' : 'baixa',
      titulo: 'Verificar janela de sono antes da apresentação',
      descricao:
        isCriticalBand || isAttentionBand
          ? `O sistema registrou ${formatHoursAndMinutes(sono)} de sono efetivo estimado. A coordenação deve conferir se a informação é real, estimada ou incompleta.`
          : `Mesmo com índice do dia preservado, o sono estimado foi de ${formatHoursAndMinutes(sono)}. Vale manter acompanhamento operacional dos próximos acionamentos.`,
    });
  }

  if ((isCriticalBand && circImpact <= -5) || (isAttentionBand && circImpact <= -8)) {
    recommendations.push({
      codigo: 'mitigar-circadiano',
      prioridade: 'media',
      titulo: 'Verificar janela operacional desfavorável',
      descricao:
        'O horário da apresentação entrou em faixa operacional desfavorável. Se houver flexibilidade, a coordenação pode analisar alternativas sem tratar este indicador como decisão automática.',
    });
  }

  if ((isCriticalBand && hvImpact <= -5) || (isAttentionBand && hvImpact <= -8)) {
    recommendations.push({
      codigo: 'descomprimir-acumulo-hv',
      prioridade: 'media',
      titulo: 'Verificar acúmulo de horas de voo',
      descricao:
        'O histórico recente de voo pressionou o índice estimado. Este dado deve orientar conferência operacional, não uma ação automática isolada.',
    });
  }

  if (
    diaEmbarcado >= 2 &&
    totalEmbarcado >= diaEmbarcado &&
    (isCriticalBand || isAttentionBand || diaEmbarcado >= 4)
  ) {
    recommendations.push({
      codigo: 'acompanhar-ciclo-embarcado',
      prioridade: 'baixa',
      titulo: 'Acompanhar desgaste do período embarcado',
      descricao: `O tripulante está no dia ${diaEmbarcado} de ${totalEmbarcado} do período embarcado. A leitura deve considerar a tendência operacional e não só o ponto do dia.`,
    });
  }

  return recommendations.slice(0, 4);
}

export function toComparisonDay(explanation: FrmsDayExplanationPayload): FrmsComparisonDay {
  return {
    data: explanation.jornada.data,
    effectiveness_pct: explanation.jornada.effectiveness_pct,
    nivel: explanation.jornada.effectiveness_nivel || explanation.diagnostico.faixa,
    fatores: explanation.diagnostico.fatores.map((factor) => ({
      codigo: factor.codigo,
      impacto_pts: roundOne(factor.impacto_pct),
      motivo_simples: factor.resumo,
    })),
  };
}

export function toNumberOrNull(value: unknown): number | null {
  if (value == null) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function computeMinutesAwakeBeforeReport(
  horaAcordou: string | null,
  horaApresentacao: string | null,
): number | null {
  const wake = hhmmToMinutes(horaAcordou);
  const report = hhmmToMinutes(horaApresentacao);
  if (wake == null || report == null) return null;
  return Math.max(0, report - wake);
}

function resolveTraceSourceSummary(flags: {
  informedData: boolean;
  estimatedData: boolean;
  legacyPreC2: boolean;
}): FrmsExplanationTraceSourceSummary {
  if (flags.legacyPreC2) return 'legacy';
  if (flags.informedData && flags.estimatedData) return 'mixed';
  if (flags.informedData) return 'informed';
  if (flags.estimatedData) return 'estimated';
  return 'unknown';
}

export function buildFrmsDayExplanationTrace(
  row: Record<string, unknown>,
  deterministicPayload: Omit<FrmsDayExplanationPayload, 'copiloto'>,
  componentes: Record<string, number>,
  fatorPrincipal: FrmsExplanationFactor | undefined,
  context?: FrmsDayExplanationTraceContext,
): FrmsDayExplanationTrace {
  const horaAcordou = deterministicPayload.jornada.hora_acordou;
  const horaDespertarEstimada = deterministicPayload.jornada.hora_despertar_estimada;
  const horaApresentacao = deterministicPayload.jornada.hora_apresentacao;
  const wakeTime = normalizeHora(horaAcordou || horaDespertarEstimada);
  const duracaoFactorPct =
    componentes.duracao != null && Number.isFinite(componentes.duracao)
      ? roundOne(Number(componentes.duracao) * 100)
      : null;
  const readinessPct =
    deterministicPayload.jornada.effectiveness_pct != null && duracaoFactorPct != null
      ? Math.max(
          0,
          Math.min(100, roundOne(deterministicPayload.jornada.effectiveness_pct + duracaoFactorPct)),
        )
      : deterministicPayload.jornada.effectiveness_pct;

  const legacyPreC2 = Number(row.processado_com_bug ?? 0) === 1;
  const c2Corrected = Number(row.processado_com_bug ?? 0) === 0;
  const informedData = Boolean(horaAcordou) || String(row.fonte_sono || '') === 'INFORMADO';
  const estimatedData =
    !informedData &&
    (deterministicPayload.jornada.duracao_sono_efetiva_min != null || Boolean(horaDespertarEstimada));
  const sourceSummary = resolveTraceSourceSummary({
    informedData,
    estimatedData,
    legacyPreC2,
  });
  const limitations = Array.from(new Set(context?.limitations ?? []));
  const sevenDays = context?.windows.sevenDays ?? {
    available: false,
    worstDay: null,
    worstEffectivenessPct: null,
  };
  const twentyEightDays = context?.windows.twentyEightDays ?? {
    available: false,
    worstDay: null,
    worstEffectivenessPct: null,
  };

  return {
    version: 'frms-day-trace-v1',
    dataQuality: {
      data_source: context?.dataSource ?? null,
      confidence: context?.confidence ?? null,
      sourceSummary,
      limitations,
    },
    sleep: {
      durationMinutes: deterministicPayload.jornada.duracao_sono_efetiva_min,
      source: typeof row.fonte_sono === 'string' ? String(row.fonte_sono) : null,
      wakeTime,
      wakeTimeSource: context?.wakeTimeSource ?? null,
      sleepStartEstimated: deterministicPayload.jornada.hora_inicio_sono_estimado,
      wakeTimeEstimated: deterministicPayload.jornada.hora_despertar_estimada,
    },
    duty: {
      date: deterministicPayload.jornada.data,
      reportTime: deterministicPayload.jornada.hora_apresentacao,
      minutesAwakeBeforeReport: computeMinutesAwakeBeforeReport(wakeTime, horaApresentacao),
      missingReportTime: !Boolean(horaApresentacao),
    },
    calculation: {
      effectivenessPct: deterministicPayload.jornada.effectiveness_pct,
      readinessPct,
      level: deterministicPayload.jornada.effectiveness_nivel,
      timeBelowThresholdMinutes: deterministicPayload.jornada.tempo_abaixo_limiar_min,
      mainFactor: fatorPrincipal?.codigo ?? null,
      mainFactorImpact: fatorPrincipal ? `${fatorPrincipal.impacto_pct.toFixed(1)} pp` : null,
      components: {
        basica: toNumberOrNull(componentes.basica),
        processo_s: toNumberOrNull(componentes.processo_s),
        processo_c: toNumberOrNull(componentes.processo_c),
        repouso: toNumberOrNull(componentes.repouso),
        hv: toNumberOrNull(componentes.hv),
        duracao: toNumberOrNull(componentes.duracao),
      },
    },
    sourceFlags: {
      informedData,
      estimatedData,
      legacyPreC2,
      c2Corrected,
      recalculationPending: Boolean(context?.recalculationPending),
    },
    windows: {
      daily: {
        available: deterministicPayload.jornada.effectiveness_pct != null,
        date: deterministicPayload.jornada.data,
        effectivenessPct: deterministicPayload.jornada.effectiveness_pct,
        explanation:
          'Leitura diária baseada na jornada processada para a data selecionada, sem reprocessamento histórico.',
      },
      sevenDays: {
        available: sevenDays.available,
        worstDay: sevenDays.worstDay,
        worstEffectivenessPct: sevenDays.worstEffectivenessPct,
        explanation: sevenDays.available
          ? 'Pior dia observado na janela rolling de 7 dias até a data selecionada.'
          : 'Sem base suficiente para determinar pior dia na janela de 7 dias.',
      },
      twentyEightDays: {
        available: twentyEightDays.available,
        worstDay: twentyEightDays.worstDay,
        worstEffectivenessPct: twentyEightDays.worstEffectivenessPct,
        explanation: twentyEightDays.available
          ? 'Pior dia observado na janela rolling de 28 dias até a data selecionada.'
          : 'Sem base suficiente para determinar pior dia na janela de 28 dias.',
      },
    },
  };
}

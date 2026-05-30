export interface FrmsOperatorExplanationInput {
  tripulanteNome?: string | null;
  effectivenessPct?: number | null;
  effectivenessLabel?: string | null;
  fatorPrincipal?: string | null;
  sonoEfetivoMin?: number | null;
  fonteSonoLabel?: string | null;
  tempoAtencaoMin?: number | null;
  recalcPendente?: boolean;
}

export interface FrmsOperatorExplanationCopy {
  resumo: string;
  fatores: string[];
  interpretacao: string;
  atencaoOperacional: string;
  limitacao: string;
}

function formatHours(totalMinutes: number | null | undefined): string | null {
  if (totalMinutes == null || !Number.isFinite(totalMinutes)) return null;
  const rounded = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(rounded / 60);
  const minutes = rounded % 60;
  return `${hours}h${String(minutes).padStart(2, '0')}`;
}

function formatPct(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return `${value.toFixed(1)}%`;
}

export function buildFrmsOperatorExplanationCopy(
  input: FrmsOperatorExplanationInput,
): FrmsOperatorExplanationCopy {
  const pct = formatPct(input.effectivenessPct);
  const label = input.effectivenessLabel || 'sem faixa informada';
  const factor = input.fatorPrincipal || 'combinação dos fatores do dia';
  const sleep = formatHours(input.sonoEfetivoMin);
  const attentionTime = formatHours(input.tempoAtencaoMin);
  const source = input.fonteSonoLabel || 'fonte do sono não informada';

  const resumo = pct
    ? `Para este dia, o sistema estimou ${pct} no índice operacional (${label}).`
    : 'Para este dia, o sistema não recebeu base suficiente para estimar o índice operacional.';

  const fatores = [
    `Principal influência registrada: ${factor}.`,
    sleep
      ? `Sono considerado no cálculo: ${sleep}.`
      : 'Sono considerado no cálculo: sem dado confiável para exibição.',
    `Fonte usada para sono/despertar: ${source.replace(/^Fonte do sono:\s*/i, '')}.`,
  ];

  if (attentionTime) {
    fatores.push(`Tempo estimado em faixa de atenção: ${attentionTime}.`);
  }

  const interpretacao = pct
    ? 'Use esta leitura como sinal de contexto para conversa operacional e acompanhamento do dia, não como liberação ou bloqueio automático.'
    : 'Sem índice estimado, a leitura deve ficar restrita aos dados disponíveis e à avaliação operacional da coordenação.';

  const atencaoOperacional = input.recalcPendente
    ? 'Há recálculo pendente porque falta horário de apresentação; confirme a jornada antes de comparar tripulantes.'
    : 'Compare com sono informado, jornada prevista, histórico recente e percepção do tripulante antes de decidir qualquer ação.';

  const limitacao =
    'Esta é uma estimativa operacional de triagem baseada nos dados disponíveis. Não é diagnóstico médico, não é validação SAFTE-FAST e não determina automaticamente aptidão ou restrição operacional.';

  return {
    resumo,
    fatores,
    interpretacao,
    atencaoOperacional,
    limitacao,
  };
}

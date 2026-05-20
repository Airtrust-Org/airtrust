import type { LegacyFadigaResult, FadigaScoreResult } from './fadiga-score';

/** Tipo que cobre os dois formatos aceitos pelo buildFratSuggestion */
type FadigaScoreOutput = LegacyFadigaResult & { recomendacao?: string };

export interface FratPrefillFactor {
  codigo: string;
  categoria: string;
  resposta: string;
  score_sugerido: number;
  justificativa: string;
}

export interface FratBridgeSuggestion {
  nivelRiscoSugerido: 'BAIXO' | 'MEDIO' | 'ALTO' | 'CRITICO';
  justificativa: string;
  fatores: FratPrefillFactor[];
}

function mapNivelFadigaToFrat(
  nivel: FadigaScoreOutput['nivelFadiga'],
): FratBridgeSuggestion['nivelRiscoSugerido'] {
  if (nivel === 'CRITICO') return 'CRITICO';
  if (nivel === 'ALTO') return 'ALTO';
  if (nivel === 'MODERADO') return 'MEDIO';
  return 'BAIXO';
}

export function buildFratSuggestion(params: {
  score: FadigaScoreOutput;
  kssScore: number;
  horasSono: number;
  qualidadeSono: number;
  sintomas: string[];
}): FratBridgeSuggestion {
  const fatores: FratPrefillFactor[] = [];

  if (params.kssScore >= 7) {
    fatores.push({
      codigo: 'FADIGA_KSS_ELEVADO',
      categoria: 'HUMANO',
      resposta: `KSS ${params.kssScore}`,
      score_sugerido: params.kssScore >= 9 ? 30 : 18,
      justificativa: 'Sonolência autorreportada elevada no check-in FRMS.',
    });
  }

  if (params.horasSono < 6) {
    fatores.push({
      codigo: 'FADIGA_SONO_INSUFICIENTE',
      categoria: 'HUMANO',
      resposta: `${params.horasSono.toFixed(1)}h`,
      score_sugerido: params.horasSono < 4 ? 28 : 16,
      justificativa: 'Janela de sono abaixo do recomendado para missão.',
    });
  }

  if (params.qualidadeSono <= 2) {
    fatores.push({
      codigo: 'FADIGA_SONO_QUALIDADE_BAIXA',
      categoria: 'HUMANO',
      resposta: `Qualidade ${params.qualidadeSono}/5`,
      score_sugerido: 12,
      justificativa: 'Sono relatado com baixa qualidade no pré-voo.',
    });
  }

  if (params.sintomas.length > 0) {
    fatores.push({
      codigo: 'FADIGA_SINTOMAS_ATIVOS',
      categoria: 'HUMANO',
      resposta: params.sintomas.join(', '),
      score_sugerido: Math.min(24, params.sintomas.length * 4),
      justificativa: 'Sintomas de fadiga reportados no check-in diário.',
    });
  }

  return {
    nivelRiscoSugerido: mapNivelFadigaToFrat(params.score.nivelFadiga),
    justificativa: params.score.recomendacao ?? 'Avaliação de fadiga baseada nos dados do check-in.',
    fatores,
  };
}

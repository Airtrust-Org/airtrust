export type ConhecimentoConfianca = 'SABIA' | 'DUVIDA' | 'CHUTEI';
export type ConhecimentoEstado = 'NOVO' | 'APRENDENDO' | 'EM_REFORCO' | 'CONSOLIDADO';

export interface DominioAtual {
  nivel: number;
  exposicoes: number;
  acertos: number;
  erros: number;
}

export interface AtualizacaoDominio extends DominioAtual {
  estado: ConhecimentoEstado;
  proximaRevisaoDias: number;
}

const clampNivel = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

export function calcularAtualizacaoDominio(
  atual: DominioAtual,
  correta: boolean,
  confianca: ConhecimentoConfianca,
): AtualizacaoDominio {
  const delta = correta
    ? confianca === 'SABIA'
      ? 18
      : confianca === 'DUVIDA'
        ? 10
        : 4
    : confianca === 'SABIA'
      ? -18
      : confianca === 'DUVIDA'
        ? -10
        : -6;

  const nivel = clampNivel(atual.nivel + delta);
  const exposicoes = atual.exposicoes + 1;
  const acertos = atual.acertos + (correta ? 1 : 0);
  const erros = atual.erros + (correta ? 0 : 1);

  const estado: ConhecimentoEstado =
    nivel >= 80 && correta && confianca === 'SABIA'
      ? 'CONSOLIDADO'
      : nivel >= 45
        ? 'EM_REFORCO'
        : exposicoes > 0
          ? 'APRENDENDO'
          : 'NOVO';

  let proximaRevisaoDias: number;
  if (!correta && confianca === 'SABIA') proximaRevisaoDias = 2;
  else if (!correta) proximaRevisaoDias = 3;
  else if (confianca === 'CHUTEI') proximaRevisaoDias = 3;
  else if (confianca === 'DUVIDA') proximaRevisaoDias = 7;
  else if (nivel >= 80) proximaRevisaoDias = 30;
  else if (nivel >= 60) proximaRevisaoDias = 14;
  else proximaRevisaoDias = 7;

  return { nivel, exposicoes, acertos, erros, estado, proximaRevisaoDias };
}

export interface CandidatoDesafio {
  questaoId: number;
  itemId: number;
  criticidade: 'BAIXA' | 'MEDIA' | 'ALTA' | 'CRITICA';
  nivel: number | null;
  proximaRevisaoEm: string | null;
  ultimaExposicaoEm: string | null;
}

const criticidadePeso: Record<CandidatoDesafio['criticidade'], number> = {
  BAIXA: 0,
  MEDIA: 8,
  ALTA: 16,
  CRITICA: 24,
};

export function pontuarCandidato(
  candidato: CandidatoDesafio,
  nowMs: number = Date.now(),
): number {
  const nivel = candidato.nivel ?? 0;
  const novo = candidato.nivel == null ? 18 : 0;
  const baixaRetencao = Math.max(0, 100 - nivel) * 0.4;
  const critica = criticidadePeso[candidato.criticidade];
  const revisaoMs = candidato.proximaRevisaoEm
    ? Date.parse(candidato.proximaRevisaoEm)
    : Number.NaN;
  const vencida = Number.isFinite(revisaoMs) && revisaoMs <= nowMs ? 40 : 0;
  return novo + baixaRetencao + critica + vencida;
}

export function selecionarQuestoesDesafio(
  candidatos: CandidatoDesafio[],
  quantidade: number = 10,
): CandidatoDesafio[] {
  const byItem = new Map<number, CandidatoDesafio>();
  for (const candidato of candidatos) {
    const atual = byItem.get(candidato.itemId);
    if (!atual || pontuarCandidato(candidato) > pontuarCandidato(atual)) {
      byItem.set(candidato.itemId, candidato);
    }
  }
  return [...byItem.values()]
    .sort((a, b) => {
      const scoreDiff = pontuarCandidato(b) - pontuarCandidato(a);
      if (scoreDiff !== 0) return scoreDiff;
      return a.questaoId - b.questaoId;
    })
    .slice(0, Math.max(0, quantidade));
}

export function periodoQuinzena(data: Date = new Date()): {
  chave: string;
  inicio: string;
  fim: string;
} {
  const year = data.getUTCFullYear();
  const month = data.getUTCMonth();
  const day = data.getUTCDate();
  const primeira = day <= 15;
  const inicio = new Date(Date.UTC(year, month, primeira ? 1 : 16));
  const fim = primeira
    ? new Date(Date.UTC(year, month, 15, 23, 59, 59))
    : new Date(Date.UTC(year, month + 1, 0, 23, 59, 59));
  const mm = String(month + 1).padStart(2, '0');
  return {
    chave: year + '-' + mm + '-Q' + (primeira ? 1 : 2),
    inicio: inicio.toISOString(),
    fim: fim.toISOString(),
  };
}

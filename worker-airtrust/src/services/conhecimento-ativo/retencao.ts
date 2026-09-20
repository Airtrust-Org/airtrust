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
  topicoId?: number | null;
  criticidade: 'BAIXA' | 'MEDIA' | 'ALTA' | 'CRITICA';
  nivel: number | null;
  proximaRevisaoEm: string | null;
  ultimaExposicaoEm: string | null;
  respondidaVezes?: number;
  ultimaRespostaEm?: string | null;
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
  let vencida = 0;
  if (Number.isFinite(revisaoMs) && revisaoMs <= nowMs) {
    const diasAtraso = Math.max(0, Math.floor((nowMs - revisaoMs) / 86400000));
    vencida = 40 + Math.min(20, diasAtraso * 2);
  }
  return novo + baixaRetencao + critica + vencida;
}

export const PONTUACAO_PRIORIDADE_MAX_REFERENCIA = 124;

export function normalizarPrioridadeRevisao(score: number): number {
  return Math.max(
    0,
    Math.min(100, Math.round((Math.max(0, score) / PONTUACAO_PRIORIDADE_MAX_REFERENCIA) * 100)),
  );
}

function preferirQuestaoMenosExposta(
  candidato: CandidatoDesafio,
  atual: CandidatoDesafio,
): boolean {
  const candidatoVezes = Number(candidato.respondidaVezes || 0);
  const atualVezes = Number(atual.respondidaVezes || 0);
  if (candidatoVezes !== atualVezes) return candidatoVezes < atualVezes;

  const candidatoUltima = candidato.ultimaRespostaEm
    ? Date.parse(candidato.ultimaRespostaEm)
    : Number.NEGATIVE_INFINITY;
  const atualUltima = atual.ultimaRespostaEm
    ? Date.parse(atual.ultimaRespostaEm)
    : Number.NEGATIVE_INFINITY;
  if (candidatoUltima !== atualUltima) return candidatoUltima < atualUltima;

  return candidato.questaoId < atual.questaoId;
}

export function selecionarQuestoesDesafio(
  candidatos: CandidatoDesafio[],
  quantidade: number = 10,
  options?: { diversificarTopicos?: boolean },
): CandidatoDesafio[] {
  const byItem = new Map<number, CandidatoDesafio>();
  for (const candidato of candidatos) {
    const atual = byItem.get(candidato.itemId);
    if (!atual) {
      byItem.set(candidato.itemId, candidato);
      continue;
    }

    const scoreDiff = pontuarCandidato(candidato) - pontuarCandidato(atual);
    if (scoreDiff > 0 || (scoreDiff === 0 && preferirQuestaoMenosExposta(candidato, atual))) {
      byItem.set(candidato.itemId, candidato);
    }
  }

  const rank = (a: CandidatoDesafio, b: CandidatoDesafio) => {
    const scoreDiff = pontuarCandidato(b) - pontuarCandidato(a);
    if (scoreDiff !== 0) return scoreDiff;
    return a.questaoId - b.questaoId;
  };
  const ranked = [...byItem.values()].sort(rank);
  const limite = Math.max(0, quantidade);
  if (!options?.diversificarTopicos || limite === 0) return ranked.slice(0, limite);

  const melhorPorTopico = new Map<number, CandidatoDesafio>();
  for (const candidato of ranked) {
    if (candidato.topicoId == null || melhorPorTopico.has(candidato.topicoId)) continue;
    melhorPorTopico.set(candidato.topicoId, candidato);
  }

  const selecionados = [...melhorPorTopico.values()].sort(rank).slice(0, limite);
  if (selecionados.length >= limite) return selecionados;

  const itensUsados = new Set(selecionados.map((candidato) => candidato.itemId));
  for (const candidato of ranked) {
    if (itensUsados.has(candidato.itemId)) continue;
    selecionados.push(candidato);
    itensUsados.add(candidato.itemId);
    if (selecionados.length >= limite) break;
  }
  return selecionados;
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

/**
 * UTILITÁRIOS DE CORES PARA SIMULADORES
 * Centraliza toda a lógica de cores para evitar duplicação
 * Data: 2026-01-14
 */

/**
 * Paleta fixa de cores (classes explícitas para Tailwind purge)
 */
export const PALETTE_CORES = [
  { bg: 'bg-blue-50', border: 'border-l-blue-500', text: 'text-blue-700' },
  { bg: 'bg-emerald-50', border: 'border-l-emerald-500', text: 'text-emerald-700' },
  { bg: 'bg-purple-50', border: 'border-l-purple-500', text: 'text-purple-700' },
  { bg: 'bg-orange-50', border: 'border-l-orange-500', text: 'text-orange-700' },
  { bg: 'bg-cyan-50', border: 'border-l-cyan-500', text: 'text-cyan-700' },
  { bg: 'bg-pink-50', border: 'border-l-pink-500', text: 'text-pink-700' },
  { bg: 'bg-indigo-50', border: 'border-l-indigo-500', text: 'text-indigo-700' },
  { bg: 'bg-amber-50', border: 'border-l-amber-500', text: 'text-amber-700' },
];

/**
 * Mapeamento explícito de aeronaves para cores (sessões normais)
 */
export const MAPEAMENTO_CORES_EXPLICITO: Record<string, (typeof PALETTE_CORES)[0]> = {
  AW139: { bg: 'bg-emerald-50', border: 'border-l-emerald-500', text: 'text-emerald-700' },
  aw139: { bg: 'bg-emerald-50', border: 'border-l-emerald-500', text: 'text-emerald-700' },
  SK76: { bg: 'bg-amber-50', border: 'border-l-amber-500', text: 'text-amber-700' },
  sk76: { bg: 'bg-amber-50', border: 'border-l-amber-500', text: 'text-amber-700' },
  'SK-76': { bg: 'bg-amber-50', border: 'border-l-amber-500', text: 'text-amber-700' },
};

/**
 * Cores para sessões de CHECK por tipo de aeronave (versão escura)
 * AW139 → verde escuro  |  SK76 → âmbar/amarelo escuro
 */
const CHECK_CORES: Record<string, { bg: string; border: string; text: string }> = {
  AW139: { bg: 'bg-emerald-200', border: 'border-l-emerald-900', text: 'text-emerald-950' },
  aw139: { bg: 'bg-emerald-200', border: 'border-l-emerald-900', text: 'text-emerald-950' },
  SK76: { bg: 'bg-amber-200', border: 'border-l-amber-700', text: 'text-amber-900' },
  sk76: { bg: 'bg-amber-200', border: 'border-l-amber-700', text: 'text-amber-900' },
  'SK-76': { bg: 'bg-amber-200', border: 'border-l-amber-700', text: 'text-amber-900' },
};

/**
 * Interface para objetos que podem ter cor de simulador
 */
export interface ObjetoComSimulador {
  simulador_tipo?: string;
  simulador_nome?: string;
  examinador_id?: number | null;
  examinador_nome?: string | null;
}

/**
 * Gera cor consistente baseado no tipo/modelo da aeronave.
 * SESSÕES DE CHECK: versão mais escura da cor da aeronave.
 * AW139 check → verde escuro  |  SK76 check → âmbar/amarelo escuro
 */
export function getCorSimulador(obj: ObjetoComSimulador) {
  const chave = obj.simulador_tipo || obj.simulador_nome || '';

  // Sessões de check: usar cor escura baseada na aeronave
  if ((obj.examinador_id != null && obj.examinador_id > 0) || !!obj.examinador_nome) {
    const isAW = /AW.?139/i.test(chave);
    const isSK = /SK.?76/i.test(chave);
    if (isAW) return CHECK_CORES['AW139'];
    if (isSK) return CHECK_CORES['SK76'];
    if (CHECK_CORES[chave]) return CHECK_CORES[chave];
    // Fallback genérico para check não mapeado → âmbar
    return { bg: 'bg-amber-200', border: 'border-l-amber-700', text: 'text-amber-900' };
  }

  // Verificar se tem mapeamento explícito primeiro
  if (MAPEAMENTO_CORES_EXPLICITO[chave]) {
    return MAPEAMENTO_CORES_EXPLICITO[chave];
  }

  // Hash simples da string para índice consistente
  const hash = chave.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const index = hash % PALETTE_CORES.length;

  return PALETTE_CORES[index];
}

/**
 * Verifica se uma sessão é um check (tem examinador)
 */
export function isCheck(obj: ObjetoComSimulador): boolean {
  return (obj.examinador_id != null && obj.examinador_id > 0) || !!obj.examinador_nome;
}

/**
 * Retorna a classe de ring para sessão de check (cor por aeronave)
 */
export function getRingCheck(obj: ObjetoComSimulador): string {
  if (!isCheck(obj)) return '';
  const chave = obj.simulador_tipo || obj.simulador_nome || '';
  const isSK = /SK.?76/i.test(chave);
  return isSK ? 'ring-1 ring-amber-600' : 'ring-1 ring-emerald-700';
}

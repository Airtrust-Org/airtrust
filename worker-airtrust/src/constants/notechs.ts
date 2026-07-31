/**
 * Catálogo canônico dos 15 itens fixos NOTECHS (Non-Technical Skills / CRM).
 *
 * A partir do PTO Revisão 10, fichas novas usam os códigos NTS-* e as
 * evidências observáveis dos pacotes canônicos AW139/S-76. Os aliases
 * NOTECHS-* permanecem reconhecidos somente para compatibilidade histórica:
 * uma ficha antiga completa não recebe quinze linhas duplicadas no self-heal.
 */

import {
  NOTECHS_CANONICAL_ITEMS,
  canonicalizeNotechsCode,
} from '../../../src/shared/simuladores/notechs-canonical';
import { resolveModeloSessaoObservacoesOverride } from '../../../src/shared/simuladores/modelos-sessao-observacoes';

export const NOTECHS_CATEGORIA = 'NOTECHS';
export const FICHA_TECNICAS_PADRAO_LIMITE = 18;

/** Namespace de ordem reservado — nunca colide com o intervalo 1-22 das manobras técnicas variáveis. */
export const NOTECHS_ORDEM_BASE = 1001;

export interface NotechsCatalogoItem {
  codigo: string;
  nome: string;
  descricao: string;
  ordem: number;
}

export interface FichaManobraBase {
  codigo: string;
  nome?: string | null;
  descricao?: string | null;
  categoria?: string | null;
  ordem: number;
  tripulante?: string | null;
  /** Override de texto por vínculo modelo↔manobra (modelos_sessao_manobras.observacoes). */
  observacoes?: string | null;
}

export interface FichaManobraMaterializada {
  codigo: string;
  nome: string;
  descricao: string;
  categoria: string;
  ordem: number;
  tripulante: string;
}

export const NOTECHS_ITENS_CATALOGO: NotechsCatalogoItem[] = NOTECHS_CANONICAL_ITEMS.map(
  (item) => ({
    codigo: item.codigo,
    nome: item.nome,
    descricao: item.evidenciaObservavel,
    ordem: item.ordem,
  }),
);

/** Fichas nestes status são imutáveis (mesmo guard usado em PUT /fichas/:id). */
export const FICHA_STATUS_FINALIZADOS = ['APROVADO', 'NAO_APROVADO', 'CONCLUIDA'];

export function isFichaStatusFinalizado(status: string | null | undefined): boolean {
  return FICHA_STATUS_FINALIZADOS.includes(String(status || '').toUpperCase());
}

/** Detecta se a ficha já tem itens NOTECHS vinculados (evita duplicar no self-heal). */
export function hasNotechsItens(manobrasRows: Array<{ categoria?: string | null }>): boolean {
  return manobrasRows.some(
    (row) => String(row.categoria || '').toUpperCase() === NOTECHS_CATEGORIA,
  );
}

export function getMissingNotechsItens(
  manobrasRows: Array<{ categoria?: string | null; codigo?: string | null }>,
): NotechsCatalogoItem[] {
  const existingCodes = new Set(
    manobrasRows
      .filter((row) => String(row.categoria || '').toUpperCase() === NOTECHS_CATEGORIA)
      .map((row) => canonicalizeNotechsCode(row.codigo))
      .filter(Boolean),
  );

  return NOTECHS_ITENS_CATALOGO.filter(
    (item) => !existingCodes.has(canonicalizeNotechsCode(item.codigo)),
  );
}

export function hasCompleteNotechsItens(
  manobrasRows: Array<{ categoria?: string | null; codigo?: string | null }>,
): boolean {
  return getMissingNotechsItens(manobrasRows).length === 0;
}

export function getNotechsStatus(
  manobrasRows: Array<{ categoria?: string | null; codigo?: string | null }>,
): 'missing' | 'partial' | 'complete' {
  const missingCount = getMissingNotechsItens(manobrasRows).length;
  if (missingCount === 0) return 'complete';
  if (missingCount === NOTECHS_ITENS_CATALOGO.length) return 'missing';
  return 'partial';
}

export function buildOperationalFichaManobras(
  manobrasTecnicas: FichaManobraBase[],
): FichaManobraMaterializada[] {
  const tecnicas = [...manobrasTecnicas]
    .sort((left, right) => Number(left.ordem || 0) - Number(right.ordem || 0))
    .slice(0, FICHA_TECNICAS_PADRAO_LIMITE)
    .map((item) => {
      // observacoes é um override de texto por vínculo modelo↔manobra: permite que
      // um mesmo item de catálogo (manobras.nome/descricao) tenha redação distinta
      // em modelos diferentes, sem duplicar o registro de manobra compartilhado.
      const override = resolveModeloSessaoObservacoesOverride(item.observacoes);
      const nome = override || String(item.nome || item.descricao || item.codigo || '').trim();
      const descricao = override || String(item.descricao || item.nome || '').trim();
      return {
        codigo: item.codigo,
        nome,
        descricao,
        categoria: String(item.categoria || 'GERAL').trim() || 'GERAL',
        ordem: Number(item.ordem),
        tripulante: String(item.tripulante || 'AB').trim() || 'AB',
      };
    });

  const notechs = NOTECHS_ITENS_CATALOGO.map((item) => ({
    codigo: item.codigo,
    nome: item.nome,
    descricao: item.descricao,
    categoria: NOTECHS_CATEGORIA,
    ordem: item.ordem,
    tripulante: 'AB',
  }));

  return [...tecnicas, ...notechs];
}

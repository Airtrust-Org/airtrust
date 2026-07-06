/**
 * Catálogo canônico dos 15 itens fixos NOTECHS (Non-Technical Skills / CRM).
 * Espelha o seed da migration 0413_notechs_categoria_itens.sql — mesmos
 * codigo/nome/descricao/ordem. Usado pelo backend para vincular os 15 itens
 * a toda ficha nova/self-heal, independentemente do modelo de sessão.
 *
 * nome = título PT ; descricao = título EN (mesma convenção do restante do
 * catálogo `manobras`). Descritores completos por faixa de nota vivem apenas
 * no frontend (src/react-app/pages/simuladores/fichas/notechs.ts) — conteúdo
 * de referência estático, não avaliado nem armazenado por linha de ficha.
 */

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

export const NOTECHS_ITENS_CATALOGO: NotechsCatalogoItem[] = [
  // COO = Cooperação / Cooperation
  { codigo: 'NOTECHS-COO-01', nome: 'Formação e Manutenção da Equipe', descricao: 'Team Building and Maintaining', ordem: 1001 },
  { codigo: 'NOTECHS-COO-02', nome: 'Consideração pelos Outros', descricao: 'Considering Others', ordem: 1002 },
  { codigo: 'NOTECHS-COO-03', nome: 'Apoio aos Outros', descricao: 'Supporting Others', ordem: 1003 },
  { codigo: 'NOTECHS-COO-04', nome: 'Resolução de Conflitos', descricao: 'Conflict Solving', ordem: 1004 },
  // LID = Liderança e Habilidades Gerenciais / Leadership and Management Skills
  { codigo: 'NOTECHS-LID-05', nome: 'Uso da Autoridade e Assertividade', descricao: 'Use of Authority and Assertiveness', ordem: 1005 },
  { codigo: 'NOTECHS-LID-06', nome: 'Manutenção de Padrões', descricao: 'Maintaining Standards', ordem: 1006 },
  { codigo: 'NOTECHS-LID-07', nome: 'Planejamento e Coordenação', descricao: 'Planning and Coordination', ordem: 1007 },
  { codigo: 'NOTECHS-LID-08', nome: 'Gerenciamento da Carga de Trabalho', descricao: 'Workload Management', ordem: 1008 },
  // CSA = Consciência Situacional / Situational Awareness
  { codigo: 'NOTECHS-CSA-09', nome: 'Consciência dos Sistemas da Aeronave', descricao: 'Aircraft Systems Awareness', ordem: 1009 },
  { codigo: 'NOTECHS-CSA-10', nome: 'Consciência do Ambiente Externo', descricao: 'Awareness of External Environment', ordem: 1010 },
  { codigo: 'NOTECHS-CSA-11', nome: 'Consciência do Tempo', descricao: 'Awareness of Time', ordem: 1011 },
  // TMD = Tomada de Decisão / Decision Making
  { codigo: 'NOTECHS-TMD-12', nome: 'Definição e Diagnóstico do Problema', descricao: 'Problem Definition and Diagnosis', ordem: 1012 },
  { codigo: 'NOTECHS-TMD-13', nome: 'Geração de Opções', descricao: 'Option Generation', ordem: 1013 },
  { codigo: 'NOTECHS-TMD-14', nome: 'Avaliação de Risco e Seleção de Opção', descricao: 'Risk Assessment and Option Selection', ordem: 1014 },
  { codigo: 'NOTECHS-TMD-15', nome: 'Revisão do Resultado', descricao: 'Outcome Review', ordem: 1015 },
];

/** Fichas nestes status são imutáveis (mesmo guard usado em PUT /fichas/:id). */
export const FICHA_STATUS_FINALIZADOS = ['APROVADO', 'NAO_APROVADO', 'CONCLUIDA'];

export function isFichaStatusFinalizado(status: string | null | undefined): boolean {
  return FICHA_STATUS_FINALIZADOS.includes(String(status || '').toUpperCase());
}

/** Detecta se a ficha já tem itens NOTECHS vinculados (evita duplicar no self-heal). */
export function hasNotechsItens(manobrasRows: Array<{ categoria?: string | null }>): boolean {
  return manobrasRows.some((row) => String(row.categoria || '').toUpperCase() === NOTECHS_CATEGORIA);
}

export function getMissingNotechsItens(
  manobrasRows: Array<{ categoria?: string | null; codigo?: string | null }>,
): NotechsCatalogoItem[] {
  const existingCodes = new Set(
    manobrasRows
      .filter((row) => String(row.categoria || '').toUpperCase() === NOTECHS_CATEGORIA)
      .map((row) => String(row.codigo || '').trim().toUpperCase())
      .filter(Boolean),
  );

  return NOTECHS_ITENS_CATALOGO.filter((item) => !existingCodes.has(item.codigo));
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

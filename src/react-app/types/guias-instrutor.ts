/** Tipos e metadados de Guias do Instrutor compartilhados com lib/ e hooks/. Reexportado por hooks/guias-instrutor/api. */

export const GUIAS_PROGRAMAS_AERONAVE = [
  { key: 'INICIAL', label: 'Inicial' },
  { key: 'TRANSICAO', label: 'Transição' },
  { key: 'PERIODICO', label: 'Periódico' },
  { key: 'SEMESTRAL', label: 'Semestral' },
  { key: 'REQUALIFICACAO', label: 'Requalificação' },
  { key: 'RECENTE', label: 'Recente' },
  { key: 'NOTURNO', label: 'Noturno' },
  { key: 'CHECK', label: 'Check / Avaliação' },
] as const;

export const GUIAS_PROGRAMAS_FUNCIONAIS = [
  { key: 'INSTRUTOR', label: 'Instrutor' },
  { key: 'EXAMINADOR', label: 'Examinador' },
] as const;

export const GUIAS_PROGRAMAS = [
  ...GUIAS_PROGRAMAS_AERONAVE,
  ...GUIAS_PROGRAMAS_FUNCIONAIS,
] as const;

export type GuiaPrograma = (typeof GUIAS_PROGRAMAS)[number]['key'];

export const PROGRAMA_LABEL: Record<string, string> = Object.fromEntries(
  GUIAS_PROGRAMAS.map((p) => [p.key, p.label]),
);

export function isProgramaFuncional(programa: string): boolean {
  return programa === 'INSTRUTOR' || programa === 'EXAMINADOR';
}

export interface GuiaInstrutor {
  id: number;
  modelo_aeronave_id: number | null;
  aeronave_nome: string;
  aeronave_codigo: string;
  programa: GuiaPrograma;
  ciclo: number | null;
  sessao_numero: number | null;
  sessao_total: number | null;
  codigo: string;
  titulo: string;
  descricao: string | null;
  versao: string;
  status: string;
  html_disponivel: boolean;
  html_status_validacao: string;
  pdf_disponivel: boolean;
  pdf_tamanho_bytes: number | null;
  publicado_em: string | null;
  updated_at: string;
  modelo_sessao_id: number | null;
  nome_sessao: string | null;
  descricao_sessao: string | null;
}

/** Tipos de Guias do Instrutor compartilhados com lib/ e hooks/. Reexportado por hooks/guias-instrutor/api. */

export interface GuiaInstrutor {
  id: number;
  modelo_aeronave_id: number;
  aeronave_nome: string;
  aeronave_codigo: string;
  programa: 'INICIAL' | 'PERIODICO' | 'SEMESTRAL' | 'CHECK';
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

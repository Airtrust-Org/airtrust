export type StatusFicha =
  | 'EM_PREENCHIMENTO'
  | 'FINALIZADA'
  | 'ASSINADA_ALUNO'
  | 'ASSINADA_INSTRUTOR'
  | 'ASSINADA_EXAMINADOR'
  | 'ASSINADA_TOTAL';

export interface FichaSimulador {
  id: number;
  sessao_id: number;
  funcionario_id: number;
  instrutor_id: number | null;
  examinador_id: number | null;
  data_sessao: string;
  tipo_sessao: string;
  tipo_aeronave?: string;
  status: StatusFicha;
  nota_geral?: string | null;
  comentarios_gerais?: string | null;
  assinatura_aluno?: string | null;
  data_assinatura_aluno?: string | null;
  assinatura_instrutor?: string | null;
  data_assinatura_instrutor?: string | null;
  assinatura_examinador?: string | null;
  data_assinatura_examinador?: string | null;
  created_at: string;
  updated_at?: string;
  deleted_at?: string | null;
}

export interface FichaManobra {
  id: number;
  ficha_id: number;
  codigo?: string | null;
  descricao: string;
  categoria?: string | null;
  ordem?: number | null;
  resultado?: string | null;
  observacoes?: string | null;
  created_at: string;
  updated_at?: string;
  deleted_at?: string | null;
}

export interface SessaoResumoFicha {
  id: number;
  simulador_id: number;
  tipo_sessao: string;
  data_sessao: string;
  duracao_minutos?: number;
  status: string;
  simulador_codigo?: string;
  tipo_aeronave?: string;
}

export interface FichaDetalheResponse {
  ficha: FichaSimulador;
  manobras: FichaManobra[];
  sessao: SessaoResumoFicha;
}

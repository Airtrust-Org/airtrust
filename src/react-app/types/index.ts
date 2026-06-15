// Re-export enums
export * from './enums';

export interface Funcionario {
  id: number;
  nome: string;
  guerra?: string;
  cpf: string;
  matricula: string;
  email?: string;
  telefone?: string;
  funcao: string;
  setor?: string;
  setor_id?: number;
  aeronave?: string;
  status: 'ativo' | 'inativo' | 'afastado';
  admissao?: string;
  nascimento?: string;
  is_instrutor?: number;
  is_checador?: number;
  cargo?: string;
  created_at: string;
  updated_at?: string;
  deleted_at?: string;
}

export interface Qualificacao {
  id: number;
  funcionario_id: number;
  funcionario_nome?: string;
  funcionario_matricula?: string;
  categoria: 'Habilitacao' | 'Medico' | 'Treinamento' | 'Licenca' | 'Certificado';
  numero?: string;
  data_emissao?: string;
  data_vencimento: string;
  status: 'ativo' | 'vencido' | 'inativo';
  observacoes?: string;
  certificate_url?: string;
  certificate_name?: string;
  created_at: string;
  updated_at?: string;
  deleted_at?: string;
}

export interface Simulador {
  id: number;
  codigo: string;
  nome: string;
  modelo?: string;
  tipo: string;
  fabricante?: string;
  status: 'disponivel' | 'manutencao' | 'inativo';
  localizacao?: string;
  capacidade?: number;
  created_at: string;
  updated_at?: string;
  deleted_at?: string;
}

export interface Treinamento {
  id: number;
  funcionario_id: number;
  funcionario_nome?: string;
  tipo: string;
  nome: string;
  data_inicio: string;
  data_conclusao?: string;
  status: 'planejado' | 'em_andamento' | 'concluido' | 'cancelado';
  instrutor?: string;
  observacoes?: string;
  carga_horaria?: number;
  created_at: string;
  updated_at?: string;
  deleted_at?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  details?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface Stats {
  total: number;
  ativos: number;
  inativos: number;
  afastados?: number;
  funcoes_cadastradas?: number;
  funcoes_ativas?: number;
}

export interface ImportResult {
  success: boolean;
  importados: number;
  erros: number;
  detalhes?: {
    sucessos: Array<{ linha: number; id: number }>;
    erros: Array<{ linha: number; erro: string }>;
  };
}

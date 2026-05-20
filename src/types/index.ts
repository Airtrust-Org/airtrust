export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface Funcionario {
  id: string;
  nome: string;
  guerra?: string;
  cpf: string;
  email: string;
  matricula: string;
  funcao?: string;
  aeronave?: string;
  cargo: string;
  setor: string;
  ativo: boolean;
  nascimento?: string;
  licenca?: string;
  canac?: string;
  sispat?: string;
  prestserv?: string;
  telefone?: string;
  admissao?: string;
  data_admissao?: string; // Alias para compatibilidade
  created_at: string;
  updated_at: string;
}

export type FuncionarioCreate = Omit<Funcionario, 'id' | 'created_at' | 'updated_at'>;
export type FuncionarioUpdate = Partial<FuncionarioCreate>;

export interface Qualificacao {
  id: number;
  funcionario_id: number;
  funcionario_nome?: string;
  funcionario_matricula?: string;
  tipo: 'TREINAMENTO' | 'CHECK' | 'EXAME';
  categoria: string;
  descricao?: string;
  instituicao?: string;
  instrutor?: string;
  carga_horaria?: number;
  numero?: string;
  data_emissao?: string;
  data_conclusao?: string;
  data_vencimento: string;
  observacoes?: string;
  arquivo_url?: string;
  status: 'ATIVO' | 'VENCIDO';
  status_calculado?: 'VALIDO' | 'VENCENDO' | 'VENCIDO';
  dias_restantes?: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

export type QualificacaoCreate = Omit<
  Qualificacao,
  | 'id'
  | 'status'
  | 'status_calculado'
  | 'dias_restantes'
  | 'funcionario_nome'
  | 'funcionario_matricula'
  | 'created_at'
  | 'updated_at'
  | 'deleted_at'
>;
export type QualificacaoUpdate = Partial<QualificacaoCreate>;

export interface Simulador {
  id: string;
  nome: string;
  codigo: string;
  modelo: string;
  tipo: 'FULL_FLIGHT' | 'FIXED_BASE' | 'FMS' | 'CPT';
  fabricante: string;
  status: 'DISPONIVEL' | 'MANUTENCAO' | 'INDISPONIVEL';
  localizacao: string;
  capacidade: number;
  created_at: string;
  updated_at: string;
}

export type SimuladorCreate = Omit<Simulador, 'id' | 'created_at' | 'updated_at'>;
export type SimuladorUpdate = Partial<SimuladorCreate>;

export interface Agendamento {
  id: string;
  simulador_id: string;
  instrutor_id: string;
  colaborador_aluno_id: string;
  template_sessao_id?: string;
  data_inicio: string;
  hora_inicio: string;
  data_fim: string;
  hora_fim: string;
  funcao_na_sessao: 'PIC' | 'SIC' | 'DUAL';
  observacoes: string;
  status: 'AGENDADO' | 'EM_ANDAMENTO' | 'CONCLUIDO' | 'CANCELADO';
  participantes?: Participante[];
  created_at: string;
  updated_at: string;
}

export interface Participante {
  colaborador_id: string;
  funcao_na_sessao: 'PIC' | 'SIC' | 'DUAL';
  nome?: string;
  matricula?: string;
}

export type AgendamentoCreate = Omit<
  Agendamento,
  'id' | 'status' | 'participantes' | 'created_at' | 'updated_at'
>;
export type AgendamentoUpdate = Partial<AgendamentoCreate>;

export interface DashboardStats {
  total: number;
  ativos: number;
  vencendo30: number;
  vencidas: number;
}

export interface ImportResult {
  sucesso: number;
  erros: Array<{
    linha: number;
    erro: string;
  }>;
}

export interface FiltrosFuncionarios {
  search?: string;
  cargo?: string;
  setor?: string;
  ativo?: boolean;
}

export interface FiltrosQualificacoes {
  search?: string;
  tipo_qualificacao?: string;
  status?: 'VALIDO' | 'VENCENDO' | 'VENCIDO';
}

export interface FiltrosSimuladores {
  search?: string;
  tipo?: string;
  status?: string;
}

export interface PaginacaoParams {
  page?: number;
  limit?: number;
}

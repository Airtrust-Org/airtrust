import z from 'zod';
import { Habilitacao as HabilitacaoCore } from '../worker/types/index';

/**
 * Tipos compartilhados entre Frontend e Backend
 */

// ============= HABILITAÇÕES =============
// Re-exportar do core (src/worker/types/index.ts)
export type Habilitacao = HabilitacaoCore;

// ============= QUALIFICAÇÕES =============
export interface Qualificacao {
  id: number;
  nome: string;
  codigo: string;
  categoria?: string;
  carga_horaria?: number;
  descricao?: string;
  ativa: boolean;
  created_at: string;
  updated_at?: string;
}

// ============= FUNCIONÁRIOS =============
export interface Funcionario {
  id: string;
  nome: string;
  cpf: string;
  email: string;
  matricula: string;
  cargo: string;
  setor: string;
  ativo: boolean;
  data_admissao: string;
  created_at: string;
  updated_at: string;
}

// ============= EMPRESAS =============
export interface Empresa {
  id: number;
  nome: string;
  razao_social?: string;
  cnpj?: string;
  logo_url?: string;
  ativa: boolean;
  created_at: string;
  updated_at?: string;
}

export interface EmpresaConfig {
  id?: number;
  empresa_id: number;
  nome: string;
  logo_url?: string;
  template_certificado?: string;
  cor_primaria: string;
  cor_secundaria: string;
  created_at?: string;
  updated_at?: string;
}

// ============= CERTIFICADOS =============
export interface Certificado {
  id: number;
  habilitacao_id: number;
  funcionario_id: number;
  empresa_id: number;
  qualificacao_id: number;
  arquivo_url: string;
  arquivo_nome: string;
  numero_certificado?: string;
  data_emissao: string;
  data_vencimento?: string;
  created_at: string;
  updated_at?: string;
}

// ============= SIMULADORES =============
export interface Simulador {
  id: number;
  nome: string;
  tipo: string;
  empresa_id: number;
  ativo: boolean;
  capacidade?: number;
  created_at: string;
  updated_at?: string;
}

export interface SimuladorSessao {
  id: number;
  simulador_id: number;
  funcionario_id: number;
  data_inicio: string;
  data_fim?: string;
  instrutor_id?: number;
  status: 'AGENDADA' | 'EM_PROGRESSO' | 'CONCLUIDA' | 'CANCELADA';
  created_at: string;
}

// ============= CATEGORIAS =============
export interface Categoria {
  id: number;
  nome: string;
  codigo: string;
  descricao?: string;
  ativa: boolean;
  created_at: string;
  updated_at?: string;
}

// ============= FUNÇÕES/PERMISSÕES =============
export interface Funcao {
  id: number;
  nome: string;
  codigo: string;
  descricao?: string;
  permissoes?: string[];
  ativa: boolean;
  created_at: string;
  updated_at?: string;
}

// ============= TREINAMENTOS =============
export interface Treinamento {
  id: number;
  nome: string;
  codigo: string;
  descricao?: string;
  carga_horaria: number;
  empresa_id: number;
  ativo: boolean;
  created_at: string;
  updated_at?: string;
}

// ============= RESPONSE GENÉRICO =============
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  message?: string;
  timestamp: string;
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
  hasMore?: boolean;
}

// ============= ZODS SCHEMAS (mantendo compatibilidade) =============

export const FuncionarioCompleteSchema = z.object({
  nome: z.string().min(1, 'Nome é obrigatório'),
  matricula: z.string().min(1, 'Matrícula é obrigatória'),
  funcao: z.string().min(1, 'Função é obrigatória'),
  is_instrutor: z.number().int().min(0).max(1).default(0),
  is_checador: z.number().int().min(0).max(1).default(0),
  avatar: z.string().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type FuncionarioCompleto = z.infer<typeof FuncionarioCompleteSchema>;

export const CSV_FIELD_MAPPING: Record<string, string> = {
  nome: 'nome',
  nome_completo: 'nome',
  funcionario: 'nome',
  guerra: 'guerra',
  nome_guerra: 'guerra',
  matricula: 'matricula',
  numero_matricula: 'matricula',
  mat: 'matricula',
  cpf: 'cpf',
  documento: 'cpf',

  email: 'email',
  'e-mail': 'email',
  endereco_email: 'email',
  telefone: 'telefone',
  fone: 'telefone',
  celular: 'telefone',

  funcao: 'funcao',
  cargo: 'funcao',
  posicao: 'funcao',
  base: 'base',
  local: 'base',
  cidade: 'base',
  contrato: 'contrato',
  tipo_contrato: 'contrato',
  status: 'status',
  situacao: 'status',
  anv: 'anv',
  aeronave: 'anv',
  aeronave_principal: 'aeronave_principal',

  data_nascimento: 'data_nascimento',
  nascimento: 'data_nascimento',
  dt_nascimento: 'data_nascimento',
  data_admissao: 'data_admissao',
  admissao: 'data_admissao',
  dt_admissao: 'data_admissao',

  codigo_anac: 'codigo_anac',
  anac: 'codigo_anac',
  cod_anac: 'codigo_anac',
  codigo_canac: 'codigo_canac',
  canac: 'codigo_canac',
  cod_canac: 'codigo_canac',
  codigo_sispat: 'codigo_sispat',
  sispat: 'codigo_sispat',
  cod_sispat: 'codigo_sispat',
  codigo_prestserv: 'codigo_prestserv',
  prestserv: 'codigo_prestserv',
  prestador: 'codigo_prestserv',
  cod_prestserv: 'codigo_prestserv',
  licenca_aeronautica: 'licenca_aeronautica',
  licenca: 'licenca_aeronautica',
  lic_aeronautica: 'licenca_aeronautica',

  cma_numero: 'cma_numero',
  numero_cma: 'cma_numero',
  num_cma: 'cma_numero',
  cma: 'cma_numero',
  cma_data_vencimento: 'cma_data_vencimento',
  vencimento_cma: 'cma_data_vencimento',
  validade_cma: 'cma_data_vencimento',

  aso_data_vencimento: 'aso_data_vencimento',
  vencimento_aso: 'aso_data_vencimento',
  validade_aso: 'aso_data_vencimento',
  aso: 'aso_data_vencimento',

  nivel_icao: 'nivel_icao',
  icao: 'nivel_icao',
  proficiencia: 'nivel_icao',
  nivel_icao_data_vencimento: 'nivel_icao_data_vencimento',
  vencimento_icao: 'nivel_icao_data_vencimento',
  validade_icao: 'nivel_icao_data_vencimento',
};

export const CAMPOS_OBRIGATORIOS = ['nome', 'matricula'];

export const CAMPOS_DATA = [
  'data_nascimento',
  'data_admissao',
  'cma_data_vencimento',
  'aso_data_vencimento',
  'nivel_icao_data_vencimento',
];

export const STATUS_VALIDOS = ['ATIVO', 'INATIVO', 'LICENCA'];
export const STATUS_MAPPING: Record<string, string> = {
  ativo: 'ATIVO',
  ativa: 'ATIVO',
  inativo: 'INATIVO',
  inativa: 'INATIVO',
  licenca: 'LICENCA',
  licença: 'LICENCA',
  afastado: 'LICENCA',
  afastada: 'LICENCA',
};

export interface TemplateSessionManobra {
  manobra_id: number;
  manobra_codigo: string;
  manobra_nome: string;
  obrigatoria: boolean;
}

export interface TemplateSessao {
  id?: number;
  nome: string;
  duracao_horas: number;
  tipo: 'BASICO' | 'AVANCADO' | 'CHECK' | 'RECORRENTE';
  descricao: string;
  manobras: TemplateSessionManobra[];
  ativo: boolean;
  created_at?: string;
  updated_at?: string;
}

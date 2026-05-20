/**
 * ============================================================
 * TYPES: MÓDULO DE SIMULADORES - SESSÕES E FICHAS
 * ============================================================
 * Data: 18/11/2025
 * Objetivo: Definições TypeScript para o módulo de simuladores
 * ============================================================
 */

// ============================================================
// SIMULADOR (Recurso/Equipamento)
// ============================================================

export interface Simulador {
  id: number;
  codigo: string;
  tipo_aeronave: string;
  nivel: string | null;
  base: string | null;
  fabricante: string | null;
  status: 'DISPONIVEL' | 'MANUTENCAO' | 'FORA_DE_SERVICO';
  observacoes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  created_by: number | null;
  updated_by: number | null;
}

export type SimuladorInput = Omit<
  Simulador,
  'id' | 'created_at' | 'updated_at' | 'deleted_at' | 'created_by' | 'updated_by'
>;

// ============================================================
// SESSÃO DE SIMULADOR
// ============================================================

export type TipoSessao =
  | 'LPC'
  | 'OPC'
  | 'LOFT'
  | 'TREINAMENTO'
  | 'RECHECK'
  | 'DIFERENÇAS'
  | 'PROFICIÊNCIA';

export type StatusSessao = 'PLANEJADA' | 'CONFIRMADA' | 'EM_ANDAMENTO' | 'CONCLUIDA' | 'CANCELADA';

export interface SessaoSimulador {
  id: number;
  simulador_id: number;
  tipo_sessao: TipoSessao;
  data_inicio: string;
  data_fim: string;
  duracao_minutos: number | null;
  status: StatusSessao;
  tipo_qualificacao_codigo: string | null;
  objetivo: string | null;
  observacoes: string | null;
  motivo_cancelamento: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  created_by: number | null;
  updated_by: number | null;
}

export type SessaoSimuladorInput = Omit<
  SessaoSimulador,
  | 'id'
  | 'duracao_minutos'
  | 'created_at'
  | 'updated_at'
  | 'deleted_at'
  | 'created_by'
  | 'updated_by'
>;

// DTO com dados expandidos (JOIN com simulador)
export interface SessaoSimuladorExpanded extends SessaoSimulador {
  simulador_codigo?: string;
  simulador_tipo_aeronave?: string;
  simulador_base?: string;
  participantes?: SessaoParticipante[];
}

// ============================================================
// PARTICIPANTES DE SESSÃO
// ============================================================

export type PapelParticipante =
  | 'ALUNO'
  | 'INSTRUTOR'
  | 'EXAMINADOR'
  | 'OBSERVADOR'
  | 'SAFETY_PILOT';

export type PresencaParticipante = 'PENDENTE' | 'PRESENTE' | 'FALTOU' | 'CANCELADO';

export type ResultadoParticipante = 'APROVADO' | 'REPROVADO' | 'N/A';

export interface SessaoParticipante {
  id: number;
  sessao_id: number;
  funcionario_id: number;
  papel: PapelParticipante;
  presenca: PresencaParticipante;
  resultado: ResultadoParticipante | null;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  created_by: number | null;
  updated_by: number | null;
}

export type SessaoParticipanteInput = Omit<
  SessaoParticipante,
  'id' | 'created_at' | 'updated_at' | 'deleted_at' | 'created_by' | 'updated_by'
>;

// DTO com dados do funcionário
export interface SessaoParticipanteExpanded extends SessaoParticipante {
  funcionario_nome?: string;
  funcionario_matricula?: string;
  funcionario_email?: string;
}

// ============================================================
// FICHA DE SIMULADOR
// ============================================================

export type StatusFicha =
  | 'EM_PREENCHIMENTO'
  | 'FINALIZADA'
  | 'ASSINADA_ALUNO'
  | 'ASSINADA_INSTRUTOR'
  | 'ASSINADA_EXAMINADOR'
  | 'ASSINADA_TOTAL';

export type NotaGeral = 'APROVADO' | 'REPROVADO' | 'RECOMENDADO_RETREINAMENTO';

export interface FichaSimulador {
  id: number;
  sessao_id: number;
  funcionario_id: number;
  instrutor_id: number | null;
  examinador_id: number | null;
  data_sessao: string;
  tipo_sessao: TipoSessao;
  tipo_aeronave: string | null;
  status: StatusFicha;
  nota_geral: NotaGeral | null;
  comentarios_gerais: string | null;

  // Assinaturas
  assinatura_aluno: string | null;
  assinatura_instrutor: string | null;
  assinatura_examinador: string | null;
  data_assinatura_aluno: string | null;
  data_assinatura_instrutor: string | null;
  data_assinatura_examinador: string | null;
  ip_assinatura_aluno: string | null;
  ip_assinatura_instrutor: string | null;
  ip_assinatura_examinador: string | null;

  // Vínculos
  qualificacao_gerada_id: number | null;
  anexos_urls: string | null; // JSON array

  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  created_by: number | null;
  updated_by: number | null;
}

export type FichaSimuladorInput = Omit<
  FichaSimulador,
  | 'id'
  | 'created_at'
  | 'updated_at'
  | 'deleted_at'
  | 'created_by'
  | 'updated_by'
  | 'assinatura_aluno'
  | 'assinatura_instrutor'
  | 'assinatura_examinador'
  | 'data_assinatura_aluno'
  | 'data_assinatura_instrutor'
  | 'data_assinatura_examinador'
  | 'ip_assinatura_aluno'
  | 'ip_assinatura_instrutor'
  | 'ip_assinatura_examinador'
>;

// DTO com dados expandidos
export interface FichaSimuladorExpanded extends FichaSimulador {
  funcionario_nome?: string;
  funcionario_matricula?: string;
  instrutor_nome?: string;
  examinador_nome?: string;
  simulador_codigo?: string;
  manobras?: FichaSimuladorManobra[];
}

// ============================================================
// MANOBRAS DA FICHA
// ============================================================

export type ResultadoManobra = 'SATISFATORIO' | 'NAO_SATISFATORIO' | 'NA' | 'OBSERVADO';

export type CategoriaManobra = 'PROCEDIMENTOS_NORMAIS' | 'ANORMAIS' | 'EMERGENCIA';

export interface FichaSimuladorManobra {
  id: number;
  ficha_id: number;
  codigo: string | null;
  descricao: string;
  categoria: CategoriaManobra | null;
  ordem: number | null;
  resultado: ResultadoManobra | null;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  created_by: number | null;
  updated_by: number | null;
}

export type FichaSimuladorManobraInput = Omit<
  FichaSimuladorManobra,
  'id' | 'created_at' | 'updated_at' | 'deleted_at' | 'created_by' | 'updated_by'
>;

// ============================================================
// CADASTRO DE MANOBRAS (Templates)
// ============================================================

export interface CadastroManobra {
  id: number;
  tipo_sessao: TipoSessao;
  tipo_aeronave: string;
  codigo: string | null;
  nome?: string; // Alguns endpoints usam 'nome' além de 'descricao'
  descricao: string;
  categoria: CategoriaManobra | null;
  ordem: number | null;
  obrigatoria: number; // 0 ou 1 (boolean no D1)
  observacoes: string | null;
  nivel_dificuldade?: string | null;
  tempo_estimado?: number | null;
  pontuacao_minima?: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  created_by: number | null;
  updated_by: number | null;
}

export type CadastroManobraInput = Omit<
  CadastroManobra,
  'id' | 'created_at' | 'updated_at' | 'deleted_at' | 'created_by' | 'updated_by'
>;

// ============================================================
// DTOs PARA REQUISIÇÕES
// ============================================================

// Criar sessão com participantes de uma vez
export interface CriarSessaoComParticipantesDTO {
  sessao: SessaoSimuladorInput;
  participantes: Array<{
    funcionario_id: number;
    papel: PapelParticipante;
  }>;
}

// Assinar ficha
export interface AssinarFichaDTO {
  papel: 'ALUNO' | 'INSTRUTOR' | 'EXAMINADOR';
  funcionario_id: number;
  ip?: string;
}

// Atualizar manobras em lote
export interface AtualizarManobrasDTO {
  manobras: Array<{
    id?: number;
    codigo?: string;
    descricao: string;
    categoria?: CategoriaManobra;
    ordem?: number;
    resultado?: ResultadoManobra;
    observacoes?: string;
  }>;
}

// Filtros para busca de sessões
export interface FiltrosSessoes {
  simulador_id?: number;
  tipo_sessao?: TipoSessao;
  data_inicio?: string;
  data_fim?: string;
  status?: StatusSessao;
  funcionario_id?: number; // participante
  instrutor_id?: number;
  papel?: PapelParticipante;
  limit?: number;
  offset?: number;
}

// Filtros para busca de fichas
export interface FiltrosFichas {
  funcionario_id?: number;
  instrutor_id?: number;
  tipo_sessao?: TipoSessao;
  data_inicio?: string;
  data_fim?: string;
  status?: StatusFicha;
  nota_geral?: NotaGeral;
  limit?: number;
  offset?: number;
}

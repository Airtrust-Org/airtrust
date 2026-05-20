/**
 * CONSTANTES CENTRALIZADAS DO AIRTRUST
 *
 * ⚠️  IMPORTANTE: Use sempre estas constantes ao invés de valores hardcoded!
 *
 * Para dados que mudam dinamicamente (aeronaves, simuladores, etc):
 * - Use hooks como useAeronaves(), useSimuladores()
 * - Carregue do banco de dados via API
 *
 * Para valores estáticos do sistema (status, estados BR, níveis ICAO):
 * - Use as constantes abaixo
 */

// ============================================
// ESTADOS BRASILEIROS
// ============================================
export const ESTADOS_BRASILEIROS = [
  { sigla: 'AC', nome: 'Acre' },
  { sigla: 'AL', nome: 'Alagoas' },
  { sigla: 'AP', nome: 'Amapá' },
  { sigla: 'AM', nome: 'Amazonas' },
  { sigla: 'BA', nome: 'Bahia' },
  { sigla: 'CE', nome: 'Ceará' },
  { sigla: 'DF', nome: 'Distrito Federal' },
  { sigla: 'ES', nome: 'Espírito Santo' },
  { sigla: 'GO', nome: 'Goiás' },
  { sigla: 'MA', nome: 'Maranhão' },
  { sigla: 'MT', nome: 'Mato Grosso' },
  { sigla: 'MS', nome: 'Mato Grosso do Sul' },
  { sigla: 'MG', nome: 'Minas Gerais' },
  { sigla: 'PA', nome: 'Pará' },
  { sigla: 'PB', nome: 'Paraíba' },
  { sigla: 'PR', nome: 'Paraná' },
  { sigla: 'PE', nome: 'Pernambuco' },
  { sigla: 'PI', nome: 'Piauí' },
  { sigla: 'RJ', nome: 'Rio de Janeiro' },
  { sigla: 'RN', nome: 'Rio Grande do Norte' },
  { sigla: 'RS', nome: 'Rio Grande do Sul' },
  { sigla: 'RO', nome: 'Rondônia' },
  { sigla: 'RR', nome: 'Roraima' },
  { sigla: 'SC', nome: 'Santa Catarina' },
  { sigla: 'SP', nome: 'São Paulo' },
  { sigla: 'SE', nome: 'Sergipe' },
  { sigla: 'TO', nome: 'Tocantins' },
] as const;

export type EstadoBR = (typeof ESTADOS_BRASILEIROS)[number]['sigla'];

// ============================================
// NÍVEIS ICAO DE INGLÊS
// ============================================
export const NIVEIS_ICAO = [
  { nivel: 4, nome: 'Operacional', descricao: 'Operational', validade_anos: 3 },
  { nivel: 5, nome: 'Avançado', descricao: 'Extended', validade_anos: 6 },
  { nivel: 6, nome: 'Especialista/Nativo', descricao: 'Expert', validade_anos: null }, // Ilimitada
] as const;

export type NivelICAO = (typeof NIVEIS_ICAO)[number]['nivel'];

// ============================================
// STATUS FUNCIONÁRIO
// ============================================
export const STATUS_FUNCIONARIO = {
  ATIVO: 'ATIVO',
  INATIVO: 'INATIVO',
  AFASTADO: 'AFASTADO',
  FERIAS: 'FERIAS',
} as const;

export const STATUS_FUNCIONARIO_OPTIONS = [
  { value: STATUS_FUNCIONARIO.ATIVO, label: 'Ativo', color: 'success' },
  { value: STATUS_FUNCIONARIO.INATIVO, label: 'Inativo', color: 'secondary' },
  { value: STATUS_FUNCIONARIO.AFASTADO, label: 'Afastado', color: 'warning' },
  { value: STATUS_FUNCIONARIO.FERIAS, label: 'Férias', color: 'info' },
] as const;

export type StatusFuncionarioType = (typeof STATUS_FUNCIONARIO)[keyof typeof STATUS_FUNCIONARIO];

// ============================================
// STATUS FICHA DE VOO
// ============================================
export const STATUS_FICHA = {
  PENDENTE: 'PENDENTE',
  EM_PREENCHIMENTO: 'EM_PREENCHIMENTO',
  ASSINADA_ALUNO: 'ASSINADA_ALUNO',
  ASSINADA_TOTAL: 'ASSINADA_TOTAL',
  CANCELADA: 'CANCELADA',
} as const;

export const STATUS_FICHA_OPTIONS = [
  { value: STATUS_FICHA.PENDENTE, label: 'Pendente', color: 'warning', icon: 'Clock' },
  { value: STATUS_FICHA.EM_PREENCHIMENTO, label: 'Em Preenchimento', color: 'info', icon: 'Edit' },
  { value: STATUS_FICHA.ASSINADA_ALUNO, label: 'Assinada Aluno', color: 'primary', icon: 'Check' },
  { value: STATUS_FICHA.ASSINADA_TOTAL, label: 'Concluída', color: 'success', icon: 'CheckCheck' },
  { value: STATUS_FICHA.CANCELADA, label: 'Cancelada', color: 'danger', icon: 'X' },
] as const;

export type StatusFichaType = (typeof STATUS_FICHA)[keyof typeof STATUS_FICHA];

// ============================================
// STATUS SESSÃO
// ============================================
export const STATUS_SESSAO = {
  AGENDADA: 'AGENDADA',
  EM_ANDAMENTO: 'EM_ANDAMENTO',
  CONCLUIDA: 'CONCLUIDA',
  CANCELADA: 'CANCELADA',
} as const;

export const STATUS_SESSAO_OPTIONS = [
  { value: STATUS_SESSAO.AGENDADA, label: 'Agendada', color: 'info' },
  { value: STATUS_SESSAO.EM_ANDAMENTO, label: 'Em Andamento', color: 'warning' },
  { value: STATUS_SESSAO.CONCLUIDA, label: 'Concluída', color: 'success' },
  { value: STATUS_SESSAO.CANCELADA, label: 'Cancelada', color: 'danger' },
] as const;

export type StatusSessaoType = (typeof STATUS_SESSAO)[keyof typeof STATUS_SESSAO];

// ============================================
// STATUS SIMULADOR
// ============================================
export const STATUS_SIMULADOR = {
  DISPONIVEL: 'DISPONIVEL',
  MANUTENCAO: 'MANUTENCAO',
  INATIVO: 'INATIVO',
} as const;

export const STATUS_SIMULADOR_OPTIONS = [
  { value: STATUS_SIMULADOR.DISPONIVEL, label: 'Disponível', color: 'success' },
  { value: STATUS_SIMULADOR.MANUTENCAO, label: 'Manutenção', color: 'warning' },
  { value: STATUS_SIMULADOR.INATIVO, label: 'Inativo', color: 'danger' },
] as const;

export type StatusSimuladorType = (typeof STATUS_SIMULADOR)[keyof typeof STATUS_SIMULADOR];

// ============================================
// STATUS QUALIFICAÇÃO/HABILITAÇÃO
// ============================================
export const STATUS_QUALIFICACAO = {
  ATIVO: 'ATIVO',
  VENCIDO: 'VENCIDO',
  A_VENCER: 'A_VENCER',
  INATIVO: 'INATIVO',
} as const;

export const STATUS_QUALIFICACAO_OPTIONS = [
  { value: STATUS_QUALIFICACAO.ATIVO, label: 'Ativo', color: 'success' },
  { value: STATUS_QUALIFICACAO.A_VENCER, label: 'A Vencer', color: 'warning' },
  { value: STATUS_QUALIFICACAO.VENCIDO, label: 'Vencido', color: 'danger' },
  { value: STATUS_QUALIFICACAO.INATIVO, label: 'Inativo', color: 'secondary' },
] as const;

export type StatusQualificacaoType = (typeof STATUS_QUALIFICACAO)[keyof typeof STATUS_QUALIFICACAO];

// ============================================
// TIPOS DE SIMULADOR
// ============================================
export const TIPOS_SIMULADOR = {
  FULL_FLIGHT: 'FULL_FLIGHT',
  FTD: 'FTD',
  BASIC: 'BASIC',
  FNPT: 'FNPT',
} as const;

export const TIPOS_SIMULADOR_OPTIONS = [
  { value: TIPOS_SIMULADOR.FULL_FLIGHT, label: 'Full Flight Simulator (FFS)', categoria: 'A' },
  { value: TIPOS_SIMULADOR.FTD, label: 'Flight Training Device (FTD)', categoria: 'B' },
  { value: TIPOS_SIMULADOR.FNPT, label: 'Flight Navigation Procedures Trainer', categoria: 'B' },
  { value: TIPOS_SIMULADOR.BASIC, label: 'Basic Instrument Trainer', categoria: 'C' },
] as const;

export type TipoSimuladorType = (typeof TIPOS_SIMULADOR)[keyof typeof TIPOS_SIMULADOR];

// ============================================
// FUNÇÕES NA SESSÃO
// ============================================
export const FUNCOES_SESSAO = {
  PIC: 'PIC',
  SIC: 'SIC',
  OBS: 'OBS',
} as const;

export const FUNCOES_SESSAO_OPTIONS = [
  { value: FUNCOES_SESSAO.PIC, label: 'PIC - Pilot in Command', descricao: 'Piloto em Comando' },
  { value: FUNCOES_SESSAO.SIC, label: 'SIC - Second in Command', descricao: 'Copiloto' },
  { value: FUNCOES_SESSAO.OBS, label: 'OBS - Observer', descricao: 'Observador' },
] as const;

export type FuncaoSessaoType = (typeof FUNCOES_SESSAO)[keyof typeof FUNCOES_SESSAO];

// ============================================
// CATEGORIAS DE QUALIFICAÇÃO
// ============================================
export const CATEGORIAS_QUALIFICACAO = {
  HABILITACAO: 'HABILITACAO',
  MEDICO: 'MEDICO',
  TREINAMENTO: 'TREINAMENTO',
  LICENCA: 'LICENCA',
  CERTIFICADO: 'CERTIFICADO',
} as const;

export const CATEGORIAS_QUALIFICACAO_OPTIONS = [
  { value: CATEGORIAS_QUALIFICACAO.HABILITACAO, label: 'Habilitação', icon: 'Award' },
  { value: CATEGORIAS_QUALIFICACAO.MEDICO, label: 'Médico', icon: 'Heart' },
  { value: CATEGORIAS_QUALIFICACAO.TREINAMENTO, label: 'Treinamento', icon: 'GraduationCap' },
  { value: CATEGORIAS_QUALIFICACAO.LICENCA, label: 'Licença', icon: 'FileCheck' },
  { value: CATEGORIAS_QUALIFICACAO.CERTIFICADO, label: 'Certificado', icon: 'FileText' },
] as const;

export type CategoriaQualificacaoType =
  (typeof CATEGORIAS_QUALIFICACAO)[keyof typeof CATEGORIAS_QUALIFICACAO];

// ============================================
// CORES PADRÃO DO SISTEMA (para elementos dinâmicos)
// ============================================
export const CORES_PADRAO = {
  primary: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700' },
  secondary: { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-700' },
  success: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700' },
  warning: { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700' },
  danger: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700' },
  info: { bg: 'bg-cyan-50', border: 'border-cyan-200', text: 'text-cyan-700' },
  purple: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700' },
  orange: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700' },
} as const;

/**
 * Função para gerar cores baseado em um index (para aeronaves, etc)
 * Usa hash do nome para manter consistência
 */
export function getCorByIndex(index: number): (typeof CORES_PADRAO)[keyof typeof CORES_PADRAO] {
  const keys = Object.keys(CORES_PADRAO) as (keyof typeof CORES_PADRAO)[];
  return CORES_PADRAO[keys[index % keys.length]];
}

/**
 * Função para gerar cor consistente baseado em string (código aeronave, etc)
 */
export function getCorByString(str: string): (typeof CORES_PADRAO)[keyof typeof CORES_PADRAO] {
  const hash = str.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return getCorByIndex(hash);
}

// ============================================
// HELPERS
// ============================================

/**
 * Busca label de uma opção pelo value
 */
export function getLabelByValue<T extends { value: string; label: string }>(
  options: readonly T[],
  value: string,
): string {
  return options.find((o) => o.value === value)?.label || value;
}

/**
 * Busca cor de uma opção pelo value
 */
export function getColorByValue<T extends { value: string; color: string }>(
  options: readonly T[],
  value: string,
): string {
  return options.find((o) => o.value === value)?.color || 'secondary';
}

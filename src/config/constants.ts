function resolveApiBase(): string {
  const envUrl = (import.meta as unknown as { env?: { VITE_API_URL?: string } })?.env?.VITE_API_URL;
  if (envUrl && envUrl.trim().length > 0) return envUrl.trim();

  // Usar proxy sempre (funciona tanto em dev quanto em pages.dev com _redirects)
  return '/api';
}

export const API_BASE_URL = resolveApiBase();

export const CARGOS = [
  { value: 'PILOTO', label: 'Piloto' },
  { value: 'COPILOTO', label: 'Copiloto' },
  { value: 'COMISSARIO', label: 'Comissário' },
  { value: 'MECANICO', label: 'Mecânico' },
  { value: 'INSTRUTOR', label: 'Instrutor' },
  { value: 'ADMINISTRADOR', label: 'Administrador' },
] as const;

export const SETORES = [
  { value: 'OPERACOES', label: 'Operações' },
  { value: 'MANUTENCAO', label: 'Manutenção' },
  { value: 'ADMINISTRATIVO', label: 'Administrativo' },
  { value: 'TREINAMENTO', label: 'Treinamento' },
  { value: 'SEGURANCA', label: 'Segurança' },
] as const;

export const TIPOS_QUALIFICACAO = [
  { value: 'LICENCA', label: 'Licença' },
  { value: 'HABILITACAO_TIPO', label: 'Habilitação de Tipo' },
  { value: 'CERTIFICACAO_MEDICA', label: 'Certificação Médica' },
  { value: 'TREINAMENTO', label: 'Treinamento' },
  { value: 'CHEQUE', label: 'Cheque de Proficiência' },
] as const;

export const STATUS_QUALIFICACAO = [
  { value: 'VALIDO', label: 'Válido', color: 'green' },
  { value: 'VENCENDO', label: 'Vencendo', color: 'yellow' },
  { value: 'VENCIDO', label: 'Vencido', color: 'red' },
] as const;

export const TIPOS_SIMULADOR = [
  { value: 'FULL_FLIGHT', label: 'Full Flight' },
  { value: 'FIXED_BASE', label: 'Fixed Base' },
  { value: 'FMS', label: 'FMS' },
  { value: 'CPT', label: 'CPT' },
] as const;

export const STATUS_SIMULADOR = [
  { value: 'DISPONIVEL', label: 'Disponível', color: 'green' },
  { value: 'MANUTENCAO', label: 'Manutenção', color: 'yellow' },
  { value: 'INDISPONIVEL', label: 'Indisponível', color: 'red' },
] as const;

export const FUNCOES_SESSAO = [
  { value: 'PIC', label: 'PIC - Pilot in Command' },
  { value: 'SIC', label: 'SIC - Second in Command' },
  { value: 'DUAL', label: 'DUAL - Dual Control' },
] as const;

export const STATUS_AGENDAMENTO = [
  { value: 'AGENDADO', label: 'Agendado', color: 'blue' },
  { value: 'EM_ANDAMENTO', label: 'Em Andamento', color: 'yellow' },
  { value: 'CONCLUIDO', label: 'Concluído', color: 'green' },
  { value: 'CANCELADO', label: 'Cancelado', color: 'red' },
] as const;

export const PAGINACAO = {
  DEFAULT_LIMIT: 50,
  MAX_LIMIT: 100,
} as const;

export const VALIDACOES = {
  CPF_REGEX: /^\d{3}\.\d{3}\.\d{3}-\d{2}$/,
  EMAIL_REGEX: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  MATRICULA_REGEX: /^[A-Z0-9]{4,10}$/,
} as const;

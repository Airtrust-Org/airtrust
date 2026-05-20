// Tipos específicos do módulo Simuladores / Sessões / Participantes (Fase 2)
// Mantém compatibilidade com schema legado (data_sessao + duracao_minutos)

export type StatusSessao =
  | 'PLANEJADA'
  | 'AGENDADA'
  | 'AGENDADO' // Backend retorna ambos
  | 'CONFIRMADA'
  | 'CONFIRMADO'
  | 'EM_ANDAMENTO'
  | 'CONCLUIDA'
  | 'CONCLUIDO'
  | 'CANCELADA'
  | 'CANCELADO';

export interface SessaoSimulador {
  id: number;
  simulador_id: number;
  tipo_sessao: string;
  data_sessao: string; // legado (YYYY-MM-DD HH:MM:SS)
  duracao_minutos: number;
  status: StatusSessao;
  observacoes?: string | null;
  created_at: string;
  updated_at?: string;
  deleted_at?: string | null;
  // Campos derivados
  simulador_codigo?: string;
  codigo_aeronave?: string;
}

export interface ParticipanteSessao {
  id: number;
  sessao_id: number;
  funcionario_id: number;
  papel: 'ALUNO' | 'INSTRUTOR' | 'OBSERVADOR' | 'EXAMINADOR';
  presenca: 'PENDENTE' | 'PRESENTE' | 'AUSENTE';
  resultado?: string | null; // e.g. APTO / INAPTO / PENDENTE
  observacoes?: string | null;
  created_at: string;
  updated_at?: string;
  deleted_at?: string | null;
}

export interface CriarSessaoPayload {
  sessao: {
    simulador_id: number;
    tipo_sessao: string;
    data_sessao?: string; // alternativa
    data_inicio?: string; // aceita no novo modelo
    data_fim?: string;
    status?: StatusSessao;
    observacoes?: string;
  };
  participantes?: Array<{ funcionario_id: number; papel: ParticipanteSessao['papel'] }>;
}

export interface AtualizarSessaoPayload {
  tipo_sessao?: string;
  data_sessao?: string;
  status?: StatusSessao;
  observacoes?: string;
  duracao_minutos?: number;
}

export interface DefinirParticipantesPayload {
  participantes: Array<{ funcionario_id: number; papel: ParticipanteSessao['papel'] }>;
}

export interface AtualizarParticipantePayload {
  presenca?: ParticipanteSessao['presenca'];
  resultado?: string;
  observacoes?: string;
}

export interface ApiListResponse<T> {
  success: boolean;
  data: T[];
  error?: string;
}

export interface ApiItemResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}

// ==========================================
// HELPERS - Normalização de Status
// ==========================================

/**
 * Normaliza status para maiúsculo
 */
export const normalizeStatus = (status: string | undefined): string => {
  return status?.toUpperCase() || '';
};

/**
 * Converte status do backend (AGENDADO) para display (AGENDADA)
 * Remove "O" final se existir e adiciona "A"
 */
export const getStatusDisplay = (status: string | undefined): string => {
  const normalized = normalizeStatus(status);
  if (normalized.endsWith('O')) {
    return normalized.slice(0, -1) + 'A';
  }
  return normalized;
};

/**
 * Compara dois status ignorando diferenças de masculino/feminino
 */
export const isSameStatus = (status1: string | undefined, status2: string | undefined): boolean => {
  const s1 = normalizeStatus(status1).replace(/[OA]$/, '');
  const s2 = normalizeStatus(status2).replace(/[OA]$/, '');
  return s1 === s2;
};

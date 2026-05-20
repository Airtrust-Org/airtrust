/**
 * Tipos TypeScript para o sistema de Qualificações
 *
 * @module types/qualificacoes
 */

/**
 * Modo de vencimento
 * 0 = Vence no dia exato do mês
 * 1 = Vence no último dia do mês
 */
export type VencimentoMode = 0 | 1;

/**
 * Status de validade de uma qualificação
 */
export type StatusValidade = 'vigente' | 'expirando' | 'vencida';

/**
 * Nível de urgência de alerta
 */
export type Urgencia = 'low' | 'medium' | 'high' | 'critical';

/**
 * Tipo de qualificação (master data)
 * Armazenado em qualificacoes_tipos
 */
export interface TipoQualificacao {
  id: string; // UUID: formato tipo-{timestamp}-{random}
  tipo?: string; // Campo legado
  codigo: string; // Código único: CMA, ASO, ICAO, etc
  nome: string; // Nome descritivo
  descricao?: string | null; // Descrição detalhada
  categoria?: string | null; // Categoria: MEDICO, OPERACIONAL, etc
  carga_horaria?: number | null; // Carga horária (horas)
  validade: number; // Validade em meses (12, 24, etc)
  vencimento_fim_mes: VencimentoMode; // 0=dia exato, 1=fim do mês
  observacoes?: string | null; // Observações adicionais
  ativo: number | boolean; // 1/true = ativo, 0/false = inativo
  created_at: string; // ISO timestamp
  updated_at?: string | null; // ISO timestamp
  deleted_at?: string | null; // ISO timestamp (soft delete)
}

/**
 * Histórico de qualificação de um funcionário
 * Armazenado em qualificacoes_historico
 */
export interface QualificacaoHistorico {
  id: number;
  funcionario_id: number;
  qualificacao_tipo_id: string; // FK para qualificacoes_tipos.id
  data_conclusao: string; // ISO date: YYYY-MM-DD
  data_vencimento: string; // ISO date: YYYY-MM-DD (calculada)
  status: StatusValidade; // vigente, expirando, vencida
  certificado_url?: string | null; // URL para arquivo certificado (R2)
  observacoes?: string | null;
  renovacoes?: number; // Contagem de renovações
  proxima_renovacao?: string | null; // Data sugerida para renovação
  created_at: string;
  updated_at?: string | null;
  deleted_at?: string | null;
}

/**
 * Dados relacionados (enriquecidos) - Qualificação com info do funcionário
 */
export interface QualificacaoComFuncionario extends QualificacaoHistorico {
  funcionario_nome: string;
  funcionario_matricula: string;
  funcionario_email?: string;
  tipo_codigo?: string;
  tipo_nome?: string;
  dias_ate_vencimento?: number;
  urgencia?: Urgencia;
}

/**
 * Resultado de cálculo de validade
 */
export interface ResultadoCalculoValidade {
  data_conclusao: string; // ISO date
  data_vencimento: string; // ISO date (calculada)
  validade_meses: number;
  vencimento_fim_mes: VencimentoMode;
  dias_validade: number;
  status: StatusValidade;
}

/**
 * Alerta de qualificação expirando
 */
export interface AlertaQualificacao {
  id: number;
  funcionario_id: number;
  funcionario_nome: string;
  funcionario_matricula: string;
  funcionario_email?: string;
  tipo_codigo: string;
  tipo_nome: string;
  data_vencimento: string;
  dias_ate_vencimento: number;
  urgencia: Urgencia;
  criado_em: string; // ISO timestamp
}

/**
 * Request body para criar/atualizar tipo de qualificação
 */
export interface CreateUpdateTipoQualificacaoRequest {
  codigo: string;
  nome: string;
  descricao?: string | null;
  categoria?: string | null;
  carga_horaria?: number | null;
  validade: number;
  vencimento_fim_mes?: VencimentoMode; // Default 0
  observacoes?: string | null;
  ativo?: number | boolean; // Default 1
}

/**
 * Request body para registrar histórico de qualificação
 */
export interface CreateQualificacaoHistoricoRequest {
  funcionario_id: number;
  qualificacao_tipo_id: string;
  data_conclusao: string; // YYYY-MM-DD
  certificado_url?: string;
  observacoes?: string;
}

/**
 * Request body para renovar qualificação
 */
export interface RenovarQualificacaoRequest {
  qualificacao_historico_id: number;
  data_conclusao: string; // YYYY-MM-DD
  certificado_url?: string;
  observacoes?: string;
}

/**
 * Response com paginação de qualificações
 */
export interface ListaQualificacoesResponse {
  success: boolean;
  data: QualificacaoComFuncionario[];
  meta: {
    count: number;
    total?: number;
    page?: number;
    limit?: number;
  };
}

/**
 * Response de alertas
 */
export interface ListaAlertasResponse {
  success: boolean;
  data: AlertaQualificacao[];
  meta: {
    count: number;
    urgencias: {
      critical: number;
      high: number;
      medium: number;
      low: number;
    };
  };
}

/**
 * Filtros para busca de qualificações
 */
export interface FiltrosQualificacao {
  funcionario_id?: number;
  status?: StatusValidade;
  urgencia?: Urgencia;
  categoria?: string;
  codigo?: string;
  data_inicio?: string; // YYYY-MM-DD
  data_fim?: string; // YYYY-MM-DD
  ativos_apenas?: boolean; // Default true
  search?: string; // Busca textual em nome, matricula, email
}

/**
 * Configuração de notificações de vencimento
 */
export interface ConfigNotificacaoVencimento {
  dias_antes: number; // Notificar X dias antes
  habilitada: boolean;
  canais: Array<'email' | 'dashboard' | 'sms'>;
  apenas_criticos?: boolean; // Default false
}

/**
 * Estatísticas de qualificações por funcionário
 */
export interface EstatisticasQualificacao {
  funcionario_id: number;
  total_qualificacoes: number;
  vigentes: number;
  expirando: number;
  vencidas: number;
  proxima_expiracao?: {
    data: string;
    dias: number;
    tipo: string;
  };
}

/**
 * Relatório de compliance de qualificações
 */
export interface RelatorioComplianceQualificacoes {
  data_relatorio: string;
  periodo: {
    inicio: string;
    fim: string;
  };
  resumo: {
    total_funcionarios: number;
    com_qualificacoes_vigentes: number;
    com_qualificacoes_expirando: number;
    com_qualificacoes_vencidas: number;
    conformidade_percentual: number;
  };
  alertas_por_urgencia: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  qualificacoes_criticas: AlertaQualificacao[];
}

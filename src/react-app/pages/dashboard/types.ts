export interface DashboardMetrics {
  tripulantesAtivos: number;
  tripulantesComQualificacoesVencendo: number;
  tripulantesComQualificacoesVencidas: number;
  qualificacoesAVencer: number;
  qualificacoesVencidas: number;
  qualificacoesValidas: number;
  totalQualificacoes: number;
  demandaFutura30Dias: number;
  demandaFutura60Dias: number;
  demandaFutura90Dias: number;
  lms?: {
    totalCursos: number;
    totalMatriculas: number;
    concluidos: number;
    emAndamento: number;
    taxaConclusaoPct: number;
  };
}

export interface ComplianceData {
  scoreGeral: number;
  scoreFinal?: number;
  metaOrganizacional: number;
  qualificacoesValidas: number;
  totalQualificacoes: number;
  breakdown: Record<string, number>;
}

export interface AlertaRaw {
  id: string;
  tipo: string;
  criticidade: string;
  mensagem: string;
  tripulanteId?: string;
  tripulanteNome: string;
  tripulanteMatricula?: string;
  qualificacaoId?: string;
  qualificacaoNome: string;
  dataVencimento?: string;
  diasRestantes: number;
  acaoRecomendada?: string;
  urlAcao?: string;
  renovada?: boolean;
}

export interface AtividadeRecente {
  id: string;
  tipo: string;
  descricao: string;
  tripulanteNome: string;
  tripulanteMatricula?: string;
  timestamp: string;
  icone?: string;
  cor?: string;
}

export interface FrmsAlertaRaw {
  id: string;
  tripulante_id: string;
  nivel: 'AVISO' | 'ATENCAO' | 'CRITICO' | 'VIOLACAO';
  descricao?: string;
  tipo?: string;
  data_jornada?: string;
  nome_tripulante?: string;
  resolvido?: number;
}

export interface EscalaItem {
  id: string;
  mes: number;
  ano: number;
  status: 'rascunho' | 'em_revisao' | 'aprovada' | 'publicada';
  total_tripulacoes?: number;
}

export interface TreinamentoPlanejadoItem {
  id: number | string;
  titulo?: string | null;
  qualificacao_nome?: string | null;
  data_prevista: string;
  status: 'PLANEJADO' | 'CONFIRMADO' | 'EM_ANDAMENTO' | 'CONCLUIDO' | 'CANCELADO';
  local?: string | null;
  convocados_total?: number;
  confirmados_total?: number;
}

export interface SolicitacaoTreinamentoItem {
  id: string;
  titulo?: string | null;
  qualificacao_nome?: string | null;
  data_prevista?: string | null;
  status?: string | null;
}

export interface SessaoSimulador {
  id: string;
  data: string;
  hora_inicio?: string | null;
  hora_fim?: string | null;
  tipo_sessao?: string | null;
  tema_sessao?: string | null;
  status?: string | null;
  simulador_nome?: string | null;
  simulador_modelo?: string | null;
  instrutor_nome?: string | null;
  participantes?: Array<{ id: number; nome: string; funcao?: string }> | string;
}

export interface SectionErrors {
  metrics: string | null;
  compliance: string | null;
}

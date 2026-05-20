/**
 * Tipos TypeScript para Dashboard Principal AirTrust
 * Sistema de Conformidade Operacional Aeronáutica
 */

export interface DashboardMetrics {
  tripulantesAtivos: number;
  tripulantesComQualificacoesVencendo: number; // próximos 30 dias
  tripulantesComQualificacoesVencidas: number;
  qualificacoesAVencer: number;
  qualificacoesVencidas: number;
  qualificacoesValidas?: number; // contagem real de qualificações válidas
  totalQualificacoes?: number; // total de qualificações (não-renovadas, concluídas)
  taxaConclusaoTreinamento: number; // percentual
  demandaFutura30Dias: number;
  demandaFutura60Dias: number;
  demandaFutura90Dias: number;
  tendenciaConclusao?: 'subindo' | 'estavel' | 'descendo';
  lms?: {
    totalCursos: number;
    totalMatriculas: number;
    concluidos: number;
    emAndamento: number;
    taxaConclusaoPct: number;
  };
}

export type AlertaCriticoTipo =
  | 'qualificacao_vencida'
  | 'qualificacao_vencendo'
  | 'treinamento_pendente'
  | 'lms_curso_pendente'
  | 'compliance_baixo'
  | 'simulador_indisponivel';

export type AlertaCriticoCriticidade = 'CRITICA' | 'ALTA' | 'MEDIA' | 'BAIXA';

export interface AlertaCritico {
  id: number;
  tipo: AlertaCriticoTipo;
  criticidade: AlertaCriticoCriticidade;
  mensagem: string;
  tripulanteId?: number;
  tripulanteNome?: string;
  tripulanteMatricula?: string;
  qualificacaoId?: number;
  qualificacaoNome?: string;
  dataVencimento?: string;
  diasRestantes?: number;
  acaoRecomendada: string;
  urlAcao: string;
  createdAt: string;
}

export interface ComplianceScore {
  scoreGeral: number; // 0-100
  breakdown: {
    qualificacoes: number; // % de qualificações válidas
    treinamentos: number; // % de treinamentos em dia
    documentacao: number; // % de documentação completa
    simuladores: number; // % de check rides válidos
    examesMedicos: number; // % de exames médicos válidos
  };
  qualificacoesValidas?: number; // contagem absoluta
  totalQualificacoes?: number; // total absoluto
  tendencia: 'subindo' | 'estavel' | 'descendo';
  metaOrganizacional: number;
}

export interface DemandaTreinamento {
  total: number;
  porPeriodo: {
    proximos30Dias: number;
    dias31a60: number;
    dias61a90: number;
  };
  porTipo: {
    inicial: number;
    recorrente: number;
    transicao: number;
    upgrade: number;
  };
  porSimulador: Array<{
    simuladorNome: string;
    quantidade: number;
    horasEstimadas: number;
  }>;
  porInstrutor: Array<{
    instrutorNome: string;
    sessoesProgramadas: number;
    horasCompromissadas: number;
    disponibilidade: number;
  }>;
}

export type AtividadeRecenteTipo =
  | 'treinamento_concluido'
  | 'qualificacao_emitida'
  | 'qualificacao_renovada'
  | 'alerta_gerado'
  | 'tripulante_cadastrado'
  | 'sessao_concluida';

export interface AtividadeRecente {
  id: number;
  tipo: AtividadeRecenteTipo;
  descricao: string;
  tripulanteNome?: string;
  tripulanteMatricula?: string;
  timestamp: string;
  icone: string;
  cor: string;
}

export interface TaxaConclusaoMensal {
  meses: string[];
  taxas: number[];
  meta: number;
}

export type SimuladorStatus = 'operacional' | 'manutencao' | 'inoperante';

export interface UtilizacaoSimulador {
  id: number;
  nome: string;
  fabricante: string;
  modelo: string;
  horasProgramadas: number;
  horasDisponiveis: number;
  taxaUtilizacao: number;
  proximaManutencao?: string;
  status: SimuladorStatus;
}

export interface UtilizacaoSimuladores {
  simuladores: UtilizacaoSimulador[];
}

export type SystemStatus = 'healthy' | 'degraded' | 'critical';
export type ComponentStatus = 'ok' | 'slow' | 'down';

export interface SystemHealth {
  status: SystemStatus;
  database: {
    status: ComponentStatus;
    latency: number;
    ultimaVerificacao: string;
  };
  storage: {
    status: ComponentStatus;
    espacoUsado: number;
    espacoTotal: number;
    ultimaVerificacao: string;
  };
  workers: {
    status: ComponentStatus;
    requestsUltima1h: number;
    errorsUltima1h: number;
    p95Latency: number;
  };
}

// Tipos auxiliares para componentes
export interface MetricCardProps {
  title: string;
  value: number | string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  color: 'blue' | 'green' | 'yellow' | 'red';
  badge?: string;
  trend?: 'subindo' | 'estavel' | 'descendo';
  isLoading?: boolean;
  onClick?: () => void;
}

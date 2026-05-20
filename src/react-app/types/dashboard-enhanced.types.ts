/**
 * Dashboard Enhanced Types
 * Tipos para o novo dashboard hierárquico e acionável
 */

export type TrendDirection = 'up' | 'down' | 'stable';
export type Severity = 'critical' | 'warning' | 'info' | 'success';
export type AlertType =
  | 'certificacao_vencendo'
  | 'certificacao_vencida'
  | 'cma_vencido'
  | 'treinamento_atrasado'
  | 'simulador_pendente'
  | 'cheque_pendente';

/**
 * Métrica com tendência temporal e sparkline
 */
export interface MetricWithTrend {
  current: number;
  previous: number; // Período anterior (semana, mês)
  delta: number; // Diferença absoluta
  deltaPercent: number; // Diferença percentual
  trend: TrendDirection;
  sparkline?: number[]; // Últimos 7-30 valores para mini-chart
  target?: number; // Meta/objetivo
  unit?: string; // %, unidades, dias, etc.
}

/**
 * Alerta crítico com priorização e ações
 */
export interface CriticalAlert {
  id: string;
  type: AlertType;
  severity: Severity;
  count: number;
  title: string;
  description: string;
  actionLabel: string;
  actionUrl: string;
  secondaryActionLabel?: string;
  secondaryActionUrl?: string;
  affectedUsers: number;
  daysUntilDeadline?: number;
  priority?: number; // Calculado automaticamente
  icon?: string; // Emoji ou ícone
}

/**
 * Breakdown de compliance por categoria
 */
export interface ComplianceBreakdown {
  category: string;
  score: number;
  total: number;
  valid: number;
  color: string;
}

/**
 * Ação próxima/pendente
 */
export interface UpcomingAction {
  id: string;
  type: 'simulador' | 'cheque' | 'renovacao' | 'exame_medico';
  title: string;
  dueDate: string; // ISO date
  daysUntil: number;
  assignedTo?: string;
  priority: 'high' | 'medium' | 'low';
  url: string;
  completed?: boolean;
}

/**
 * Atividade recente
 */
export interface RecentActivity {
  id: string;
  type: 'qualificacao' | 'treinamento' | 'simulador' | 'cheque' | 'certificado';
  title: string;
  description: string;
  timestamp: string; // ISO timestamp
  user?: {
    name: string;
    avatar?: string;
  };
  icon?: string;
}

/**
 * Dados de saúde do sistema
 */
export interface SystemHealth {
  database: {
    status: 'healthy' | 'degraded' | 'down';
    latency: number; // ms
    lastCheck: string;
  };
  storage: {
    status: 'healthy' | 'degraded' | 'down';
    used: number; // GB
    total: number; // GB
    percentage: number;
  };
  workers: {
    status: 'healthy' | 'degraded' | 'down';
    requestsPerHour: number;
    errorRate: number; // %
  };
}

/**
 * Dados completos do dashboard
 */
export interface EnhancedDashboardData {
  // Métricas principais com tendências
  compliance: MetricWithTrend & {
    breakdown: ComplianceBreakdown[];
  };
  tripulantesAtivos: MetricWithTrend;
  qualificacoesAVencer: MetricWithTrend;
  simuladoresUtilizacao: MetricWithTrend;

  // Alertas críticos priorizados
  criticalAlerts: CriticalAlert[];

  // Próximas ações
  upcomingActions: UpcomingAction[];

  // Atividades recentes
  recentActivities: RecentActivity[];

  // Saúde do sistema
  systemHealth: SystemHealth;

  // Timestamp da última atualização
  lastUpdated: string;
}

/**
 * Calcula score de prioridade de um alerta
 */
export function calculateAlertPriority(alert: CriticalAlert): number {
  const severityWeight = {
    critical: 100,
    warning: 50,
    info: 10,
    success: 0,
  };

  const urgencyWeight =
    alert.daysUntilDeadline !== undefined ? Math.max(0, 100 - alert.daysUntilDeadline * 10) : 0;

  const volumeWeight = Math.min(alert.count * 5, 50); // Max 50 pontos

  return severityWeight[alert.severity] + urgencyWeight + volumeWeight;
}

/**
 * Formata delta de métrica com sinal e cor
 */
export function formatMetricDelta(
  delta: number,
  deltaPercent: number,
  inversePolarity = false, // true se diminuição é positiva (ex: alertas)
): {
  text: string;
  color: string;
  icon: string;
} {
  const isPositive = inversePolarity ? delta < 0 : delta > 0;
  const isNegative = inversePolarity ? delta > 0 : delta < 0;

  return {
    text: `${delta > 0 ? '+' : ''}${delta} (${deltaPercent > 0 ? '+' : ''}${deltaPercent.toFixed(1)}%)`,
    color: isPositive ? 'text-emerald-600' : isNegative ? 'text-red-600' : 'text-gray-500',
    icon: delta > 0 ? '↑' : delta < 0 ? '↓' : '→',
  };
}

/**
 * Agrupa ações por período
 */
export function groupActionsByPeriod(actions: UpcomingAction[]): {
  today: UpcomingAction[];
  next7Days: UpcomingAction[];
  next30Days: UpcomingAction[];
} {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const next7 = new Date(today);
  next7.setDate(next7.getDate() + 7);
  const next30 = new Date(today);
  next30.setDate(next30.getDate() + 30);

  return {
    today: actions.filter((a) => {
      const due = new Date(a.dueDate);
      return due <= today;
    }),
    next7Days: actions.filter((a) => {
      const due = new Date(a.dueDate);
      return due > today && due <= next7;
    }),
    next30Days: actions.filter((a) => {
      const due = new Date(a.dueDate);
      return due > next7 && due <= next30;
    }),
  };
}

/**
 * Formata timestamp relativo (ex: "há 2 horas")
 */
export function formatRelativeTime(timestamp: string): string {
  const now = new Date();
  const date = new Date(timestamp);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'agora';
  if (diffMins < 60) return `há ${diffMins} min`;
  if (diffHours < 24) return `há ${diffHours}h`;
  if (diffDays < 7) return `há ${diffDays}d`;
  return date.toLocaleDateString('pt-BR');
}

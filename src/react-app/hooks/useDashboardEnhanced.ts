import { useState, useEffect, useCallback, useMemo } from 'react';
import type {
  EnhancedDashboardData,
  CriticalAlert,
  MetricWithTrend,
  UpcomingAction,
  RecentActivity,
  SystemHealth,
  ComplianceBreakdown,
} from '../types/dashboard-enhanced.types';
import { calculateAlertPriority } from '../types/dashboard-enhanced.types';
import { API_BASE_URL, getAccessToken } from '@/react-app/config/api';

const API_BASE = API_BASE_URL;

/**
 * Hook para buscar e processar dados do dashboard com tendências e priorização
 */
export function useDashboardEnhanced() {
  const [data, setData] = useState<EnhancedDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  /**
   * Busca dados de múltiplos endpoints e combina
   */
  const fetchDashboardData = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      setError(new Error('Token não encontrado'));
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      };

      // Buscar dados em paralelo (API_BASE já contém /api)
      const [metricsRes, complianceRes, alertasRes, atividadesRes] = await Promise.all([
        fetch(`${API_BASE}/dashboard/metrics`, { headers }),
        fetch(`${API_BASE}/dashboard/compliance-score`, { headers }),
        fetch(`${API_BASE}/dashboard/alertas-criticos`, { headers }),
        fetch(`${API_BASE}/dashboard/atividades-recentes`, { headers }),
      ]);

      if (!metricsRes.ok || !complianceRes.ok || !alertasRes.ok) {
        throw new Error('Erro ao buscar dados do dashboard');
      }

      const metricsData = await metricsRes.json();
      const complianceData = await complianceRes.json();
      const alertasData = await alertasRes.json();
      const atividadesData = atividadesRes.ok ? await atividadesRes.json() : { data: [] };

      // Processar dados
      const enhancedData = processEnhancedData(
        metricsData.data,
        complianceData.data,
        alertasData.data,
        atividadesData.data || [],
      );

      setData(enhancedData);
      setLastRefresh(new Date());
    } catch (err) {
      console.error('Erro ao buscar dashboard:', err);
      setError(err instanceof Error ? err : new Error('Erro desconhecido'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Processa e enriquece os dados
   */
  function processEnhancedData(
    metrics: any,
    compliance: any,
    alertas: any,
    atividades: any[],
  ): EnhancedDashboardData {
    // Compliance com breakdown
    const complianceMetric: MetricWithTrend & { breakdown: ComplianceBreakdown[] } = {
      current: compliance.scoreFinal || 0,
      previous: compliance.scoreFinal || 0, // Sem histórico persistido; delta será 0
      delta: 0,
      deltaPercent: 0,
      trend: 'stable',
      target: 90,
      unit: '%',
      breakdown: [
        {
          category: 'Qualificações',
          score: compliance.scoreQualificacoes || 0,
          total: metrics.totalQualificacoes || 0,
          valid: metrics.qualificacoesValidas || 0,
          color: 'bg-blue-500',
        },
        {
          category: 'Simuladores',
          score: compliance.scoreSimuladores || 100,
          total: 100,
          valid: 100,
          color: 'bg-emerald-500',
        },
        {
          category: 'Treinamentos',
          score: compliance.scoreTreinamentos || 100,
          total: 100,
          valid: 100,
          color: 'bg-purple-500',
        },
      ],
    };

    // Tripulantes ativos
    const tripulantesMetric: MetricWithTrend = {
      current: metrics.tripulantesAtivos || 0,
      previous: metrics.tripulantesAtivos || 0, // Sem histórico persistido; delta será 0
      delta: 0,
      deltaPercent: 0,
      trend: 'stable',
    };

    // Qualificações a vencer
    const qualificacoesAVencerMetric: MetricWithTrend = {
      current: metrics.qualificacoesAVencer || 0,
      previous: metrics.qualificacoesAVencer || 0,
      delta: 0,
      deltaPercent: 0,
      trend: 'stable',
      target: 0, // Meta é 0 vencimentos
      unit: 'qualif.',
    };

    // Utilização de simuladores
    const simuladoresMetric: MetricWithTrend = {
      current: 0, // Utilização de simuladores: requer endpoint dedicado /api/simuladores/utilizacao
      previous: 0,
      delta: 0,
      deltaPercent: 0,
      trend: 'stable',
      unit: '%',
    };

    // Processar alertas críticos
    const criticalAlerts: CriticalAlert[] = processAlerts(alertas, metrics);

    // Processar próximas ações
    const upcomingActions: UpcomingAction[] = processUpcomingActions(alertas);

    // Processar atividades recentes
    const recentActivities: RecentActivity[] = processRecentActivities(atividades);

    // Saúde do sistema (mock)
    const systemHealth: SystemHealth = {
      database: {
        status: 'healthy',
        latency: 190,
        lastCheck: new Date().toISOString(),
      },
      storage: {
        status: 'healthy',
        used: 0,
        total: 10,
        percentage: 0,
      },
      workers: {
        status: 'healthy',
        requestsPerHour: 0,
        errorRate: 0,
      },
    };

    return {
      compliance: complianceMetric,
      tripulantesAtivos: tripulantesMetric,
      qualificacoesAVencer: qualificacoesAVencerMetric,
      simuladoresUtilizacao: simuladoresMetric,
      criticalAlerts,
      upcomingActions,
      recentActivities,
      systemHealth,
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Processa e prioriza alertas
   */
  function processAlerts(alertasData: any, metrics: any): CriticalAlert[] {
    const alerts: CriticalAlert[] = [];

    // Certificações vencendo (< 7 dias)
    if (metrics.qualificacoesAVencer > 0) {
      alerts.push({
        id: 'cert-vencendo',
        type: 'certificacao_vencendo',
        severity: 'warning',
        count: metrics.qualificacoesAVencer,
        title: `${metrics.qualificacoesAVencer} Certificações Vencendo`,
        description: `${metrics.qualificacoesAVencer} certificações vencem nos próximos 30 dias`,
        actionLabel: 'Agendar Renovações',
        actionUrl: '/qualificacoes?filtro=a_vencer',
        secondaryActionLabel: 'Ver Lista',
        secondaryActionUrl: '/qualificacoes',
        affectedUsers: metrics.qualificacoesAVencer,
        daysUntilDeadline: 30,
        icon: '⚠️',
      });
    }

    // Certificações vencidas
    if (metrics.qualificacoesVencidas > 0) {
      alerts.push({
        id: 'cert-vencidas',
        type: 'certificacao_vencida',
        severity: 'critical',
        count: metrics.qualificacoesVencidas,
        title: `${metrics.qualificacoesVencidas} Certificações Vencidas`,
        description: `${metrics.qualificacoesVencidas} certificações já vencidas requerem ação imediata`,
        actionLabel: 'Afastar da Escala',
        actionUrl: '/qualificacoes?filtro=vencidas',
        secondaryActionLabel: 'Ver Detalhes',
        secondaryActionUrl: '/qualificacoes',
        affectedUsers: metrics.qualificacoesVencidas,
        daysUntilDeadline: 0,
        icon: '🚨',
      });
    }

    // Processar alertas detalhados
    if (alertasData.alertas && Array.isArray(alertasData.alertas)) {
      alertasData.alertas.forEach((alerta: any) => {
        // Evitar duplicatas
        if (alerta.tipo === 'qualificacao_vencendo' || alerta.tipo === 'qualificacao_vencida') {
          return;
        }

        alerts.push({
          id: `alert-${alerta.id}`,
          type: alerta.tipo,
          severity: alerta.criticidade === 'alta' ? 'critical' : 'warning',
          count: 1,
          title: alerta.titulo,
          description: alerta.descricao,
          actionLabel: 'Ver Detalhes',
          actionUrl: alerta.url || '/dashboard',
          affectedUsers: 1,
          daysUntilDeadline: alerta.diasRestantes,
          icon: alerta.criticidade === 'alta' ? '🚨' : '⚠️',
        });
      });
    }

    // Calcular prioridade e ordenar
    return alerts
      .map((alert) => ({
        ...alert,
        priority: calculateAlertPriority(alert),
      }))
      .sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }

  /**
   * Processa próximas ações
   */
  function processUpcomingActions(alertasData: any): UpcomingAction[] {
    const actions: UpcomingAction[] = [];

    // Extrair de alertas
    if (alertasData.alertas && Array.isArray(alertasData.alertas)) {
      alertasData.alertas.forEach((alerta: any) => {
        const dueDate = alerta.dataVencimento || alerta.dataPrevista;
        if (!dueDate) return;

        const due = new Date(dueDate);
        const now = new Date();
        const daysUntil = Math.ceil((due.getTime() - now.getTime()) / 86400000);

        actions.push({
          id: `action-${alerta.id}`,
          type: alerta.tipo === 'simulador_pendente' ? 'simulador' : 'renovacao',
          title: alerta.titulo,
          dueDate,
          daysUntil,
          priority: daysUntil < 7 ? 'high' : daysUntil < 30 ? 'medium' : 'low',
          url: alerta.url || '/dashboard',
        });
      });
    }

    return actions.sort((a, b) => a.daysUntil - b.daysUntil);
  }

  /**
   * Processa atividades recentes
   */
  function processRecentActivities(atividades: any[]): RecentActivity[] {
    return atividades.slice(0, 10).map((ativ: any, idx: number) => ({
      id: `activity-${idx}`,
      type: ativ.tipo || 'qualificacao',
      title: ativ.titulo || ativ.descricao,
      description: ativ.descricao || '',
      timestamp: ativ.data || new Date().toISOString(),
      user: ativ.usuario
        ? {
            name: ativ.usuario,
            avatar: undefined,
          }
        : undefined,
      icon: getActivityIcon(ativ.tipo),
    }));
  }

  function getActivityIcon(tipo: string): string {
    const icons: Record<string, string> = {
      qualificacao: '📋',
      treinamento: '📚',
      simulador: '✈️',
      cheque: '✅',
      certificado: '🎓',
    };
    return icons[tipo] || '📄';
  }

  // Auto-refresh a cada 15 minutos (era 5 minutos)
  useEffect(() => {
    fetchDashboardData();

    const interval = setInterval(
      () => {
        fetchDashboardData();
      },
      15 * 60 * 1000,
    );

    return () => clearInterval(interval);
  }, [fetchDashboardData]);

  // Alertas críticos ordenados (máximo 5)
  const topAlerts = useMemo(() => data?.criticalAlerts.slice(0, 5) || [], [data]);

  // Total de alertas
  const totalAlertsCount = useMemo(
    () => data?.criticalAlerts.reduce((sum, a) => sum + a.count, 0) || 0,
    [data],
  );

  return {
    data,
    isLoading,
    error,
    lastRefresh,
    topAlerts,
    totalAlertsCount,
    refresh: fetchDashboardData,
  };
}

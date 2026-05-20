/**
 * Hook customizado para buscar métricas do dashboard
 * Sistema AirTrust - Conformidade Aeronáutica
 */

import { useState, useEffect, useCallback } from 'react';
import type { DashboardMetrics } from '../types/dashboard.types';
import { API_BASE_URL, getAccessToken } from '@/react-app/config/api';

export function useDashboardMetrics(autoRefreshInterval = 15 * 60 * 1000) {
  // 15 minutos (era 5 minutos)
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const token = getAccessToken();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch(`${API_BASE_URL}/dashboard/metrics`, {
        headers,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      setMetrics(result.data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao carregar métricas';
      setError(message);
      console.error('[useDashboardMetrics] Erro:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMetrics();

    // Auto-refresh - NÃO disparar no visibilitychange (causava explosão de requests!)
    const interval = setInterval(() => {
      if (!document.hidden) {
        fetchMetrics();
      }
    }, autoRefreshInterval);

    return () => {
      clearInterval(interval);
    };
  }, [fetchMetrics, autoRefreshInterval]);

  return { metrics, isLoading, error, refetch: fetchMetrics };
}

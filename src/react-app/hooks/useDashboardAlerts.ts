/**
 * Hook customizado para buscar alertas críticos
 * Sistema AirTrust - Conformidade Aeronáutica
 */

import { useState, useEffect, useCallback } from 'react';
import type { AlertaCritico } from '../types/dashboard.types';
import { API_BASE_URL, getAccessToken } from '@/react-app/config/api';

export function useDashboardAlerts(autoRefreshInterval = 15 * 60 * 1000) {
  // 15 minutos (era 1 minuto - causava 100k+ requests/dia!)
  const [alerts, setAlerts] = useState<AlertaCritico[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAlerts = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const token = getAccessToken();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch(`${API_BASE_URL}/dashboard/alertas-criticos`, {
        headers,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      setAlerts(result.data || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao carregar alertas';
      setError(message);
      console.error('[useDashboardAlerts] Erro:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAlerts();

    // Auto-refresh controlado - NÃO disparar no visibilitychange (causava explosão de requests!)
    const interval = setInterval(() => {
      if (!document.hidden) {
        fetchAlerts();
      }
    }, autoRefreshInterval);

    return () => {
      clearInterval(interval);
    };
  }, [fetchAlerts, autoRefreshInterval]);

  return { alerts, isLoading, error, refetch: fetchAlerts };
}

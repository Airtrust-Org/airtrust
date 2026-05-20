/**
 * Hook customizado para buscar compliance score
 * Sistema AirTrust - Conformidade Aeronáutica
 */

import { useState, useEffect, useCallback } from 'react';
import type { ComplianceScore } from '../types/dashboard.types';
import { API_BASE_URL, getAccessToken } from '@/react-app/config/api';

export function useDashboardCompliance(autoRefreshInterval = 15 * 60 * 1000) {
  // 15 minutos (era 5 minutos)
  const [compliance, setCompliance] = useState<ComplianceScore | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCompliance = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const token = getAccessToken();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch(
        `${API_BASE_URL}/dashboard/compliance-score`,

        {
          headers,
        },
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      setCompliance(result.data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao carregar compliance score';
      setError(message);
      console.error('[useDashboardCompliance] Erro:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCompliance();

    // NÃO disparar no visibilitychange (causava explosão de requests!)
    const interval = setInterval(() => {
      if (!document.hidden) {
        fetchCompliance();
      }
    }, autoRefreshInterval);

    return () => {
      clearInterval(interval);
    };
  }, [fetchCompliance, autoRefreshInterval]);

  return { compliance, isLoading, error, refetch: fetchCompliance };
}

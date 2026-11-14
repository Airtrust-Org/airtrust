/**
 * Hook customizado para buscar compliance score
 * Sistema AirTrust - Conformidade Aeronáutica
 */

import { useState, useEffect, useCallback } from 'react';
import type { ComplianceScore } from '../types/dashboard.types';
import { fetchWithAuth } from '@/react-app/config/api';
import {
  assertTenantDataScope,
  captureTenantDataScope,
  registerTenantCacheReset,
  StaleTenantResponseError,
} from '@/react-app/lib/tenant-data-layer';
import { onDataChanged } from '@/react-app/utils/data-sync';

export function useDashboardCompliance(autoRefreshInterval = 15 * 60 * 1000) {
  // 15 minutos (era 5 minutos)
  const [compliance, setCompliance] = useState<ComplianceScore | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCompliance = useCallback(async () => {
    const scope = captureTenantDataScope();
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetchWithAuth('/api/dashboard/compliance-score', {
        signal: scope.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      assertTenantDataScope(scope);
      setCompliance(result.data);
    } catch (err) {
      if (err instanceof StaleTenantResponseError || (err instanceof Error && err.name === 'AbortError')) {
        return;
      }
      const message = err instanceof Error ? err.message : 'Erro ao carregar compliance score';
      setError(message);
      console.error('[useDashboardCompliance] Erro:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCompliance();

    const unregisterReset = registerTenantCacheReset('dashboard-compliance', () => {
      setCompliance(null);
      setError(null);
      queueMicrotask(() => {
        void fetchCompliance();
      });
    });

    const unsubscribeSync = onDataChanged(
      () => {
        void fetchCompliance();
      },
      ['qualificacoes', 'treinamentos', 'lms', 'compliance'],
    );

    // NÃO disparar no visibilitychange (causava explosão de requests!)
    const interval = setInterval(() => {
      if (!document.hidden) {
        fetchCompliance();
      }
    }, autoRefreshInterval);

    return () => {
      unregisterReset();
      unsubscribeSync();
      clearInterval(interval);
    };
  }, [fetchCompliance, autoRefreshInterval]);

  return { compliance, isLoading, error, refetch: fetchCompliance };
}

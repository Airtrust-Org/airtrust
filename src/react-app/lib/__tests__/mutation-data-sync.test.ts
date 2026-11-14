// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { QueryObserver } from '@tanstack/react-query';
import { dataChangeScopesForMutation } from '../apiFetch';
import { canApplyCrossTabDataChange, notifyDataChanged } from '@/react-app/utils/data-sync';
import { queryClient, shouldInvalidateQueryForDataChange } from '../query-client';
import { resetTenantDataLayer } from '../tenant-data-layer';

describe('tenant-aware mutation cache invalidation', () => {
  it('refetches an observed, populated dashboard query only once for overlapping mutation scopes', async () => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    resetTenantDataLayer({ tenantId: 6, reason: 'manual', broadcast: false });
    const key6 = ['tenant', 6, 'dashboard', 'operational-summary'] as const;
    const key7 = ['tenant', 7, 'dashboard', 'operational-summary'] as const;
    queryClient.setQueryData(key6, { total: 1 });
    queryClient.setQueryData(key7, { total: 7 });

    const fetch6 = vi.fn(async () => ({ total: 2 }));
    const fetch7 = vi.fn(async () => ({ total: 8 }));
    const observer6 = new QueryObserver(queryClient, {
      queryKey: key6,
      queryFn: fetch6,
      staleTime: Infinity,
    });
    const observer7 = new QueryObserver(queryClient, {
      queryKey: key7,
      queryFn: fetch7,
      staleTime: Infinity,
    });
    const unsubscribe6 = observer6.subscribe(() => {});
    const unsubscribe7 = observer7.subscribe(() => {});

    try {
      expect(fetch6).toHaveBeenCalledTimes(0);
      expect(fetch7).toHaveBeenCalledTimes(0);
      // One successful employee mutation has 3 domain dependencies.
      notifyDataChanged('funcionarios');
      notifyDataChanged('qualificacoes');
      notifyDataChanged('compliance');
      await vi.waitFor(() => expect(fetch6).toHaveBeenCalledTimes(1));
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(fetch6).toHaveBeenCalledTimes(1);
      expect(fetch7).toHaveBeenCalledTimes(0);
      expect(queryClient.getQueryData(key6)).toEqual({ total: 2 });
      expect(queryClient.getQueryData(key7)).toEqual({ total: 7 });
    } finally {
      unsubscribe6();
      unsubscribe7();
      resetTenantDataLayer({ tenantId: null, reason: 'manual', broadcast: false });
    }
  });

  it('rejects cross-tab invalidation from a different or unresolved tenant', () => {
    expect(canApplyCrossTabDataChange(6, 6)).toBe(true);
    expect(canApplyCrossTabDataChange(6, 7)).toBe(false);
    expect(canApplyCrossTabDataChange(null, 6)).toBe(false);
    expect(canApplyCrossTabDataChange(6, null)).toBe(false);
  });

  it('routes supported mutations to affected domains', () => {
    expect(dataChangeScopesForMutation('/api/qualificacoes/123')).toEqual(['qualificacoes', 'compliance']);
    expect(dataChangeScopesForMutation('/api/funcionarios/99')).toContain('funcionarios');
    expect(dataChangeScopesForMutation('/api/lms-matriculas/42/status')).toContain('lms');
    expect(dataChangeScopesForMutation('/api/frms/checkin')).toEqual(['frms']);
  });

  it('does not invalidate on high-frequency SCORM progress commits', () => {
    expect(dataChangeScopesForMutation('/api/lms-matriculas/42/scorm/commit')).toEqual([]);
    expect(dataChangeScopesForMutation('/api/lms-matriculas/42/progresso')).toEqual([]);
  });

  it('does not invalidate auth or unrelated mutation paths', () => {
    expect(dataChangeScopesForMutation('/api/auth/refresh')).toEqual([]);
    expect(dataChangeScopesForMutation('/api/unknown/resource')).toEqual([]);
  });

  it('never invalidates query data for a different company or unscoped key', () => {
    expect(shouldInvalidateQueryForDataChange(['tenant', 7, 'qualificacoes'], 'qualificacoes', 6)).toBe(false);
    expect(shouldInvalidateQueryForDataChange(['qualificacoes'], 'qualificacoes', 6)).toBe(false);
    expect(shouldInvalidateQueryForDataChange(['tenant', 'pending', 'qualificacoes'], 'all', 6)).toBe(false);
  });

  it('invalidates matching domains of the active company only', () => {
    expect(shouldInvalidateQueryForDataChange(['tenant', 6, 'qualificacoes', 22], 'qualificacoes', 6)).toBe(true);
    expect(shouldInvalidateQueryForDataChange(['tenant', 6, 'dashboard'], 'funcionarios', 6)).toBe(true);
    expect(shouldInvalidateQueryForDataChange(['tenant', 6, 'simuladores'], 'lms', 6)).toBe(false);
    expect(shouldInvalidateQueryForDataChange(['tenant', 6, 'any'], 'all', 6)).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { complianceDependentQueryKeys, invalidateComplianceDependents } from './complianceCacheInvalidation';
import { tenantQueryKey } from '@/react-app/lib/query-client';

describe('Compliance cross-module cache consistency', () => {
  it('invalidates all Compliance, LMS, Qualificacoes and dashboard consumers after a saved change', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const keys = complianceDependentQueryKeys.map((prefix) => [...prefix, 'tenant6', 101]);
    for (const key of keys) client.setQueryData(key, { existing: true });
    client.setQueryData(['unrelated', 'settings'], { existing: true });

    await invalidateComplianceDependents(client);

    for (const key of keys) {
      expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    }
    expect(client.getQueryState(['unrelated', 'settings'])?.isInvalidated).toBe(false);
    client.clear();
  });

  it('revalidates LMS enrollments and real tenant-prefixed employee/dashboard queries without affecting other tenants', async () => {
    const client = new QueryClient();
    const keys = [
      ['lms', 'minhas-ead'],
      ['lms', 'matriculas-curso', 78],
      ['lms', 'matricula-detalhe', 521],
      ['lms-stats'],
      ['historico-qualificacoes', { funcionarioId: 101 }],
      ['training-compliance', 'reconciliation', null, null],
      tenantQueryKey(6, 'funcionarios', 'list', { setor: 'OPS' }),
      tenantQueryKey(6, 'funcionarios', 'detail', 101),
      tenantQueryKey(6, 'dashboard', 'metrics'),
      tenantQueryKey(6, 'dashboard', 'compliance'),
      tenantQueryKey(6, 'qualificacoes', 'detail', 50),
      tenantQueryKey(6, 'historico', 101),
    ];
    for (const key of keys) client.setQueryData(key, { cached: true });
    const otherTenant = tenantQueryKey(7, 'dashboard', 'metrics');
    client.setQueryData(otherTenant, { cached: true });

    await invalidateComplianceDependents(client, 6);

    for (const key of keys) expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    expect(client.getQueryState(otherTenant)?.isInvalidated).toBe(false);
    client.clear();
  });
});

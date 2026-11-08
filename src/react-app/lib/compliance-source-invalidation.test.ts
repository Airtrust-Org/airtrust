import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { tenantQueryKey } from './query-client';
import {
  invalidateEmployeeComplianceProjections,
  invalidateTrainingEvidenceProjections,
} from './compliance-source-invalidation';

describe('Compliance projections refreshed by their source modules', () => {
  it('revalidates the applicable training matrix after employee status/role changes without touching another tenant', async () => {
    const client = new QueryClient();
    const keys = [
      ['training-compliance', 'people', 'OPS'],
      ['treinamentos-planejados', 6],
      ['lms', 'matriculas-curso', 78],
      tenantQueryKey(6, 'funcionarios', 'detail', 101),
      tenantQueryKey(6, 'dashboard', 'compliance'),
    ];
    for (const key of keys) client.setQueryData(key, { old: true });
    const otherTenant = tenantQueryKey(7, 'dashboard', 'compliance');
    const otherModule = ['unrelated', 'settings'];
    client.setQueryData(otherTenant, { old: true });
    client.setQueryData(otherModule, { old: true });

    await invalidateEmployeeComplianceProjections(client, 6);

    for (const key of keys) expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    expect(client.getQueryState(otherTenant)?.isInvalidated).toBe(false);
    expect(client.getQueryState(otherModule)?.isInvalidated).toBe(false);
    client.clear();
  });

  it('revalidates historical qualifications, LMS certificates, Compliance and indicators when terminal evidence changes', async () => {
    const client = new QueryClient();
    const keys = [
      ['training-compliance', 'summary'],
      ['qualificacoes', 'detail', '23'],
      ['qualification-types', 'list'],
      ['historico-qualificacoes', { funcionarioId: 101 }],
      ['lms-stats'],
      ['lms', 'matricula-detalhe', 22],
      tenantQueryKey(6, 'qualificacoes', 'detail', 50),
      tenantQueryKey(6, 'qualificacoes-historico', 'list'),
      tenantQueryKey(6, 'historico', 101),
      tenantQueryKey(6, 'dashboard', 'metrics'),
    ];
    for (const key of keys) client.setQueryData(key, { stale: true });
    const unrelatedTenant = tenantQueryKey(7, 'qualificacoes', 'detail', 50);
    client.setQueryData(unrelatedTenant, { stale: true });

    await invalidateTrainingEvidenceProjections(client, 6);

    for (const key of keys) expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    expect(client.getQueryState(unrelatedTenant)?.isInvalidated).toBe(false);
    client.clear();
  });
});

import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { complianceDependentQueryKeys, invalidateComplianceDependents } from './complianceCacheInvalidation';

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

  it('revalidates filtered and unfiltered LMS enrollment keys, not just the Compliance matrix', async () => {
    const client = new QueryClient();
    const keys = [
      ['lms', 'minhas-ead'],
      ['lms', 'matriculas-curso', 78],
      ['lms', 'matricula-detalhe', 521],
      ['lms-stats'],
      ['historico-qualificacoes', { funcionarioId: 101 }],
      ['training-compliance', 'reconciliation', null, null],
    ];
    for (const key of keys) client.setQueryData(key, { cached: true });

    await invalidateComplianceDependents(client);

    for (const key of keys) expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    client.clear();
  });
});

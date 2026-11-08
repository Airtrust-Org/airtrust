import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { tenantQueryKey } from '@/react-app/lib/query-client';
import { useAtualizarFuncionario } from '../useFuncionarios';

const request = vi.hoisted(() => vi.fn());
vi.mock('@/react-app/lib/api-contract', () => ({ apiJson: request }));
vi.mock('@/react-app/hooks/useAuth', () => ({
  useAuth: () => ({ empresaAtualId: 6 }),
}));

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const keys = [
    ['training-compliance', 'people'],
    ['treinamentos-planejados'],
    tenantQueryKey(6, 'dashboard', 'compliance'),
    tenantQueryKey(6, 'funcionarios', 'list'),
  ];
  for (const key of keys) client.setQueryData(key, { stale: true });
  const unrelatedTenant = tenantQueryKey(7, 'dashboard', 'compliance');
  client.setQueryData(unrelatedTenant, { stale: true });
  const wrapper = ({ children }: { children: ReactNode }) =>
    <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, keys, unrelatedTenant, wrapper };
}

describe('Funcionario updates propagate to Compliance', () => {
  beforeEach(() => { request.mockReset(); });

  it('refreshes obligations and dashboard after a successful job/status update', async () => {
    request.mockResolvedValueOnce({ id: 101, status: 'INATIVO' });
    const { client, keys, unrelatedTenant, wrapper } = setup();
    const { result } = renderHook(() => useAtualizarFuncionario(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: 101, data: { status: 'INATIVO' } });
    });

    expect(request).toHaveBeenCalledWith(
      '/api/funcionarios/101',
      expect.objectContaining({ method: 'PUT' }),
    );
    for (const key of keys) expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    expect(client.getQueryState(unrelatedTenant)?.isInvalidated).toBe(false);
    client.clear();
  });

  it('does not show recalculated Compliance when the employee edit failed', async () => {
    request.mockRejectedValueOnce(new Error('Sem permissão para alterar'));
    const { client, keys, wrapper } = setup();
    const { result } = renderHook(() => useAtualizarFuncionario(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync({ id: 101, data: { status: 'INATIVO' } }))
        .rejects.toThrow('Sem permissão');
    });

    for (const key of keys) expect(client.getQueryState(key)?.isInvalidated).toBe(false);
    client.clear();
  });
});

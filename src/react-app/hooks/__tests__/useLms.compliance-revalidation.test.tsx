import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFinalizarMatricula, useUpdateMatriculaStatus } from '../useLms';

const request = vi.hoisted(() => vi.fn());
vi.mock('@/react-app/config/api', () => ({
  API_BASE_URL: '/api',
  fetchWithAuth: request,
  getAccessToken: () => null,
}));

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const keys = [
    ['training-compliance', 'summary'],
    ['historico-qualificacoes', { funcionarioId: 101 }],
    ['qualificacoes', 'list'],
    ['lms-stats'],
  ];
  for (const key of keys) client.setQueryData(key, { old: true });
  const wrapper = ({ children }: { children: ReactNode }) =>
    <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, keys, wrapper };
}

describe('LMS terminal mutations refresh Compliance evidence projections', () => {
  beforeEach(() => {
    request.mockReset();
  });

  it('revalidates Compliance and Qualifications after a successful finalization', async () => {
    request.mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({ success: true, data: {
        matricula_id: 99, novo_status: 'CONCLUIDO', progresso_pct: 100,
        qualificacao_gerada: { qualificacao_historico_id: 500 },
      } }),
    });
    const { client, keys, wrapper } = setup();
    const { result } = renderHook(() => useFinalizarMatricula(), { wrapper });
    await act(async () => { await result.current.mutateAsync(99); });

    expect(request).toHaveBeenCalledWith(
      '/api/lms/matriculas/99/finalizar',
      expect.objectContaining({ method: 'POST' }),
    );
    for (const key of keys) expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    client.clear();
  });

  it('does not advertise new evidence when a finalization request was rejected', async () => {
    request.mockResolvedValueOnce({
      ok: false, status: 409,
      json: async () => ({ success: false, error: 'Conclusão não comprovada' }),
    });
    const { client, keys, wrapper } = setup();
    const { result } = renderHook(() => useFinalizarMatricula(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync(99)).rejects.toThrow('Conclusão não comprovada');
    });

    for (const key of keys) expect(client.getQueryState(key)?.isInvalidated).toBe(false);
    client.clear();
  });

  it('revalidates affected projections after an administrator changes enrollment status', async () => {
    request.mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({ success: true, data: {
        id: 99, curso_id: 78, status: 'CANCELADO',
      } }),
    });
    const { client, keys, wrapper } = setup();
    const { result } = renderHook(() => useUpdateMatriculaStatus(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ matriculaId: 99, status: 'CANCELADO' });
    });

    for (const key of keys) expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    client.clear();
  });
});

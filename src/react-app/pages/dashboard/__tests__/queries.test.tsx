import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useSimuladoresAlertasQuery } from '../queries';

const { fetchWithAuthMock, useTenantQueryKeyMock } = vi.hoisted(() => ({
  fetchWithAuthMock: vi.fn(),
  useTenantQueryKeyMock: vi.fn(),
}));

vi.mock('@/react-app/config/api', () => ({
  API_BASE_URL: 'https://api.airtrust.online/api',
  fetchWithAuth: fetchWithAuthMock,
}));

vi.mock('@/react-app/lib/useTenantQueryKey', () => ({
  useTenantQueryKey: () => useTenantQueryKeyMock(),
}));

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('dashboard queries', () => {
  beforeEach(() => {
    fetchWithAuthMock.mockReset();
    useTenantQueryKeyMock.mockReset();
    fetchWithAuthMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          fichas_pendentes_avaliacao: 2,
          fichas_aguardando_assinatura_aluno: 1,
          fichas_aguardando_assinatura_instrutor: 0,
          fichas_aguardando_assinatura: 1,
          sessoes_proximas_sem_ficha_completa: 3,
          edicoes_pendentes: 1,
          janela_sessoes_proximas_horas: 24,
        },
      }),
    });
  });

  it('consulta /dashboard/simuladores-alertas e usa cache segmentado por tenant', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    useTenantQueryKeyMock.mockReturnValue({ empresaId: 7 });

    const { rerender } = renderHook(() => useSimuladoresAlertasQuery(true), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(fetchWithAuthMock).toHaveBeenCalledTimes(1);
    });
    expect(String(fetchWithAuthMock.mock.calls[0][0])).toContain('/dashboard/simuladores-alertas');
    expect(
      queryClient
        .getQueryCache()
        .findAll()
        .some(
          (query) =>
            JSON.stringify(query.queryKey) ===
            JSON.stringify(['tenant', 7, 'dashboard', 'simuladores-alertas']),
        ),
    ).toBe(true);

    useTenantQueryKeyMock.mockReturnValue({ empresaId: 9 });

    rerender();

    await waitFor(() => {
      expect(fetchWithAuthMock).toHaveBeenCalledTimes(2);
    });
    expect(
      queryClient
        .getQueryCache()
        .findAll()
        .some(
          (query) =>
            JSON.stringify(query.queryKey) ===
            JSON.stringify(['tenant', 9, 'dashboard', 'simuladores-alertas']),
        ),
    ).toBe(true);
  });

  it('nao dispara a consulta quando o hook esta desabilitado', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    useTenantQueryKeyMock.mockReturnValue({ empresaId: 7 });

    renderHook(() => useSimuladoresAlertasQuery(false), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(fetchWithAuthMock).not.toHaveBeenCalled();
    });
  });
});

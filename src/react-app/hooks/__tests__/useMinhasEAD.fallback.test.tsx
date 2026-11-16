import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchWithAuthMock = vi.hoisted(() => vi.fn());
vi.mock('@/react-app/config/api', () => ({
  API_BASE_URL: '/api',
  fetchWithAuth: fetchWithAuthMock,
  getAccessToken: () => null,
}));

import { useMinhasEAD } from '@/react-app/hooks/useLms';

const ok = (data: unknown, total?: number) =>
  new Response(JSON.stringify({
    success: true,
    data,
    ...(total === undefined ? {} : { pagination: { page: 1, limit: 200, total } }),
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });

const error = (status: number) =>
  new Response(JSON.stringify({ success: false, error: 'Serviço indisponível' }), {
    status, headers: { 'Content-Type': 'application/json' },
  });

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 1 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => { fetchWithAuthMock.mockReset(); });

describe('useMinhasEAD: recuperação de leitura sem fabricar evidências', () => {
  it('usa lista paginada sob HTTP 503 e marca visualização simplificada', async () => {
    fetchWithAuthMock.mockImplementation(async (route: string) => {
      if (route.includes('/matriculas/minhas-ead')) return error(503);
      if (route.includes('/matriculas/minhas?')) return ok([{
        id: 10, curso_id: 15, funcionario_id: 5, status: 'EM_ANDAMENTO',
        progresso_pct: 38, titulo: 'Curso real',
      }], 1);
      throw new Error('Rota não prevista');
    });
    const { result } = renderHook(() => useMinhasEAD(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0]?.consulta_simplificada).toBe(true);
    expect(result.current.data?.[0]).toMatchObject({
      id: 10, titulo: 'Curso real', progresso_pct: 38,
      data_vencimento_qualificacao: null, tem_certificado: 0,
    });
    expect(result.current.data?.[0].certificate_state).toBeUndefined();
    expect(fetchWithAuthMock).toHaveBeenCalledTimes(2);
  });

  it('não faz fallback se o backend negar vínculo ou acesso', async () => {
    fetchWithAuthMock.mockImplementation(async () => error(409));
    const { result } = renderHook(() => useMinhasEAD(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(fetchWithAuthMock.mock.calls.every(([url]) =>
      String(url).includes('/matriculas/minhas-ead'))).toBe(true);
  });
});

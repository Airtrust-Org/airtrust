import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { authFetch } = vi.hoisted(() => ({ authFetch: vi.fn() }));
vi.mock('@/react-app/config/api', () => ({
  API_BASE_URL: '/api', fetchWithAuth: authFetch, getAccessToken: () => 'test-token',
}));
import { useMatriculaDetalhe } from '../useLms';

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return {client, wrapper};
}

describe('LMS enrollment detail player load', () => {
  afterEach(() => { vi.useRealTimers(); authFetch.mockReset(); });

  it('terminates a stalled token refresh with an explicit error instead of an infinite spinner', async () => {
    vi.useFakeTimers();
    authFetch.mockImplementation(() => new Promise(() => {}));
    const {client, wrapper} = setup();
    const { result, unmount } = renderHook(() => useMatriculaDetalhe(2058), {wrapper});
    await act(async () => { await vi.advanceTimersByTimeAsync(43_000); });
    expect(authFetch).toHaveBeenCalledTimes(2);
    expect(result.current.isError).toBe(true);
    expect(result.current.error?.message).toMatch(/Tempo limite ao abrir a matrícula/);
    unmount();client.clear();
  });

  it('loads real saved enrollment state and does not change its status or progress', async () => {
    const row = {id:2058,curso_id:68,empresa_id:6,
      status:'EM_ANDAMENTO',progresso_pct:100,ultimo_slide:59};
    authFetch.mockResolvedValue({
      ok:true, json:async()=>({success:true,data:row}),
    });
    const {client,wrapper}=setup();
    const {result,unmount}=renderHook(()=>useMatriculaDetalhe(2058),{wrapper});
    await waitFor(()=>expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toMatchObject(row);
    expect(authFetch).toHaveBeenCalledWith(
      '/api/lms/matriculas/2058',expect.objectContaining({signal:expect.any(AbortSignal)}));
    unmount();client.clear();
  });

  it('keeps a previously loaded enrollment in cache when a background refresh fails', async () => {
    const row = {id:2058,curso_id:68,empresa_id:6,
      status:'EM_ANDAMENTO',progresso_pct:100,ultimo_slide:59};
    authFetch.mockResolvedValueOnce({ok:true,json:async()=>({success:true,data:row})});
    authFetch.mockResolvedValue({ok:false,status:503,json:async()=>({
      success:false,error:'A consulta temporariamente falhou',
    })});
    const {client,wrapper}=setup();
    const {result,unmount}=renderHook(()=>useMatriculaDetalhe(2058),{wrapper});
    await waitFor(()=>expect(result.current.isSuccess).toBe(true));
    await act(async()=>{await result.current.refetch();});
    expect(result.current.data).toMatchObject(row);
    await waitFor(()=>expect(result.current.error?.message).toMatch(/temporariamente falhou/), {timeout:3500});
    unmount();client.clear();
  });

  it('surfaces server 409/403 rather than labelling a real enrollment absent', async () => {
    authFetch.mockResolvedValue({ok:false,status:409,
      json:async()=>({success:false,error:'Sessão SCORM temporariamente indisponível'})});
    const {client,wrapper}=setup();
    const {result,unmount}=renderHook(()=>useMatriculaDetalhe(2058),{wrapper});
    await waitFor(()=>expect(result.current.isError).toBe(true), {timeout: 3500});
    expect(result.current.error?.message).toMatch(/Sessão SCORM/);
    expect(result.current.data).toBeUndefined();
    unmount();client.clear();
  });
});

import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useGuiasInstrutorPermissions } from '../useGuiasInstrutorPermissions';

vi.mock('@/react-app/lib/useTenantQueryKey', () => ({
  useTenantQueryKey: () => ({ empresaId: 1, tenantKey: (...args: unknown[]) => args }),
}));

const mockFetchWithAuth = vi.fn();
vi.mock('@/react-app/config/api', () => ({
  API_BASE_URL: 'https://api.airtrust.online/api',
  fetchWithAuth: (...args: unknown[]) => mockFetchWithAuth(...args),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useGuiasInstrutorPermissions', () => {
  it('isLoading=true e todas as flags false antes da resposta chegar (nunca "restrito" prematuro)', () => {
    mockFetchWithAuth.mockReturnValue(new Promise(() => {})); // nunca resolve
    const { result } = renderHook(() => useGuiasInstrutorPermissions(), { wrapper });
    expect(result.current.isLoading).toBe(true);
    expect(result.current.podeVisualizar).toBe(false);
    expect(result.current.podeGerenciar).toBe(false);
  });

  it('reflete platform admin retornado pelo endpoint real do backend', async () => {
    mockFetchWithAuth.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: { podeVisualizar: true, podeGerenciar: true, isPlatformAdmin: true },
      }),
    });
    const { result } = renderHook(() => useGuiasInstrutorPermissions(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current).toMatchObject({
      podeVisualizar: true,
      podeGerenciar: true,
      isPlatformAdmin: true,
    });
  });

  it('reflete usuário comum sem gerenciar', async () => {
    mockFetchWithAuth.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: { podeVisualizar: true, podeGerenciar: false, isPlatformAdmin: false },
      }),
    });
    const { result } = renderHook(() => useGuiasInstrutorPermissions(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current).toMatchObject({
      podeVisualizar: true,
      podeGerenciar: false,
      isPlatformAdmin: false,
    });
  });
});

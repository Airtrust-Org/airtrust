import { beforeEach, describe, expect, it, vi } from 'vitest';

const toastError = vi.fn();
vi.mock('sonner', () => ({ toast: { error: toastError } }));

function makeJwt(tenantId: number): string {
  return `header.${btoa(JSON.stringify({ empresa_id: tenantId, exp: 4_102_444_800 }))}.signature`;
}

describe('React Query tenant keys and mutation errors', () => {
  beforeEach(() => {
    vi.resetModules();
    toastError.mockReset();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('never falls back to tenant 0 when a selected tenant exists', async () => {
    sessionStorage.setItem('airtrust_token', makeJwt(42));
    const { tenantQueryKey } = await import('../query-client');

    expect(tenantQueryKey(undefined, 'funcionarios')).toEqual(['tenant', 42, 'funcionarios']);
    expect(tenantQueryKey(null, 'agendamentos')).not.toContain(0);
  });

  it('reports a mutation error globally when no local onError exists', async () => {
    const { queryClient } = await import('../query-client');
    const mutation = queryClient.getMutationCache().build(queryClient, {
      mutationFn: async () => {
        throw new TypeError('network down');
      },
    });

    await expect(mutation.execute(undefined)).rejects.toThrow('network down');
    expect(toastError).toHaveBeenCalledWith(
      'Falha de rede. Verifique sua conexão e tente novamente.',
    );
  });

  it('allows a local mutation to suppress the global notification', async () => {
    const { queryClient } = await import('../query-client');
    const mutation = queryClient.getMutationCache().build(queryClient, {
      mutationFn: async () => {
        throw new Error('handled locally');
      },
      meta: { suppressGlobalError: true },
      onError: vi.fn(),
    });

    await expect(mutation.execute(undefined)).rejects.toThrow('handled locally');
    expect(toastError).not.toHaveBeenCalled();
  });
});

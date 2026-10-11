/* @vitest-environment jsdom */
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const logout = vi.fn();
  return {
    appFetch: vi.fn(),
    logout,
    auth: { token: 'test-token', empresaAtualId: 6, logout },
  };
});

vi.mock('@/react-app/hooks/useAuth', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/react-app/lib/app-fetch', () => ({ appFetch: mocks.appFetch }));
vi.mock('@/react-app/lib/apiFetch', () => ({ apiFetch: mocks.appFetch }));
vi.mock('@/react-app/lib/tenant-data-layer', () => ({
  assertTenantDataScope: vi.fn(),
  captureTenantDataScope: () => ({ tenantId: 6 }),
  getCurrentTenantId: () => 6,
  registerTenantCacheReset: vi.fn(),
}));
vi.mock('../../utils/request-control', () => ({
  requestController: { recordRequest: vi.fn() },
}));
vi.mock('../../utils/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}));

import { useApi } from '../useApi';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}

function response(status: number, data: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    statusText: '',
    json: async () => ({ success: true, data }),
  } as Response;
}

describe('useApi responses arriving out of order', () => {
  beforeEach(() => {
    mocks.appFetch.mockReset();
    mocks.logout.mockReset();
  });

  it('keeps the newer filter result when an older HTTP response resolves last', async () => {
    const oldRequest = deferred<Response>();
    const newRequest = deferred<Response>();
    mocks.appFetch.mockReturnValueOnce(oldRequest.promise).mockReturnValueOnce(newRequest.promise);

    const { result, rerender } = renderHook(
      ({ page }) => useApi<{ page: number }>(`/api/qualificacoes/historico?page=${page}`, { retry: 0 }),
      { initialProps: { page: 1 } },
    );
    await waitFor(() => expect(mocks.appFetch).toHaveBeenCalledTimes(1));
    rerender({ page: 2 });
    await waitFor(() => expect(mocks.appFetch).toHaveBeenCalledTimes(2));

    await act(async () => { newRequest.resolve(response(200, { page: 2 })); });
    await waitFor(() => expect(result.current.data).toEqual({ page: 2 }));
    await act(async () => { oldRequest.resolve(response(200, { page: 1 })); });

    expect(result.current.data).toEqual({ page: 2 });
    expect(result.current.error).toBeNull();
  });

  it('ignores a stale 401 instead of logging out the current filter session', async () => {
    const oldRequest = deferred<Response>();
    const newRequest = deferred<Response>();
    mocks.appFetch.mockReturnValueOnce(oldRequest.promise).mockReturnValueOnce(newRequest.promise);

    const { result, rerender } = renderHook(
      ({ page }) => useApi<{ page: number }>(`/api/qualificacoes/historico?page=${page}`, { retry: 0 }),
      { initialProps: { page: 1 } },
    );
    await waitFor(() => expect(mocks.appFetch).toHaveBeenCalledTimes(1));
    rerender({ page: 2 });
    await waitFor(() => expect(mocks.appFetch).toHaveBeenCalledTimes(2));
    await act(async () => { newRequest.resolve(response(200, { page: 2 })); });
    await act(async () => { oldRequest.resolve(response(401, null)); });

    expect(result.current.data).toEqual({ page: 2 });
    expect(mocks.logout).not.toHaveBeenCalled();
  });
});

import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { authFetch } = vi.hoisted(() => ({ authFetch: vi.fn() }));

vi.mock('@/react-app/config/api', () => ({
  API_BASE_URL: '/api',
  fetchWithAuth: authFetch,
  getAccessToken: () => 'test-token',
}));

import { useLmsCursos } from '../useLms';

describe('LMS catalog request deadlines', () => {
  afterEach(() => {
    vi.useRealTimers();
    authFetch.mockReset();
  });

  it('reports an error after the deadline even while token refresh remains unresolved', async () => {
    vi.useFakeTimers();
    // Model the authenticated client stuck waiting on a refresh request.
    authFetch.mockImplementation(() => new Promise(() => {}));
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result, unmount } = renderHook(() => useLmsCursos({ limit: 5 }), { wrapper });

    // The catalog hook allows one retry after the initial request times out.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(43_000);
    });

    expect(authFetch).toHaveBeenCalledTimes(2);
    expect(result.current.isError).toBe(true);
    expect(result.current.error?.message).toMatch(/Tempo limite ao consultar os cursos/);
    unmount();
    client.clear();
  });
});

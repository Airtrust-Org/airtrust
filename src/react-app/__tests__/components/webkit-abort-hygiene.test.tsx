import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/react-app/lib/tenant-data-layer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/react-app/lib/tenant-data-layer')>();
  return {
    ...actual,
    getCurrentTenantId: vi.fn(() => 7),
  };
});

vi.mock('@/react-app/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 12 },
    empresaAtualId: 7,
    isAuthenticated: true,
  }),
}));

import { clearTokens, setTokens } from '@/react-app/config/api';
import { VersionBadge } from '@/react-app/components/VersionBadge';
import { useOperationalAccess } from '@/react-app/hooks/useOperationalAccess';
import { useSystemSettings } from '@/react-app/hooks/useSystemSettings';
import { queryClient } from '@/react-app/lib/query-client';
import { apiClient } from '@/react-app/services/apiClient';

afterEach(() => {
  cleanup();
  clearTokens();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

function SystemSettingsProbe() {
  useSystemSettings();
  return null;
}

function OperationalAccessProbe() {
  useOperationalAccess();
  return null;
}

describe('WebKit navigation abort hygiene', () => {
  it('aborts in-flight system settings requests on pagehide and unmount', async () => {
    const futureExp = Math.floor(Date.now() / 1000) + 3600;
    const payloadB64 = btoa(JSON.stringify({ sub: '12', empresa_id: 7, exp: futureExp }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    setTokens(`eyJhbGciOiJIUzI1NiJ9.${payloadB64}.sig`);
    const capturedSignals: AbortSignal[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.signal) capturedSignals.push(init.signal);
        return new Promise<Response>(() => undefined);
      }),
    );

    const view = render(<SystemSettingsProbe />);
    await waitFor(() => expect(capturedSignals).toHaveLength(1));
    expect(capturedSignals[0].aborted).toBe(false);

    window.dispatchEvent(new Event('pagehide'));
    expect(capturedSignals[0].aborted).toBe(true);

    view.unmount();

    // Unmount also aborts a fresh in-flight request
    const view2 = render(<SystemSettingsProbe />);
    await waitFor(() => expect(capturedSignals).toHaveLength(2));
    expect(capturedSignals[1].aborted).toBe(false);
    view2.unmount();
    expect(capturedSignals[1].aborted).toBe(true);
  });

  it('forwards AbortSignal in VersionBadge and skips retrying HTTP 404 responses', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: false }), { status: 404 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = new QueryClient({
      defaultOptions: { queries: { retryDelay: 10 } },
    });

    render(
      <QueryClientProvider client={client}>
        <VersionBadge />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(init?.signal).toBeInstanceOf(AbortSignal);

    await new Promise((r) => setTimeout(r, 40));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    client.clear();
  });

  it('forwards AbortSignal in useOperationalAccess and cancels queryClient queries on pagehide', async () => {
    const getSpy = vi.spyOn(apiClient, 'get').mockImplementation(
      async () => ({ success: true, data: { enabled: false, domains: [], setor_ids: [], actions: {} } }),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={client}>
        <OperationalAccessProbe />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(getSpy).toHaveBeenCalledTimes(1));
    const options = getSpy.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    client.clear();

    const cancelSpy = vi.spyOn(queryClient, 'cancelQueries').mockResolvedValue(undefined);
    window.dispatchEvent(new Event('pagehide'));
    expect(cancelSpy).toHaveBeenCalledTimes(1);
  });

  it('resumes active queries cancelled on pagehide when restored via persisted pageshow', async () => {
    let calls = 0;
    function RestorableQueryProbe() {
      const { data, fetchStatus } = useQuery({
        queryKey: ['webkit-bfcache-probe'],
        queryFn: ({ signal }) => {
          calls += 1;
          if (calls === 1) {
            return new Promise<{ status: string }>((_resolve, reject) => {
              signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), {
                once: true,
              });
            });
          }
          return Promise.resolve({ status: 'restored-ok' });
        },
        retry: false,
      });
      return <div data-testid="bfcache-probe">{data ? data.status : `loading:${fetchStatus}`}</div>;
    }

    const view = render(
      <QueryClientProvider client={queryClient}>
        <RestorableQueryProbe />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(calls).toBe(1));
    await waitFor(() => expect(view.getByTestId('bfcache-probe').textContent).toBe('loading:fetching'));

    window.dispatchEvent(new Event('pagehide'));
    await waitFor(() => expect(view.getByTestId('bfcache-probe').textContent).toBe('loading:idle'));

    const pageShowEvent = Object.assign(new Event('pageshow'), { persisted: true });
    window.dispatchEvent(pageShowEvent);

    await waitFor(() => expect(view.getByTestId('bfcache-probe').textContent).toBe('restored-ok'));
    expect(calls).toBe(2);
    view.unmount();
    queryClient.removeQueries({ queryKey: ['webkit-bfcache-probe'] });
  });
});

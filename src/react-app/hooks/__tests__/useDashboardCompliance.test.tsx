import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearTokens, setTokens } from '@/react-app/config/api';
import { resetTenantDataLayer } from '@/react-app/lib/tenant-data-layer';
import { useDashboardCompliance } from '../useDashboardCompliance';

function makeToken(empresaId: number): string {
  const payload = btoa(JSON.stringify({ sub: '1', empresa_id: empresaId, exp: Math.floor(Date.now() / 1000) + 3600 }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `eyJhbGciOiJIUzI1NiJ9.${payload}.sig`;
}

describe('useDashboardCompliance', () => {
  afterEach(() => {
    clearTokens();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('does not loop or refetch after logout clears tokens', async () => {
    setTokens(makeToken(7));
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { score: 92, total: 10, conformes: 9 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { result, unmount } = renderHook(() => useDashboardCompliance(60_000));
    await waitFor(() => expect(result.current.compliance).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Clear session (triggers airtrust:token-changed -> logout reset)
    await act(async () => {
      clearTokens();
      resetTenantDataLayer({ reason: 'logout', tenantId: null });
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(result.current.compliance).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    unmount();
  });
});

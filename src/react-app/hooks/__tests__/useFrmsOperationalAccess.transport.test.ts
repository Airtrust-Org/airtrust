import { describe, expect, it, vi } from 'vitest';

vi.mock('@/react-app/config/api', () => ({
  API_BASE_URL: 'https://staging-api.test/api',
  fetchWithAuth: vi.fn(),
}));

import { fetchWithAuth } from '@/react-app/config/api';
import { requestFrmsOperationalAccess } from '../useFrmsOperationalAccess';

const fetchMock = vi.mocked(fetchWithAuth);

describe('FRMS operational access canonical authenticated transport', () => {
  it('reads only the authenticated team scope without custom bypass headers', async () => {
    const scope = { enabled: true, domains: ['FRMS'], setor_ids: [1] };
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      success: true, data: scope,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const controller = new AbortController();

    await expect(requestFrmsOperationalAccess(controller.signal)).resolves.toEqual(scope);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://staging-api.test/api/me/operational-access',
      { method: 'GET', cache: 'no-store', signal: controller.signal },
    );
    expect(Object.keys(fetchMock.mock.lastCall?.[1]?.headers ?? {})).toHaveLength(0);
  });

  it('never treats a 401 or missing authorization scope as access', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{"success":false}', { status: 401 }));
    await expect(requestFrmsOperationalAccess(new AbortController().signal))
      .rejects.toThrow('FRMS_ACCESS_HTTP_UNAVAILABLE');

    fetchMock.mockResolvedValueOnce(new Response('{"success":true}', { status: 200 }));
    await expect(requestFrmsOperationalAccess(new AbortController().signal))
      .rejects.toThrow('FRMS_ACCESS_RESPONSE_INVALID');
  });
});

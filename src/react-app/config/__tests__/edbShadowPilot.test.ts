import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchWithAuth } from '@/react-app/config/api';
import {
  isEdbShadowPilotEnabled,
  resetEdbShadowPilotCapabilityForTesting,
} from '@/react-app/config/edbShadowPilot';

vi.mock('@/react-app/config/api', () => ({ fetchWithAuth: vi.fn() }));

function response(body: unknown, ok = true) {
  return { ok, json: vi.fn().mockResolvedValue(body) } as unknown as Response;
}

describe('eDB shadow pilot capability client', () => {
  afterEach(() => {
    vi.clearAllMocks();
    resetEdbShadowPilotCapabilityForTesting();
  });

  it('returns true only for an explicit enabled capability', async () => {
    vi.mocked(fetchWithAuth).mockResolvedValueOnce(
      response({ success: true, data: { enabled: true } }),
    );

    await expect(isEdbShadowPilotEnabled()).resolves.toBe(true);
    expect(fetchWithAuth).toHaveBeenCalledWith('/api/edb/capability', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-cache',
    });
  });

  it('fails closed for disabled, malformed or unavailable responses', async () => {
    vi.mocked(fetchWithAuth)
      .mockResolvedValueOnce(response({ success: true, data: { enabled: false } }))
      .mockResolvedValueOnce(response({ success: true, data: {} }))
      .mockRejectedValueOnce(new Error('unavailable'));

    await expect(isEdbShadowPilotEnabled(true)).resolves.toBe(false);
    await expect(isEdbShadowPilotEnabled(true)).resolves.toBe(false);
    await expect(isEdbShadowPilotEnabled(true)).resolves.toBe(false);
  });

  it('uses a short in-memory cache', async () => {
    vi.mocked(fetchWithAuth).mockResolvedValueOnce(
      response({ success: true, data: { enabled: true } }),
    );

    await expect(isEdbShadowPilotEnabled()).resolves.toBe(true);
    await expect(isEdbShadowPilotEnabled()).resolves.toBe(true);
    expect(fetchWithAuth).toHaveBeenCalledTimes(1);
  });
});

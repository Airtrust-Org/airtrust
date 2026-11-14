import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearLegacyAirtrustCaches } from '@/react-app/components/ErrorBoundary';

afterEach(() => vi.unstubAllGlobals());

describe('UX-01 manual chunk recovery preserves Pilot offline resources', () => {
  it('unregisters only main-app service workers and keeps Pilot cache namespaces', async () => {
    const pilotUnregister = vi.fn();
    const mainUnregister = vi.fn().mockResolvedValue(true);
    const getRegistrations = vi.fn().mockResolvedValue([
      { scope: 'https://airtrust.online/pilot/', unregister: pilotUnregister },
      { scope: 'https://airtrust.online/', unregister: mainUnregister },
    ]);
    vi.stubGlobal('navigator', {
      ...navigator,
      serviceWorker: { getRegistrations },
    });
    const cacheDelete = vi.fn().mockResolvedValue(true);
    vi.stubGlobal('caches', {
      keys: vi.fn().mockResolvedValue(['airtrust-app-v9', 'airtrust-pilot-offline-v3', 'other-cache']),
      delete: cacheDelete,
    });
    await clearLegacyAirtrustCaches();
    expect(getRegistrations).toHaveBeenCalledOnce();
    expect(mainUnregister).toHaveBeenCalledOnce();
    expect(pilotUnregister).not.toHaveBeenCalled();
    expect(cacheDelete).toHaveBeenCalledExactlyOnceWith('airtrust-app-v9');
  });

  it('does not fail recovery when the browser lacks service worker and cache APIs', async () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('caches', undefined);
    await expect(clearLegacyAirtrustCaches()).resolves.toBeUndefined();
  });
});

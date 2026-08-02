import { fetchWithAuth } from '@/react-app/config/api';

let cachedEnabled: boolean | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 15_000;

export async function isEdbShadowPilotEnabled(forceRefresh = false): Promise<boolean> {
  const now = Date.now();
  if (!forceRefresh && cachedEnabled !== null && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedEnabled;
  }

  try {
    const response = await fetchWithAuth('/api/edb/capability', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-cache',
    });
    const payload: unknown = await response.json().catch(() => null);
    cachedEnabled =
      response.ok &&
      typeof payload === 'object' &&
      payload !== null &&
      'data' in payload &&
      typeof payload.data === 'object' &&
      payload.data !== null &&
      'enabled' in payload.data &&
      payload.data.enabled === true;
  } catch {
    cachedEnabled = false;
  }

  cacheTimestamp = now;
  return cachedEnabled;
}

export function resetEdbShadowPilotCapabilityForTesting(): void {
  cachedEnabled = null;
  cacheTimestamp = 0;
}

import { appFetch } from '@/react-app/lib/app-fetch';
import { LruTtlCache } from '@/react-app/lib/lru-ttl-cache';
import { getCurrentTenantId, registerTenantCacheReset } from '@/react-app/lib/tenant-data-layer';

class APICache {
  private readonly cache = new LruTtlCache<string, unknown>(100, 5 * 60 * 1000);

  get<T>(key: string): T | null {
    return (this.cache.get(key) as T | undefined) ?? null;
  }

  set<T>(key: string, data: T, ttlMs: number): void {
    this.cache.set(key, data, ttlMs);
  }

  invalidate(key: string): void {
    this.cache.delete(key);
  }

  invalidatePattern(pattern: RegExp): void {
    this.cache.deleteMatching((key) => pattern.test(key));
  }

  clear(): void {
    this.cache.clear();
  }

  stats() {
    return {
      size: this.cache.size,
      maxSize: 100,
      entries: [...this.cache.keys()],
    };
  }
}

export const apiCache = new APICache();
registerTenantCacheReset('api-cache', () => apiCache.clear());

export async function cachedFetch<T>(
  url: string,
  ttlMs: number = 5 * 60 * 1000,
  options?: RequestInit,
): Promise<T> {
  const cacheKey = `${getCurrentTenantId() ?? 'public'}:${url}:${JSON.stringify(options || {})}`;
  const cached = apiCache.get<T>(cacheKey);
  if (cached !== null) return cached;

  const response = await appFetch(url, options);
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

  const data = (await response.json()) as T;
  apiCache.set(cacheKey, data, ttlMs);
  return data;
}

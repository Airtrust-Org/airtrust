/**
 * Cache de API em memória para reduzir requisições ao Cloudflare Workers
 * Implementa cache com TTL para endpoints críticos
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

class APICache {
  private cache = new Map<string, CacheEntry<any>>();
  private readonly MAX_CACHE_SIZE = 100;

  /**
   * Obter dado do cache se ainda for válido
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      console.log(`[CACHE MISS] ${key}`);
      return null;
    }

    const age = Date.now() - entry.timestamp;
    if (age > entry.ttl) {
      console.log(`[CACHE EXPIRED] ${key} (idade: ${age}ms)`);
      this.cache.delete(key);
      return null;
    }

    console.log(`[CACHE HIT] ${key} (idade: ${age}ms)`);
    return entry.data as T;
  }

  /**
   * Armazenar dado em cache com TTL
   */
  set<T>(key: string, data: T, ttlMs: number): void {
    // Limpar cache se crescer demais
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
      console.log(`[CACHE] Removida entrada mais antiga`);
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttlMs,
    });

    console.log(`[CACHE SET] ${key} com TTL ${ttlMs}ms`);
  }

  /**
   * Limpar cache específico
   */
  invalidate(key: string): void {
    this.cache.delete(key);
    console.log(`[CACHE INVALIDATED] ${key}`);
  }

  /**
   * Limpar cache por padrão (ex: /api/dashboard/*)
   */
  invalidatePattern(pattern: RegExp): void {
    let count = 0;
    for (const [key] of this.cache) {
      if (pattern.test(key)) {
        this.cache.delete(key);
        count++;
      }
    }
    console.log(`[CACHE INVALIDATED] ${count} entradas com padrão ${pattern}`);
  }

  /**
   * Limpar todo o cache
   */
  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    console.log(`[CACHE CLEARED] ${size} entradas removidas`);
  }

  /**
   * Obter estatísticas do cache
   */
  stats() {
    return {
      size: this.cache.size,
      maxSize: this.MAX_CACHE_SIZE,
      entries: Array.from(this.cache.entries()).map(([key, entry]) => ({
        key,
        age: Date.now() - entry.timestamp,
        ttl: entry.ttl,
        isExpired: Date.now() - entry.timestamp > entry.ttl,
      })),
    };
  }
}

// Singleton
export const apiCache = new APICache();

/**
 * Hook para fetch com cache automático
 * Exemplo:
 * const data = await cachedFetch(
 *   `/api/health`,
 *   5 * 60 * 1000  // 5 minutos de cache
 * );
 */
export async function cachedFetch<T>(
  url: string,
  ttlMs: number = 5 * 60 * 1000,
  options?: RequestInit,
): Promise<T> {
  const cacheKey = `${url}:${JSON.stringify(options || {})}`;

  // Verificar cache
  const cached = apiCache.get<T>(cacheKey);
  if (cached) {
    return cached;
  }

  // Fazer request
  const response = await fetch(url, options);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = (await response.json()) as T;

  // Armazenar em cache
  apiCache.set(cacheKey, data, ttlMs);

  return data;
}

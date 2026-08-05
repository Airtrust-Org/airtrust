export interface LruTtlEntry<V> {
  value: V;
  expiresAt: number;
}

/**
 * Small bounded LRU cache with eager TTL pruning.
 * Entries are physically removed on read/write instead of remaining as expired
 * objects until the process is reloaded.
 */
export class LruTtlCache<K, V> {
  private readonly entries = new Map<K, LruTtlEntry<V>>();

  constructor(
    private readonly maxEntries: number,
    private readonly defaultTtlMs: number,
  ) {
    if (!Number.isInteger(maxEntries) || maxEntries <= 0) {
      throw new Error('LruTtlCache maxEntries must be a positive integer');
    }
    if (!Number.isFinite(defaultTtlMs) || defaultTtlMs <= 0) {
      throw new Error('LruTtlCache defaultTtlMs must be positive');
    }
  }

  get(key: K, now = Date.now()): V | undefined {
    this.pruneExpired(now);
    const entry = this.entries.get(key);
    if (!entry) return undefined;

    // Reinsert to make this the most-recently-used entry.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: K, value: V, ttlMs = this.defaultTtlMs, now = Date.now()): void {
    this.pruneExpired(now);
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: now + Math.max(1, ttlMs) });

    while (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value as K | undefined;
      if (oldestKey === undefined) break;
      this.entries.delete(oldestKey);
    }
  }

  delete(key: K): boolean {
    return this.entries.delete(key);
  }

  deleteMatching(predicate: (key: K, value: V) => boolean, now = Date.now()): number {
    this.pruneExpired(now);
    let deleted = 0;
    for (const [key, entry] of this.entries) {
      if (predicate(key, entry.value)) {
        this.entries.delete(key);
        deleted += 1;
      }
    }
    return deleted;
  }

  clear(): void {
    this.entries.clear();
  }

  pruneExpired(now = Date.now()): number {
    let deleted = 0;
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) {
        this.entries.delete(key);
        deleted += 1;
      }
    }
    return deleted;
  }

  get size(): number {
    this.pruneExpired();
    return this.entries.size;
  }

  keys(): IterableIterator<K> {
    this.pruneExpired();
    return this.entries.keys();
  }
}

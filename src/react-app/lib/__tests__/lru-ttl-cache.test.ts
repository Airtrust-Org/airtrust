import { describe, expect, it } from 'vitest';
import { LruTtlCache } from '../lru-ttl-cache';

describe('LruTtlCache', () => {
  it('enforces the configured maximum and evicts the least recently used item', () => {
    const cache = new LruTtlCache<string, number>(2, 1000);
    cache.set('a', 1, 1000, 0);
    cache.set('b', 2, 1000, 0);
    expect(cache.get('a', 1)).toBe(1);
    cache.set('c', 3, 1000, 1);

    expect(cache.get('b', 1)).toBeUndefined();
    expect(cache.get('a', 1)).toBe(1);
    expect(cache.get('c', 1)).toBe(3);
  });

  it('physically removes expired entries', () => {
    const cache = new LruTtlCache<string, number>(2, 10);
    cache.set('expired', 1, 10, 0);
    expect(cache.get('expired', 11)).toBeUndefined();
    expect(cache.size).toBe(0);
  });
});

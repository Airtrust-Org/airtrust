import { beforeEach, describe, expect, it, vi } from 'vitest';

function makeJwt(tenantId: number): string {
  const payload = btoa(JSON.stringify({ empresa_id: tenantId, exp: 4_102_444_800 }));
  return `header.${payload}.signature`;
}

describe('tenant data layer reliability', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('clears hot caches on A → B → A, including identical numeric IDs', async () => {
    sessionStorage.setItem('airtrust_token', makeJwt(1));
    const module = await import('../tenant-data-layer');
    const cache = new Map<string, string>();
    module.registerTenantCacheReset('test-cache', () => cache.clear());

    cache.set('employee:7', 'tenant-A');
    sessionStorage.setItem('airtrust_token', makeJwt(2));
    module.resetTenantDataLayer({ tenantId: 2, reason: 'tenant-switch', broadcast: false });
    expect(cache.size).toBe(0);

    cache.set('employee:7', 'tenant-B');
    sessionStorage.setItem('airtrust_token', makeJwt(1));
    module.resetTenantDataLayer({ tenantId: 1, reason: 'tenant-switch', broadcast: false });
    expect(cache.size).toBe(0);
    expect(module.getCurrentTenantId()).toBe(1);
  });

  it('aborts an in-flight request when the tenant changes', async () => {
    sessionStorage.setItem('airtrust_token', makeJwt(1));
    const module = await import('../tenant-data-layer');
    const scope = module.captureTenantDataScope();

    sessionStorage.setItem('airtrust_token', makeJwt(2));
    module.resetTenantDataLayer({ tenantId: 2, reason: 'tenant-switch', broadcast: false });

    expect(scope.signal.aborted).toBe(true);
    expect(() => module.assertTenantDataScope(scope)).toThrow('empresa ativa mudou');
  });

  it('clears caches when logout is emitted', async () => {
    sessionStorage.setItem('airtrust_token', makeJwt(1));
    const module = await import('../tenant-data-layer');
    const reset = vi.fn();
    module.registerTenantCacheReset('logout-cache', reset);

    window.dispatchEvent(new CustomEvent('airtrust:token-changed', { detail: { token: null } }));

    expect(reset).toHaveBeenCalledTimes(1);
    expect(module.getCurrentTenantId()).toBeNull();
  });

  it('clears caches for a remote tab without adopting that tab tenant', async () => {
    sessionStorage.setItem('airtrust_token', makeJwt(1));
    const module = await import('../tenant-data-layer');
    const reset = vi.fn();
    module.registerTenantCacheReset('cross-tab-cache', reset);

    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'airtrust:data-scope-reset',
        newValue: JSON.stringify({ tenantId: 2, reason: 'tenant-switch', nonce: 'tab-b' }),
      }),
    );

    expect(reset).toHaveBeenCalledTimes(1);
    expect(module.getCurrentTenantId()).toBe(1);
  });
});

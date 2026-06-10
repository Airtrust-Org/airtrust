/**
 * Test: ModalNovaSessao — staled capability cache after operational flag change.
 *
 * Scenario (reproduces 2026-06-09 production activation failure):
 * 1. Capability endpoint initially returns false (flag not yet activated).
 *    The modal opens, fetches capability, selector is hidden.
 * 2. Worker is redeployed with flag=true — browser HTTP cache may still
 *    serve the stale `false` response (Cache-Control: public, max-age=300).
 * 3. Modal reopens → `forceRefresh: true` bypasses both the browser HTTP
 *    cache and the in-memory cache → selector appears.
 *
 * This test verifies the `cache: 'no-cache'` fetch option and the
 * `forceRefresh` parameter correctly invalidate stale state.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// Mock fetch to control /api/capabilities responses
let capabilityResponse: boolean = false;

beforeEach(() => {
  capabilityResponse = false;
  vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = typeof input === 'string' ? input : input instanceof Request ? input.url : '';
    if (url.includes('/capabilities')) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            success: true,
            data: { simulador_shared_sessions: capabilityResponse },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    }
    // Default fallback for any other fetch
    return Promise.resolve(new Response(JSON.stringify({ success: true, data: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
  });

  // Reset module-level cache between tests
  vi.doUnmock('@/react-app/config/sharedSessions');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ModalNovaSessao — staled capability cache after flag activation', () => {
  it('fetches with cache: no-cache to bypass browser HTTP cache', async () => {
    // Dynamically import to get a fresh module with reset cache
    const { isSharedSessionsEnabled, _resetCacheForTesting } = await import(
      '@/react-app/config/sharedSessions'
    );
    _resetCacheForTesting();

    // First call: capability is false (flag not yet activated)
    capabilityResponse = false;
    const first = await isSharedSessionsEnabled();
    expect(first).toBe(false);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/capabilities'),
      expect.objectContaining({ cache: 'no-cache' }),
    );

    // Simulate operational flag activation
    capabilityResponse = true;

    // Without forceRefresh: returns cached false (within TTL)
    const cached = await isSharedSessionsEnabled();
    expect(cached).toBe(false); // Still serving stale cache

    // With forceRefresh: bypasses cache and gets fresh true
    const fresh = await isSharedSessionsEnabled({ forceRefresh: true });
    expect(fresh).toBe(true);
  });

  it('isSharedSessionsEnabled uses cache: no-cache in fetch options', async () => {
    const { isSharedSessionsEnabled, _resetCacheForTesting } = await import(
      '@/react-app/config/sharedSessions'
    );
    _resetCacheForTesting();

    capabilityResponse = true;
    await isSharedSessionsEnabled();

    // Verify the fetch was called with cache: 'no-cache'
    const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls;
    const capabilityCall = calls.find((call: any[]) => {
      const url = typeof call[0] === 'string' ? call[0] : '';
      return url.includes('/capabilities');
    });
    expect(capabilityCall).toBeDefined();
    const fetchOptions = capabilityCall?.[1];
    expect(fetchOptions).toMatchObject({ cache: 'no-cache' });
  });

  it('forceRefresh: false (default) respects in-memory cache', async () => {
    const { isSharedSessionsEnabled, _resetCacheForTesting } = await import(
      '@/react-app/config/sharedSessions'
    );
    _resetCacheForTesting();

    capabilityResponse = true;
    const first = await isSharedSessionsEnabled();
    expect(first).toBe(true);

    // Clear fetch mock to verify no new fetch happens
    (fetch as ReturnType<typeof vi.fn>).mockClear();

    capabilityResponse = false; // Change server response
    const second = await isSharedSessionsEnabled(); // No forceRefresh
    expect(second).toBe(true); // Serves from in-memory cache
    expect(fetch).not.toHaveBeenCalled(); // No network request
  });

  it('_resetCacheForTesting clears all cached state', async () => {
    // Import fresh module references
    const mod1 = await import('@/react-app/config/sharedSessions');
    mod1._resetCacheForTesting();

    // After reset, sync check should return false
    expect(mod1.isSharedSessionsEnabledSync()).toBe(false);

    // Set true via a fetch
    capabilityResponse = true;
    await mod1.isSharedSessionsEnabled({ forceRefresh: true });
    expect(mod1.isSharedSessionsEnabledSync()).toBe(true);

    // Reset again
    mod1._resetCacheForTesting();
    expect(mod1.isSharedSessionsEnabledSync()).toBe(false);
  });
});

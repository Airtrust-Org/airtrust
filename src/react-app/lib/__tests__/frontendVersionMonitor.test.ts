import { describe, expect, it, vi } from 'vitest';
import { installFrontendVersionMonitor, shouldSkipAutomaticRefresh } from '../frontendVersionMonitor';

describe('frontendVersionMonitor', () => {
  it('refreshes when the served frontend version differs from the loaded document version', async () => {
    let focusListener: (() => void) | undefined;
    const refresh = vi.fn(async () => undefined);
    const windowApi = {
      location: { pathname: '/controle-voos/voos' },
      addEventListener: vi.fn((event: string, cb: () => void) => { if (event === 'focus') focusListener = cb; }),
      removeEventListener: vi.fn(),
      setInterval: vi.fn(() => 1 as unknown as number),
      clearInterval: vi.fn(),
    } as any;
    const documentApi = {
      visibilityState: 'visible',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      querySelector: vi.fn(),
    } as any;

    const dispose = installFrontendVersionMonitor({
      windowApi,
      documentApi,
      readCurrentVersion: () => 'old-sha',
      fetchVersion: vi.fn(async () => 'new-sha'),
      refresh,
      pollIntervalMs: 60_000,
    });

    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    focusListener?.();
    await Promise.resolve();
    expect(refresh).toHaveBeenCalledTimes(1);
    dispose();
  });

  it('does not refresh when versions match', async () => {
    const refresh = vi.fn(async () => undefined);
    installFrontendVersionMonitor({
      windowApi: {
        location: { pathname: '/controle-voos/voos' },
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        setInterval: vi.fn(() => 1 as unknown as number),
        clearInterval: vi.fn(),
      } as any,
      documentApi: {
        visibilityState: 'visible',
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        querySelector: vi.fn(),
      } as any,
      readCurrentVersion: () => 'same-sha',
      fetchVersion: vi.fn(async () => 'same-sha'),
      refresh,
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('skips LMS player and FRMS check-in routes to avoid interrupting active work', () => {
    expect(shouldSkipAutomaticRefresh('/lms/player/123')).toBe(true);
    expect(shouldSkipAutomaticRefresh('/frms/checkin')).toBe(true);
    expect(shouldSkipAutomaticRefresh('/frms/checkin/')).toBe(true);
    expect(shouldSkipAutomaticRefresh('/frms/fadiga-checkin')).toBe(true);
    expect(shouldSkipAutomaticRefresh('/controle-voos/voos')).toBe(false);
  });

  it('defers an available update during FRMS check-in and refreshes after leaving it', async () => {
    let focusListener: (() => void) | undefined;
    const refresh = vi.fn(async () => undefined);
    const location = { pathname: '/frms/checkin' };
    const fetchVersion = vi.fn(async () => 'new-sha');

    installFrontendVersionMonitor({
      windowApi: {
        location,
        addEventListener: vi.fn((event: string, cb: () => void) => {
          if (event === 'focus') focusListener = cb;
        }),
        removeEventListener: vi.fn(),
        setInterval: vi.fn(() => 1 as unknown as number),
        clearInterval: vi.fn(),
      } as any,
      documentApi: {
        visibilityState: 'visible',
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        querySelector: vi.fn(),
      } as any,
      readCurrentVersion: () => 'old-sha',
      fetchVersion,
      refresh,
    });

    await Promise.resolve();
    expect(fetchVersion).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();

    location.pathname = '/frms/controle-operacional';
    focusListener?.();
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });
});

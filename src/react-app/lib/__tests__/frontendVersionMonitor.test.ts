import { describe, expect, it, vi } from 'vitest';
import {
  installFrontendVersionMonitor,
  shouldSkipAutomaticRefresh,
  onFrontendUpdateAvailable,
  getPendingFrontendUpdate,
} from '../frontendVersionMonitor';

function browserMocks(pathname = '/controle-voos/voos') {
  let focusListener: (() => void) | undefined;
  const location = { pathname };
  const windowApi = {
    location,
    addEventListener: vi.fn((event: string, callback: () => void) => {
      if (event === 'focus') focusListener = callback;
    }),
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
  return { windowApi, documentApi, location, focus: () => focusListener?.() };
}

describe('frontendVersionMonitor', () => {
  it('announces a new version once instead of reloading the active page', async () => {
    const browser = browserMocks();
    const notified = vi.fn();
    const unsubscribe = onFrontendUpdateAvailable(notified);
    notified.mockClear(); // subscriptions can replay a previously announced version

    const fetchVersion = vi.fn(async () => 'new-sha-1');
    const dispose = installFrontendVersionMonitor({
      windowApi: browser.windowApi,
      documentApi: browser.documentApi,
      readCurrentVersion: () => 'old-sha',
      fetchVersion,
    });

    await vi.waitFor(() => expect(notified).toHaveBeenCalledWith('new-sha-1'));
    expect(getPendingFrontendUpdate()).toBe('new-sha-1');
    browser.focus();
    await vi.waitFor(() => expect(fetchVersion).toHaveBeenCalledTimes(2));
    expect(notified).toHaveBeenCalledTimes(1);
    expect(browser.windowApi.location.pathname).toBe('/controle-voos/voos');

    dispose();
    unsubscribe();
  });

  it('does not announce an update when versions match', async () => {
    const browser = browserMocks();
    const notified = vi.fn();
    const unsubscribe = onFrontendUpdateAvailable(notified);
    notified.mockClear();
    installFrontendVersionMonitor({
      windowApi: browser.windowApi,
      documentApi: browser.documentApi,
      readCurrentVersion: () => 'same-sha',
      fetchVersion: vi.fn(async () => 'same-sha'),
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(notified).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('skips LMS player and FRMS check-in routes', () => {
    expect(shouldSkipAutomaticRefresh('/lms/player/123')).toBe(true);
    expect(shouldSkipAutomaticRefresh('/frms/checkin')).toBe(true);
    expect(shouldSkipAutomaticRefresh('/frms/checkin/')).toBe(true);
    expect(shouldSkipAutomaticRefresh('/frms/fadiga-checkin')).toBe(true);
    expect(shouldSkipAutomaticRefresh('/controle-voos/voos')).toBe(false);
  });

  it('defers update notification during check-in and announces after leaving', async () => {
    const browser = browserMocks('/frms/checkin');
    const fetchVersion = vi.fn(async () => 'new-sha-2');
    const notified = vi.fn();
    const unsubscribe = onFrontendUpdateAvailable(notified);
    notified.mockClear();

    const dispose = installFrontendVersionMonitor({
      windowApi: browser.windowApi,
      documentApi: browser.documentApi,
      readCurrentVersion: () => 'old-sha',
      fetchVersion,
    });

    await Promise.resolve();
    expect(fetchVersion).not.toHaveBeenCalled();
    expect(notified).not.toHaveBeenCalled();

    browser.location.pathname = '/frms/controle-operacional';
    browser.focus();
    await vi.waitFor(() => expect(notified).toHaveBeenCalledWith('new-sha-2'));
    dispose();
    unsubscribe();
  });

  it('replays available update to a listener mounted after bootstrap', async () => {
    const listener = vi.fn();
    const unsubscribe = onFrontendUpdateAvailable(listener);
    expect(listener).toHaveBeenCalledWith(getPendingFrontendUpdate());
    unsubscribe();
  });
});

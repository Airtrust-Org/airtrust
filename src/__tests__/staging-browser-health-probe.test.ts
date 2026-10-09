import { describe, expect, it, vi } from 'vitest';
import { probeRealStagingHealth } from '../../e2e/lib/staging-browser-health-probe.mjs';

const HEALTH_URL = 'https://airtrust-api-staging.airtrust.workers.dev/api/health';

function setup(values: number[], options: {
  aborted?: boolean;
  origin?: string;
  violations?: number;
  failureText?: string;
  requestUrl?: string;
} = {}) {
  let requestFailed: ((request: unknown) => void) | undefined;
  const pending = [...values];
  const page = {
    on: vi.fn((_name: string, listener: (request: unknown) => void) => {
      requestFailed = listener;
    }),
    off: vi.fn(),
    url: vi.fn(() => options.origin ?? 'https://staging.airtrust.pages.dev/login'),
    waitForLoadState: vi.fn(async () => undefined),
    evaluate: vi.fn(async () => {
      const response = pending.shift();
      if (response === -1 && options.aborted) {
        requestFailed?.({
          url: () => options.requestUrl ?? HEALTH_URL,
          method: () => 'GET',
          failure: () => ({ errorText: options.failureText ?? 'net::ERR_ABORTED' }),
        });
      }
      return response ?? -1;
    }),
  };
  const assertFrontendSha = vi.fn(async () => undefined);
  const params = {
    guard: { violations: Array.from({ length: options.violations ?? 0 }, () => ({ reason: 'blocked' })) },
    releaseShortSha: '56f14db',
    assertFrontendSha,
  };
  return { page, params, assertFrontendSha };
}

describe('staging browser-origin health preflight', () => {
  it('retries exactly one aborted GET after page load and rechecks frontend SHA', async () => {
    const { page, params, assertFrontendSha } = setup([-1, 200], { aborted: true });
    await expect(probeRealStagingHealth(page, params)).resolves.toBe(200);
    expect(page.evaluate).toHaveBeenCalledTimes(2);
    expect(page.waitForLoadState).toHaveBeenCalledTimes(2);
    expect(page.waitForLoadState).toHaveBeenCalledWith('networkidle', { timeout: 15_000 });
    expect(assertFrontendSha).toHaveBeenCalledWith(page, '56f14db', 'login-preflight-retry');
    expect(page.off).toHaveBeenCalledOnce();
  });
  it('does not bypass an HTTP 403/500 or retry an unexplained transport failure', async () => {
    for (const values of [[403, 200], [500, 200], [-1, 200]]) {
      const { page, params } = setup(values);
      await expect(probeRealStagingHealth(page, params)).resolves.toBe(values[0]);
      expect(page.evaluate).toHaveBeenCalledOnce();
      expect(page.waitForLoadState).toHaveBeenCalledOnce();
    }
  });
  it('does not retry a CORS, TLS or unrelated health request failure', async () => {
    for (const opts of [
      { aborted: true, failureText: 'net::ERR_FAILED' },
      { aborted: true, requestUrl: 'https://airtrust-api-staging.airtrust.workers.dev/api/version' },
    ]) {
      const { page, params } = setup([-1, 200], opts);
      await expect(probeRealStagingHealth(page, params)).resolves.toBe(-1);
      expect(page.evaluate).toHaveBeenCalledOnce();
    }
  });
  it('does not retry after a security guard violation or on an unrelated origin', async () => {
    for (const opts of [
      { aborted: true, violations: 1 },
      { aborted: true, origin: 'https://airtrust.online/login' },
    ]) {
      const { page, params } = setup([-1, 200], opts);
      await expect(probeRealStagingHealth(page, params)).resolves.toBe(-1);
      expect(page.evaluate).toHaveBeenCalledOnce();
    }
  });
  it('remains failed after the single permitted retry, never retries a third time', async () => {
    const { page, params } = setup([-1, -1, 200], { aborted: true });
    await expect(probeRealStagingHealth(page, params)).resolves.toBe(-1);
    expect(page.evaluate).toHaveBeenCalledTimes(2);
    expect(page.off).toHaveBeenCalledOnce();
  });
});

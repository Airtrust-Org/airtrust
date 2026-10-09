/**
 * Probe the actual staging API from the published staging login page.
 *
 * A navigation in the first paint can abort an in-flight GET after the
 * read-only browser route guard has been installed. Retry at most once,
 * and ONLY when the browser observed net::ERR_ABORTED for that exact GET.
 * An HTTP denial, CORS error, security-guard violation or unexpected
 * origin is terminal; no fake auth/health responses are ever supplied.
 */
const HEALTH_URL = 'https://airtrust-api-staging.airtrust.workers.dev/api/health';
const FRONTEND_ORIGIN = 'https://staging.airtrust.pages.dev';

export async function probeRealStagingHealth(page, { guard, releaseShortSha, assertFrontendSha }) {
  let healthAborted = false;
  const onFailed = (request) => {
    if (request.url() !== HEALTH_URL || request.method() !== 'GET') return;
    const failure = request.failure();
    if (failure?.errorText === 'net::ERR_ABORTED') healthAborted = true;
  };
  page.on('requestfailed', onFailed);
  const probe = async () => {
    try {
      return await page.evaluate(async (url) => {
        try {
          const response = await fetch(url, {
            method: 'GET', mode: 'cors', credentials: 'omit', cache: 'no-store',
          });
          return response.status;
        } catch {
          return -1;
        }
      }, HEALTH_URL);
    } catch {
      // A navigation can also destroy the initial page evaluation context.
      return -1;
    }
  };

  try {
    let status = await probe();
    if (status !== -1 || !healthAborted || guard.violations.length !== 0 ||
      new URL(page.url()).origin !== FRONTEND_ORIGIN) {
      return status;
    }

    // This is a bounded retry of the same GET, not an auth or release bypass.
    await page.waitForLoadState('load');
    if (releaseShortSha) {
      await assertFrontendSha(page, releaseShortSha, 'login-preflight-retry');
    }
    status = await probe();
    return status;
  } finally {
    page.off('requestfailed', onFailed);
  }
}

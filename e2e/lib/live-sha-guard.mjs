/**
 * Live staging-frontend SHA guard.
 *
 * Staging is shared: another deploy can replace the frontend between the
 * provenance guard, login, and each Playwright navigation. Every relevant
 * step must re-read the LIVE `<meta name="build-version">` and confirm it
 * still carries the short SHA of `release_sha`. Any divergence fails closed
 * with STAGING_FRONTEND_SHA_MISMATCH.
 */

export function extractBuildVersion(html) {
  const match = String(html ?? '').match(
    /<meta\s+name=["']build-version["']\s+content=["']([^"']+)["']/i,
  );
  return match ? match[1].trim() : null;
}

export function normalizeShortSha(value) {
  const raw = String(value ?? '')
    .trim()
    .toLowerCase();
  if (!/^[0-9a-f]{7,40}$/.test(raw)) {
    throw new Error('EXPECTED_SHORT_SHA_INVALID');
  }
  return raw.slice(0, 7);
}

/**
 * The published staging frontend stamps EXACTLY:
 *   <meta name="build-version" content="staging-<iso8601>-<shortsha>">
 * (see scripts/stamp-build-version.sh). Accept the short SHA only as the exact
 * `-<shortsha>` suffix of a `staging-` prefixed string — never merely "appears
 * somewhere in the value".
 *
 * @param {string | null | undefined} buildVersion
 * @param {string} shortSha 7-hex short SHA (already normalized)
 * @returns {boolean}
 */
export function matchesStagingBuildVersion(buildVersion, shortSha) {
  const value = String(buildVersion ?? '').trim();
  const short = String(shortSha ?? '')
    .trim()
    .toLowerCase();
  if (!/^[0-9a-f]{7}$/.test(short)) return false;
  return value.startsWith('staging-') && value.toLowerCase().endsWith(`-${short}`);
}

/**
 * @param {{ buildVersion: string | null, expectedShortSha: string, where?: string }} args
 * @returns {string} the confirmed build-version
 */
export function assertLiveShaMatches({
  buildVersion,
  expectedShortSha,
  where = 'staging-frontend',
}) {
  const short = normalizeShortSha(expectedShortSha);
  if (!buildVersion) {
    throw new Error(`STAGING_FRONTEND_BUILD_VERSION_META_MISSING:${where}`);
  }
  if (!matchesStagingBuildVersion(buildVersion, short)) {
    throw new Error(`STAGING_FRONTEND_SHA_MISMATCH:${where}:${buildVersion}`);
  }
  return buildVersion;
}

/**
 * Playwright helper — reads the meta tag from the LIVE DOM after a navigation.
 * @param {import('@playwright/test').Page} page
 * @param {string} expectedShortSha
 * @param {string} [where]
 */
export async function assertLiveFrontendShaFromPage(page, expectedShortSha, where = 'navigation') {
  const buildVersion = await page
    .locator('meta[name="build-version"]')
    .getAttribute('content')
    .catch(() => null);
  return assertLiveShaMatches({ buildVersion, expectedShortSha, where });
}

/**
 * Node helper — GET the staging frontend and assert the served SHA.
 * @param {string} origin
 * @param {string} expectedShortSha
 * @param {typeof fetch} [fetchImpl]
 */
export async function assertLiveFrontendShaFromOrigin(origin, expectedShortSha, fetchImpl = fetch) {
  const response = await fetchImpl(`${origin}/`, { headers: { Accept: 'text/html' } });
  if (!response.ok) {
    throw new Error(`STAGING_FRONTEND_HTTP_${response.status}`);
  }
  const html = await response.text();
  return assertLiveShaMatches({
    buildVersion: extractBuildVersion(html),
    expectedShortSha,
    where: 'live-origin',
  });
}

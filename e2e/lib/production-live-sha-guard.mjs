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
  if (!/^[0-9a-f]{7,40}$/.test(raw)) throw new Error('EXPECTED_SHORT_SHA_INVALID');
  return raw.slice(0, 7);
}

export function matchesProductionBuildVersion(buildVersion, shortSha) {
  const value = String(buildVersion ?? '').trim();
  const short = normalizeShortSha(shortSha);
  return (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z-[0-9a-f]{7}$/i.test(value) &&
    value.toLowerCase().endsWith(`-${short}`)
  );
}

export function assertProductionLiveShaMatches({
  buildVersion,
  expectedShortSha,
  where = 'production-frontend',
}) {
  const short = normalizeShortSha(expectedShortSha);
  if (!buildVersion) throw new Error(`PRODUCTION_FRONTEND_BUILD_VERSION_META_MISSING:${where}`);
  if (!matchesProductionBuildVersion(buildVersion, short)) {
    throw new Error(`PRODUCTION_FRONTEND_SHA_MISMATCH:${where}:${buildVersion}`);
  }
  return buildVersion;
}

export async function assertProductionFrontendShaFromPage(
  page,
  expectedShortSha,
  where = 'navigation',
) {
  const buildVersion = await page
    .locator('meta[name="build-version"]')
    .getAttribute('content')
    .catch(() => null);
  return assertProductionLiveShaMatches({ buildVersion, expectedShortSha, where });
}

export async function assertProductionFrontendShaFromOrigin(
  origin,
  expectedShortSha,
  fetchImpl = fetch,
) {
  const response = await fetchImpl(`${origin}/`, { headers: { Accept: 'text/html' } });
  if (!response.ok) throw new Error(`PRODUCTION_FRONTEND_HTTP_${response.status}`);
  const html = await response.text();
  return assertProductionLiveShaMatches({
    buildVersion: extractBuildVersion(html),
    expectedShortSha,
    where: 'live-origin',
  });
}

/**
 * Immutable production identity proof for the FRMS browser test.
 * Re-run before AND after browser interaction: a production deployment may
 * change while an environment approval or browser session is pending.
 * Public provenance only; no credentials, tokens, PII or response bodies logged.
 */
export function assertProductionShaPair({
  expectedWorkerSha,
  expectedPagesSha,
  versionJson,
  frontendHtml,
}) {
  const workerSha = String(expectedWorkerSha ?? '');
  const pagesSha = String(expectedPagesSha ?? '');
  if (!/^[0-9a-f]{40}$/.test(workerSha) || !/^[0-9a-f]{40}$/.test(pagesSha)) {
    throw new Error('FRMS_PRODUCTION_PROVENANCE_EXPECTED_SHA_INVALID');
  }
  const actualWorkerSha = versionJson?.data?.sourceSha;
  if (actualWorkerSha !== workerSha) {
    throw new Error('FRMS_PRODUCTION_WORKER_SHA_MISMATCH');
  }
  const livePageStamps = [
    ...String(frontendHtml ?? '').matchAll(/20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z-([0-9a-f]{7,40})(?![0-9a-f])/g),
  ].map((match) => match[1]);
  if (livePageStamps.length !== 1 || !pagesSha.startsWith(livePageStamps[0])) {
    throw new Error('FRMS_PRODUCTION_PAGES_SHA_MISMATCH');
  }
  return true;
}

export async function assertLiveProductionProvenance(
  expectedWorkerSha,
  expectedPagesSha,
  fetcher = fetch,
) {
  const options = {
    headers: { 'Cache-Control': 'no-store' },
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
  };
  const version = await fetcher('https://api.airtrust.online/api/version', options);
  if (version.status !== 200) throw new Error('FRMS_PRODUCTION_VERSION_HTTP_NOT_200');
  const frontend = await fetcher('https://airtrust.online/login', options);
  if (frontend.status !== 200) throw new Error('FRMS_PRODUCTION_PAGES_HTTP_NOT_200');
  assertProductionShaPair({
    expectedWorkerSha,
    expectedPagesSha,
    versionJson: await version.json(),
    frontendHtml: await frontend.text(),
  });
  console.log('FRMS_PRODUCTION_LIVE_SHA_MATCH_PASS');
}

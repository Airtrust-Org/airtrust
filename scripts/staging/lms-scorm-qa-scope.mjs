/**
 * Restrict disposable staging fixtures to the exact browser QA scope.
 * Negative-only checks must not create three unrelated upload candidates.
 * The full scope retains all four legacy fixtures until its candidate-first
 * positive journey is separately reviewed and granted.
 */
const FIXTURES_BY_SCOPE = Object.freeze({
  all: Object.freeze(['success', 'reject', 'timeout', 'resume']),
  'resume-inactive-preview': Object.freeze(['resume']),
  'candidate-first-no-grant': Object.freeze(['resume']),
});

export function fixtureKindsForQaScope(scope = 'all') {
  if (typeof scope !== 'string' ||
      !Object.hasOwn(FIXTURES_BY_SCOPE, scope)) {
    throw new Error('QA_SCORM_SCOPE_NOT_SUPPORTED');
  }
  return [...FIXTURES_BY_SCOPE[scope]];
}

/** Missing QA_SCOPE preserves the documented default; an explicitly empty or
 * unknown scope must never silently fall back to full staging QA. */
export function resolveQaScope(scope) {
  const selected = scope === undefined ? 'all' : scope;
  fixtureKindsForQaScope(selected);
  return selected;
}

/**
 * Full positive staging QA still uses the disabled legacy SCORM replacement
 * action. No grant exists for its four disposable courses, and one exact F5
 * grant cannot authorize four independent uploads. Block it before any
 * network or fixture mutation; cleanup of historic "all" runs stays allowed.
 * Remove this guard only with a reviewed candidate-first positive journey
 * and per-candidate grant verification (not an environment-variable bypass).
 */
export function assertQaScopeReadyForStaging(scope) {
  const selected = resolveQaScope(scope);
  if (selected === 'all') {
    throw new Error('QA_SCORM_POSITIVE_SCOPE_BLOCKED_PENDING_EXACT_F5_GRANT_AND_CANDIDATE_FIRST');
  }
  return selected;
}

/** Exact single-use F5 init allowlist for the negative staging QA firewall.
 * Compare the raw browser URL, not just hostname/pathname: reject credentials,
 * nonstandard ports, query strings, fragments and alternate encodings.
 */
export function isExactQaStagingInitRequest({ method, url, courseId } = {}) {
  return Number.isSafeInteger(courseId) && courseId > 0 && method === 'POST' &&
    url === `https://airtrust-api-staging.airtrust.workers.dev/api/lms/cursos/${courseId}/scorm-upload/streamed/init`;
}

/**
 * Cleanup is a destructive staging operation. A state file alone must never
 * authorize deleting an arbitrary course ID (even inside the QA tenant).
 * Validate the exact run, fixture count, names, kinds and unique IDs first.
 */
export function assertDisposableQaCleanupState(state, scope, runMarker) {
  const kinds = fixtureKindsForQaScope(scope);
  if (!/^\d+-\d+$/.test(String(runMarker)) ||
      !state || state.schema_version !== 1 ||
      state.run_marker !== runMarker ||
      !state.courses || typeof state.courses !== 'object' ||
      Array.isArray(state.courses) ||
      Object.keys(state.courses).length !== kinds.length) {
    throw new Error('QA_SCORM_CLEANUP_STATE_MISMATCH');
  }
  const labels = { success: 'Success', reject: 'Reject', timeout: 'Timeout', resume: 'Resume' };
  const seen = new Set();
  return kinds.map((kind) => {
    const item = state.courses[kind];
    const title = 'QA SCORM ' + labels[kind] + ' ' + runMarker;
    const zipName = 'qa-scorm-' + kind + '-' + runMarker + '.zip';
    if (!item || item.kind !== kind || item.title !== title ||
        item.zip_name !== zipName ||
        !Number.isSafeInteger(item.id) || item.id <= 0 || seen.has(item.id)) {
      throw new Error('QA_SCORM_CLEANUP_FIXTURE_IDENTITY_MISMATCH');
    }
    seen.add(item.id);
    return { id: item.id, kind, title };
  });
}

/** Verify actual Worker course identity before any QA cleanup or rollback. */
export function assertDisposableQaCourseReadback(course, expected) {
  if (!expected || !Number.isSafeInteger(expected.id) || expected.id <= 0 ||
      typeof expected.title !== 'string' ||
      !/^QA SCORM (Success|Reject|Timeout|Resume) [0-9]+-[0-9]+$/.test(expected.title) ||
      !course || Number(course.id) !== expected.id ||
      course.titulo !== expected.title ||
      course.categoria !== 'QA Synthetic' ||
      course.tipo_conteudo !== 'scorm' ||
      (course.publicado !== 0 && course.publicado !== false)) {
    throw new Error('QA_SCORM_CLEANUP_TARGET_IDENTITY_MISMATCH');
  }
  return true;
}

/**
 * Offline contract for a future grant-authorized POSITIVE candidate QA.
 * Only mutating Playwright requests belong in this trace. No network I/O,
 * grant, conformance, activation or certification is performed here.
 */
/** The Worker returns a normalized ZIP member path, never an external URL. */
function isCanonicalQaLaunchPath(value) {
  if (typeof value !== 'string' || !value || value.length > 350 ||
      value !== value.normalize('NFC') || value.startsWith('/') ||
      /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value) ||
      /[\\?#\u0000-\u001f\u007f]/.test(value)) return false;
  // Escaped dot segments and separators must not pass as an apparently safe
  // readback path. The Worker normalizes ZIP paths before returning them.
  try { if (decodeURIComponent(value) !== value) return false; }
  catch { return false; }
  return value.split('/').every(segment => segment !== '' &&
    segment !== '.' && segment !== '..');
}

export function assertInactiveF5CandidateTrace({
  requests, tenantId, courseId, operationId, partCount, packageSha256, zipBytes, receipt,
}) {
  const fail = () => { throw new Error('QA_SCORM_F5_POSITIVE_TRACE_INVALID'); };
  if (!Number.isSafeInteger(tenantId) || tenantId < 1 ||
      !Number.isSafeInteger(courseId) || courseId < 1 ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(operationId ?? '') ||
      !Number.isSafeInteger(partCount) || partCount < 1 || partCount > 10 ||
      !/^[0-9a-f]{64}$/.test(packageSha256 ?? '') ||
      !Number.isSafeInteger(zipBytes) || zipBytes < 22 || zipBytes > 80 * 1024 * 1024 ||
      partCount !== Math.ceil(zipBytes / (8 * 1024 * 1024)) ||
      !Array.isArray(requests) || requests.length !== partCount + 2 ||
      !receipt || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(receipt.packageId ?? '') ||
      receipt.packageId === operationId ||
      receipt.r2Prefix !== `lms/scorm/${tenantId}/${courseId}/_candidates/${receipt.packageId}/` ||
      !isCanonicalQaLaunchPath(receipt.launchFile) ||
      receipt.packageSha256 !== packageSha256 ||
      receipt.zipBytes !== zipBytes || receipt.status !== 'VALIDATED' ||
      receipt.scormVersion !== '1.2' ||
      receipt.createdByOperation !== true || receipt.alreadyExisted !== false ||
      receipt.active !== false || receipt.completionWritten !== false ||
      receipt.certificateIssued !== false ||
      receipt.structural?.status !== 'PASS' ||
      receipt.completionManifest?.status !== 'PASS' ||
      receipt.diagnostics?.status !== 'PASS' ||
      receipt.r2Readback?.source !== 'WORKER_R2_STREAMED_ZIP_READBACK' ||
      receipt.r2Readback?.zipSha256 !== packageSha256 ||
      receipt.r2Readback?.zipBytes !== zipBytes ||
      receipt.r2Readback?.etagStable !== true ||
      receipt.r2Readback?.memberIntegrityVerified !== true ||
      !/^[0-9a-f]{64}$/.test(receipt.r2Readback?.launchAssetSha256 ?? '') ||
      !Number.isSafeInteger(receipt.r2Readback?.rangeRequests) ||
      receipt.r2Readback.rangeRequests < 1 || receipt.r2Readback.rangeRequests > 6) fail();

  const base = `/api/lms/cursos/${courseId}/scorm-upload/streamed`;
  const expected = [
    { method: 'POST', pathname: `${base}/init` },
    ...Array.from({ length: partCount }, (_, index) => ({
      method: 'PUT', pathname: `${base}/${operationId}/parts/${index + 1}`,
    })),
    { method: 'POST', pathname: `${base}/${operationId}/complete` },
  ];
  // Bind the offline positive trace to the Worker protocol, not just URLs.
  // Captured statuses and body sizes are assertions, NOT independent readbacks.
  const init = requests[0], body = init?.body;
  if (init?.responseStatus !== 201 || init.contentType !== 'application/json' ||
      !body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).sort().join(',') !==
        'arquivo_nome,expected_sha256,operation_id,zip_bytes' ||
      body.operation_id !== operationId ||
      body.expected_sha256 !== packageSha256 || body.zip_bytes !== zipBytes ||
      body.arquivo_nome !== `f5-${packageSha256}-${operationId}.zip`) fail();
  for (let part = 1; part <= partCount; part += 1) {
    const item = requests[part];
    const bytes = Math.min(8 * 1024 * 1024, zipBytes - (part - 1) * 8 * 1024 * 1024);
    if (item?.responseStatus !== 200 ||
        item.contentType !== 'application/octet-stream' ||
        item.contentLength !== bytes || item.byteLength !== bytes) fail();
  }
  const complete = requests[partCount + 1];
  if (complete?.responseStatus !== 202 || complete.byteLength !== 0) fail();

  for (let index = 0; index < expected.length; index += 1) {
    const observed = requests[index];
    if (!observed || observed.method !== expected[index].method ||
        typeof observed.url !== 'string') fail();
    let url;
    try { url = new URL(observed.url); } catch { fail(); }
    if (url.protocol !== 'https:' ||
        url.hostname !== 'airtrust-api-staging.airtrust.workers.dev' ||
        url.port || url.username || url.password || url.search || url.hash ||
        url.pathname !== expected[index].pathname) fail();
  }
  // This is a Worker-reported receipt plus an HTTP request trace, NOT an
  // independent D1/R2 readback or functional certification. The caller must
  // separately prove persisted inactive state and previous active-version pin.
  return Object.freeze({
    candidate: 'VALIDATED', workerReceiptInactive: true,
    activationRequestObserved: false, independentReadbackVerified: false,
    functionalCertificationVerified: false, uploadParts: partCount,
  });
}

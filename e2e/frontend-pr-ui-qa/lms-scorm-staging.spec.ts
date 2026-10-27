import { readFileSync, writeFileSync } from 'node:fs';

import { expect, test, type Page, type Route } from '@playwright/test';

import { assertLiveFrontendShaFromPage } from '../lib/live-sha-guard.mjs';

type QaCourse = {
  id: number;
  title: string;
  zip_path: string;
  zip_name: string;
};

type QaState = {
  courses: {
    success: QaCourse;
    reject: QaCourse;
    timeout: QaCourse;
    resume: QaCourse;
  };
};

type ApiEnvelope = {
  success?: boolean;
  data?: {
    status?: string;
    packageId?: string;
    packageSha256?: string;
    publishable?: boolean;
    structural?: { status?: string };
    completionManifest?: { status?: string };
    diagnostics?: { status?: string };
    conformance?: {
      status?: string;
      tests?: Array<{ name?: string; status?: string; detail?: string }>;
    };
    functionalCertification?: { status?: string; missing?: string[] };
    runtime?: {
      status?: string;
      functionalCompletionVerified?: boolean;
      functionalCompletionReason?: string | null;
      failureStage?: string;
      failureCategory?: string;
      initializeObserved?: boolean;
      commitObserved?: boolean;
      finishObserved?: boolean;
      completionReached?: boolean;
    };
  };
};

const STATE_PATH =
  process.env.QA_LMS_SCORM_STATE_PATH || 'qa-state/staging-lms-scorm/state.json';
const SUMMARY_PATH = 'qa-state/staging-lms-scorm/browser-summary.json';
const STAGING_API_HOST = 'airtrust-api-staging.airtrust.workers.dev';

test.describe.configure({ retries: 0 });

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function delayedRealResponse(
  route: Route,
  delayMs: number,
  capture: (json: ApiEnvelope | null) => void,
) {
  // The governed timeout fixture intentionally waits for the real Browser Rendering
  // conformance limit (~30s). Keep the Playwright proxy timeout above that backend limit.
  const response = await route.fetch({ timeout: 45_000 });
  const json = (await response.json().catch(() => null)) as ApiEnvelope | null;
  capture(json);
  await sleep(delayMs);
  await route.fulfill({ response });
}

async function openCourseEditor(page: Page, course: QaCourse) {
  // The catalog fetches draft courses asynchronously after the page mounts.
  // A visible searchbox is NOT proof of a completed catalog query. Record the
  // real tenant-scoped draft API verdict before assessing the synthetic card.
  // Never fake or fulfill auth, tenant context or course responses.
  const draftQuery = page.waitForResponse((response) => {
    if (response.request().method() !== 'GET') return false;
    const url = new URL(response.url());
    return url.pathname === '/api/lms/cursos' && url.searchParams.get('publicados') === '0';
  }, { timeout: 45_000 });
  await page.goto('/lms/cursos', { waitUntil: 'domcontentloaded' });
  const draftResponse = await draftQuery;
  // A 200 HTML shell (Pages fallback/redirect) is not a valid Worker catalog.
  // Require the actual trusted staging API origin, never a same-path proxy.
  const draftUrl = new URL(draftResponse.url());
  if (draftUrl.protocol !== 'https:' || draftUrl.hostname !== STAGING_API_HOST) {
    throw new Error('QA_SCORM_DRAFT_CATALOG_UNTRUSTED_ORIGIN');
  }
  if (draftResponse.status() !== 200) {
    throw new Error('QA_SCORM_DRAFT_CATALOG_API_HTTP_' + draftResponse.status());
  }
  const responseType = (draftResponse.headers()['content-type'] ?? '').toLowerCase();
  if (!/(?:^|[+\/])json(?:[;\s]|$)/.test(responseType)) {
    throw new Error('QA_SCORM_DRAFT_CATALOG_NON_JSON_200');
  }
  const draftPayload = await draftResponse.json().catch(() => null) as {
    success?: boolean;
    data?: Array<{ id: number }>;
    pagination?: { total?: number };
  } | null;
  if (!draftPayload?.success || !Array.isArray(draftPayload.data)) {
    // Emit only a bounded schema classification; never catalog data, tenant IDs,
    // course names, response bodies, auth headers, or backend error strings.
    const successClass = draftPayload?.success === true ? 'true'
      : draftPayload?.success === false ? 'false' : 'missing';
    const dataValue: unknown = draftPayload?.data;
    const dataClass = Array.isArray(dataValue) ? 'array'
      : dataValue === null ? 'null'
      : dataValue === undefined ? 'missing'
      : typeof dataValue === 'object' ? 'object' : 'scalar';
    throw new Error(
      'QA_SCORM_DRAFT_CATALOG_API_INVALID:success_' + successClass +
      ':data_' + dataClass,
    );
  }
  if (!draftPayload.data.some((item) => Number(item.id) === Number(course.id))) {
    // Only sanitized aggregate dimensions and a reason code; no employee or
    // course PII, tokens, request headers, or raw backend response data.
    throw new Error(
      'QA_SCORM_SYNTHETIC_COURSE_ABSENT_FROM_DRAFT_CATALOG:' +
      'page_rows=' + draftPayload.data.length +
      ';pagination_total=' + (draftPayload.pagination?.total ?? 'unknown'),
    );
  }

  const releaseShortSha = String(process.env.RELEASE_SHA || '').slice(0, 7);
  if (releaseShortSha) {
    await assertLiveFrontendShaFromPage(page, releaseShortSha, 'lms-scorm-qa');
  }

  const search = page.getByRole('searchbox', {
    name: /Buscar cursos/i,
  });
  await expect(search).toBeVisible();
  await search.fill(course.title);

  const card = page.locator('article').filter({ hasText: course.title });
  await expect(card).toHaveCount(1, { timeout: 30_000 });
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Editar' }).click();

  await expect(
    page.getByRole('heading', { name: `Refinando ${course.title}` }),
  ).toBeVisible();

  const fileInput = page.locator('input[type="file"][accept=".zip"]').first();
  await fileInput.setInputFiles(course.zip_path);
  await expect(page.getByText(course.zip_name, { exact: true })).toBeVisible();
}

async function submitCourse(page: Page) {
  await page
    .getByRole('button', { name: /Salvar alterações|Substituir conteúdo/i })
    .click();
}

test('LMS SCORM staging: protocol pass stays uncertified, static reject and timeout stay blocked', async ({ page }) => {
  test.setTimeout(240_000);

  const state = JSON.parse(readFileSync(STATE_PATH, 'utf8')) as QaState;
  const mutations: Array<{ method: string; url: string }> = [];

  page.on('request', (request) => {
    const method = request.method().toUpperCase();
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return;
    mutations.push({ method, url: request.url() });
  });

  let successUpload: ApiEnvelope | null = null;
  let successConformance: ApiEnvelope | null = null;
  let successActivate: ApiEnvelope | null = null;

  await page.route(
    `**/api/lms/cursos/${state.courses.success.id}/scorm-upload**`,
    (route) => delayedRealResponse(route, 1_200, (json) => { successUpload = json; }),
  );
  await page.route(
    `**/api/lms/cursos/${state.courses.success.id}/scorm-package-versions/*/conformance`,
    (route) => delayedRealResponse(route, 1_200, (json) => { successConformance = json; }),
  );
  await page.route(
    `**/api/lms/cursos/${state.courses.success.id}/scorm-package-versions/*/activate`,
    (route) => delayedRealResponse(route, 1_200, (json) => { successActivate = json; }),
  );

  await openCourseEditor(page, state.courses.success);
  await submitCourse(page);

  await expect(page.getByText('Enviando ZIP...', { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('25%', { exact: true })).toBeVisible();
  await expect(page.getByText('Executando validação do player...', { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText('65%', { exact: true })).toBeVisible();
  // The API may reject conformance before activation. Report its sanitized
  // contract verdict instead of masking the cause behind a 30-second UI timeout.
  await expect.poll(() => successConformance !== null, {
    timeout: 35_000,
    message: 'A API de conformidade não retornou resposta à auditoria SCORM',
  }).toBe(true);
  const conformanceVerdict = successConformance?.data;
  const evidence = conformanceVerdict?.conformance?.tests?.find(
    (item) => item.name === 'FUNCTIONAL_COMPLETION_EVIDENCE',
  );
  const safeDiagnostic = {
    api_success: successConformance?.success ?? false,
    publishable: conformanceVerdict?.publishable ?? false,
    structural: conformanceVerdict?.structural?.status ?? null,
    manifest: conformanceVerdict?.completionManifest?.status ?? null,
    diagnostics: conformanceVerdict?.diagnostics?.status ?? null,
    conformance: conformanceVerdict?.conformance?.status ?? null,
    functional_evidence: evidence?.status ?? null,
    functional_reason: evidence?.detail ?? null,
    runtime_status: conformanceVerdict?.runtime?.status ?? null,
    runtime_failure_stage: conformanceVerdict?.runtime?.failureStage ?? null,
    runtime_failure_category: conformanceVerdict?.runtime?.failureCategory ?? null,
    runtime_driver_reason: conformanceVerdict?.runtime?.functionalCompletionReason ?? null,
    runtime_driver_completed: conformanceVerdict?.runtime?.functionalCompletionVerified ?? false,
    initialized: conformanceVerdict?.runtime?.initializeObserved ?? false,
    committed: conformanceVerdict?.runtime?.commitObserved ?? false,
    finished: conformanceVerdict?.runtime?.finishObserved ?? false,
    completion_reached: conformanceVerdict?.runtime?.completionReached ?? false,
  };
  // Protocol/interactive driver PASS does not cover two browsers, resume,
  // rejected assessment, tenant/cycle isolation or persisted qualifications.
  // The currently active version must remain unchanged. This QA is not a
  // full functional certification and must never report the ZIP as activated.
  expect(conformanceVerdict?.conformance?.status,
    `SCORM_PROTOCOL_FAILURE:${JSON.stringify(safeDiagnostic)}`,
  ).toBe('PASS');
  expect(conformanceVerdict?.publishable).toBe(false);
  expect(conformanceVerdict?.functionalCertification?.status).toBe('UNCERTIFIED');
  await expect(page.getByText(/aguarda certificação funcional completa/i)).toBeVisible({
    timeout: 20_000,
  });
  expect(successUpload?.success).toBe(true);
  expect(successUpload?.data?.status).toBe('VALIDATED');
  expect(successConformance?.success).toBe(true);
  expect(successConformance?.data?.runtime?.status).toBe('PASS');
  expect(successActivate).toBeNull();
  expect(mutations.some((entry) =>
    entry.url.includes(`/cursos/${state.courses.success.id}/scorm-package-versions/`) &&
    entry.url.includes('/activate'),
  )).toBe(false);

  await page.unroute(`**/api/lms/cursos/${state.courses.success.id}/scorm-upload**`);
  await page.unroute(
    `**/api/lms/cursos/${state.courses.success.id}/scorm-package-versions/*/conformance`,
  );
  await page.unroute(
    `**/api/lms/cursos/${state.courses.success.id}/scorm-package-versions/*/activate`,
  );

  let rejectedUpload: ApiEnvelope | null = null;
  await page.route(
    `**/api/lms/cursos/${state.courses.reject.id}/scorm-upload**`,
    (route) => delayedRealResponse(route, 1_000, (json) => { rejectedUpload = json; }),
  );

  await openCourseEditor(page, state.courses.reject);
  await submitCourse(page);

  await expect(page.getByText('Enviando ZIP...', { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('25%', { exact: true })).toBeVisible();
  await expect(page.getByText(/rejeitado no Quality Gate estático/i)).toBeVisible({
    timeout: 20_000,
  });

  expect(rejectedUpload?.success).toBe(true);
  expect(rejectedUpload?.data?.status).toBe('REJECTED');
  expect(
    mutations.some(
      (entry) =>
        entry.url.includes(`/cursos/${state.courses.reject.id}/scorm-package-versions/`) &&
        entry.url.includes('/conformance'),
    ),
  ).toBe(false);
  expect(
    mutations.some(
      (entry) =>
        entry.url.includes(`/cursos/${state.courses.reject.id}/scorm-package-versions/`) &&
        entry.url.includes('/activate'),
    ),
  ).toBe(false);

  await page.unroute(`**/api/lms/cursos/${state.courses.reject.id}/scorm-upload**`);

  let timeoutUpload: ApiEnvelope | null = null;
  let timeoutConformance: ApiEnvelope | null = null;
  await page.route(
    `**/api/lms/cursos/${state.courses.timeout.id}/scorm-upload**`,
    (route) => delayedRealResponse(route, 700, (json) => { timeoutUpload = json; }),
  );
  await page.route(
    `**/api/lms/cursos/${state.courses.timeout.id}/scorm-package-versions/*/conformance`,
    (route) => delayedRealResponse(route, 700, (json) => { timeoutConformance = json; }),
  );

  await openCourseEditor(page, state.courses.timeout);
  await submitCourse(page);

  await expect(page.getByText('Enviando ZIP...', { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('25%', { exact: true })).toBeVisible();
  await expect(page.getByText('Executando validação do player...', { exact: true })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText('65%', { exact: true })).toBeVisible();
  await expect(page.getByText(/não passou na validação de conformidade do player/i)).toBeVisible({
    timeout: 60_000,
  });

  expect(timeoutUpload?.success).toBe(true);
  expect(timeoutUpload?.data?.status).toBe('VALIDATED');
  expect(timeoutConformance?.success).toBe(true);
  expect(timeoutConformance?.data?.publishable).toBe(false);
  expect(timeoutConformance?.data?.runtime?.status).toBe('TIMEOUT');
  expect(
    mutations.some(
      (entry) =>
        entry.url.includes(`/cursos/${state.courses.timeout.id}/scorm-package-versions/`) &&
        entry.url.includes('/activate'),
    ),
  ).toBe(false);

  const mutationViolations = mutations.filter((entry) => {
    try {
      return new URL(entry.url).hostname !== STAGING_API_HOST;
    } catch {
      return true;
    }
  });
  expect(mutationViolations).toEqual([]);

  const summary = {
    ok: true,
    live_frontend_provenance: 'PASS',
    success: {
      real_zip_upload: true,
      visible_progress: [25, 65],
      runtime_conformance: 'PASS',
      functional_certification: 'UNCERTIFIED',
      activated: false,
      previous_package_preserved: true,
    },
    rejection: {
      real_zip_upload: true,
      static_gate: 'REJECTED',
      conformance_called: false,
      activated: false,
      visible_error: true,
    },
    timeout: {
      real_zip_upload: true,
      visible_progress: [25, 65],
      runtime_conformance: 'TIMEOUT',
      activated: false,
      visible_error: true,
    },
    production_mutations: 0,
  };
  writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2) + '\n', { mode: 0o600 });
});

// A selected EXTERNAL ZIP cannot use the legacy save/replace action. The
// candidate-first editor disables that action instead of surfacing the old
// synchronous replacement error. This is a UI guard only: it does not prove
// Worker-side EXTERNAL rejection or any granted candidate conformance.
test('LMS SCORM resume: legacy replacement disabled for unreviewed EXTERNAL ZIP', async ({ page }) => {
  test.setTimeout(90_000);
  const state = JSON.parse(readFileSync(STATE_PATH, 'utf8')) as QaState;
  const resume = state.courses.resume;
  const attemptedWrites: Array<{ method: string; pathname: string }> = [];

  await openCourseEditor(page, resume);
  // Fail closed even if a future UI regression tries an unsolicited mutation.
  // Service Workers are blocked for this audit profile in Playwright config.
  await page.route('**/*', async route => {
    const method = route.request().method().toUpperCase();
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      await route.continue();
      return;
    }
    const pathname = new URL(route.request().url()).pathname;
    attemptedWrites.push({ method, pathname });
    await route.abort('blockedbyclient');
  });

  await expect(page.getByRole('button', { name: 'Salvar dados (remova o ZIP)' }))
    .toBeDisabled();
  await expect(page.getByRole('button', {
    name: 'Carregar somente candidato inativo (QA)',
  })).toBeVisible();
  // Do not click the candidate button: a real init POST is separately governed
  // and must not be mistaken for this no-write UI guard.
  await page.waitForTimeout(500);
  expect(attemptedWrites, 'Legacy replacement must not attempt a mutation')
    .toEqual([]);

  const summary = {
    source: 'GOVERNED_STAGING_LMS_SCORM_LEGACY_REPLACEMENT_UI_GUARD',
    scope: 'QA_EXAMINER_SYNTHETIC_TENANT_ONLY',
    exactZipSha256: 'a66beb51033394e8ea736e76d1c644a4b2e37e1e7926c37b37b63b5cc0f10d6f',
    rejectedBeforeUpload: true,
    rejectionMechanism: 'DISABLED_LEGACY_SUBMIT',
    uploadRequests: 0,
    previewRendered: [],
    previewSkippedReason: 'NO_EXACT_F5_GRANT_FOR_EXTERNAL_CANDIDATE',
    active: false,
    certified: false,
    committedCmiProven: false,
    productionMutations: 0,
  };
  writeFileSync('qa-state/staging-lms-scorm/resume-preview-summary.json',
    JSON.stringify(summary, null, 2) + '\n', { mode: 0o600 });
});

/**
 * Current governed editor deliberately prevents legacy "Substituir conteúdo"
 * from combining a metadata save and an unreviewed SCORM activation.
 * This negative-path QA is distinct from functional certification or a granted
 * candidate-upload test: no staging grant is issued for disposable QA courses.
 */
test('LMS SCORM candidate-first: old submit is disabled and ungranted F5 intake is rejected', async ({ page }) => {
  test.setTimeout(90_000);
  const state = JSON.parse(readFileSync(STATE_PATH, 'utf8')) as QaState;
  const course = state.courses.resume;
  const writes: Array<{ method: string; origin: string; pathname: string }> = [];
  const blockedWrites: typeof writes = [];
  const initPath = `/api/lms/cursos/${course.id}/scorm-upload/streamed/init`;

  await openCourseEditor(page, course);
  // Install the mutation firewall AFTER editor initialization. Observing
  // unexpected writes without blocking them is unsafe: a regression could
  // actually upload or activate a candidate before the assertion runs.
  await page.route('**/*', async route => {
    const request = route.request();
    const method = request.method().toUpperCase();
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      await route.continue();
      return;
    }
    const url = new URL(request.url());
    const observed = { method, origin: url.origin, pathname: url.pathname };
    writes.push(observed);
    const allowedInit = method === 'POST' &&
      url.protocol === 'https:' &&
      url.hostname === STAGING_API_HOST &&
      url.pathname === initPath;
    if (!allowedInit) {
      blockedWrites.push(observed);
      await route.abort('blockedbyclient');
      return;
    }
    await route.continue();
  });
  await expect(page.getByRole('button', { name: 'Salvar dados (remova o ZIP)' }))
    .toBeDisabled();
  const inactiveButton = page.getByRole('button', {
    name: 'Carregar somente candidato inativo (QA)',
  });
  await expect(inactiveButton).toBeVisible();
  await expect(inactiveButton).toBeEnabled();
  // This request must be rejected by the real Worker F5 grant guard before
  // upload parts or candidate creation. Never mock an authorization grant.
  const rejectedInit = page.waitForResponse(response => {
    const u = new URL(response.url());
    return u.hostname === STAGING_API_HOST &&
      u.pathname === initPath &&
      response.request().method() === 'POST';
  }, { timeout: 20_000 });
  await inactiveButton.click();
  const initResponse = await rejectedInit;
  // An unrelated 401 or RBAC 403 is not evidence of the F5 grant guard.
  expect(initResponse.status(), 'F5 grant denial must be HTTP 403').toBe(403);
  const denial = await initResponse.json().catch(() => null) as {
    success?: boolean; error?: unknown;
  } | null;
  expect(denial?.success).toBe(false);
  expect(typeof denial?.error).toBe('string');
  expect(/grant(?: SCORM)? F5|grant de staging/i.test(String(denial?.error)),
    'Expected explicit F5 grant rejection, not an unrelated RBAC denial',
  ).toBe(true);
  // Allow async UI error handling to settle while the route firewall remains
  // active. A late mutation is blocked before it reaches the environment.
  await page.waitForTimeout(750);
  expect(blockedWrites, 'No unexpected staging or off-origin write may be attempted')
    .toEqual([]);
  // An exact allowlist also detects unexpected course writes or off-origin
  // requests, beyond just upload parts, conformance and activation.
  expect(writes, 'Denied intake must only POST init to the trusted staging Worker')
    .toEqual([{
      method: 'POST',
      origin: 'https://' + STAGING_API_HOST,
      pathname: initPath,
    }]);
});

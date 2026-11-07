import { readFileSync, writeFileSync } from 'node:fs';

import { expect, test, type Page } from '@playwright/test';

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

const STATE_PATH =
  process.env.QA_LMS_SCORM_STATE_PATH || 'qa-state/staging-lms-scorm/state.json';
const SUMMARY_PATH = 'qa-state/staging-lms-scorm/browser-summary.json';
const STAGING_API_HOST = 'airtrust-api-staging.airtrust.workers.dev';

test.describe.configure({ retries: 0 });

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
  if (!/(?:^|[+/])json(?:[;\s]|$)/.test(responseType)) {
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

// The current catalog deliberately disables the legacy submit while a SCORM
// ZIP is selected. Candidate intake is a distinct staging-only F5 operation
// requiring a fresh exact grant. This browser test proves the UI guard, NOT
// a real ZIP upload, SCORM conformance, completion, qualification or PDF.
test('LMS SCORM staging: candidate-first UI blocks legacy replacement for all synthetic fixtures', async ({ page }) => {
  test.setTimeout(180_000);
  const state = JSON.parse(readFileSync(STATE_PATH, 'utf8')) as QaState;
  const scormWrites: string[] = [];
  page.on('request', (request) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method())) return;
    const path = new URL(request.url()).pathname;
    if (/\/scorm-upload(?:\/|$)|\/scorm-package-versions\//.test(path)) {
      scormWrites.push(path);
    }
  });

  for (const course of [state.courses.success, state.courses.reject, state.courses.timeout]) {
    await openCourseEditor(page, course);
    await expect(page.getByRole('button', { name: 'Salvar dados (remova o ZIP)' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Carregar somente candidato inativo (QA)' })).toBeEnabled();
    await expect(page.getByText(/grant F5 exato da edição/i)).toBeVisible();
  }

  expect(scormWrites, 'Legacy submit must never upload, conform or activate a selected ZIP').toEqual([]);
  writeFileSync(SUMMARY_PATH, JSON.stringify({
    ok: true,
    scope: 'CANDIDATE_FIRST_UI_GUARD_ONLY',
    guardedCourses: 3,
    legacySubmitBlocked: true,
    f5CandidateButtonVisible: true,
    realZipUpload: 'NOT_RUN_NO_EXACT_F5_GRANT',
    runtimeConformance: 'NOT_RUN_NO_EXACT_F5_GRANT',
    staticRejectAndTimeout: 'NOT_RUN_BROWSER',
    functionalCertification: 'UNCERTIFIED',
    certificatePdf: 'NOT_RUN',
    candidateActivated: false,
    scormWrites: 0,
    productionMutations: 0,
  }, null, 2) + '\n', { mode: 0o600 });
});

// The EXTERNAL resume ZIP has no F5 admin grant or signed editorial review.
// It must not be routed through the disabled legacy replacement button.
// This is a UI-only negative guard, not a backend rejection or QA preview.
test('LMS SCORM resume: EXTERNAL unreviewed ZIP cannot use legacy submit', async ({ page }) => {
  test.setTimeout(90_000);
  const state = JSON.parse(readFileSync(STATE_PATH, 'utf8')) as QaState;
  const unexpectedUploads: string[] = [];
  page.on('request', request => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method())) return;
    const path = new URL(request.url()).pathname;
    if (/\/scorm-upload(?:\/|$)|\/scorm-package-versions\//.test(path)) {
      unexpectedUploads.push(path);
    }
  });

  await openCourseEditor(page, state.courses.resume);
  await expect(page.getByRole('button', { name: 'Salvar dados (remova o ZIP)' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Carregar somente candidato inativo (QA)' })).toBeEnabled();
  expect(unexpectedUploads).toEqual([]);

  writeFileSync('qa-state/staging-lms-scorm/resume-preview-summary.json',
    JSON.stringify({
      source: 'STAGING_CANDIDATE_FIRST_UI_GUARD',
      scope: 'QA_EXAMINER_SYNTHETIC_TENANT_ONLY',
      exactZipSha256: 'a66beb51033394e8ea736e76d1c644a4b2e37e1e7926c37b37b63b5cc0f10d6f',
      legacySubmitBlocked: true,
      candidateIntakeNotAttempted: true,
      uploadRequests: 0,
      previewRendered: [],
      previewSkippedReason: 'NO_EXACT_F5_GRANT_FOR_EXTERNAL_CANDIDATE',
      active: false,
      certified: false,
      committedCmiProven: false,
      productionMutations: 0,
    }, null, 2) + '\n', { mode: 0o600 });
});

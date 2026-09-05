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
  capture: (json: unknown) => void,
) {
  const response = await route.fetch();
  const json = await response.json().catch(() => null);
  capture(json);
  await sleep(delayMs);
  await route.fulfill({ response });
}

async function openCourseEditor(page: Page, course: QaCourse) {
  await page.goto('/lms/cursos', { waitUntil: 'domcontentloaded' });

  const releaseShortSha = String(process.env.RELEASE_SHA || '').slice(0, 7);
  if (releaseShortSha) {
    await assertLiveFrontendShaFromPage(page, releaseShortSha, 'lms-scorm-qa');
  }

  const search = page.getByRole('searchbox', {
    name: /Buscar cursos por título, categoria ou descrição/i,
  });
  await expect(search).toBeVisible();
  await search.fill(course.title);

  const card = page.locator('article').filter({ hasText: course.title });
  await expect(card).toHaveCount(1);
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

test('LMS SCORM staging: real success, rejection, timeout and visible progress', async ({ page }) => {
  test.setTimeout(150_000);

  const state = JSON.parse(readFileSync(STATE_PATH, 'utf8')) as QaState;
  const mutations: Array<{ method: string; url: string }> = [];

  page.on('request', (request) => {
    const method = request.method().toUpperCase();
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return;
    mutations.push({ method, url: request.url() });
  });

  let successUpload: any = null;
  let successConformance: any = null;
  let successActivate: any = null;

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
  await expect(page.getByText('Ativando nova versão...', { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText('85%', { exact: true })).toBeVisible();

  await expect(page.getByText('Curso atualizado.', { exact: true })).toBeVisible({ timeout: 20_000 });
  expect(successUpload?.success).toBe(true);
  expect(successUpload?.data?.status).toBe('VALIDATED');
  expect(successConformance?.success).toBe(true);
  expect(successConformance?.data?.publishable).toBe(true);
  expect(successConformance?.data?.runtime?.status).toBe('PASS');
  expect(successActivate?.success).toBe(true);
  expect(successActivate?.data?.status).toBe('ACTIVE');

  await page.unroute(`**/api/lms/cursos/${state.courses.success.id}/scorm-upload**`);
  await page.unroute(
    `**/api/lms/cursos/${state.courses.success.id}/scorm-package-versions/*/conformance`,
  );
  await page.unroute(
    `**/api/lms/cursos/${state.courses.success.id}/scorm-package-versions/*/activate`,
  );

  let rejectedUpload: any = null;
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

  let timeoutUpload: any = null;
  let timeoutConformance: any = null;
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
      visible_progress: [25, 65, 85],
      runtime_conformance: 'PASS',
      activated: true,
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

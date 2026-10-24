/**
 * Browser compatibility proof for the real QA Factory/M8 SCO controls.
 *
 * This exercises JavaScript authored inside the disposable SCORM ZIP in both
 * Chromium and WebKit. The SCORM API bridge is TEST-LOCAL, not a live LMS
 * enrollment: these tests MUST NEVER emit a functional certification or be
 * used to activate a package. Tenant/cycle, D1 and certificate E2E remain
 * separate mandatory release evidence.
 */
import { expect, test } from '@playwright/test';
import { buildInteractiveM8QaFiles } from '../../scripts/staging/lms-scorm-m8-fixture.mjs';

const origin = 'https://scorm-protocol.airtrust.invalid';
const qaFiles: Record<string, Uint8Array> =
  buildInteractiveM8QaFiles('AIRTRUST-SCORM-BROWSER-QA', 'protocol-test-v1');

test('interactive Factory/M8 SCO requires real answers and explicit learner completion', async ({
  page, context,
}) => {
  const assets = new Map(Object.entries(qaFiles));
  await context.route(origin + '/**', async route => {
    const url = new URL(route.request().url());
    const key = decodeURIComponent(url.pathname.slice(1)) || 'index.html';
    const bytes = assets.get(key);
    if (!bytes) return route.fulfill({ status: 404, body: 'asset not found' });
    const contentType = key.endsWith('.html') ? 'text/html; charset=utf-8'
      : key.endsWith('.js') ? 'application/javascript; charset=utf-8'
      : key.endsWith('.css') ? 'text/css; charset=utf-8'
      : key.endsWith('.svg') ? 'image/svg+xml'
      : 'application/octet-stream';
    return route.fulfill({ status: 200, contentType, body: Buffer.from(bytes) });
  });

  // The real SCO must call the bridge itself. The test may read its trace,
  // but never writes score, pass, completion or interaction state.
  await context.addInitScript(() => {
    type Call = { method: string; key?: string; value?: string };
    const snapshot = {
      initialized: false, finished: false,
      values: {} as Record<string, string>, calls: [] as Call[],
    };
    const api = {
      LMSInitialize: (_value: string) => {
        snapshot.calls.push({ method: 'LMSInitialize' });
        snapshot.initialized = true;
        return 'true';
      },
      LMSGetValue: (key: string) => {
        snapshot.calls.push({ method: 'LMSGetValue', key });
        return snapshot.values[key] ?? '';
      },
      LMSSetValue: (key: string, value: string) => {
        snapshot.calls.push({ method: 'LMSSetValue', key, value: String(value) });
        if (snapshot.finished) return 'false';
        snapshot.values[key] = String(value);
        return 'true';
      },
      LMSCommit: (_value: string) => {
        snapshot.calls.push({ method: 'LMSCommit' });
        return snapshot.finished ? 'false' : 'true';
      },
      LMSFinish: (_value: string) => {
        snapshot.calls.push({ method: 'LMSFinish' });
        snapshot.finished = true;
        return 'true';
      },
      LMSGetLastError: () => '0',
      LMSGetErrorString: () => 'No error',
      LMSGetDiagnostic: () => '',
    };
    Object.defineProperty(window, 'API', { value: api });
    Object.defineProperty(window, '__AIRTRUST_SCORM_QA_TRACE', { value: snapshot });
  });

  const read = (target: typeof page) => target.evaluate(() => {
    const w = window as unknown as {
      __AIRTRUST_SCORM_QA_TRACE: {
        initialized: boolean; finished: boolean;
        values: Record<string, string>;
        calls: Array<{ method: string; key?: string; value?: string }>;
      };
      __AIRTRUST_PLAYER_TEST__: {
        getState(): { completed: boolean };
        getModelState(): { assessmentPassed: boolean; passed: boolean; failed: boolean };
      };
    };
    return {
      ...w.__AIRTRUST_SCORM_QA_TRACE,
      learner: w.__AIRTRUST_PLAYER_TEST__.getState(),
      model: w.__AIRTRUST_PLAYER_TEST__.getModelState(),
    };
  });

  // Failure is driven by the SCO's actual visible buttons, not by writing
  // "failed" into the mock CMI; a wrong answer must not trigger completion.
  await page.goto(origin + '/index.html');
  await expect(page.getByRole('heading', { name: 'Avaliação QA' })).toBeVisible();
  expect((await read(page)).initialized).toBe(true);
  await expect(page.locator('#submitAssessment')).toBeDisabled();
  await page.locator('button[data-answer="0"]').click();
  await page.locator('#submitAssessment').click();
  const failed = await read(page);
  expect(failed.values['cmi.core.lesson_status']).toBe('failed');
  expect(failed.values['cmi.core.score.raw']).toBe('0');
  expect(failed.model.failed).toBe(true);
  expect(failed.learner.completed).toBe(false);
  await expect(page.locator('#completeCourse')).toBeHidden();

  // Fresh isolated browser document; the same real SCO now has to pass
  // the scored assessment and receive an explicit completion click.
  const approvedPage = await context.newPage();
  await approvedPage.goto(origin + '/index.html');
  await expect(approvedPage.getByRole('heading', { name: 'Avaliação QA' })).toBeVisible();
  await approvedPage.locator('button[data-answer="1"]').click();
  const beforeAssessment = await read(approvedPage);
  expect(beforeAssessment.learner.completed).toBe(false);
  expect(beforeAssessment.values['cmi.core.lesson_status']).toBe('incomplete');

  await approvedPage.locator('#submitAssessment').click();
  await expect(approvedPage.locator('#completeCourse')).toBeVisible();
  const beforeCompletion = await read(approvedPage);
  expect(beforeCompletion.model.assessmentPassed).toBe(true);
  expect(beforeCompletion.model.passed).toBe(false);
  expect(beforeCompletion.learner.completed).toBe(false);

  await approvedPage.locator('#completeCourse').click();
  const passed = await read(approvedPage);
  expect(passed.learner.completed).toBe(true);
  expect(passed.model.passed).toBe(true);
  expect(passed.values['cmi.core.lesson_status']).toBe('passed');
  expect(passed.values['cmi.core.score.raw']).toBe('100');
  expect(passed.calls.some(item => item.method === 'LMSCommit')).toBe(true);

  await approvedPage.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  const finished = await read(approvedPage);
  expect(finished.finished).toBe(true);
  expect(finished.calls.filter(item => item.method === 'LMSFinish')).toHaveLength(1);
  await approvedPage.close();
});

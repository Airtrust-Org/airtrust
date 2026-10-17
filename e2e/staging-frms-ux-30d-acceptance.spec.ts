import { expect, test, type Page } from '@playwright/test';
import { installReadOnlyGuard } from './lib/read-only-network-guard.mjs';

// Exclusive 30-day synthetic FRMS tenant already installed through the governed
// staging workflow. This test does not provision, mutate or impersonate a user.
const QA_TENANT_ID = '999013';
const BASE = 'https://staging.airtrust.pages.dev';
const API_HOST = 'airtrust-api-staging.airtrust.workers.dev';
const DAY = '2026-10-13';

test.use({ storageState: { cookies: [], origins: [] } });

async function captureMain(page: Page, name: string) {
  const main = page.locator('main').first();
  await expect(main).toBeVisible({ timeout: 20_000 });
  await test.info().attach(name, {
    body: await main.screenshot({ animations: 'disabled' }),
    contentType: 'image/png',
  });
}

test('FRMS UX 30d staging: synthetic tenant admin reads operational flows', async ({ page }) => {
  test.setTimeout(150_000);
  const email = String(process.env.FRMS_QA_EMAIL || '').trim();
  const password = String(process.env.FRMS_QA_PASSWORD || '');
  if (email !== 'qa-frms-ux@staging.airtrust.invalid' || !password) throw new Error('FRMS_SCOPED_QA_CREDENTIAL_MISSING');

  const guard = installReadOnlyGuard(page);
  const failures: string[] = [];
  page.on('response', (response) => {
    const u = new URL(response.url());
    if (u.hostname === API_HOST && response.status() >= 500) {
      failures.push(`HTTP_${response.status()}:${u.pathname}`);
    }
  });

  // The previously captured real-browser trace (run #39037634258) showed
  // POST /api/auth/login aborted by the browser (net::ERR_ABORTED), with no
  // server response, while the SPA was clearing legacy caches. A single
  // bounded retry is allowed ONLY for that transport failure, never 401/403
  // or missing access. No mocked auth, JWT, storage or bypass of the guard.
  const loginResponses: number[] = [];
  const loginAborted: string[] = [];
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.hostname === API_HOST && url.pathname === '/api/auth/login' &&
        response.request().method() === 'POST') {
      loginResponses.push(response.status());
    }
  });
  page.on('requestfailed', (request) => {
    const url = new URL(request.url());
    if (url.hostname === API_HOST && url.pathname === '/api/auth/login' &&
        request.method() === 'POST' && request.failure() === 'net::ERR_ABORTED') {
      loginAborted.push('ABORTED');
    }
  });

  const loginPage = async () => {
    await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(password);
    await page.getByRole('button', { name: /entrar|sign in/i }).click();
  };
  const completeRealLogin = async (timeoutMs: number): Promise<boolean> => {
    // A tenant-scoped ADMIN may legitimately be offered an operational
    // profile chooser before navigation. Choose only an actual manager/admin
    // role shown by the server-driven UI, never an unrelated learner role.
    const ready = await page.waitForFunction(() =>
      !window.location.pathname.startsWith('/login') ||
      Array.from(document.querySelectorAll('button')).some((button) =>
        /^Entrar como (Administrador(?: Geral| da Empresa)?|Gestor)\b/i.test(
          (button.textContent || '').trim(),
        )),
    undefined, { timeout: timeoutMs }).then(() => true).catch(() => false);
    if (!ready) return false;
    if (!new URL(page.url()).pathname.startsWith('/login')) return true;

    const managerOrAdmin = page.getByRole('button', {
      name: /entrar como (administrador(?: geral| da empresa)?|gestor)/i,
    }).first();
    if (!(await managerOrAdmin.isVisible().catch(() => false))) {
      throw new Error('FRMS_QA_AUTHORIZED_OPERATIONAL_PROFILE_NOT_PRESENT');
    }
    await managerOrAdmin.click();
    return page.waitForURL((u) => !u.pathname.startsWith('/login'), {
      timeout: timeoutMs,
    }).then(() => true).catch(() => false);
  };

  await loginPage();
  let loggedIn = await completeRealLogin(20_000);
  if (!loggedIn && loginAborted.length > 0 && loginResponses.length === 0 &&
      guard.violations.length === 0) {
    // Retry the real form once after the browser abort; do not retry HTTP
    // errors or repeatedly resend a successful credential request.
    await loginPage();
    loggedIn = await completeRealLogin(25_000);
  }
  if (!loggedIn) {
    throw new Error(
      'FRMS_QA_REAL_LOGIN_INCOMPLETE:responses=' +
      (loginResponses.join(',') || 'none') +
      ';aborted=' + loginAborted.length +
      ';guard_violations=' + guard.violations.length,
    );
  }

  // Account is scoped to exactly tenant 999013 by the governed staging fixture.
  // With only one authorized tenant, the UI may omit the company selector.
  // Never forge a session, JWT, membership or tenant context in the browser.
  const selector = page.locator('select').filter({
    has: page.locator(`option[value="${QA_TENANT_ID}"]`),
  }).first();
  if (await selector.isVisible().catch(() => false)) {
    const selected = page.waitForResponse(
      (response) => response.url().includes('/api/auth/select-empresa') && response.request().method() === 'POST',
      { timeout: 20_000 },
    );
    await selector.selectOption(QA_TENANT_ID);
    expect((await selected).status()).toBe(200);
    await expect(selector).toHaveValue(QA_TENANT_ID, { timeout: 20_000 });
  }

  const snapshotRequest = page.waitForResponse(
    (response) => response.url().includes('/api/frms/operational-snapshot') &&
      response.url().includes(DAY),
    { timeout: 50_000 },
  );
  await page.goto(BASE + '/frms?data=' + DAY, { waitUntil: 'domcontentloaded' });
  const snapshot = await snapshotRequest;
  expect(snapshot.status(), 'FRMS não pode tratar contexto ausente como normal').toBe(200);
  const payload = await snapshot.json() as {
    success?: boolean;
    data?: Array<{ nome?: string | null; empresa_id?: number; checkin_status?: string }>;
    summary?: { total_tripulantes?: number; checkins_pendentes?: number; checkins_recebidos?: number };
  };
  expect(payload.success).toBe(true);
  // The 30-day fixture provisions 14 distinct crew in the tenant, but the
  // operational snapshot is date-scoped. For 2026-10-13 the governed daily
  // count band yields 7 crew with recorded activity, not all 14 employees.
  const expectedDailyCrew = 7;
  expect(payload.summary?.total_tripulantes).toBe(expectedDailyCrew);
  expect(payload.data).toHaveLength(expectedDailyCrew);
  expect(payload.data?.every((p) => p.empresa_id === 999013 && p.nome?.startsWith('QA Tripulante '))).toBe(true);
  expect((payload.summary?.checkins_pendentes ?? 0) + (payload.summary?.checkins_recebidos ?? 0)).toBe(expectedDailyCrew);
  await expect(page.getByRole('navigation', { name: 'Áreas FRMS' })).toBeVisible();
  await expect(page.getByText(/Serviço temporariamente indisponível/i)).toHaveCount(0);
  await captureMain(page, '01-operacao-frms-qa');

  await page.getByRole('link', { name: 'Casos', exact: true }).click();
  await expect(page).toHaveURL(/\/frms\/alertas/);
  await expect(page.getByText(/Serviço temporariamente indisponível/i)).toHaveCount(0);
  await captureMain(page, '02-casos-frms-qa');

  await page.goto(BASE + '/frms?area=manutencao', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('navigation', { name: 'Áreas FRMS' })).toBeVisible();
  await captureMain(page, '03-manutencao-frms-qa');

  await page.goto(BASE + '/frms/relatorios', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText(/Serviço temporariamente indisponível/i)).toHaveCount(0);
  await captureMain(page, '04-relatorios-frms-qa');

  expect(failures, 'Erros 5xx no escopo QA autenticado').toEqual([]);
  guard.assertClean();
  console.log('FRMS_UX_30D_SYNTHETIC_BROWSER_QA_PASS; tenant=999013; routes=operacao,casos,manutencao,relatorios; production_writes=none');
});

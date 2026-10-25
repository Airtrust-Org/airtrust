import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { classifyRequest, SAFE_METHODS } from './lib/read-only-network-guard.mjs';

const QA_TENANT_ID = 999013;
const BASE = process.env.BASE_URL || 'https://staging.airtrust.pages.dev';
const API_HOST = 'airtrust-api-staging.airtrust.workers.dev';

test.use({
  storageState: { cookies: [], origins: [] },
  trace: 'off',
  screenshot: 'off',
  video: 'off',
});

type AuthCompaniesPayload = {
  success?: boolean;
  data?: {
    empresaAtualId?: number;
    empresas?: Array<{ id: number; is_current?: number }>;
  };
};

type EVDPayload = {
  success?: boolean;
  data?: Array<Record<string, unknown> & {
    empresa_id?: number | string;
    revisao?: number;
    status?: string;
  }>;
};

function apiPath(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.hostname === API_HOST ? parsed.pathname : null;
  } catch {
    return null;
  }
}

function formatDateBR(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
}

function saveSanitizedEvidence(params: {
  date: string;
  assignments: number;
  publications: number;
  publicationStatus: number;
  evdStatus: number;
  mutationRequestsAfterLogin: number;
}) {
  const outputDirectory = process.env.RUNNER_TEMP || test.info().outputDir;
  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.writeFileSync(
    path.join(outputDirectory, 'frms-evd-readonly-summary.json'),
    JSON.stringify({
      tenantId: QA_TENANT_ID,
      date: params.date,
      assignments: params.assignments,
      publications: params.publications,
      evdHttpStatus: params.evdStatus,
      publicationsHttpStatus: params.publicationStatus,
      outcome: 'PASS',
      mutationRequestsAfterLogin: params.mutationRequestsAfterLogin,
      evidence: 'read-only authenticated staging view; no D1/R2 writes',
    }, null, 2) + '\n',
  );
}

test('EVD staging: authenticated QA reads the selected day without writes', async ({ page }) => {
  test.setTimeout(120_000);
  const email = String(process.env.FRMS_QA_EMAIL || '').trim();
  const password = String(process.env.FRMS_QA_PASSWORD || '');
  if (email !== 'qa-frms-ux@staging.airtrust.invalid' || !password) {
    throw new Error('FRMS_EVD_SCOPED_QA_CREDENTIAL_MISSING');
  }

  let authCompanies: AuthCompaniesPayload | null = null;
  const loginResponses: number[] = [];
  const loginAborted: string[] = [];
  const postLoginMutations: Array<{ method: string; path: string }> = [];
  const serverFailures: string[] = [];
  let authenticated = false;

  page.on('response', async (response) => {
    const url = new URL(response.url());
    if (url.hostname !== API_HOST) return;
    if (response.status() >= 500) serverFailures.push(`HTTP_${response.status()}:${url.pathname}`);
    if (url.pathname === '/api/auth/empresas' && response.request().method() === 'GET') {
      try {
        authCompanies = await response.json() as AuthCompaniesPayload;
      } catch {
        authCompanies = null;
      }
    }
    if (url.pathname === '/api/auth/login' && response.request().method() === 'POST') {
      loginResponses.push(response.status());
    }
  });
  page.on('requestfailed', (request) => {
    const url = new URL(request.url());
    if (url.hostname === API_HOST && url.pathname === '/api/auth/login' &&
        request.method() === 'POST' && request.failure()?.errorText === 'net::ERR_ABORTED') {
      loginAborted.push('ABORTED');
    }
  });

  // A real staging login is permitted before the EVD read phase. As soon as
  // the authenticated route/profile is ready, every non-safe HTTP method is
  // recorded and blocked, including auth refresh/logout POSTs.
  const blockedRequests: Array<{ method: string; path: string; reason: string }> = [];
  page.route('**/*', async (route) => {
    const request = route.request();
    const method = request.method().toUpperCase();
    const url = request.url();
    const pathName = apiPath(url) || (() => {
      try {
        return new URL(url).pathname;
      } catch {
        return '<unparseable-url>';
      }
    })();

    if (authenticated && !SAFE_METHODS.includes(method)) {
      const entry = { method, path: pathName, reason: 'post-auth-read-only-phase' };
      postLoginMutations.push({ method, path: pathName });
      blockedRequests.push(entry);
      await route.abort('blockedbyclient');
      return;
    }

    const decision = classifyRequest({ method, url });
    if (decision.decision === 'allow') {
      await route.continue();
    } else {
      if (decision.decision === 'block') {
        blockedRequests.push({ method, path: pathName, reason: decision.reason });
      }
      await route.abort('blockedbyclient');
    }
  });

  const loginPage = async () => {
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
    await expect(page.locator('#airtrust-boot-fallback')).toHaveCount(0);
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(password);
    await page.getByRole('button', { name: /entrar|sign in/i }).click();
  };

  const finishRealLogin = async (timeoutMs: number): Promise<boolean> => {
    const ready = await page.waitForFunction(() =>
      !window.location.pathname.startsWith('/login') ||
      Array.from(document.querySelectorAll('button')).some((button) =>
        /^Entrar como (Administrador(?: Geral| da Empresa)?|Gestor)/i.test(
          (button.textContent || '').trim(),
        ),
      ),
    undefined, { timeout: timeoutMs }).then(() => true).catch(() => false);
    if (!ready) return false;
    if (!new URL(page.url()).pathname.startsWith('/login')) return true;

    const managerOrAdmin = page.getByRole('button', {
      name: /entrar como (administrador(?: geral| da empresa)?|gestor)/i,
    }).first();
    if (!(await managerOrAdmin.isVisible().catch(() => false))) {
      throw new Error('FRMS_EVD_AUTHORIZED_OPERATIONAL_PROFILE_NOT_PRESENT');
    }
    await managerOrAdmin.click();
    return page.waitForURL((url) => !url.pathname.startsWith('/login'), {
      timeout: timeoutMs,
    }).then(() => true).catch(() => false);
  };

  await loginPage();
  let loggedIn = await finishRealLogin(20_000);
  if (!loggedIn && loginAborted.length > 0 && loginResponses.length === 0 && blockedRequests.length === 0) {
    // Retry only a browser-aborted login with no server response; never retry a
    // request that could have authenticated successfully.
    await loginPage();
    loggedIn = await finishRealLogin(25_000);
  }
  if (!loggedIn || !loginResponses.includes(200)) {
    throw new Error(
      'FRMS_EVD_REAL_LOGIN_INCOMPLETE:responses=' + (loginResponses.join(',') || 'none') +
      ';aborted=' + loginAborted.length,
    );
  }

  authenticated = true;
  await expect.poll(() => authCompanies?.data?.empresaAtualId ?? null, { timeout: 20_000 })
    .toBe(QA_TENANT_ID);
  expect(authCompanies?.success).toBe(true);
  expect(authCompanies?.data?.empresas?.map((company) => company.id)).toContain(QA_TENANT_ID);

  const companySelector = page.locator('select').filter({
    has: page.locator(`option[value="${QA_TENANT_ID}"]`),
  }).first();
  if (await companySelector.count()) {
    await expect(companySelector).toHaveValue(String(QA_TENANT_ID));
  }

  const evdResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.hostname === API_HOST && url.pathname === '/api/evd' &&
      response.request().method() === 'GET';
  }, { timeout: 45_000 });
  const publicationResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.hostname === API_HOST && url.pathname === '/api/evd/publicacoes' &&
      response.request().method() === 'GET';
  }, { timeout: 45_000 });

  await page.goto(`${BASE}/escalas/diaria`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#airtrust-boot-fallback')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Escala Diária de Voo', exact: true }))
    .toBeVisible({ timeout: 30_000 });

  const selectedDate = await page.locator('input[type="date"]').inputValue();
  expect(selectedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

  const [evdResponse, publicationResponse] = await Promise.all([
    evdResponsePromise,
    publicationResponsePromise,
  ]);
  expect(new URL(evdResponse.url()).searchParams.get('data')).toBe(selectedDate);
  expect(new URL(publicationResponse.url()).searchParams.get('data')).toBe(selectedDate);
  expect(evdResponse.status(), 'EVD deve responder dentro da sessão real').toBe(200);
  expect(publicationResponse.status(), 'Publicações EVD devem responder dentro da sessão real').toBe(200);
  const evdPayload = await evdResponse.json() as EVDPayload;
  const publicationPayload = await publicationResponse.json() as EVDPayload;
  expect(evdPayload.success).toBe(true);
  expect(publicationPayload.success).toBe(true);
  if (!Array.isArray(evdPayload.data)) {
    throw new Error('FRMS_EVD_DATA_ARRAY_MISSING');
  }
  if (!Array.isArray(publicationPayload.data)) {
    throw new Error('FRMS_EVD_PUBLICATIONS_ARRAY_MISSING');
  }
  const assignments = evdPayload.data;
  const publications = publicationPayload.data;
  expect(assignments.every((row) => Number(row.empresa_id) === QA_TENANT_ID)).toBe(true);
  expect(publications.every((row) => Number(row.empresa_id) === QA_TENANT_ID)).toBe(true);

  const daySection = page.locator('#evd-escala-dia');
  await expect(daySection).toBeVisible();
  await expect(daySection.getByRole('heading', { name: /^Escala do dia/ })).toBeVisible();
  await expect(daySection.getByText(`${assignments.length} ${assignments.length === 1 ? 'designação' : 'designações'}`, { exact: true }))
    .toBeVisible({ timeout: 30_000 });

  if (assignments.length === 0) {
    await expect(daySection.getByText(`Nenhuma aeronave escalada para ${formatDateBR(selectedDate)}`, { exact: true }))
      .toBeVisible();
  } else {
    await expect(daySection.locator('tbody tr')).toHaveCount(assignments.length);
  }

  const publicationHeading = page.getByRole('heading', { name: /^Histórico de publicações/ });
  await expect(publicationHeading).toBeVisible();
  const publicationSection = publicationHeading.locator('xpath=../..');
  if (publications.length === 0) {
    await expect(publicationSection.getByText('Nenhuma publicação diária registrada para esta data.', { exact: true }))
      .toBeVisible({ timeout: 30_000 });
  } else {
    const latestPublication = publications[0];
    expect(latestPublication.revisao).toEqual(expect.any(Number));
    expect(typeof latestPublication.status).toBe('string');
    await expect(publicationSection.getByText(`Última revisão: R${latestPublication.revisao}`, { exact: true }))
      .toBeVisible({ timeout: 30_000 });
    await expect(publicationSection.getByText(`R${latestPublication.revisao}`, { exact: true }).first())
      .toBeVisible();
    await expect(publicationSection.getByText(latestPublication.status!, { exact: true }).first())
      .toBeVisible();
  }

  // Capture into memory before the final guards, so no browser await can
  // create a window between those guards and publishing the evidence.
  const sanitizedScreenshot = await daySection.screenshot({
    animations: 'disabled',
    // Keep the day, count and explicit empty state visible while preventing
    // published crew names and operational notes from entering the artifact.
    style: '#evd-escala-dia tbody { visibility: hidden !important; }',
  });

  expect(serverFailures, 'Erros 5xx durante leitura EVD').toEqual([]);
  expect(postLoginMutations, 'Nenhum método mutável pode sair após autenticação e validação do tenant')
    .toEqual([]);
  expect(blockedRequests, 'Nenhuma chamada fora da allowlist deve ocorrer')
    .toEqual([]);

  // No browser await occurs after the final guard. A failed assertion leaves
  // neither screenshot nor PASS summary on disk.
  const outputDirectory = process.env.RUNNER_TEMP || test.info().outputDir;
  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.writeFileSync(path.join(outputDirectory, 'frms-evd-readonly.png'), sanitizedScreenshot);
  saveSanitizedEvidence({
    date: selectedDate,
    assignments: assignments.length,
    publications: publications.length,
    evdStatus: evdResponse.status(),
    publicationStatus: publicationResponse.status(),
    mutationRequestsAfterLogin: postLoginMutations.length,
  });
  console.log(
    `FRMS_EVD_READONLY_QA_END; tenant=${QA_TENANT_ID}; date=${selectedDate}; ` +
    `assignments=${assignments.length}; publications=${publications.length}; ` +
    'mutation_requests_after_login=0; d1_r2_writes=none',
  );
});

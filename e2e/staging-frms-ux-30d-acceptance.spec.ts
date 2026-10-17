import { expect, test, type Page } from '@playwright/test';
import { installReadOnlyGuard } from './lib/read-only-network-guard.mjs';

// Exclusive 30-day synthetic FRMS tenant already installed through the governed
// staging workflow. This test does not provision, mutate or impersonate a user.
const QA_TENANT_ID = '999013';
const BASE = 'https://staging.airtrust.pages.dev';
const API_HOST = 'airtrust-api-staging.airtrust.workers.dev';
const DAY = '2026-10-13';

test.use({ storageState: { cookies: [], origins: [] } });

async function captureMain(page: Page, name: string, heading: string) {
  // The static boot fallback is itself a <main>. Never accept it as an
  // operational page or use mere URL presence as evidence of rendering.
  await expect(page.locator('#airtrust-boot-fallback')).toHaveCount(0);
  const title = page.getByRole('heading', { name: heading, exact: true }).first();
  await expect(title).toBeVisible({ timeout: 30_000 });
  const main = page.locator('main').filter({ has: title }).first();
  await expect(main).toBeVisible();
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
    // CSS/legacy cache recovery can navigate the login document as it boots.
    // Wait for a stable public login before the real credential POST; never
    // forge tokens or retry a potentially successful FRMS data submission.
    await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
    await expect(page.locator('#airtrust-boot-fallback')).toHaveCount(0);
    await expect(page.locator('input[type="email"]')).toBeVisible();
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
       /^Entrar como (Administrador(?: Geral| da Empresa)?|Gestor)/i.test(
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
  await expect(page.getByText('Carregando prioridades e evidências.')).toHaveCount(0, { timeout: 30_000 });
  await captureMain(page, '01-operacao-frms-qa', 'Operação');

  // A green UI test that accepts "Nenhum caso" cannot prove case management.
  // Require the four QA fixture cases to be returned by the REAL authenticated
  // tenant-scoped endpoint; capture the actual UI even if the contract fails.
  const casesRequest = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.hostname === API_HOST && url.pathname === '/api/frms/alertas' &&
      url.searchParams.get('resolvido') === 'false' &&
      response.request().method() === 'GET';
  }, { timeout: 45_000 });
  await page.getByRole('link', { name: 'Casos', exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === '/frms/alertas');
  const casesResponse = await casesRequest;
  expect(casesResponse.status(), 'Casos deve carregar com sessão QA real').toBe(200);
  const casesPayload = await casesResponse.json() as {
    success?: boolean;
    total?: number;
    data?: Array<{
      id: string;
      nome_tripulante?: string | null;
      jornada_id?: string | null;
      data_jornada?: string | null;
      resolvido?: number;
    }>;
  };
  expect(casesPayload.success).toBe(true);
  // A loader that has not mounted yet also has count 0. Require terminal state.
  const casesSettled = page.getByText('Nenhum caso neste filtro', { exact: true })
    .or(page.locator('main article').first());
  await expect(casesSettled).toBeVisible({ timeout: 45_000 });
  await expect(page.locator('[aria-label="Carregando casos"]')).toHaveCount(0);
  await expect(page.getByText('Não foi possível atualizar os casos.')).toHaveCount(0);
  await captureMain(page, '02-casos-frms-qa', 'Casos');

  const expectedCaseIds = [1, 2, 3, 4].map((n) => 'qa-frms-ux-case-' + n).sort();
  expect(casesPayload.total, 'FRMS_QA_CASES_NOT_VISIBLE: seed antigo nao prova ciclo de casos')
    .toBe(expectedCaseIds.length);
  expect((casesPayload.data ?? []).map((row) => row.id).sort()).toEqual(expectedCaseIds);
  expect(casesPayload.data?.every((row) =>
    row.nome_tripulante?.startsWith('QA Tripulante ') &&
    row.jornada_id?.startsWith('qa-frms-ux-j-') &&
    Boolean(row.data_jornada?.match(/^2026-\d\d-\d\d$/)) &&
    row.resolvido === 0,
  )).toBe(true);
  await expect(page.locator('main article')).toHaveCount(expectedCaseIds.length);
  await expect(page.getByText('Nenhum caso neste filtro', { exact: true })).toHaveCount(0);

  // Exercise the real action affordance without sending any PUT or changing
  // treatment/acknowledgement. A full lifecycle needs separate governed QA writes.
  const firstCase = page.locator('main article').first();
  await expect(firstCase.getByText('QA SINTETICO: revisar contexto e registrar providencia')).toBeVisible();
  await firstCase.getByRole('button', { name: 'Registrar tratamento' }).click();
  const treatmentDialog = page.getByRole('dialog');
  await expect(treatmentDialog.getByRole('heading', { name: 'Registrar medida sem encerrar o caso' })).toBeVisible();
  for (const field of ['Responsável pelo tratamento', 'Prazo', 'Medida de mitigação', 'Justificativa da decisão']) {
    await expect(treatmentDialog.getByText(field, { exact: true })).toBeVisible();
  }
  await expect(treatmentDialog.getByRole('button', { name: 'Registrar sem encerrar' })).toBeDisabled();
  await test.info().attach('02b-frms-caso-tratamento-dry-run', {
    body: await treatmentDialog.screenshot({ animations: 'disabled' }),
    contentType: 'image/png',
  });
  await treatmentDialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(treatmentDialog).toHaveCount(0);
  test.info().annotations.push({
    type: 'coverage-gap',
    description: 'Fluxo do caso foi inspecionado sem writes; tratamento, eficácia e encerramento precisam de QA de mutação governado.',
  });

  // Management of maintenance personnel requires an explicit backend grant.
  // The synthetic flight-operations account may have no such grant; never
  // label an Operation fallback screenshot as Maintenance acceptance.
  const maintenanceLink = page.getByRole('navigation', { name: 'Áreas FRMS' })
    .getByRole('link', { name: 'Manutenção', exact: true });
  if (await maintenanceLink.count()) {
    await maintenanceLink.click();
    await expect(page).toHaveURL(/area=manutencao/);
    await captureMain(page, '03-manutencao-frms-qa', 'Fadiga da Manutenção');
  } else {
    test.info().annotations.push({
      type: 'coverage-gap',
      description: 'Manutenção exige identidade de QA com can_manage_maintenance=true; fora do escopo deste teste',
    });
    console.log('FRMS_QA_MAINTENANCE_NOT_AUTHORIZED; no positive maintenance coverage claimed');
  }

  // Use real navigation, then verify a full reload of the Reports deep link.
  // Both paths must render Reports rather than the static boot-failure page.
  await page.getByRole('link', { name: 'Administração', exact: true }).click();
  await page.getByRole('navigation', { name: 'Administração FRMS' })
    .getByRole('link', { name: 'Relatórios', exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === '/frms/relatorios');
  // The prior assertion 'loading count === 0' raced before the first API
  // request. Only accept a rendered report table or a definitive empty state.
  const reportsSettled = page.getByText('Nenhum dado encontrado para o recorte deste relatório', { exact: true })
    .or(page.locator('main table').first());
  await expect(reportsSettled).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText('Não foi possível gerar este relatório')).toHaveCount(0);
  await captureMain(page, '04-relatorios-frms-qa', 'Relatórios FRMS');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(reportsSettled).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText('Não foi possível gerar este relatório')).toHaveCount(0);
  await captureMain(page, '05-relatorios-deeplink-frms-qa', 'Relatórios FRMS');

  expect(failures, 'Erros 5xx no escopo QA autenticado').toEqual([]);
  guard.assertClean();
  console.log('FRMS_UX_30D_SYNTHETIC_BROWSER_QA_PASS; tenant=999013; routes=operacao,casos_com_4_casos_e_modal_readonly,relatorios; maintenance_conditional=true; case_lifecycle_write_coverage=false; production_writes=none');
});

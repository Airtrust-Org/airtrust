import { expect, test, type Page, type Response as PlaywrightResponse } from '@playwright/test';
import { assertProductionFrontendShaFromPage } from '../lib/production-live-sha-guard.mjs';
import { installProductionReadOnlyGuard } from '../lib/production-read-only-network-guard.mjs';

const EXPECTED_SHA = String(process.env.EXPECTED_PRODUCTION_SHA || '')
  .trim()
  .toLowerCase();
const EMAIL = String(process.env.E2E_EMAIL || '').trim();
const PASSWORD = String(process.env.E2E_PASSWORD || '');
const PROD_API_BASE_URL = String(process.env.PROD_API_BASE_URL || 'https://api.airtrust.online').replace(/\/+$/, '');

function waitApi(page: Page, path: string, query?: (url: URL) => boolean): Promise<PlaywrightResponse> {
  return page.waitForResponse(
    (response) => {
      if (response.request().method() !== 'GET') return false;
      try {
        const url = new URL(response.url());
        return url.pathname === path && (!query || query(url));
      } catch {
        return false;
      }
    },
    { timeout: 45_000 },
  );
}

async function payload(response: PlaywrightResponse) {
  expect(response.ok(), `${response.url()} HTTP ${response.status()}`).toBeTruthy();
  const json = await response.json();
  expect(json?.success).toBe(true);
  return json;
}

function expectCount(value: unknown, name: string) {
  expect(Number.isInteger(value), `${name} must be integer`).toBeTruthy();
  expect(Number(value), `${name} must be >= 0`).toBeGreaterThanOrEqual(0);
}

function assertSummary(data: any) {
  for (const key of [
    'pessoas',
    'pessoas_sem_configuracao',
    'setores_sem_matriz',
    'cargos_sem_matriz',
    'matriculas_sem_requisito',
    'requisitos_obrigatorios',
    'conformes',
    'vencendo',
    'vencidos',
    'nao_realizados',
    'em_andamento',
  ]) {
    expectCount(data[key], key);
  }
  expect(data.pessoas_sem_configuracao).toBeLessThanOrEqual(data.pessoas);
  expect(data.vencendo).toBeLessThanOrEqual(data.conformes);
  expect(data.requisitos_obrigatorios).toBe(
    data.conformes + data.vencidos + data.nao_realizados + data.em_andamento,
  );
  if (data.requisitos_obrigatorios > 0) {
    expect(data.compliance_pct).toBeCloseTo(
      Math.round((data.conformes / data.requisitos_obrigatorios) * 1000) / 10,
      5,
    );
  } else {
    expect(data.compliance_pct).toBeNull();
  }
  expect(Array.isArray(data.setores)).toBe(true);
  const sectorPeople = data.setores.reduce(
    (sum: number, row: any) => sum + Number(row.pessoas || 0),
    0,
  );
  expect(sectorPeople).toBe(data.pessoas);
}

async function login(page: Page) {
  expect(EXPECTED_SHA).toMatch(/^[0-9a-f]{40}$/);
  expect(EMAIL).not.toBe('');
  expect(PASSWORD).not.toBe('');
  expect(EMAIL).not.toMatch(/staging\.airtrust\.invalid$/i);

  // This smoke validates Compliance, not the public login form. Bootstrap the
  // authenticated browser session through the canonical production auth API so
  // transient UI/profile-chooser timing cannot mask the actual Compliance result.
  // The read-only network guard still observes the browser fetches and permits
  // only the authentication POST plus read-only requests.
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await assertProductionFrontendShaFromPage(page, EXPECTED_SHA.slice(0, 7), 'production-login');

  const authResult = await page.evaluate(
    async ({ apiBase, email, password }) => {
      const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
      type LoginPayload = {
        success?: boolean;
        code?: unknown;
        data?: { accessToken?: unknown; refreshToken?: unknown; user?: unknown };
      };
      let loginResponse: Response | null = null;
      let loginJson: LoginPayload | null = null;

      for (let attempt = 1; attempt <= 5; attempt += 1) {
        try {
          loginResponse = await fetch(`${apiBase}/api/auth/login`, {
            method: 'POST',
            headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, senha: password }),
          });
        } catch (error) {
          if (attempt === 5) throw error;
          await wait(Math.min(1000 * 2 ** (attempt - 1), 8000));
          continue;
        }
        loginJson = (await loginResponse.json().catch(() => null)) as LoginPayload | null;
        if (loginResponse.status !== 429) break;
        const retryAfterSeconds = Number(loginResponse.headers.get('retry-after') || 0);
        const delayMs = retryAfterSeconds > 0
          ? retryAfterSeconds * 1000
          : Math.min(1000 * 2 ** (attempt - 1), 8000);
        await wait(delayMs);
      }

      const accessToken = String(loginJson?.data?.accessToken || '');
      const refreshToken = String(loginJson?.data?.refreshToken || '');
      const user = loginJson?.data?.user;
      if (
        !loginResponse ||
        loginResponse.status !== 200 ||
        loginJson?.success !== true ||
        accessToken.length < 20 ||
        !user ||
        typeof user !== 'object'
      ) {
        return {
          ok: false,
          stage: 'login',
          status: loginResponse?.status ?? 0,
          code: String(loginJson?.code || ''),
        };
      }

      const profilesResponse = await fetch(
        `${apiBase}/api/me/operational-access/session-profiles`,
        {
          method: 'GET',
          headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
        },
      );
      const profilesJson = await profilesResponse.json().catch(() => null);
      if (profilesResponse.status !== 200 || profilesJson?.success !== true) {
        return {
          ok: false,
          stage: 'session-profiles',
          status: profilesResponse.status,
          code: String(profilesJson?.code || ''),
        };
      }

      localStorage.setItem('airtrust_persist_login_policy', '2');
      localStorage.setItem('airtrust_persist_login', '1');
      localStorage.setItem('airtrust_token', accessToken);
      localStorage.setItem('airtrust_user', JSON.stringify(user));
      if (refreshToken) {
        localStorage.setItem('airtrust_refresh_token', refreshToken);
      }
      sessionStorage.removeItem('airtrust_token');
      sessionStorage.removeItem('airtrust_user');
      sessionStorage.removeItem('airtrust_refresh_token');
      document.cookie = 'airtrust_session_role=; Max-Age=0; Path=/; SameSite=Lax';
      document.cookie = 'airtrust_session_role=; Max-Age=0; Path=/; Domain=.airtrust.online; SameSite=Lax';

      return {
        ok: true,
        stage: 'ready',
        status: profilesResponse.status,
        profileCount: Array.isArray(profilesJson?.data?.roles) ? profilesJson.data.roles.length : -1,
      };
    },
    { apiBase: PROD_API_BASE_URL, email: EMAIL, password: PASSWORD },
  );

  expect(
    authResult.ok,
    `production auth bootstrap failed at ${authResult.stage} (HTTP ${authResult.status}${authResult.code ? `, ${authResult.code}` : ''})`,
  ).toBe(true);

}

test('production intelligent training compliance UI and APIs are coherent and read-only', async ({ page }) => {
  const guard = installProductionReadOnlyGuard(page);
  await login(page);

  // Observe the first authenticated Compliance mount. A second reload can race
  // with the app's auth/session navigation and abort the document before these
  // canonical read-only requests settle.
  const capabilitiesP = waitApi(page, '/api/compliance-treinamentos/capabilities');
  const catalogsP = waitApi(page, '/api/compliance-treinamentos/catalogos');
  const summaryP = waitApi(page, '/api/compliance-treinamentos/resumo');
  const pendingsP = waitApi(page, '/api/compliance-treinamentos/pendencias');
  await page.goto('/treinamentos/compliance', { waitUntil: 'domcontentloaded' });
  await page.waitForURL((url) => url.pathname === '/treinamentos/compliance', { timeout: 45_000 });
  await expect(page).toHaveURL(/\/treinamentos\/compliance$/);
  await assertProductionFrontendShaFromPage(
    page,
    EXPECTED_SHA.slice(0, 7),
    'production-compliance',
  );

  const [capabilities, catalogs, summary, pendings] = await Promise.all([
    capabilitiesP.then(payload),
    catalogsP.then(payload),
    summaryP.then(payload),
    pendingsP.then(payload),
  ]);
  await expect(page.getByRole('heading', { name: 'Compliance de Treinamentos' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Filtrar por setor' })).toContainText('Todos os setores');
  await expect(page.getByRole('combobox', { name: 'Filtrar por função' })).toContainText('Todas as funções');
  await expect(page.getByRole('heading', { name: 'Central de pendências' })).toBeVisible();
  expect(capabilities.data.schema_ready).toBe(true);
  expect(capabilities.data.reconciliation_ready).toBe(true);
  expect(capabilities.data.scopes).toEqual(
    expect.arrayContaining(['EMPRESA', 'SETOR', 'FUNCAO', 'SETOR_FUNCAO', 'FUNCIONARIO']),
  );
  expect(['all', 'restricted']).toContain(catalogs.data.access_mode);
  expect(Array.isArray(catalogs.data.setores)).toBe(true);
  expect(Array.isArray(catalogs.data.funcoes)).toBe(true);
  expect(Array.isArray(catalogs.data.setor_funcoes)).toBe(true);
  assertSummary(summary.data);
  expect(Array.isArray(pendings.data)).toBe(true);
  for (const row of pendings.data) {
    expect(['VENCIDO', 'NAO_REALIZADO', 'VENCENDO', 'EM_ANDAMENTO']).toContain(
      row.status_compliance,
    );
    expectCount(row.avisos_enviados, 'pending.avisos_enviados');
    expect(typeof row.tem_email).toBe('boolean');
    expect(typeof row.tem_whatsapp).toBe('boolean');
  }

  const trainingsP = waitApi(page, '/api/compliance-treinamentos/treinamentos');
  await page.getByRole('main').getByRole('button', { name: 'Treinamentos', exact: true }).click();
  const trainings = await trainingsP.then(payload);
  expect(Array.isArray(trainings.data)).toBe(true);
  for (const row of trainings.data) {
    for (const key of [
      'pessoas',
      'conformes',
      'vencendo',
      'vencidos',
      'nao_realizados',
      'em_andamento',
    ]) {
      expectCount(row[key], `training.${key}`);
    }
    expect(row.vencendo).toBeLessThanOrEqual(row.conformes);
    expect(row.pessoas).toBe(row.conformes + row.vencidos + row.nao_realizados + row.em_andamento);
    expect(row.compliance_pct).toBeCloseTo(
      row.pessoas > 0 ? Math.round((row.conformes / row.pessoas) * 1000) / 10 : 100,
      5,
    );
  }

  if (catalogs.data.setores.length > 0) {
    const sector = catalogs.data.setores[0];
    const filteredSummaryP = waitApi(
      page,
      '/api/compliance-treinamentos/resumo',
      (url) => url.searchParams.get('setor_id') === String(sector.id),
    );
    const filteredTrainingsP = waitApi(
      page,
      '/api/compliance-treinamentos/treinamentos',
      (url) => url.searchParams.get('setor_id') === String(sector.id),
    );
    await page.getByRole('combobox', { name: 'Filtrar por setor' }).selectOption(String(sector.id));
    const [filteredSummary, filteredTrainings] = await Promise.all([
      filteredSummaryP.then(payload),
      filteredTrainingsP.then(payload),
    ]);
    assertSummary(filteredSummary.data);
    expect(filteredSummary.data.pessoas).toBeLessThanOrEqual(summary.data.pessoas);
    expect(Array.isArray(filteredTrainings.data)).toBe(true);
    await page.getByRole('combobox', { name: 'Filtrar por setor' }).selectOption('');
  }

  const statusCandidates = [
    ['Nunca fez', 'NAO_REALIZADO', summary.data.nao_realizados],
    ['Vencidos', 'VENCIDO', summary.data.vencidos],
    ['Em andamento', 'EM_ANDAMENTO', summary.data.em_andamento],
    ['Vencendo', 'VENCENDO', summary.data.vencendo],
  ] as const;
  const drill = statusCandidates.find(([, , count]) => count > 0);
  if (drill) {
    // Summary status cards now open the requirement drilldown instead of the people tab.
    // Validate the current UI contract and its read-only API rather than a stale /pessoas request.
    const requirementsP = waitApi(
      page,
      '/api/compliance-treinamentos/requisitos-aplicaveis',
      (url) => url.searchParams.get('status') === drill[1],
    );
    await page.getByRole('button', { name: new RegExp(`${drill[0]}$`, 'i') }).click();
    const requirements = await requirementsP.then(payload);
    expect(Array.isArray(requirements.data)).toBe(true);
    expect(requirements.data.length).toBeGreaterThan(0);
    expectCount(requirements.meta?.pessoas ?? -1, 'requirements.meta.pessoas');
    expectCount(requirements.meta?.requisitos_distintos ?? -1, 'requirements.meta.requisitos_distintos');
    expectCount(requirements.meta?.obrigacoes_individuais ?? -1, 'requirements.meta.obrigacoes_individuais');
    const dialog = page.getByRole('dialog', { name: new RegExp(`${drill[0]}.*visão geral`, 'i') });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Detalhamento do número', { exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: 'Fechar', exact: true }).click();
    await expect(dialog).toBeHidden();
  }

  // Exercise the Pessoas tab independently from the status-card requirement drilldown.
  const peopleP = waitApi(page, '/api/compliance-treinamentos/pessoas');
  await page.getByRole('button', { name: 'Pessoas', exact: true }).click();
  const people = await peopleP.then(payload);
  expect(Array.isArray(people.data)).toBe(true);
  await expect(page.getByRole('columnheader', { name: 'Pessoa' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Setor / cargo' })).toBeVisible();

  const sectorsP = waitApi(page, '/api/compliance-treinamentos/setores');
  await page.getByRole('button', { name: 'Setores', exact: true }).click();
  const sectors = await sectorsP.then(payload);
  expect(Array.isArray(sectors.data)).toBe(true);
  for (const sector of sectors.data) {
    expectCount(sector.pessoas, 'sector.pessoas');
    expectCount(sector.requisitos_obrigatorios, 'sector.requisitos_obrigatorios');
    expect(Array.isArray(sector.cargos)).toBe(true);
  }

  const trendP = waitApi(page, '/api/compliance-treinamentos/tendencias');
  await page.getByRole('button', { name: 'Relatórios', exact: true }).click();
  const trend = await trendP.then(payload);
  expect(Array.isArray(trend.data)).toBe(true);
  expect(trend.data.length).toBeGreaterThan(0);
  const currentTrend = trend.data.at(-1);
  expect(currentTrend?.snapshot_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expectCount(currentTrend?.pessoas ?? -1, 'trend.pessoas');
  expectCount(currentTrend?.requisitos_obrigatorios ?? -1, 'trend.requisitos_obrigatorios');
  await expect(page.getByRole('heading', { name: 'Evolução do compliance — 90 dias' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Relatório inteligente' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Exportar PDF' })).toBeVisible();

  const communicationsP = waitApi(page, '/api/compliance-treinamentos/comunicacoes');
  await page.getByRole('button', { name: 'Comunicações', exact: true }).click();
  const communications = await communicationsP.then(payload);
  expect(Array.isArray(communications.data)).toBe(true);
  await expect(page.getByRole('heading', { name: 'Histórico de comunicações' })).toBeVisible();

  await page.getByRole('button', { name: 'Administração', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Por organização', exact: true })).toBeVisible();
  await expect(page.getByText('Matriz por organização', { exact: true })).toBeVisible();

  const reconciliationP = waitApi(page, '/api/compliance-treinamentos/reconciliacao');
  await page.getByRole('button', { name: 'Matrículas', exact: true }).click();
  const reconciliation = await reconciliationP.then(payload);
  for (const key of [
    'matriculas_ativas',
    'matriculas_alinhadas',
    'gaps_matricula_acionaveis',
    'matriculados_sem_requisito',
    'nao_aplica_matriculados',
  ]) {
    expectCount(reconciliation.data.resumo[key], `reconciliation.${key}`);
  }
  expect(Array.isArray(reconciliation.data.gaps_matricula)).toBe(true);
  expect(Array.isArray(reconciliation.data.matriculas_revisao)).toBe(true);

  await page.getByRole('button', { name: 'Por organização', exact: true }).click();
  const orgSector = page.getByLabel('Setor', { exact: true });
  const orgSectorIds = await orgSector
    .locator('option')
    .evaluateAll((options) =>
      options.map((option) => (option as HTMLOptionElement).value).filter(Boolean),
    );
  if (orgSectorIds.length > 0) {
    const orgMatrixP = waitApi(
      page,
      '/api/compliance-treinamentos/matriz-organizacao',
      (url) => url.searchParams.get('setor_id') === orgSectorIds[0],
    );
    await orgSector.selectOption(orgSectorIds[0]);
    const orgMatrix = await orgMatrixP.then(payload);
    expect(Array.isArray(orgMatrix.data)).toBe(true);
    if (orgMatrix.data.length > 0) {
      expect(Number.isInteger(orgMatrix.data[0].impacto?.pessoas)).toBe(true);
      expect(Number.isInteger(orgMatrix.data[0].impacto?.atingidas_neste_nivel)).toBe(true);
      expect(orgMatrix.data[0].impacto.atingidas_neste_nivel).toBeLessThanOrEqual(
        orgMatrix.data[0].impacto.pessoas,
      );
      await expect(page.getByRole('columnheader', { name: 'Impacto' })).toBeVisible();
    }
  }

  await page.getByRole('button', { name: 'Automação', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Alertas automáticos centralizados' })).toBeVisible();
  await expect(page.getByText(/usam exclusivamente a régua de qualificações/i)).toBeVisible();
  await expect(page.getByText(/processamento diário às 05:00/i)).toBeVisible();

  await page.getByRole('button', { name: 'Por treinamento', exact: true }).click();
  const trainingSelector = page
    .getByText('Treinamento / modelo de qualificação', { exact: true })
    .locator('..')
    .locator('select');
  await expect(trainingSelector).toBeVisible();
  const selectableTipoIds = await trainingSelector
    .locator('option')
    .evaluateAll((options) =>
      options.map((option) => (option as HTMLOptionElement).value).filter(Boolean),
    );
  expect(selectableTipoIds.length).toBeGreaterThan(0);
  const selectedTipoId = selectableTipoIds[0];
  const rulesP = waitApi(
    page,
    '/api/compliance-treinamentos/regras',
    (url) => url.searchParams.get('qualificacao_tipo_id') === selectedTipoId,
  );
  await trainingSelector.selectOption(selectedTipoId);
  const rules = await rulesP.then(payload);
  expect(Array.isArray(rules.data)).toBe(true);

  guard.assertClean();
});

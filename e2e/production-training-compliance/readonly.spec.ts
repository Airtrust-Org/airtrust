import { expect, test, type Page, type Response } from '@playwright/test';
import { assertProductionFrontendShaFromPage } from '../lib/production-live-sha-guard.mjs';
import { installProductionReadOnlyGuard } from '../lib/production-read-only-network-guard.mjs';

const EXPECTED_SHA = String(process.env.EXPECTED_PRODUCTION_SHA || '')
  .trim()
  .toLowerCase();
const EMAIL = String(process.env.E2E_EMAIL || '').trim();
const PASSWORD = String(process.env.E2E_PASSWORD || '');

function waitApi(page: Page, path: string, query?: (url: URL) => boolean): Promise<Response> {
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

async function payload(response: Response) {
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
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await assertProductionFrontendShaFromPage(page, EXPECTED_SHA.slice(0, 7), 'production-login');
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: /entrar|sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 45_000 });
  await expect(page).not.toHaveURL(/\/login/);
}

test('production intelligent training compliance UI and APIs are coherent and read-only', async ({ page }) => {
  const guard = installProductionReadOnlyGuard(page);
  await login(page);

  const capabilitiesP = waitApi(page, '/api/compliance-treinamentos/capabilities');
  const catalogsP = waitApi(page, '/api/compliance-treinamentos/catalogos');
  const summaryP = waitApi(page, '/api/compliance-treinamentos/resumo');
  const pendingsP = waitApi(page, '/api/compliance-treinamentos/pendencias');
  await page.goto('/treinamentos/compliance', { waitUntil: 'domcontentloaded' });
  await assertProductionFrontendShaFromPage(
    page,
    EXPECTED_SHA.slice(0, 7),
    'production-compliance',
  );
  await expect(page.getByRole('heading', { name: 'Compliance de Treinamentos' })).toBeVisible();
  await expect(page.getByRole('combobox').first()).toContainText('Todos os setores');
  await expect(page.getByRole('combobox').nth(1)).toContainText('Todos os cargos');
  await expect(page.getByRole('heading', { name: 'Central de pendências' })).toBeVisible();

  const [capabilities, catalogs, summary, pendings] = await Promise.all([
    capabilitiesP.then(payload),
    catalogsP.then(payload),
    summaryP.then(payload),
    pendingsP.then(payload),
  ]);
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
    await page.getByRole('combobox').first().selectOption(String(sector.id));
    const [filteredSummary, filteredTrainings] = await Promise.all([
      filteredSummaryP.then(payload),
      filteredTrainingsP.then(payload),
    ]);
    assertSummary(filteredSummary.data);
    expect(filteredSummary.data.pessoas).toBeLessThanOrEqual(summary.data.pessoas);
    expect(Array.isArray(filteredTrainings.data)).toBe(true);
    await page.getByRole('combobox').first().selectOption('');
  }

  const statusCandidates = [
    ['Nunca fez', 'NAO_REALIZADO', summary.data.nao_realizados],
    ['Vencidos', 'VENCIDO', summary.data.vencidos],
    ['Em andamento', 'EM_ANDAMENTO', summary.data.em_andamento],
    ['Vencendo', 'VENCENDO', summary.data.vencendo],
  ] as const;
  const drill = statusCandidates.find(([, , count]) => count > 0);
  if (drill) {
    const peopleP = waitApi(
      page,
      '/api/compliance-treinamentos/pessoas',
      (url) => url.searchParams.get('status') === drill[1],
    );
    await page.getByRole('button', { name: new RegExp(`^${drill[0]}`, 'i') }).click();
    const people = await peopleP.then(payload);
    expect(Array.isArray(people.data)).toBe(true);
    expect(people.data.length).toBeGreaterThan(0);
    await expect(page.getByRole('columnheader', { name: 'Pessoa' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Setor / cargo' })).toBeVisible();
  } else {
    await page.getByRole('button', { name: 'Pessoas', exact: true }).click();
    await expect(page.getByRole('columnheader', { name: 'Pessoa' })).toBeVisible();
  }

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

  const policyP = waitApi(page, '/api/compliance-treinamentos/configuracao-alertas');
  await page.getByRole('button', { name: 'Automação', exact: true }).click();
  const policy = await policyP.then(payload);
  expect(typeof policy.data.enabled).toBe('boolean');
  expect(Array.isArray(policy.data.due_day_thresholds)).toBe(true);
  expect(Array.isArray(policy.data.manager_overdue_thresholds)).toBe(true);
  await expect(page.getByRole('heading', { name: 'Régua automática de cobrança' })).toBeVisible();

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

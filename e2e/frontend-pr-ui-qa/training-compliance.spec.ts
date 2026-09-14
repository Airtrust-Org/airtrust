import { expect, test, type Page, type Response } from '@playwright/test';
import { installReadOnlyGuard } from '../lib/read-only-network-guard.mjs';
import { assertLiveFrontendShaFromPage } from '../lib/live-sha-guard.mjs';

const SHORT_SHA = String(process.env.RELEASE_SHA || '')
  .trim()
  .toLowerCase()
  .slice(0, 7);
const QA_CODE = String(process.env.QA_COMPLIANCE_CODE || '').trim();

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

test('training compliance canonical staging flow is live and read-only', async ({ page }) => {
  expect(QA_CODE).toMatch(/^QA-COMP-/);
  const guard = installReadOnlyGuard(page);
  const capabilitiesP = waitApi(page, '/api/compliance-treinamentos/capabilities');
  const catalogsP = waitApi(page, '/api/compliance-treinamentos/catalogos');
  const summaryP = waitApi(page, '/api/compliance-treinamentos/resumo');
  const trainingsP = waitApi(page, '/api/compliance-treinamentos/treinamentos');

  await page.goto('/treinamentos/compliance', { waitUntil: 'domcontentloaded' });
  if (SHORT_SHA) await assertLiveFrontendShaFromPage(page, SHORT_SHA, 'training-compliance');
  await expect(page.getByRole('heading', { name: 'Compliance de Treinamentos' })).toBeVisible();
  await expect(page.getByRole('combobox').first()).toContainText('Todos os setores');
  await expect(page.getByRole('combobox').nth(1)).toContainText('Todos os cargos');

  const [capabilities, catalogs, summary, trainings] = await Promise.all([
    capabilitiesP.then(payload),
    catalogsP.then(payload),
    summaryP.then(payload),
    trainingsP.then(payload),
  ]);
  expect(capabilities.data.schema_ready).toBe(true);
  expect(capabilities.data.scopes).toEqual(
    expect.arrayContaining(['EMPRESA', 'SETOR', 'FUNCAO', 'SETOR_FUNCAO', 'FUNCIONARIO']),
  );
  expect(catalogs.data.access_mode).toBe('all');
  expect(Array.isArray(catalogs.data.setores)).toBe(true);
  expect(Array.isArray(catalogs.data.funcoes)).toBe(true);

  const s = summary.data;
  expect(s.requisitos_obrigatorios).toBe(
    s.conformes + s.vencidos + s.nao_realizados + s.em_andamento,
  );
  if (s.requisitos_obrigatorios > 0)
    expect(s.compliance_pct).toBeCloseTo(
      Math.round((s.conformes / s.requisitos_obrigatorios) * 1000) / 10,
      5,
    );
  else expect(s.compliance_pct).toBeNull();

  const qaTraining = trainings.data.find((row: any) => row.qualificacao_tipo_codigo === QA_CODE);
  expect(qaTraining, 'synthetic never-realized training must be visible').toBeTruthy();
  expect(qaTraining.pessoas).toBeGreaterThan(0);
  expect(qaTraining.nao_realizados).toBe(qaTraining.pessoas);
  expect(qaTraining.conformes).toBe(0);
  expect(qaTraining.vencendo).toBe(0);
  expect(qaTraining.vencidos).toBe(0);
  expect(qaTraining.em_andamento).toBe(0);
  expect(qaTraining.compliance_pct).toBe(0);

  const row = page.locator('tbody tr').filter({ hasText: QA_CODE }).first();
  await expect(row).toBeVisible();
  const peopleP = waitApi(
    page,
    '/api/compliance-treinamentos/pessoas',
    (url) =>
      url.searchParams.get('qualificacao_tipo_id') === String(qaTraining.qualificacao_tipo_id) &&
      url.searchParams.get('status') === 'NAO_REALIZADO',
  );
  await row.locator('td').nth(5).getByRole('button').click();
  const people = await peopleP.then(payload);
  expect(people.data.length).toBe(qaTraining.pessoas);
  await expect(page.getByText(/Pessoas.*NAO REALIZADO/i)).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Pessoa' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Cargo' })).toBeVisible();

  guard.assertClean();
});

import { readFileSync, statSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { assertLiveFrontendShaFromPage } from '../lib/live-sha-guard.mjs';
import { classifyRequest, installReadOnlyGuard } from '../lib/read-only-network-guard.mjs';

type QaState = {
  draft_id: string;
  class_name: string;
  workflow_status: 'PLANEJADO' | 'REPLANEJAR';
  qa_marker: string;
  runtime_draft_id: string;
  runtime_class_name: string;
  runtime_suggested_date: string;
  runtime_start_time: string;
  runtime_end_time: string;
  runtime_instructor_id: number;
  runtime_simulator_id: number;
};

function statusLabel(value: QaState['workflow_status']) {
  if (value === 'PLANEJADO') return 'Planejamento definido com CAE';
  return 'Requer ajuste após CAE';
}

function installSyntheticPlanningWriteGuard(
  page: Parameters<typeof installReadOnlyGuard>[0],
  draftId: string,
) {
  const violations: Array<{ method: string; url: string; reason: string }> = [];
  const allowed = new Set([
    'POST /api/simuladores/planejamento-v2/confirmar-horarios',
    `PUT /api/simuladores/planejamento-v2/rascunhos/${draftId}`,
    `POST /api/simuladores/planejamento-v2/rascunhos/${draftId}/materializar`,
  ]);
  page.route('**/*', async (route) => {
    const request = route.request();
    const method = request.method().toUpperCase();
    const url = request.url();
    const classified = classifyRequest({ method, url });
    if (classified.decision === 'allow') {
      await route.continue();
      return;
    }
    if (classified.decision === 'suppress') {
      await route.abort('blockedbyclient');
      return;
    }
    let key = '';
    let host = '';
    try {
      const parsed = new URL(url);
      host = parsed.hostname.toLowerCase();
      key = `${method} ${parsed.pathname.replace(/\/+$/, '') || '/'}`;
    } catch {
      // classifyRequest already marks this as blocked.
    }
    const stagingHost =
      host === 'staging.airtrust.pages.dev' || host === 'airtrust-api-staging.airtrust.workers.dev';
    if (stagingHost && allowed.has(key)) {
      await route.continue();
      return;
    }
    violations.push({ method, url, reason: classified.reason });
    await route.abort('blockedbyclient');
  });
  return {
    assertClean() {
      if (violations.length) {
        throw new Error(
          `SYNTHETIC_PLANNING_GUARD_VIOLATION: ${violations.map((v) => `${v.method} ${v.url} (${v.reason})`).join(' | ')}`,
        );
      }
    },
  };
}

test('simulator planning: resume persisted CAE workflow and export PDF', async ({ page }) => {
  const statePath =
    process.env.QA_SIMULATOR_STATE_PATH || 'qa-state/staging-simulator-planning/state.json';
  const state = JSON.parse(readFileSync(statePath, 'utf8')) as QaState;

  expect(state.draft_id.length).toBeGreaterThan(20);
  expect(state.class_name).toMatch(/^QA Planning Persistence /);
  expect(state.qa_marker).toBe('QA_SIMULATOR_PLANNING_SMOKE');

  const guard = installReadOnlyGuard(page);

  await page.goto('/simuladores?tab=planejamento', { waitUntil: 'domcontentloaded' });
  const releaseShortSha = String(process.env.RELEASE_SHA || '').slice(0, 7);
  if (releaseShortSha) {
    await assertLiveFrontendShaFromPage(page, releaseShortSha, 'simulator-planning');
  }

  await expect(page.getByRole('heading', { name: 'Planejamentos em andamento' })).toBeVisible();

  const draftCard = page.getByRole('button').filter({ hasText: state.class_name }).first();
  await expect(draftCard).toBeVisible();
  await draftCard.click();

  await expect(
    page.getByText(statusLabel(state.workflow_status), { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText('1 ajuste(s) manual(is)', { exact: true })).toBeVisible();
  await expect(
    page.getByText('Arquivo: qa-cae-disponibilidade.pdf', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(state.class_name, { exact: true }).last()).toBeVisible();

  // Exercise the exact live interactions that previously failed in production.
  const choosePairButton = page.getByRole('button', { name: 'Escolher dupla disponível' }).first();
  await expect(choosePairButton).toBeVisible();
  await choosePairButton.click();
  const crewDialog = page.getByRole('dialog', { name: /Escolher dupla para/ });
  await expect(crewDialog).toBeVisible();
  await expect(crewDialog).not.toContainText('Sessão informada não corresponde');
  await crewDialog.getByRole('button', { name: 'Fechar troca' }).click();
  await expect(crewDialog).toBeHidden();

  const swapSessionButton = page.getByRole('button', { name: 'Trocar sessão' }).first();
  await expect(swapSessionButton).toBeVisible();
  await swapSessionButton.click();
  const sessionDialog = page.getByRole('dialog', { name: /Trocar sessão de/ });
  await expect(sessionDialog).toBeVisible();
  await expect(sessionDialog).not.toContainText('Sessão informada não corresponde');
  await sessionDialog.getByRole('button', { name: 'Fechar troca de sessão' }).click();
  await expect(sessionDialog).toBeHidden();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Gerar PDF' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^planejamento-simulador-\d{4}-\d{2}-\d{2}\.pdf$/);
  const downloadedPath = await download.path();
  expect(downloadedPath).toBeTruthy();
  expect(statSync(downloadedPath as string).size).toBeGreaterThan(500);

  guard.assertClean();
});

test.describe('stateful simulator materialization', () => {
  // This test creates a real synthetic calendar session. Never retry the same fixture
  // inside one workflow attempt; cleanup/reseed provides the safe retry boundary.
  test.describe.configure({ retries: 0 });

  test('simulator planning: confirm CAI and materialize synthetic plan in real UI', async ({
    page,
  }) => {
    const statePath =
      process.env.QA_SIMULATOR_STATE_PATH || 'qa-state/staging-simulator-planning/state.json';
    const state = JSON.parse(readFileSync(statePath, 'utf8')) as QaState;
    expect(state.runtime_draft_id.length).toBeGreaterThan(20);
    expect(state.runtime_class_name).toMatch(/^QA Planning CAI Runtime /);

    const guard = installSyntheticPlanningWriteGuard(page, state.runtime_draft_id);
    await page.goto('/simuladores?tab=planejamento', { waitUntil: 'domcontentloaded' });
    const releaseShortSha = String(process.env.RELEASE_SHA || '').slice(0, 7);
    if (releaseShortSha) {
      await assertLiveFrontendShaFromPage(page, releaseShortSha, 'simulator-planning-runtime');
    }

    const runtimeCard = page
      .getByRole('button')
      .filter({ hasText: state.runtime_class_name })
      .first();
    await expect(runtimeCard).toBeVisible();
    await runtimeCard.click();

    await expect(
      page.getByText('2. Disponibilidade CAE e datas sugeridas', { exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel('SK76 início 1')).toBeVisible();
    await expect(page.getByLabel('SK76 início 2')).toBeVisible();
    const addPeriod = page.getByRole('button', { name: '+ Adicionar período' }).last();
    await addPeriod.click();
    await expect(page.getByLabel('SK76 início 3')).toBeVisible();
    const thirdRow = page.getByLabel('SK76 início 3').locator('..');
    await thirdRow.getByRole('button', { name: 'Remover' }).click();
    await expect(page.getByLabel('SK76 início 3')).toHaveCount(0);

    await expect(
      page.getByText('3. Confirmação CAE — datas e horários', { exact: true }),
    ).toBeVisible();
    const dateInput = page.locator('input[aria-label^="Data "]').first();
    const startInput = page.locator('input[aria-label^="Início "]').first();
    const endInput = page.locator('input[aria-label^="Fim "]').first();
    await expect(dateInput).toHaveValue(state.runtime_suggested_date);
    await startInput.fill(state.runtime_start_time);
    await endInput.fill(state.runtime_end_time);
    await page.getByRole('button', { name: 'Aplicar horários confirmados' }).click();
    await expect(
      page.getByText('Planejamento definido com CAE', { exact: true }).first(),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Preparar agendamento em lote' }).click();
    const instructor = page.getByLabel('Instrutor');
    await expect(instructor).toBeVisible();
    await instructor.selectOption(String(state.runtime_instructor_id));
    const simulator = page.getByLabel('Simulador AW139');
    await expect(simulator).toBeVisible();
    await simulator.selectOption(String(state.runtime_simulator_id));

    await page.getByRole('button', { name: 'Criar todas as sessões no calendário' }).click();
    await expect(
      page
        .getByText('Todas as sessões confirmadas foram criadas no calendário.', { exact: true })
        .first(),
    ).toBeVisible({ timeout: 10_000 });
    guard.assertClean();
  });
});

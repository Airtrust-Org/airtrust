import { readFileSync, statSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { assertLiveFrontendShaFromPage } from '../lib/live-sha-guard.mjs';
import { installReadOnlyGuard } from '../lib/read-only-network-guard.mjs';

type QaState = {
  draft_id: string;
  class_name: string;
  workflow_status: 'PLANEJADO' | 'REPLANEJAR';
  qa_marker: string;
};

function statusLabel(value: QaState['workflow_status']) {
  if (value === 'PLANEJADO') return 'Planejamento definido com CAE';
  return 'Requer ajuste após CAE';
}

test('simulator planning: resume persisted CAE workflow and export PDF', async ({ page }) => {
  const statePath =
    process.env.QA_SIMULATOR_STATE_PATH ||
    'test-results/staging-simulator-planning/state.json';
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

  await expect(page.getByText(statusLabel(state.workflow_status), { exact: true }).first()).toBeVisible();
  await expect(page.getByText('1 ajuste(s) manual(is)', { exact: true })).toBeVisible();
  await expect(page.getByText('Arquivo: qa-cae-disponibilidade.pdf', { exact: true })).toBeVisible();
  await expect(page.getByText(state.class_name, { exact: true }).last()).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Gerar PDF' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^planejamento-simulador-\d{4}-\d{2}-\d{2}\.pdf$/);
  const downloadedPath = await download.path();
  expect(downloadedPath).toBeTruthy();
  expect(statSync(downloadedPath as string).size).toBeGreaterThan(500);

  guard.assertClean();
});

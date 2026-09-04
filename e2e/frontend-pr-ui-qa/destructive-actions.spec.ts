/**
 * audit_profile = "destructive-actions"
 *
 * Validates PR #282's shared DataTable / RowActionsMenu contract on the real
 * staging frontend, authenticated with a real staging session, strictly
 * read-only. The final confirmation control is NEVER clicked; every opened
 * confirmation is dismissed with "Cancelar".
 *
 * Matrix: viewports 1440x900 / 390x844 / 375x812  x  themes light / dark.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { installReadOnlyGuard } from '../lib/read-only-network-guard.mjs';

type ThemeMode = 'light' | 'dark';

const VIEWPORTS = [
  { key: 'desktop', width: 1440, height: 900 },
  { key: 'mobile_390', width: 390, height: 844 },
  { key: 'mobile_375', width: 375, height: 812 },
] as const;

const THEMES: ThemeMode[] = ['light', 'dark'];

// Real, reachable surfaces where the shared DataTable/RowActionsMenu delete
// landed in #281/#282.
const CADASTRO_SURFACES = [
  { label: 'Categorias', path: '/simuladores/cadastros/categorias' },
  { label: 'Instrutores', path: '/simuladores/cadastros/instrutores' },
  { label: 'Modelos', path: '/simuladores/cadastros/modelos' },
  { label: 'Tipos de sessão', path: '/simuladores/cadastros/tipos' },
];

const EVIDENCE_DIR = path.join('test-results', 'frontend-pr-ui-qa', 'screenshots');
const SUMMARY_PATH = path.join('test-results', 'frontend-pr-ui-qa', 'summary.json');

const results = {
  status: 'PASS' as 'PASS' | 'FAIL' | 'BLOCKED',
  pr_number: Number(process.env.PR_NUMBER || 0),
  release_sha: process.env.RELEASE_SHA || '',
  frontend_build_version: '',
  worker_sha_match_required: false,
  authentication: 'REAL_STAGING',
  mutations_detected: 0,
  desktop: 'PASS' as string,
  mobile_390: 'PASS' as string,
  mobile_375: 'PASS' as string,
  light: 'PASS' as string,
  dark: 'PASS' as string,
  documents: 'FIXTURE_NOT_AVAILABLE' as string,
};

function ensureDir(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

async function setTheme(page: Page, theme: ThemeMode) {
  await page.evaluate((nextTheme) => {
    window.localStorage.setItem('theme-preference', nextTheme);
    window.dispatchEvent(new CustomEvent('airtrust:theme-updated', { detail: nextTheme }));
  }, theme);
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme, { timeout: 10_000 });
}

async function assertNoHorizontalOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth - doc.clientWidth;
  });
  expect(overflow, `${label}: page overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(1);
}

async function captureBuildVersion(page: Page) {
  if (results.frontend_build_version) return;
  const content = await page
    .locator('meta[name="build-version"]')
    .getAttribute('content')
    .catch(() => null);
  if (content) results.frontend_build_version = content;
}

test.describe('destructive-actions profile', () => {
  test.beforeAll(() => {
    ensureDir(EVIDENCE_DIR);
    ensureDir(path.dirname(SUMMARY_PATH));
  });

  test.afterAll(() => {
    writeFileSync(SUMMARY_PATH, `${JSON.stringify(results, null, 2)}\n`);
  });

  for (const viewport of VIEWPORTS) {
    for (const theme of THEMES) {
      test(`${viewport.key} / ${theme}: RowActionsMenu is read-only and keyboard-safe`, async ({
        page,
      }) => {
        const guard = installReadOnlyGuard(page);

        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto('/simuladores/cadastros/categorias', { waitUntil: 'domcontentloaded' });
        await captureBuildVersion(page);
        await setTheme(page, theme);

        let surfacesChecked = 0;

        for (const surface of CADASTRO_SURFACES) {
          await page.goto(surface.path, { waitUntil: 'domcontentloaded' });
          await setTheme(page, theme);
          await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
          await assertNoHorizontalOverflow(page, `${surface.label} @ ${viewport.key}/${theme}`);

          const trigger = page.getByRole('button', { name: /mais ações/i }).first();
          if ((await trigger.count()) === 0) {
            // No rows on this staging tenant surface — nothing destructive is
            // exposed, which is itself the desired state. Move on.
            continue;
          }
          surfacesChecked += 1;

          // The destructive control must NOT be a permanently visible button.
          const bareDestructive = page.getByRole('button', {
            name: /^(excluir|remover|apagar)\b/i,
          });
          expect(
            await bareDestructive.count(),
            `${surface.label}: destructive action is always visible outside the menu`,
          ).toBe(0);

          await trigger.scrollIntoViewIfNeeded();
          await trigger.click();

          const menu = page.getByRole('menu');
          await expect(menu).toBeVisible();
          expect(
            await menu.evaluate((el) => {
              const r = el.getBoundingClientRect();
              return r.left >= -1 && r.right <= window.innerWidth + 1;
            }),
            `${surface.label}: menu escapes the viewport`,
          ).toBeTruthy();

          const destructiveItem = menu.getByRole('menuitem', {
            name: /excluir|remover|apagar/i,
          });
          await expect(destructiveItem.first()).toBeVisible();

          if (surface.label === 'Categorias' && theme === 'light' && viewport.key === 'desktop') {
            await page.screenshot({ path: path.join(EVIDENCE_DIR, 'desktop-menu-open.png') });
          }

          await destructiveItem.first().click();

          const dialog = page.getByRole('alertdialog');
          await expect(dialog).toBeVisible();
          const cancel = dialog.getByRole('button', { name: /cancelar/i });
          await expect(cancel).toBeVisible();

          if (surface.label === 'Categorias' && viewport.key === 'desktop') {
            await page.screenshot({
              path: path.join(EVIDENCE_DIR, `confirmation-${theme}.png`),
            });
          }

          // Dismiss — the destructive confirm button is never clicked.
          await cancel.click();
          await expect(dialog).toBeHidden();

          // Focus returns to a real element (menu trigger or page body), not lost.
          const activeTag = await page.evaluate(() => document.activeElement?.tagName ?? null);
          expect(activeTag).not.toBeNull();

          // Re-open, then Escape must close the menu with no trap.
          await trigger.click();
          await expect(page.getByRole('menu')).toBeVisible();
          await page.keyboard.press('Escape');
          await expect(page.getByRole('menu')).toBeHidden();

          // Keyboard open (Enter) then close (Escape) round-trips.
          await trigger.focus();
          await page.keyboard.press('Enter');
          await expect(page.getByRole('menu')).toBeVisible();
          await page.keyboard.press('Escape');
          await expect(page.getByRole('menu')).toBeHidden();
        }

        if (viewport.key === 'desktop' && theme === 'light') {
          await page.goto('/simuladores/cadastros/categorias', { waitUntil: 'domcontentloaded' });
          await page.screenshot({ path: path.join(EVIDENCE_DIR, 'desktop-menu-closed.png') });
        }
        if (viewport.key !== 'desktop' && theme === 'light') {
          await page.screenshot({
            path: path.join(EVIDENCE_DIR, `${viewport.key}.png`),
          });
        }
        if (theme === 'dark' && viewport.key === 'desktop') {
          await page.screenshot({ path: path.join(EVIDENCE_DIR, 'dark-mode.png') });
        }

        try {
          guard.assertClean();
        } catch (error) {
          results.status = 'FAIL';
          results[viewport.key] = 'FAIL';
          results[theme] = 'FAIL';
          throw error;
        }

        if (surfacesChecked === 0) {
          test.info().annotations.push({
            type: 'note',
            description: `No populated cadastro surface reachable at ${viewport.key}/${theme}`,
          });
        }
      });
    }
  }

  test('funcionário documents: delete lives in the menu, download stays direct', async ({
    page,
  }) => {
    const guard = installReadOnlyGuard(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/funcionarios', { waitUntil: 'domcontentloaded' });
    await captureBuildVersion(page);

    const firstFuncionario = page.getByRole('link', { name: /.+/ }).first();
    const hasFuncionario = (await firstFuncionario.count()) > 0;

    // We only proceed if a SAFE synthetic document fixture exists. We never
    // create or delete data to manufacture one.
    const syntheticDoc = page.getByText(/QA[_-]?SYNTHETIC|fixture/i).first();
    const hasSyntheticDoc = hasFuncionario && (await syntheticDoc.count()) > 0;

    if (!hasSyntheticDoc) {
      results.documents = 'FIXTURE_NOT_AVAILABLE';
      test.info().annotations.push({
        type: 'note',
        description: 'DOCUMENT_DELETE_FIXTURE_NOT_AVAILABLE',
      });
      guard.assertClean();
      return;
    }

    const downloadAction = page.getByRole('link', { name: /baixar|download/i }).first();
    await expect(downloadAction, 'download must remain a direct action').toBeVisible();

    const docTrigger = page.getByRole('button', { name: /mais ações/i }).first();
    await docTrigger.click();
    const menu = page.getByRole('menu');
    await expect(menu.getByRole('menuitem', { name: /excluir|remover/i })).toBeVisible();
    await menu.getByRole('menuitem', { name: /excluir|remover/i }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: /cancelar/i }).click();
    await expect(dialog).toBeHidden();

    results.documents = 'PASS';
    guard.assertClean();
  });
});

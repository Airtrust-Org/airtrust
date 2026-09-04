/**
 * audit_profile = "destructive-actions"  —  scoped to the REAL delta of PR #282.
 *
 * PR #282 changes these runtime files:
 *   - src/react-app/components/UI/DataTable.tsx      (shared DataTable + RowActionsMenu wiring)
 *   - src/react-app/components/UI/RowActionsMenu.tsx (the menu primitive)
 *   - src/react-app/pages/funcionarios/ListaDocumentos.tsx (RowActionsMenu on document rows)
 * Its remaining changed files are component/unit-test support, not further
 * browser runtime surfaces.
 *
 * Independent inventory of the #282 tree (see PR description):
 *   - The shared UI/DataTable has NO active runtime consumer passing `onDelete`
 *     (Qualificacoes.tsx imports a different DataTable).
 *     => recorded as DATATABLE_RUNTIME_NOT_APPLICABLE_NO_ACTIVE_CONSUMER,
 *        NOT counted as a tested visual surface.
 *   - RowActionsMenu's only importer is ListaDocumentos, reached from the
 *     funcionário ficha documents area. That is the one real surface to exercise.
 *
 * PER-CELL MATRIX (BLOCKER G/I): the 6 viewport/theme cells each carry their
 * OWN status in results.matrix_cells (PASS | FAIL | BLOCKED | NOT_RUN, all
 * initialized NOT_RUN). A cell writes ONLY its own key — it can never change
 * another cell's result, and one PASS cell can never mask a cell that did not
 * reach the surface. The a11y contract has its own results.a11y_status.
 * scripts/ci/frontend-pr-qa-summarize.mjs derives the global status from those.
 *
 * A cell is PASS only if, in that SAME cell: frontend SHA correct, synthetic
 * funcionário confirmed, synthetic document confirmed, RowActionsMenu exercised,
 * menu within the viewport, confirmation opened, "Cancelar" used, zero mutation,
 * zero horizontal overflow, theme applied. It is BLOCKED if the synthetic
 * funcionário / document / RowActionsMenu surface is not reachable, and FAIL on
 * a mutation, overflow, clipped menu, SHA mismatch or any layout assertion.
 *
 * PRIVACY (BLOCKER C): we NEVER open "the first funcionário". A funcionário
 * ficha is opened only when the listing row itself is an unambiguous synthetic
 * QA fixture (name matches SYNTHETIC_FIXTURE_PATTERN). If no synthetic funcionário
 * exists, we record SYNTHETIC_FUNCIONARIO_FIXTURE_NOT_AVAILABLE, take NO
 * screenshot of the listing (it contains real people), and the run is BLOCKED.
 * We never create a fixture, never touch the database, never upload.
 *
 * Strictly read-only. The destructive confirm button is NEVER clicked; every
 * confirmation is dismissed with "Cancelar". Live staging SHA is re-checked
 * after every navigation.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test, type Locator, type Page } from '@playwright/test';

import { installReadOnlyGuard } from '../lib/read-only-network-guard.mjs';
import { assertLiveFrontendShaFromPage } from '../lib/live-sha-guard.mjs';

type ThemeMode = 'light' | 'dark';

const VIEWPORTS = [
  { key: 'desktop', width: 1440, height: 900 },
  { key: 'mobile_390', width: 390, height: 844 },
  { key: 'mobile_375', width: 375, height: 812 },
] as const;

const THEMES: ThemeMode[] = ['light', 'dark'];

type CellStatus = 'PASS' | 'FAIL' | 'BLOCKED' | 'NOT_RUN';

const MATRIX_CELL_KEYS = [
  'desktop_light',
  'desktop_dark',
  'mobile_390_light',
  'mobile_390_dark',
  'mobile_375_light',
  'mobile_375_dark',
] as const;

const matrixCells: Record<string, CellStatus> = Object.fromEntries(
  MATRIX_CELL_KEYS.map((k) => [k, 'NOT_RUN' as CellStatus]),
);

const EVIDENCE_DIR = path.join('test-results', 'frontend-pr-ui-qa', 'screenshots');
const SUMMARY_PATH = path.join('test-results', 'frontend-pr-ui-qa', 'summary.json');

const RELEASE_SHORT_SHA = String(process.env.RELEASE_SHA || '')
  .toLowerCase()
  .slice(0, 7);

// A row (funcionário OR document) is only safe to exercise if it is an obvious
// synthetic QA fixture. Same unambiguous markers for both.
const SYNTHETIC_FIXTURE_PATTERN =
  /qa[_\s-]?sint|qa[_\s-]?synthetic|synthetic|fixture|sint[eé]tic|\[qa\]|\bqa[_\s-]?fixture\b/i;
const SYNTHETIC_DOC_PATTERN = SYNTHETIC_FIXTURE_PATTERN;

type ReachResult =
  | { status: 'OK'; trigger: Locator; download: Locator; fixtureName: string }
  | { status: 'SYNTHETIC_FUNCIONARIO_FIXTURE_NOT_AVAILABLE' }
  | { status: 'SYNTHETIC_DOCUMENT_NOT_AVAILABLE' };

const results: Record<string, unknown> = {
  audit_profile: 'destructive-actions',
  pr_number: Number(process.env.PR_NUMBER || 0),
  release_sha: process.env.RELEASE_SHA || '',
  authentication: 'REAL_STAGING',
  worker_sha_match_required: false,
  frontend_build_version: '',
  datatable_runtime: 'DATATABLE_RUNTIME_NOT_APPLICABLE_NO_ACTIVE_CONSUMER',
  real_surfaces_exercised: 0,
  mutations_detected: 0,
  funcionario_fixture: 'SYNTHETIC_FUNCIONARIO_FIXTURE_NOT_AVAILABLE',
  matrix_cells: matrixCells,
  a11y_status: 'NOT_RUN' as CellStatus,
};

/** Record ONLY this cell's status. Never touches another cell. */
function setCell(cellKey: string, status: CellStatus) {
  matrixCells[cellKey] = status;
}

function noteFuncionarioFixture(status: 'SYNTHETIC_FIXTURE_CONFIRMED' | 'SYNTHETIC_FUNCIONARIO_FIXTURE_NOT_AVAILABLE') {
  // Only ever upgrade to CONFIRMED; a single confirmed cell is enough to record
  // that a synthetic funcionário exists. It is informational, not a gate.
  if (status === 'SYNTHETIC_FIXTURE_CONFIRMED') results.funcionario_fixture = status;
}

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

async function captureBuildVersion(page: Page) {
  if (results.frontend_build_version) return;
  const content = await page
    .locator('meta[name="build-version"]')
    .getAttribute('content')
    .catch(() => null);
  if (content) results.frontend_build_version = content;
}

async function assertNoHorizontalOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `${label}: page overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(1);
}

async function withinViewport(locator: Locator): Promise<boolean> {
  return locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return r.left >= -1 && r.right <= window.innerWidth + 1 && r.width > 0 && r.height > 0;
  });
}

/**
 * Navigate Funcionários -> a SYNTHETIC funcionário fixture -> ficha -> documents
 * area, and return the ListaDocumentos RowActionsMenu trigger locator only when
 * a synthetic document row is really reachable at runtime on this #282-only
 * staging frontend. Never opens a non-synthetic (real) funcionário.
 */
function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function reachDocumentsRowActionsMenu(page: Page, where: string): Promise<ReachResult> {
  await page.goto('/funcionarios', { waitUntil: 'domcontentloaded' });
  if (RELEASE_SHORT_SHA)
    await assertLiveFrontendShaFromPage(page, RELEASE_SHORT_SHA, `${where}:funcionarios`);
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);

  // BLOCKER C: never click "the first funcionário". Only follow a listing row
  // whose own accessible text unambiguously marks it as a synthetic QA fixture.
  const rowLinks = page.locator(
    'main a[href*="/funcionarios/"], [role="main"] a[href*="/funcionarios/"]',
  );
  const linkCount = await rowLinks.count();
  let syntheticRow: Locator | null = null;
  for (let i = 0; i < linkCount; i += 1) {
    const link = rowLinks.nth(i);
    const label = ((await link.innerText().catch(() => '')) || '').trim();
    const aria = (await link.getAttribute('aria-label').catch(() => null)) || '';
    if (SYNTHETIC_FIXTURE_PATTERN.test(label) || SYNTHETIC_FIXTURE_PATTERN.test(aria)) {
      syntheticRow = link;
      break;
    }
  }
  if (!syntheticRow) {
    return { status: 'SYNTHETIC_FUNCIONARIO_FIXTURE_NOT_AVAILABLE' };
  }

  await syntheticRow.click();
  await page.waitForURL(/\/funcionarios\/[^/]+/, { timeout: 20_000 }).catch(() => undefined);
  if (RELEASE_SHORT_SHA)
    await assertLiveFrontendShaFromPage(page, RELEASE_SHORT_SHA, `${where}:ficha`);

  // Open the documents / pasta-360 area of the ficha.
  const docTab = page
    .getByRole('button', { name: /documentos|pasta 360|pasta virtual|pasta/i })
    .or(page.getByRole('tab', { name: /documentos|pasta 360|pasta virtual|pasta/i }))
    .or(page.getByRole('link', { name: /documentos|pasta 360|pasta virtual/i }))
    .first();
  if ((await docTab.count()) > 0) {
    await docTab.click().catch(() => undefined);
    await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
    if (RELEASE_SHORT_SHA) {
      await assertLiveFrontendShaFromPage(page, RELEASE_SHORT_SHA, `${where}:documentos`);
    }
  }

  // ListaDocumentos renders one named trigger and one named direct-download
  // control per file. Select a fixture only when both controls name the SAME
  // synthetic filename; page-wide synthetic text is not sufficient.
  const textCandidates = await page.locator('p').allTextContents();
  for (const rawName of textCandidates) {
    const fixtureName = rawName.trim();
    if (!fixtureName || !SYNTHETIC_DOC_PATTERN.test(fixtureName)) continue;

    const escapedName = escapeRegExp(fixtureName);
    const trigger = page.getByRole('button', {
      name: new RegExp(`^mais ações para ${escapedName}$`, 'i'),
    });
    const download = page.getByRole('button', {
      name: new RegExp(`^baixar ${escapedName}$`, 'i'),
    });
    if ((await trigger.count()) === 1 && (await download.count()) === 1) {
      return { status: 'OK', trigger, download, fixtureName };
    }
  }

  return { status: 'SYNTHETIC_DOCUMENT_NOT_AVAILABLE' };
}

test.describe('destructive-actions profile (PR #282 real delta)', () => {
  test.beforeAll(() => {
    ensureDir(EVIDENCE_DIR);
    ensureDir(path.dirname(SUMMARY_PATH));
  });

  test.afterAll(() => {
    writeFileSync(SUMMARY_PATH, `${JSON.stringify(results, null, 2)}\n`);
  });

  for (const viewport of VIEWPORTS) {
    for (const theme of THEMES) {
      const cellKey = `${viewport.key}_${theme}`;
      test(`${cellKey}: layout + documents reachability`, async ({ page }) => {
        const guard = installReadOnlyGuard(page);

        try {
          await page.setViewportSize({ width: viewport.width, height: viewport.height });
          await page.goto('/funcionarios', { waitUntil: 'domcontentloaded' });
          await captureBuildVersion(page);
          if (RELEASE_SHORT_SHA) {
            await assertLiveFrontendShaFromPage(page, RELEASE_SHORT_SHA, `${cellKey}:entry`);
          }
          await setTheme(page, theme);
          await assertNoHorizontalOverflow(page, `Funcionários @ ${cellKey}`);

          const reached = await reachDocumentsRowActionsMenu(page, cellKey);
          await setTheme(page, theme);
          await assertNoHorizontalOverflow(page, `Documentos @ ${cellKey}`);

          if (reached.status === 'SYNTHETIC_FUNCIONARIO_FIXTURE_NOT_AVAILABLE') {
            noteFuncionarioFixture('SYNTHETIC_FUNCIONARIO_FIXTURE_NOT_AVAILABLE');
            setCell(cellKey, 'BLOCKED');
            test.info().annotations.push({
              type: 'note',
              description: `${cellKey}: SYNTHETIC_FUNCIONARIO_FIXTURE_NOT_AVAILABLE (no synthetic funcionário in the listing; no real ficha opened, no screenshot taken, nothing created)`,
            });
          } else if (reached.status === 'SYNTHETIC_DOCUMENT_NOT_AVAILABLE') {
            noteFuncionarioFixture('SYNTHETIC_FIXTURE_CONFIRMED');
            setCell(cellKey, 'BLOCKED');
            test.info().annotations.push({
              type: 'note',
              description: `${cellKey}: DOCUMENT_DELETE_FIXTURE_NOT_AVAILABLE (synthetic funcionário opened, but no unambiguously synthetic document row; nothing created)`,
            });
          } else {
            noteFuncionarioFixture('SYNTHETIC_FIXTURE_CONFIRMED');
            await reached.trigger.scrollIntoViewIfNeeded();

            // Download is a direct, named UI control on the same synthetic row.
            // It is read-only; the guard still records and blocks any mutation.
            if (viewport.key === 'desktop' && theme === 'light') {
              const downloadResponse = page.waitForResponse(
                (response) =>
                  response.request().method() === 'GET' &&
                  /\/api\/documentos\/[^/]+\/download(?:\?|$)/.test(response.url()),
                { timeout: 20_000 },
              );
              await reached.download.click();
              expect(
                (await downloadResponse).ok(),
                `download failed for ${reached.fixtureName}`,
              ).toBe(true);
            }

            // Destructive control must NOT be a permanently visible button.
            const bareDestructive = page.getByRole('button', {
              name: /^(excluir|remover|apagar)\b/i,
            });
            expect(
              await bareDestructive.count(),
              'destructive action visible outside the menu',
            ).toBe(0);

            await reached.trigger.click();
            const menu = page.getByRole('menu');
            await expect(menu).toBeVisible();
            expect(await withinViewport(menu), 'menu escapes the viewport').toBeTruthy();

            const item = menu.getByRole('menuitem', { name: /excluir|remover|apagar/i }).first();
            await expect(item).toBeVisible();
            expect(await withinViewport(item), 'destructive item cut off').toBeTruthy();

            if (viewport.key === 'desktop' && theme === 'light') {
              await page.screenshot({ path: path.join(EVIDENCE_DIR, 'desktop-menu-open.png') });
            }

            await item.click();
            const dialog = page.getByRole('alertdialog');
            await expect(dialog).toBeVisible();
            if (viewport.key === 'desktop') {
              await page.screenshot({ path: path.join(EVIDENCE_DIR, `confirmation-${theme}.png`) });
            }
            await dialog.getByRole('button', { name: /cancelar/i }).click();
            await expect(dialog).toBeHidden();

            // Screenshots ONLY once inside a confirmed synthetic fixture.
            if (viewport.key !== 'desktop' && theme === 'light') {
              await page.screenshot({ path: path.join(EVIDENCE_DIR, `${viewport.key}.png`) });
            }
            if (viewport.key === 'desktop' && theme === 'dark') {
              await page.screenshot({ path: path.join(EVIDENCE_DIR, 'dark-mode.png') });
            }
            if (viewport.key === 'desktop' && theme === 'light') {
              await page.screenshot({ path: path.join(EVIDENCE_DIR, 'desktop-menu-closed.png') });
            }

            results.real_surfaces_exercised = (results.real_surfaces_exercised as number) + 1;
            setCell(cellKey, 'PASS');
          }

          results.mutations_detected = Math.max(
            results.mutations_detected as number,
            guard.mutationCount,
          );
          if (guard.mutationCount > 0) {
            setCell(cellKey, 'FAIL');
            throw new Error(`mutation attempted: ${guard.violations[0]?.reason}`);
          }
          guard.assertClean();
        } catch (error) {
          // Any thrown assertion / SHA mismatch / mutation in THIS cell => FAIL
          // for THIS cell only.
          if (matrixCells[cellKey] !== 'FAIL') setCell(cellKey, 'FAIL');
          results.mutations_detected = Math.max(
            results.mutations_detected as number,
            guard.mutationCount,
          );
          throw error;
        }
      });
    }
  }

  test('a11y_status: RowActionsMenu keyboard + a11y contract (mandatory gate)', async ({ page }) => {
    const guard = installReadOnlyGuard(page);
    await page.setViewportSize({ width: 1440, height: 900 });

    const reached = await reachDocumentsRowActionsMenu(page, 'a11y');
    if (reached.status !== 'OK') {
      // BLOCKER H: a skipped a11y contract is BLOCKED, never a silent pass.
      results.a11y_status = 'BLOCKED';
      test.info().annotations.push({
        type: 'note',
        description: `A11Y_CONTRACT_BLOCKED: ${reached.status}`,
      });
      guard.assertClean();
      return;
    }

    try {
      const { trigger } = reached;
      await trigger.scrollIntoViewIfNeeded();

    // Touch target — computed runtime size, not CSS class inspection.
    const box = await trigger.boundingBox();
    expect(box, 'trigger has no box').not.toBeNull();
    expect(box!.width, 'trigger width < 44').toBeGreaterThanOrEqual(44);
    expect(box!.height, 'trigger height < 44').toBeGreaterThanOrEqual(44);

    const menu = page.getByRole('menu');

    // Enter opens.
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(menu).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    expect(
      await trigger.evaluate((el) => el === document.activeElement),
      'focus did not return to the Mais ações trigger after Escape',
    ).toBeTruthy();

    // Space opens.
    await trigger.focus();
    await page.keyboard.press(' ');
    await expect(menu).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    expect(
      await trigger.evaluate((el) => el === document.activeElement),
      'focus did not return to the trigger after Space+Escape',
    ).toBeTruthy();

    // Click opens; Cancel on the confirmation returns focus, no trap.
    await trigger.click();
    await expect(menu).toBeVisible();
    await menu
      .getByRole('menuitem', { name: /excluir|remover|apagar/i })
      .first()
      .click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: /cancelar/i }).click();
    await expect(dialog).toBeHidden();
    expect(
      await trigger.evaluate((el) => el === document.activeElement),
      'focus did not return to the trigger after closing the confirmation',
    ).toBeTruthy();

      results.mutations_detected = Math.max(
        results.mutations_detected as number,
        guard.mutationCount,
      );
      if (guard.mutationCount > 0) {
        results.a11y_status = 'FAIL';
        throw new Error(`a11y mutation attempted: ${guard.violations[0]?.reason}`);
      }
      guard.assertClean();
      results.a11y_status = 'PASS';
    } catch (error) {
      if (results.a11y_status !== 'FAIL') results.a11y_status = 'FAIL';
      results.mutations_detected = Math.max(
        results.mutations_detected as number,
        guard.mutationCount,
      );
      throw error;
    }
  });
});

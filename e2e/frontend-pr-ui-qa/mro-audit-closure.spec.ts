/**
 * audit_profile = "audit-closure"
 *
 * Read-only MRO responsive regression coverage for governed staging acceptance.
 * Runs only through the trusted-main frontend PR UI QA harness. No mutations,
 * screenshots, product behavior changes, deployment, or production access.
 */
import { expect, test, type Page } from '@playwright/test';

import { installReadOnlyGuard } from '../lib/read-only-network-guard.mjs';
import { assertLiveFrontendShaFromPage } from '../lib/live-sha-guard.mjs';

const RELEASE_SHORT_SHA = String(process.env.RELEASE_SHA || '')
  .trim()
  .toLowerCase()
  .slice(0, 7);

const VIEWPORTS = [
  { key: 'mobile_390', width: 390, height: 844 },
  { key: 'mobile_375', width: 375, height: 812 },
] as const;

// Exact route set required by the 2026-09-02 MRO mobile audit closure plan.
const ROUTES = [
  { key: 'dashboard', path: '/mro' },
  { key: 'ordens_servico', path: '/mro/os' },
  { key: 'aeronaves', path: '/mro/aeronaves' },
  { key: 'vencimentos', path: '/mro/vencimentos' },
  { key: 'componentes', path: '/mro/componentes' },
  { key: 'estoque', path: '/mro/estoque' },
  { key: 'registros_tecnicos', path: '/mro/registros-tecnicos' },
] as const;

async function gotoChecked(page: Page, route: string, label: string) {
  await page.goto(route, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(200);
  if (RELEASE_SHORT_SHA) {
    await assertLiveFrontendShaFromPage(page, RELEASE_SHORT_SHA, label);
  }
  await expect(page.locator('body')).toBeVisible();
  const root = page.locator('#root');
  await expect(root).toBeVisible();
  expect((await root.textContent())?.trim().length ?? 0, `${label}: empty root`).toBeGreaterThan(0);
}

async function assertDocumentContained(page: Page, label: string) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(
    dimensions.document - dimensions.viewport,
    `${label}: document horizontal overflow`,
  ).toBeLessThanOrEqual(1);
  expect(
    dimensions.body - dimensions.viewport,
    `${label}: body horizontal overflow`,
  ).toBeLessThanOrEqual(1);
}

async function assertVisibleControlsInsideViewport(page: Page, label: string) {
  const offenders = await page.locator('button:visible, input:visible, select:visible, a:visible').evaluateAll(
    (elements) =>
      elements
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            tag: element.tagName,
            label:
              element.getAttribute('aria-label') ||
              element.getAttribute('title') ||
              (element.textContent || '').trim().slice(0, 80),
            left: rect.left,
            right: rect.right,
            width: rect.width,
          };
        })
        .filter(
          (item) =>
            item.width > 0 &&
            (item.left < -1 || item.right > window.innerWidth + 1),
        )
        .slice(0, 10),
  );
  expect(offenders, `${label}: interactive controls outside viewport`).toEqual([]);
}

test.describe('MRO responsive audit-closure regression', () => {
  for (const viewport of VIEWPORTS) {
    for (const route of ROUTES) {
      test(`${viewport.key}: ${route.key} stays contained and read-only`, async ({ page }) => {
        const guard = installReadOnlyGuard(page);
        await page.setViewportSize({ width: viewport.width, height: viewport.height });

        await gotoChecked(page, route.path, `mro:${viewport.key}:${route.key}`);
        await assertDocumentContained(page, `mro:${viewport.key}:${route.key}`);
        await assertVisibleControlsInsideViewport(page, `mro:${viewport.key}:${route.key}`);

        guard.assertClean();
        expect(guard.mutationCount, 'MRO responsive QA must remain read-only').toBe(0);
      });
    }
  }
});

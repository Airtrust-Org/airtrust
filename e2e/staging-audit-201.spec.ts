import { expect, test, type Page } from '@playwright/test';

const TECHNICAL_ERROR_PATTERN =
  /(SQLITE_ERROR|D1_ERROR|no such (?:column|table)|TypeError:|ReferenceError:|stack trace|\bat\s+[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?\s*\([^\n]*:\d+:\d+\))/i;
const STAGING_API_HOST = 'airtrust-api-staging.airtrust.workers.dev';

type ThemeMode = 'light' | 'dark';

type AuditRoute = {
  label: string;
  path: string;
};

const DESKTOP_ROUTES: AuditRoute[] = [
  { label: 'Dashboard', path: '/' },
  { label: 'Funcionários', path: '/funcionarios' },
  { label: 'Qualificações', path: '/qualificacoes' },
  { label: 'Treinamentos Planejados', path: '/treinamentos/planejados' },
  { label: 'LMS', path: '/lms/dashboard' },
  { label: 'Escalas', path: '/escalas' },
  { label: 'FRMS', path: '/frms' },
  { label: 'Simuladores', path: '/simuladores' },
  { label: 'Planejamento de Simuladores', path: '/simuladores?tab=planejamento' },
  { label: 'SGSO', path: '/sgso' },
  { label: 'MRO', path: '/mro' },
  { label: 'Controle de Voos', path: '/controle-voos' },
  { label: 'Administração', path: '/configuracoes/usuarios' },
];

const MOBILE_ROUTES: AuditRoute[] = [
  { label: 'Funcionários', path: '/funcionarios' },
  { label: 'Qualificações', path: '/qualificacoes' },
  { label: 'Treinamentos Planejados', path: '/treinamentos/planejados' },
  { label: 'FRMS', path: '/frms' },
  { label: 'Planejamento de Simuladores', path: '/simuladores?tab=planejamento' },
  { label: 'SGSO', path: '/sgso' },
  { label: 'MRO', path: '/mro' },
  { label: 'Controle de Voos', path: '/controle-voos' },
  { label: 'Administração', path: '/configuracoes/usuarios' },
];

async function setTheme(page: Page, theme: ThemeMode) {
  await page.evaluate((nextTheme) => {
    window.localStorage.setItem('theme-preference', nextTheme);
    window.dispatchEvent(new CustomEvent('airtrust:theme-updated', { detail: nextTheme }));
  }, theme);
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme, { timeout: 10_000 });
}

async function auditRoute(
  page: Page,
  route: AuditRoute,
  options: { theme: ThemeMode; mobile?: boolean },
) {
  const pageErrors: string[] = [];
  const api5xx: string[] = [];
  const onPageError = (error: Error) => pageErrors.push(error.message);
  const onResponse = (response: import('@playwright/test').Response) => {
    try {
      const url = new URL(response.url());
      if (url.hostname === STAGING_API_HOST && response.status() >= 500) {
        api5xx.push(`${response.status()} ${url.pathname}${url.search}`);
      }
    } catch {
      // Ignore non-standard response URLs from browser internals/extensions.
    }
  };

  page.on('pageerror', onPageError);
  page.on('response', onResponse);

  try {
    await page.goto(route.path, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => undefined);
    await setTheme(page, options.theme);
    await page.waitForTimeout(250);

    const expectedPath = new URL(route.path, 'https://staging.airtrust.pages.dev').pathname;
    const finalUrl = new URL(page.url());
    expect(finalUrl.pathname, `${route.label} redirected away from its canonical route`).toBe(
      expectedPath,
    );
    expect(finalUrl.pathname, `${route.label} redirected to login`).not.toMatch(/^\/login(?:\/|$)/);

    const body = page.locator('body');
    await expect(body).toBeVisible({ timeout: 20_000 });
    const visibleText = (await body.innerText()).trim();
    expect(visibleText.length, `${route.label} rendered no meaningful UI`).toBeGreaterThan(20);
    expect(visibleText, `${route.label} exposed a technical backend/runtime error`).not.toMatch(
      TECHNICAL_ERROR_PATTERN,
    );

    expect(pageErrors, `${route.label} emitted uncaught browser page errors`).toEqual([]);
    expect(api5xx, `${route.label} triggered staging API 5xx responses`).toEqual([]);

    if (options.mobile) {
      const dimensions = await page.evaluate(() => ({
        viewport: window.innerWidth,
        rootScrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth,
      }));
      expect(
        Math.max(dimensions.rootScrollWidth, dimensions.bodyScrollWidth),
        `${route.label} has horizontal overflow at 375px`,
      ).toBeLessThanOrEqual(dimensions.viewport + 2);
    }

    console.log(
      `AUDIT_201_ROUTE_PASS label=${JSON.stringify(route.label)} path=${route.path} theme=${options.theme} mobile=${Boolean(options.mobile)}`,
    );
  } finally {
    page.off('pageerror', onPageError);
    page.off('response', onResponse);
  }
}

test.describe('staging audit #201 — authenticated cross-module UI regression', () => {
  test.describe.configure({ mode: 'serial' });

  test('desktop canonical routes render safely in light and dark modes', async ({ page }) => {
    for (const theme of ['light', 'dark'] as const) {
      for (const route of DESKTOP_ROUTES) {
        await auditRoute(page, route, { theme });
      }
    }
  });

  test('representative migrated routes have no horizontal overflow at 375px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    for (const route of MOBILE_ROUTES) {
      await auditRoute(page, route, { theme: 'light', mobile: true });
    }
  });

  test('Pasta 360 opens from the canonical employee journey when staging has a fixture', async ({ page }) => {
    await auditRoute(page, { label: 'Funcionários', path: '/funcionarios' }, { theme: 'light' });

    const pastaButtons = page.getByRole('button', { name: /Pasta 360/i });
    if ((await pastaButtons.count()) === 0) {
      test.info().annotations.push({
        type: 'fixture-limitation',
        description: 'No employee row/Pasta 360 action exists in the synthetic staging tenant.',
      });
      console.log('AUDIT_201_PASTA360_NOT_EXERCISED reason=no_employee_fixture');
      return;
    }

    const pageErrors: string[] = [];
    const onPageError = (error: Error) => pageErrors.push(error.message);
    page.on('pageerror', onPageError);
    try {
      await pastaButtons.first().click();
      await page.waitForURL(/\/funcionarios\/[^/]+\/ficha\?[^#]*tab=pasta/, { timeout: 20_000 });
      await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => undefined);
      const bodyText = (await page.locator('body').innerText()).trim();
      expect(bodyText.length).toBeGreaterThan(20);
      expect(bodyText).not.toMatch(TECHNICAL_ERROR_PATTERN);
      expect(pageErrors).toEqual([]);
      console.log(`AUDIT_201_PASTA360_PASS url=${new URL(page.url()).pathname}`);
    } finally {
      page.off('pageerror', onPageError);
    }
  });
});

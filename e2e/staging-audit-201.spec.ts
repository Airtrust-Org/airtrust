import { expect, test, type Locator, type Page } from '@playwright/test';

const TECHNICAL_ERROR_PATTERN =
  /(SQLITE_ERROR|D1_ERROR|no such (?:column|table)|TypeError:|ReferenceError:|stack trace|\bat\s+[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?\s*\([^\n]*:\d+:\d+\))/i;
const RAW_INTERNAL_PATTERN =
  /\b(?:empresa_id|funcionario_id|qualificacao_tipo_id|treinamento_id|session_model_ids|materialization_strategy|TRAINING_PLAN_REQUIRED|QUALIFICACAO_TIPO|HISTORICO_QUALIFICACAO|D1_ERROR|SQLITE_ERROR)\b/;
const ROUTE_NOT_FOUND_PATTERN = /(?:\b404\b|p[aá]gina\s+n[aã]o\s+encontrada|page\s+not\s+found)/i;
const EMPTY_STATE_PATTERN =
  /(?:nenhum(?:a)?.{0,60}(?:encontrad[oa]s?|dispon[ií]vel)|nenhum(?:a)?\s+(?:registro|resultado|item|dado)|sem\s+resultados|n[aã]o\s+encontrad[oa]s?|nenhum(?:a)?\s+correspond[eê]ncia)/i;
const STAGING_API_HOST = 'airtrust-api-staging.airtrust.workers.dev';
const FRONTEND_BASE_URL = process.env.BASE_URL || 'https://staging.airtrust.pages.dev';
const NO_MATCH_TOKEN = 'audit-201-sem-correspondencia-9f4a';
const MAX_DISCOVERED_ROUTE_SHAPES = 300;
const READ_ONLY_INSPECTOR_PATTERN =
  /^(?:ver|ver detalhes|detalhes|visualizar|abrir|pasta 360|ver ficha|ver perfil|ver relat[oó]rio)$/i;
const MUTATION_LABEL_PATTERN =
  /(?:salvar|excluir|remover|apagar|criar|adicionar|novo|aprovar|reprovar|enviar|confirmar|executar|sincronizar|importar|upload|finalizar|assinar|materializar|gerar)/i;

type ThemeMode = 'light' | 'dark';

type AuditRoute = {
  label: string;
  path: string;
  allowedCanonicalPaths?: string[];
};

type RouteCandidate = AuditRoute & {
  shape: string;
};

const DESKTOP_ROUTES: AuditRoute[] = [
  { label: 'Dashboard', path: '/', allowedCanonicalPaths: ['/', '/funcionarios', '/home'] },
  { label: 'Funcionários', path: '/funcionarios' },
  { label: 'Qualificações', path: '/qualificacoes' },
  { label: 'Treinamentos Planejados', path: '/treinamentos/planejados' },
  {
    label: 'LMS',
    path: '/lms/dashboard',
    allowedCanonicalPaths: ['/lms/dashboard', '/lms/cursos'],
  },
  { label: 'Escalas', path: '/escalas' },
  { label: 'FRMS', path: '/frms' },
  { label: 'Simuladores', path: '/simuladores' },
  { label: 'Planejamento de Simuladores', path: '/simuladores?tab=planejamento' },
  { label: 'SGSO', path: '/sgso' },
  { label: 'MRO', path: '/mro' },
  { label: 'Controle de Voos', path: '/controle-voos' },
  {
    label: 'Administração',
    path: '/configuracoes/usuarios',
    allowedCanonicalPaths: ['/configuracoes/usuarios', '/configuracoes'],
  },
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
  {
    label: 'Administração',
    path: '/configuracoes/usuarios',
    allowedCanonicalPaths: ['/configuracoes/usuarios', '/configuracoes'],
  },
];

const MRO_MOBILE_ROUTES: AuditRoute[] = [
  { label: 'MRO dashboard', path: '/mro' },
  { label: 'MRO ordens de serviço', path: '/mro/os' },
  { label: 'MRO aeronaves', path: '/mro/aeronaves' },
];

const MRO_MOBILE_VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 375, height: 812 },
] as const;

async function waitForStablePage(page: Page) {
  await page.waitForLoadState('domcontentloaded');
  await expect
    .poll(
      async () => {
        const bodyText = (await page.locator('body').innerText()).trim();
        return bodyText.length > 0 && bodyText !== 'Loading...';
      },
      {
        message: 'timed out waiting for page loading state to resolve',
        timeout: 15_000,
      },
    )
    .toBe(true);
  await page.waitForLoadState('networkidle', { timeout: 3_000 }).catch(() => undefined);
  await page.waitForTimeout(150);
}

async function setTheme(page: Page, theme: ThemeMode) {
  await page.evaluate((nextTheme) => {
    window.localStorage.setItem('theme-preference', nextTheme);
    window.dispatchEvent(new CustomEvent('airtrust:theme-updated', { detail: nextTheme }));
  }, theme);
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme, { timeout: 10_000 });
}

async function assertHealthyUi(page: Page, label: string) {
  const body = page.locator('body');
  await expect(body).toBeVisible({ timeout: 20_000 });

  const visibleText = (await body.innerText()).trim();
  expect(visibleText.length, `${label} rendered no meaningful UI`).toBeGreaterThan(20);
  expect(visibleText, `${label} exposed a technical backend/runtime error`).not.toMatch(
    TECHNICAL_ERROR_PATTERN,
  );
  expect(visibleText, `${label} exposed a raw internal enum/identifier`).not.toMatch(
    RAW_INTERNAL_PATTERN,
  );
  expect(visibleText, `${label} exposed an unhandled 404/not found error`).not.toMatch(
    ROUTE_NOT_FOUND_PATTERN,
  );

  const main = page.locator('main, [role="main"]');
  expect(await main.count(), `${label} has no main landmark`).toBeGreaterThan(0);
  await expect(main.first()).toBeVisible();

  const headings = page.locator(
    'main h1, main h2, main h3, main h4, [role="main"] h1, [role="main"] h2, [role="main"] h3, [role="main"] h4, h1, h2',
  );
  await expect
    .poll(async () => headings.count(), {
      message: `${label} has no visible page heading structure`,
      timeout: 15_000,
    })
    .toBeGreaterThan(0);
}

async function withRuntimeGuards(page: Page, label: string, action: () => Promise<void>) {
  const pageErrors: string[] = [];
  const api5xx: string[] = [];
  const onPageError = (error: Error) => pageErrors.push(error.message);
  const onResponse = (response: import('@playwright/test').Response) => {
    try {
      const url = new URL(response.url());
      if (url.hostname === STAGING_API_HOST && response.status() >= 500) {
        if (response.status() === 503 && url.pathname.startsWith('/api/backup')) return;
        api5xx.push(`${response.status()} ${url.pathname}${url.search}`);
      }
    } catch {
      // Ignore non-standard browser/extension response URLs.
    }
  };

  page.on('pageerror', onPageError);
  page.on('response', onResponse);
  try {
    await action();
  } finally {
    page.off('pageerror', onPageError);
    page.off('response', onResponse);
  }

  expect(pageErrors, `${label} emitted uncaught browser page errors`).toEqual([]);
  expect(api5xx, `${label} triggered staging API 5xx responses`).toEqual([]);
}

async function auditRoute(
  page: Page,
  route: AuditRoute,
  options: { theme: ThemeMode; mobile?: boolean; strictPath?: boolean },
) {
  await withRuntimeGuards(page, route.label, async () => {
    await page.goto(route.path, { waitUntil: 'domcontentloaded' });
    await waitForStablePage(page);
    await setTheme(page, options.theme);
    await page.waitForTimeout(100);

    const expected = new URL(route.path, FRONTEND_BASE_URL);
    const finalUrl = new URL(page.url());
    expect(finalUrl.origin, `${route.label} escaped the staging frontend origin`).toBe(
      new URL(FRONTEND_BASE_URL).origin,
    );
    expect(finalUrl.pathname, `${route.label} redirected to login`).not.toMatch(/^\/login(?:\/|$)/);
    if (options.strictPath !== false) {
      const allowedPaths = route.allowedCanonicalPaths
        ? route.allowedCanonicalPaths.map((p) => new URL(p, FRONTEND_BASE_URL).pathname)
        : [expected.pathname];
      expect(
        allowedPaths.includes(finalUrl.pathname),
        `${route.label} redirected away from its canonical route (received: ${finalUrl.pathname}, expected: ${allowedPaths.join(', ')})`,
      ).toBe(true);
    }

    await assertHealthyUi(page, route.label);

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
  });

  console.log(
    `AUDIT_201_ROUTE_PASS label=${JSON.stringify(route.label)} path=${route.path} theme=${options.theme} mobile=${Boolean(options.mobile)}`,
  );
}

async function assertVisibleInteractiveControlsInsideViewport(page: Page, label: string) {
  const offenders = await page
    .locator('button:visible, input:visible, select:visible, a:visible')
    .evaluateAll((elements) =>
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

function routeShape(path: string): string {
  const url = new URL(path, FRONTEND_BASE_URL);
  const normalizedPath = url.pathname
    .split('/')
    .map((segment) => {
      if (/^\d+$/.test(segment)) return ':id';
      if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment)) return ':uuid';
      if (/^[0-9a-f]{20,}$/i.test(segment)) return ':hash';
      return segment;
    })
    .join('/');

  const kept = new URLSearchParams();
  for (const key of ['tab', 'view', 'section']) {
    const value = url.searchParams.get(key);
    if (value) kept.set(key, value);
  }
  const query = kept.toString();
  return query ? `${normalizedPath}?${query}` : normalizedPath;
}

function normalizeLinkedRoute(
  href: string,
  text: string,
  currentUrl: string,
): RouteCandidate | null {
  const url = new URL(href, currentUrl);
  const frontendOrigin = new URL(FRONTEND_BASE_URL).origin;

  if (url.origin !== frontendOrigin) return null;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/assets/')) return null;
  if (
    /^\/(?:login|logout|recuperar-senha|reset-password|acesso-negado)(?:\/|$)/i.test(url.pathname)
  ) {
    return null;
  }
  if (/\.(?:pdf|csv|xlsx?|zip|png|jpe?g|webp|svg)$/i.test(url.pathname)) return null;

  const kept = new URLSearchParams();
  for (const key of ['tab', 'view', 'section']) {
    const value = url.searchParams.get(key);
    if (value) kept.set(key, value);
  }
  const query = kept.toString();
  const path = query ? `${url.pathname}?${query}` : url.pathname;
  const cleanText = text.replace(/\s+/g, ' ').trim();

  return {
    label: cleanText || path,
    path,
    shape: routeShape(path),
  };
}

async function revealNavigationMenus(page: Page) {
  const treinamentos = page.getByRole('button', { name: /^Treinamentos$/i }).first();
  if ((await treinamentos.count()) > 0 && (await treinamentos.isVisible())) {
    await treinamentos.hover();
    await page.waitForTimeout(120);
  }

  const expandableHeaderButtons = page.locator(
    'header button[aria-haspopup="menu"], header button[aria-expanded]',
  );
  for (let i = 0; i < (await expandableHeaderButtons.count()); i += 1) {
    const button = expandableHeaderButtons.nth(i);
    if (!(await button.isVisible()) || !(await button.isEnabled())) continue;
    const name = ((await button.getAttribute('aria-label')) || (await button.innerText())).trim();
    if (MUTATION_LABEL_PATTERN.test(name) || /sair|logout/i.test(name)) continue;
    const expanded = await button.getAttribute('aria-expanded');
    if (expanded === 'false') {
      await button.click().catch(() => undefined);
      await page.waitForTimeout(80);
    }
  }
}

async function collectLinkedRoutes(page: Page): Promise<RouteCandidate[]> {
  await revealNavigationMenus(page);

  const anchors = await page.locator('a[href]').evaluateAll((nodes) =>
    nodes.map((node) => ({
      href: (node as HTMLAnchorElement).href,
      text: (node.textContent || '').trim(),
    })),
  );

  const unique = new Map<string, RouteCandidate>();
  for (const anchor of anchors) {
    const candidate = normalizeLinkedRoute(anchor.href, anchor.text, page.url());
    if (!candidate || unique.has(candidate.shape)) continue;
    unique.set(candidate.shape, candidate);
  }

  return [...unique.values()];
}

async function exerciseTabs(page: Page, label: string) {
  const tabs = page.locator('[role="tab"], button[aria-selected]');
  const count = await tabs.count();
  let exercised = 0;

  for (let i = 0; i < count; i += 1) {
    const tab = tabs.nth(i);
    if (!(await tab.isVisible()) || !(await tab.isEnabled())) continue;
    const name = ((await tab.getAttribute('aria-label')) || (await tab.innerText())).trim();
    if (MUTATION_LABEL_PATTERN.test(name)) continue;

    await withRuntimeGuards(page, `${label} tab ${name || i + 1}`, async () => {
      await tab.click();
      await waitForStablePage(page);
      await assertHealthyUi(page, `${label} tab ${name || i + 1}`);
    });
    exercised += 1;
  }

  console.log(`AUDIT_201_TABS label=${JSON.stringify(label)} exercised=${exercised}`);
}

async function exerciseSearchAndEmptyState(page: Page, label: string) {
  const searchInputs = page.locator(
    'main input[type="search"], main input[placeholder*="buscar" i], main input[placeholder*="pesquis" i], main input[aria-label*="buscar" i], main input[aria-label*="pesquis" i]',
  );
  const count = await searchInputs.count();
  let exercised = 0;

  for (let i = 0; i < count; i += 1) {
    const input = searchInputs.nth(i);
    if (!(await input.isVisible()) || !(await input.isEnabled())) continue;

    await withRuntimeGuards(page, `${label} search ${i + 1}`, async () => {
      await input.fill(NO_MATCH_TOKEN);
      await input.press('Enter').catch(() => undefined);
      await expect
        .poll(
          async () => {
            const bodyText = await page.locator('body').innerText();
            return EMPTY_STATE_PATTERN.test(bodyText);
          },
          {
            message: `${label} search does not expose a canonical empty/no-results state`,
            timeout: 20_000,
          },
        )
        .toBe(true);
      await assertHealthyUi(page, `${label} search ${i + 1}`);

      await input.fill('');
      await input.press('Enter').catch(() => undefined);
      await page.waitForTimeout(450);
    });
    exercised += 1;
  }

  console.log(`AUDIT_201_SEARCH label=${JSON.stringify(label)} exercised=${exercised}`);
}

async function exerciseFilterPanels(page: Page, label: string) {
  const buttons = page.getByRole('button', {
    name: /^(?:mais filtros|filtros|filtros avan[cç]ados)$/i,
  });
  let exercised = 0;

  for (let i = 0; i < (await buttons.count()); i += 1) {
    const button = buttons.nth(i);
    if (!(await button.isVisible()) || !(await button.isEnabled())) continue;

    await withRuntimeGuards(page, `${label} filters`, async () => {
      await button.click();
      await page.waitForTimeout(150);
      await assertHealthyUi(page, `${label} filters`);
      const expanded = await button.getAttribute('aria-expanded');
      if (expanded === 'true') {
        await button.click().catch(() => undefined);
      } else {
        await page.keyboard.press('Escape').catch(() => undefined);
      }
    });
    exercised += 1;
  }

  console.log(`AUDIT_201_FILTERS label=${JSON.stringify(label)} exercised=${exercised}`);
}

async function exercisePagination(page: Page, label: string) {
  const pagination = page.locator(
    'main nav[aria-label*="pag" i], main [role="navigation"][aria-label*="pag" i]',
  );
  let exercised = 0;

  for (let i = 0; i < (await pagination.count()); i += 1) {
    const region = pagination.nth(i);
    if (!(await region.isVisible())) continue;

    const next = region.getByRole('button', { name: /pr[oó]xim|seguinte|next/i }).first();
    const nextLink = region.getByRole('link', { name: /pr[oó]xim|seguinte|next/i }).first();
    const control = (await next.count()) > 0 && (await next.isVisible()) ? next : nextLink;

    if (
      (await control.count()) === 0 ||
      !(await control.isVisible()) ||
      !(await control.isEnabled())
    ) {
      continue;
    }

    await withRuntimeGuards(page, `${label} pagination`, async () => {
      await control.click();
      await waitForStablePage(page);
      await assertHealthyUi(page, `${label} pagination`);

      const previous = region.getByRole('button', { name: /anteri|previous|prev/i }).first();
      const previousLink = region.getByRole('link', { name: /anteri|previous|prev/i }).first();
      const back =
        (await previous.count()) > 0 && (await previous.isVisible()) ? previous : previousLink;
      if ((await back.count()) > 0 && (await back.isVisible()) && (await back.isEnabled())) {
        await back.click();
        await waitForStablePage(page);
      }
    });
    exercised += 1;
  }

  console.log(`AUDIT_201_PAGINATION label=${JSON.stringify(label)} exercised=${exercised}`);
}

async function exerciseDateNavigation(page: Page, label: string) {
  const next = page
    .getByRole('button', {
      name: /(?:pr[oó]xim[oa]\s+(?:m[eê]s|semana|dia|data)|avan[cç]ar\s+(?:m[eê]s|semana|dia|data))/i,
    })
    .first();

  if ((await next.count()) === 0 || !(await next.isVisible()) || !(await next.isEnabled())) {
    console.log(`AUDIT_201_DATE_NAV label=${JSON.stringify(label)} exercised=0`);
    return;
  }

  await withRuntimeGuards(page, `${label} date navigation`, async () => {
    await next.click();
    await waitForStablePage(page);
    await assertHealthyUi(page, `${label} date navigation`);

    const previous = page
      .getByRole('button', {
        name: /(?:(?:m[eê]s|semana|dia|data)\s+anterior|voltar\s+(?:m[eê]s|semana|dia|data))/i,
      })
      .first();
    if (
      (await previous.count()) > 0 &&
      (await previous.isVisible()) &&
      (await previous.isEnabled())
    ) {
      await previous.click();
      await waitForStablePage(page);
    }
  });

  console.log(`AUDIT_201_DATE_NAV label=${JSON.stringify(label)} exercised=1`);
}

async function exerciseReadOnlyInspector(page: Page, label: string) {
  const buttons = page.getByRole('button', { name: READ_ONLY_INSPECTOR_PATTERN });
  let target: Locator | null = null;

  for (let i = 0; i < (await buttons.count()); i += 1) {
    const button = buttons.nth(i);
    if (!(await button.isVisible()) || !(await button.isEnabled())) continue;
    const name = ((await button.getAttribute('aria-label')) || (await button.innerText())).trim();
    if (MUTATION_LABEL_PATTERN.test(name)) continue;
    target = button;
    break;
  }

  if (!target) {
    console.log(`AUDIT_201_INSPECTOR label=${JSON.stringify(label)} exercised=0`);
    return;
  }

  const originalUrl = page.url();
  const targetName = (
    (await target.getAttribute('aria-label')) || (await target.innerText())
  ).trim();

  await withRuntimeGuards(page, `${label} inspector ${targetName}`, async () => {
    await target!.click();
    await page.waitForTimeout(250);
    await assertHealthyUi(page, `${label} inspector ${targetName}`);

    const dialog = page.getByRole('dialog').first();
    if ((await dialog.count()) > 0 && (await dialog.isVisible())) {
      await expect(dialog).toBeVisible();
      await page.keyboard.press('Escape').catch(() => undefined);
      await page.waitForTimeout(100);
    }

    if (page.url() !== originalUrl) {
      await page.goto(originalUrl, { waitUntil: 'domcontentloaded' });
      await waitForStablePage(page);
    }
  });

  console.log(
    `AUDIT_201_INSPECTOR label=${JSON.stringify(label)} exercised=1 action=${JSON.stringify(targetName)}`,
  );
}

async function inspectDisabledControls(page: Page, label: string) {
  const disabled = page.locator('main button:disabled, main [aria-disabled="true"]');
  const count = await disabled.count();
  for (let i = 0; i < Math.min(count, 8); i += 1) {
    const control = disabled.nth(i);
    if (!(await control.isVisible())) continue;
    await expect(control).toBeDisabled();
  }
  console.log(`AUDIT_201_DISABLED label=${JSON.stringify(label)} count=${count}`);
}

async function exerciseReadOnlySurface(page: Page, label: string) {
  await exerciseTabs(page, label);
  await exerciseFilterPanels(page, label);
  await exerciseSearchAndEmptyState(page, label);
  await exercisePagination(page, label);
  await exerciseDateNavigation(page, label);
  await exerciseReadOnlyInspector(page, label);
  await inspectDisabledControls(page, label);
}

async function traverseAllAccessibleLinkedRoutes(page: Page) {
  const queue: AuditRoute[] = [...DESKTOP_ROUTES];
  const seenShapes = new Set(queue.map((route) => routeShape(route.path)));
  let cursor = 0;

  while (cursor < queue.length) {
    if (queue.length > MAX_DISCOVERED_ROUTE_SHAPES) {
      throw new Error(
        `AUDIT_ROUTE_CAP_EXCEEDED discovered=${queue.length} cap=${MAX_DISCOVERED_ROUTE_SHAPES}; increase the reviewed cap rather than silently skipping routes`,
      );
    }

    const route = queue[cursor];
    cursor += 1;
    const canonical = DESKTOP_ROUTES.some((item) => item.path === route.path);

    await auditRoute(page, route, {
      theme: 'light',
      strictPath: canonical,
    });
    await exerciseReadOnlySurface(page, route.label);

    const discovered = await collectLinkedRoutes(page);
    for (const candidate of discovered) {
      if (seenShapes.has(candidate.shape)) continue;
      seenShapes.add(candidate.shape);
      queue.push({ label: candidate.label, path: candidate.path });
      console.log(
        `AUDIT_201_ROUTE_DISCOVERED label=${JSON.stringify(candidate.label)} path=${candidate.path} shape=${candidate.shape}`,
      );
    }
  }

  expect(
    queue.length,
    'exhaustive route traversal discovered fewer routes than canonical seeds',
  ).toBeGreaterThanOrEqual(DESKTOP_ROUTES.length);
  test.info().annotations.push({
    type: 'audit-route-count',
    description: `Exhaustive read-only traversal covered ${queue.length} unique accessible route shapes.`,
  });
  console.log(`AUDIT_201_ROUTE_TOTAL count=${queue.length}`);
}

test.describe('staging audit #201 — authenticated cross-module UI regression', () => {
  test.describe.configure({ mode: 'serial' });

  test('desktop canonical routes render safely in light and dark modes', async ({ page }) => {
    test.setTimeout(6 * 60 * 1_000);
    for (const theme of ['light', 'dark'] as const) {
      for (const route of DESKTOP_ROUTES) {
        await auditRoute(page, route, { theme });
      }
    }
  });

  test('all accessible linked routes and read-only controls are traversed exhaustively', async ({
    page,
  }) => {
    test.setTimeout(22 * 60 * 1_000);
    await traverseAllAccessibleLinkedRoutes(page);
  });

  test('representative migrated routes have no horizontal overflow at 375px', async ({ page }) => {
    test.setTimeout(5 * 60 * 1_000);
    await page.setViewportSize({ width: 375, height: 812 });
    for (const route of MOBILE_ROUTES) {
      await auditRoute(page, route, { theme: 'light', mobile: true });
    }
  });

  test('MRO dashboard, service orders and aircraft stay contained at 390x844 and 375x812', async ({ page }) => {
    test.setTimeout(4 * 60 * 1_000);
    for (const viewport of MRO_MOBILE_VIEWPORTS) {
      await page.setViewportSize(viewport);
      for (const route of MRO_MOBILE_ROUTES) {
        const label = `${route.label} ${viewport.width}x${viewport.height}`;
        await auditRoute(page, route, { theme: 'light', mobile: true });
        await assertVisibleInteractiveControlsInsideViewport(page, label);
      }
    }
  });

  test('Pasta 360 opens from the canonical employee journey when staging has a fixture', async ({
    page,
  }) => {
    test.setTimeout(3 * 60 * 1_000);
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

    await withRuntimeGuards(page, 'Pasta 360', async () => {
      await pastaButtons.first().click();
      await page.waitForURL(/\/funcionarios\/[^/]+\/ficha\?[^#]*tab=pasta/, { timeout: 20_000 });
      await waitForStablePage(page);
      await assertHealthyUi(page, 'Pasta 360');
    });
    console.log(`AUDIT_201_PASTA360_PASS url=${new URL(page.url()).pathname}`);
  });
});
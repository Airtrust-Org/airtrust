import { expect, test, type Page } from '@playwright/test';

const FRONTEND_BASE_URL = process.env.BASE_URL || 'https://staging.airtrust.pages.dev';
const STAGING_API_HOST = 'airtrust-api-staging.airtrust.workers.dev';
const MAX_ROUTE_SHAPES = 160;
const TECHNICAL_ERROR_PATTERN =
  /(SQLITE_ERROR|D1_ERROR|no such (?:column|table)|TypeError:|ReferenceError:|stack trace|\bat\s+[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?\s*\([^\n]*:\d+:\d+\))/i;
const MUTATION_LABEL_PATTERN =
  /(?:salvar|excluir|remover|apagar|criar|adicionar|novo|aprovar|reprovar|enviar|confirmar|executar|sincronizar|importar|upload|finalizar|assinar|materializar|gerar)/i;

type RouteCandidate = {
  label: string;
  path: string;
  shape: string;
};

const SEEDS: RouteCandidate[] = [
  { label: 'Dashboard', path: '/', shape: '/' },
  { label: 'Funcionários', path: '/funcionarios', shape: '/funcionarios' },
  { label: 'Qualificações', path: '/qualificacoes', shape: '/qualificacoes' },
  { label: 'Treinamentos Planejados', path: '/treinamentos/planejados', shape: '/treinamentos/planejados' },
  { label: 'LMS', path: '/lms/dashboard', shape: '/lms/dashboard' },
  { label: 'Escalas', path: '/escalas', shape: '/escalas' },
  { label: 'FRMS', path: '/frms', shape: '/frms' },
  { label: 'Simuladores', path: '/simuladores', shape: '/simuladores' },
  { label: 'Planejamento de Simuladores', path: '/simuladores?tab=planejamento', shape: '/simuladores?tab=planejamento' },
  { label: 'SGSO', path: '/sgso', shape: '/sgso' },
  { label: 'MRO', path: '/mro', shape: '/mro' },
  { label: 'Controle de Voos', path: '/controle-voos', shape: '/controle-voos' },
  { label: 'Administração', path: '/configuracoes/usuarios', shape: '/configuracoes/usuarios' },
];

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

function normalizeLink(href: string, text: string, currentUrl: string): RouteCandidate | null {
  const url = new URL(href, currentUrl);
  const frontendOrigin = new URL(FRONTEND_BASE_URL).origin;
  if (url.origin !== frontendOrigin) return null;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/assets/')) return null;
  if (/^\/(?:login|logout|recuperar-senha|reset-password|acesso-negado)(?:\/|$)/i.test(url.pathname)) return null;
  if (/\.(?:pdf|csv|xlsx?|zip|png|jpe?g|webp|svg)$/i.test(url.pathname)) return null;

  const kept = new URLSearchParams();
  for (const key of ['tab', 'view', 'section']) {
    const value = url.searchParams.get(key);
    if (value) kept.set(key, value);
  }
  const query = kept.toString();
  const path = query ? `${url.pathname}?${query}` : url.pathname;
  return {
    label: text.replace(/\s+/g, ' ').trim() || path,
    path,
    shape: routeShape(path),
  };
}

async function waitForStablePage(page: Page) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForLoadState('networkidle', { timeout: 2_000 }).catch(() => undefined);
  await page.waitForTimeout(120);
}

async function assertHealthy(page: Page, label: string) {
  const finalUrl = new URL(page.url());
  expect(finalUrl.origin, `${label} escaped staging origin`).toBe(new URL(FRONTEND_BASE_URL).origin);
  expect(finalUrl.pathname, `${label} redirected to login`).not.toMatch(/^\/login(?:\/|$)/);
  const body = page.locator('body');
  await expect(body).toBeVisible({ timeout: 20_000 });
  const text = (await body.innerText()).trim();
  expect(text.length, `${label} rendered no meaningful UI`).toBeGreaterThan(20);
  expect(text, `${label} exposed a technical error`).not.toMatch(TECHNICAL_ERROR_PATTERN);
}

async function collectLinks(page: Page): Promise<RouteCandidate[]> {
  const anchors = await page.locator('a[href]').evaluateAll((nodes) =>
    nodes.map((node) => ({
      href: (node as HTMLAnchorElement).href,
      text: (node.textContent || '').trim(),
    })),
  );
  const unique = new Map<string, RouteCandidate>();
  for (const anchor of anchors) {
    const candidate = normalizeLink(anchor.href, anchor.text, page.url());
    if (candidate && !unique.has(candidate.shape)) unique.set(candidate.shape, candidate);
  }
  return [...unique.values()];
}

async function collectLinksAcrossTabs(page: Page, routeLabel: string): Promise<RouteCandidate[]> {
  const collected = new Map<string, RouteCandidate>();
  for (const candidate of await collectLinks(page)) collected.set(candidate.shape, candidate);

  const tabs = page.locator('[role="tab"], button[aria-selected]');
  const count = await tabs.count();
  let exercised = 0;

  for (let i = 0; i < count; i += 1) {
    const tab = tabs.nth(i);
    if (!(await tab.isVisible()) || !(await tab.isEnabled())) continue;
    const name = ((await tab.getAttribute('aria-label')) || (await tab.innerText())).trim();
    if (MUTATION_LABEL_PATTERN.test(name)) continue;

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
        // Ignore browser-internal response URLs.
      }
    };

    page.on('pageerror', onPageError);
    page.on('response', onResponse);
    try {
      await tab.click();
      await waitForStablePage(page);
      await assertHealthy(page, `${routeLabel} tab ${name || i + 1}`);
      for (const candidate of await collectLinks(page)) {
        if (!collected.has(candidate.shape)) collected.set(candidate.shape, candidate);
      }
    } finally {
      page.off('pageerror', onPageError);
      page.off('response', onResponse);
    }

    expect(pageErrors, `${routeLabel} tab ${name || i + 1} emitted page errors`).toEqual([]);
    expect(api5xx, `${routeLabel} tab ${name || i + 1} triggered staging API 5xx`).toEqual([]);
    exercised += 1;
  }

  console.log(`AUDIT_201_TAB_LINKS label=${JSON.stringify(routeLabel)} tabs=${exercised} links=${collected.size}`);
  return [...collected.values()];
}

test('audit #201 recursively discovers routes exposed by every accessible tab', async ({ page }) => {
  test.setTimeout(22 * 60 * 1_000);

  const queue = [...SEEDS];
  const seen = new Set(queue.map((route) => route.shape));
  let cursor = 0;

  while (cursor < queue.length) {
    if (queue.length > MAX_ROUTE_SHAPES) {
      throw new Error(
        `AUDIT_TAB_ROUTE_CAP_EXCEEDED discovered=${queue.length} cap=${MAX_ROUTE_SHAPES}; raise the reviewed cap rather than silently skipping routes`,
      );
    }

    const route = queue[cursor];
    cursor += 1;

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
        // Ignore browser-internal response URLs.
      }
    };

    page.on('pageerror', onPageError);
    page.on('response', onResponse);
    let discovered: RouteCandidate[] = [];
    try {
      await page.goto(route.path, { waitUntil: 'domcontentloaded' });
      await waitForStablePage(page);
      await assertHealthy(page, route.label);
      discovered = await collectLinksAcrossTabs(page, route.label);
    } finally {
      page.off('pageerror', onPageError);
      page.off('response', onResponse);
    }

    expect(pageErrors, `${route.label} emitted page errors`).toEqual([]);
    expect(api5xx, `${route.label} triggered staging API 5xx`).toEqual([]);

    for (const candidate of discovered) {
      if (seen.has(candidate.shape)) continue;
      seen.add(candidate.shape);
      queue.push(candidate);
      console.log(
        `AUDIT_201_TAB_ROUTE_DISCOVERED label=${JSON.stringify(candidate.label)} path=${candidate.path} shape=${candidate.shape}`,
      );
    }
  }

  expect(queue.length).toBeGreaterThanOrEqual(SEEDS.length);
  test.info().annotations.push({
    type: 'audit-tab-route-count',
    description: `Tab-aware recursive discovery covered ${queue.length} unique accessible route shapes.`,
  });
  console.log(`AUDIT_201_TAB_ROUTE_TOTAL count=${queue.length}`);
});

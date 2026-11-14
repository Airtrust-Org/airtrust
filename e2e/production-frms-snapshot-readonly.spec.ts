import { expect, test, type Request, type Response } from '@playwright/test';
import { SUPPRESSED_EXTERNAL_RESOURCE_HOSTS } from './lib/production-read-only-network-guard.mjs';

/**
 * Real, authenticated production FRMS read-only browser smoke.
 * Never prints tokens, personal data, payloads, URLs with query parameters,
 * screenshots, HAR, traces or videos. Strict no-write network allowlist.
 */
const FRONTEND = 'https://airtrust.online';
const API = 'api.airtrust.online';
const DATE = '2026-10-13';
const ALLOWED_HOSTS = new Set(['airtrust.online', API]);
const AUTH_POST = new Set([
  '/api/auth/login', '/api/auth/refresh', '/api/auth/refresh-token',
  '/api/auth/token/refresh', '/api/auth/select-empresa',
  '/api/auth/empresas/select', '/api/me/operational-access/session-profile',
]);
const PROFILE = /^Entrar como (Administrador(?: Geral| da Empresa)?|Gestor|Manager)$/i;

test.use({ storageState: { cookies: [], origins: [] }, screenshot: 'off', video: 'off', trace: 'off' });

test('production FRMS snapshot: permitted tenant 6, no browser abort or operational write', async ({ page }) => {
  test.setTimeout(150_000);
  // Fail before any navigation, even if this spec is invoked explicitly outside CI.
  if (process.env.E2E_ALLOW_PRODUCTION !== 'true') {
    throw new Error('FRMS_PRODUCTION_EXPLICIT_OPT_IN_REQUIRED');
  }
  const email = process.env.E2E_EMAIL?.trim() || '';
  const password = process.env.E2E_PASSWORD || '';
  if (!email || !password || email.endsWith('staging.airtrust.invalid')) {
    throw new Error('FRMS_PRODUCTION_QA_CREDENTIAL_UNAVAILABLE');
  }

  const violations: string[] = [];
  const snapshotRequests: Request[] = [];
  const abortedSnapshotRequests: string[] = [];
  const snapshots: Response[] = [];
  const started = new WeakMap<Request, number>();
  const durations: number[] = [];

  await page.route('**/*', async (route) => {
    const req = route.request();
    const method = req.method();
    let url: URL;
    try { url = new URL(req.url()); } catch {
      violations.push('UNPARSEABLE_URL');
      await route.abort('blockedbyclient');
      return;
    }
    const host = url.hostname.toLowerCase();
    if (SUPPRESSED_EXTERNAL_RESOURCE_HOSTS.includes(host) && ['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      await route.abort('blockedbyclient');
      return;
    }
    const safe = url.protocol === 'https:' && ALLOWED_HOSTS.has(host) &&
      (['GET', 'HEAD', 'OPTIONS'].includes(method) ||
       (host === API && method === 'POST' && AUTH_POST.has(url.pathname)));
    if (!safe) {
      violations.push('BLOCKED_' + method + '_' + (ALLOWED_HOSTS.has(host) ? 'UNAUTHORIZED_METHOD' : 'HOST'));
      await route.abort('blockedbyclient');
      return;
    }
    await route.continue();
  });

  const isSnapshot = (request: Request) => {
    const u = new URL(request.url());
    return u.hostname === API && u.pathname === '/api/frms/operational-snapshot' &&
      u.searchParams.get('data_inicio') === DATE && request.method() === 'GET';
  };
  page.on('request', (request) => {
    if (!isSnapshot(request)) return;
    snapshotRequests.push(request);
    started.set(request, Date.now());
  });
  page.on('requestfailed', (request) => {
    if (isSnapshot(request)) abortedSnapshotRequests.push(request.failure()?.errorText || 'UNKNOWN_NETWORK_ERROR');
  });
  page.on('response', (response) => {
    if (!isSnapshot(response.request())) return;
    snapshots.push(response);
    const t0 = started.get(response.request());
    if (t0 !== undefined) durations.push(Date.now() - t0);
  });

  await page.goto(FRONTEND + '/frms?data=' + DATE, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#airtrust-boot-fallback')).toHaveCount(0, { timeout: 30_000 });
  await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 30_000 });
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: /entrar|sign in/i }).click();

  // Only a real server-offered operational profile may be activated.
  await expect.poll(async () => {
    if (!new URL(page.url()).pathname.startsWith('/login')) return 'entered';
    const labels = await page.locator('button > span:first-child').allTextContents();
    return labels.some((s) => PROFILE.test(s.trim())) ? 'chooser' : 'waiting';
  }, { timeout: 35_000 }).not.toBe('waiting');
  if (new URL(page.url()).pathname.startsWith('/login')) {
    const choice = page.locator('button').filter({
      has: page.locator('span').filter({ hasText: PROFILE }),
    }).first();
    await expect(choice).toBeVisible();
    await choice.click();
  }
  await expect(page).toHaveURL((u) => u.origin === FRONTEND && u.pathname === '/frms', { timeout: 35_000 });
  await expect.poll(() => snapshots.length, { timeout: 50_000 }).toBeGreaterThanOrEqual(1);

  async function assertLatestSnapshot(index: number) {
    const res = snapshots[index];
    expect(res.status(), 'FRMS_PRODUCTION_SNAPSHOT_STATUS').toBe(200);
    const payload = await res.json() as {
      success?: boolean; data?: Array<{ empresa_id?: number }>;
      summary?: { total_tripulantes?: number }; meta?: { scope?: string };
    };
    expect(payload.success).toBe(true);
    expect(Array.isArray(payload.data)).toBe(true);
    expect(Number.isInteger(payload.summary?.total_tripulantes)).toBe(true);
    expect(payload.summary!.total_tripulantes).toBeGreaterThan(0);
    expect(payload.data!.every((row) => Number(row.empresa_id) === 6)).toBe(true);
    expect(['team', 'self']).toContain(payload.meta?.scope);
  }

  await assertLatestSnapshot(0);
  await expect(page.getByRole('heading', { name: 'Operação', exact: true })).toBeVisible();
  await expect(page.getByText(/O snapshot FRMS não respondeu dentro do prazo|Situação FRMS indisponível/)).toHaveCount(0);
  expect(violations, 'FRMS_PRODUCTION_NETWORK_GUARD').toEqual([]);
  expect(abortedSnapshotRequests, 'FRMS_PRODUCTION_ABORTED_SNAPSHOT_GET').toEqual([]);
  expect(snapshotRequests.length, 'FRMS_PRODUCTION_DUPLICATE_GET').toBe(1);

  // A user-initiated read-only refresh proves a second real GET without
  // replaying any operational mutation or relying on Playwright test retries.
  await page.getByRole('button', { name: /Atualizar dados|Refresh data/i }).click();
  await expect.poll(() => snapshots.length, { timeout: 40_000 }).toBeGreaterThanOrEqual(2);
  await assertLatestSnapshot(1);
  expect(violations, 'FRMS_PRODUCTION_NETWORK_GUARD').toEqual([]);
  expect(abortedSnapshotRequests, 'FRMS_PRODUCTION_ABORTED_SNAPSHOT_GET').toEqual([]);
  expect(snapshotRequests.length, 'FRMS_PRODUCTION_DUPLICATE_GET_AFTER_REFRESH').toBe(2);

  // Extend the same authorized tenant-6 browser session across the read-only
  // operational workspaces. Never trigger any FRMS case mutation or export
  // (which may contain personally identifiable operational data).
  const workspaceResponses = new Map<string, Response[]>();
  const workspaceFailures: string[] = [];
  const endpointKey = (request: Request): string | null => {
    const uri = new URL(request.url());
    if (!ALLOWED_HOSTS.has(uri.hostname) || request.method() !== 'GET') return null;
    if (uri.pathname === '/api/frms/alertas') return 'cases';
    if (uri.pathname === '/api/frms/relatorios/compliance') return 'compliance';
    if (uri.pathname === '/api/frms/relatorios/mapa-fadiga') return 'fatigue-map';
    if (uri.pathname === '/api/frms/relatorios/alertas-historico') return 'alert-history';
    if (uri.pathname === '/api/frms/fadiga-acumulada/frota') return 'legal-fleet';
    return null;
  };
  page.on('response', (response) => {
    const key = endpointKey(response.request());
    if (key) workspaceResponses.set(key, [...(workspaceResponses.get(key) ?? []), response]);
  });
  page.on('requestfailed', (request) => {
    const key = endpointKey(request);
    if (key) workspaceFailures.push(key + ':' + (request.failure()?.errorText ?? 'UNKNOWN'));
  });
  async function assertWorkspaceResponse(key: string) {
    await expect.poll(() => workspaceResponses.get(key)?.length ?? 0, { timeout: 30_000 }).toBeGreaterThan(0);
    const response = workspaceResponses.get(key)!.at(-1)!;
    expect(response.status(), 'FRMS_WORKSPACE_' + key + '_HTTP').toBe(200);
    const body = await response.json() as {
      success?: boolean;
      data?: unknown[];
      total?: number;
      meta?: { tenant_id?: number | string };
    };
    expect(body.success, 'FRMS_WORKSPACE_' + key + '_SUCCESS').toBe(true);
    expect(Array.isArray(body.data), 'FRMS_WORKSPACE_' + key + '_ARRAY').toBe(true);
    if (key === 'cases') {
      expect(Number.isInteger(body.total) && body.total! >= body.data!.length,
        'FRMS_GLOBAL_FILTERED_COUNT').toBe(true);
    } else {
      expect(Number(body.meta?.tenant_id), 'FRMS_REPORT_TENANT_ISOLATION').toBe(6);
    }
  }

  await page.goto(FRONTEND + '/frms/alertas', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Casos', exact: true })).toBeVisible({ timeout: 30_000 });
  await assertWorkspaceResponse('cases');
  await expect(page.getByText('Não foi possível atualizar os casos. Tente novamente antes de tomar uma decisão operacional.')).toHaveCount(0);

  await page.goto(FRONTEND + '/frms/relatorios', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Relatórios FRMS', exact: true })).toBeVisible({ timeout: 30_000 });
  await assertWorkspaceResponse('compliance');
  await page.getByRole('button', { name: /Resumo de consumo de limites/ }).click();
  await assertWorkspaceResponse('fatigue-map');
  await page.getByRole('button', { name: /Histórico de Alertas/ }).click();
  await assertWorkspaceResponse('alert-history');
  await expect(page.getByText('Não foi possível gerar este relatório')).toHaveCount(0);
  // Regression for the actual success/data contract: useApi normally unwraps
  // an envelope, so the Accumulated Legal screen must explicitly preserve it.
  // A successful fleet GET must never be rendered as an empty roster by the UI.
  await page.goto(FRONTEND + '/frms/fadiga-acumulada', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Acumulado Legal de Trabalho e Voo' })).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => workspaceResponses.get('legal-fleet')?.length ?? 0, { timeout: 40_000 }).toBeGreaterThan(0);
  const legalFleetResponse = workspaceResponses.get('legal-fleet')!.at(-1)!;
  expect(legalFleetResponse.status(), 'FRMS_LEGAL_FLEET_HTTP').toBe(200);
  const legal = await legalFleetResponse.json() as {
    success?: boolean;
    data?: { frota?: unknown[]; resumo?: { total_tripulantes?: number }; limites?: unknown; thresholds?: unknown };
  };
  expect(legal.success, 'FRMS_LEGAL_FLEET_SUCCESS').toBe(true);
  expect(Array.isArray(legal.data?.frota), 'FRMS_LEGAL_FLEET_ARRAY').toBe(true);
  expect(legal.data?.resumo?.total_tripulantes, 'FRMS_LEGAL_FLEET_COUNT').toBe(legal.data!.frota!.length);
  expect(legal.data?.limites, 'FRMS_LEGAL_LIMITS_PRESENT').toBeTruthy();
  expect(legal.data?.thresholds, 'FRMS_LEGAL_THRESHOLDS_PRESENT').toBeTruthy();
  await expect(page.getByText('Tripulantes', { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Não foi possível confirmar o acumulado legal.')).toHaveCount(0);
  if (legal.data!.frota!.length > 0) {
    await expect(page.getByText(/Nenhuma jornada registrada em/)).toHaveCount(0);
  } else {
    await expect(page.getByText(/Nenhuma jornada registrada em/)).toBeVisible();
  }
  console.log('FRMS_PRODUCTION_LEGAL_FLEET_READONLY_PASS;tenant=6;scope=legal-fleet;operational_writes=0');

  expect(workspaceFailures, 'FRMS_WORKSPACE_ABORTED_GET').toEqual([]);
  expect(violations, 'FRMS_PRODUCTION_NETWORK_GUARD').toEqual([]);
  console.log('FRMS_PRODUCTION_WORKSPACE_READONLY_PASS;tenant=6;routes=cases,compliance,fatigue-map,alert-history;operational_writes=0;aborts=0');

  console.log('FRMS_PRODUCTION_READONLY_PASS;tenant=6;responses=2;aborts=0;operational_writes=0;durations_ms=' +
    durations.join(','));
});

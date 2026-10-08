/**
 * Real authentication against the staging frontend for the Frontend PR UI QA.
 *
 * NO fake JWT, NO manual localStorage session, NO route fulfilment of
 * /auth/me or /auth/empresas. The browser drives the real staging login form
 * and the real staging API issues the session.
 *
 * Credentials are chosen as an ATOMIC pair (BLOCKER 7):
 *   - QA_ADMIN_EMAIL + QA_ADMIN_PASSWORD both set  -> admin pair
 *   - neither set                                  -> E2E_EMAIL / E2E_PASSWORD
 *   - exactly one admin value set                  -> fail closed
 */
import { test as setup, expect, type Response } from '@playwright/test';

import { AUTH_FILE } from '../frontend-pr-ui-qa.config';
import { resolveCredentialPair } from '../lib/credential-pair.mjs';
import { assertLiveFrontendShaFromPage } from '../lib/live-sha-guard.mjs';
import { installReadOnlyGuard } from '../lib/read-only-network-guard.mjs';

setup('real staging login', async ({ page }) => {
  // Guard the authentication phase too: otherwise an initial navigation could
  // reach a production host before the post-auth specs install their guards.
  const guard = installReadOnlyGuard(page);
  const { email, password, profile } = resolveCredentialPair(process.env);
  const releaseShortSha = String(process.env.RELEASE_SHA || '')
    .toLowerCase()
    .slice(0, 7);

  const loginRequests: string[] = [];
  const authResponses: string[] = [];
  const authNetworkFailures: string[] = [];
  const authPath = (url: string) => {
    try {
      const path = new URL(url).pathname;
      return /^\/api\/auth\/(login|empresas|me)$/.test(path) ? path : null;
    } catch { return null; }
  };
  let tenantProofRequest: { url: string; bearer: string } | null = null;
  let tenantProofResponse: Response | null = null;
  const isTenantEndpoint = (url: string) => {
    try {
      return new URL(url).pathname === '/api/auth/empresas';
    } catch {
      return false;
    }
  };
  page.on('request', (request) => {
    const path = authPath(request.url());
    if (request.method() === 'POST' && path) loginRequests.push(path);
    if (request.method() === 'GET' && isTenantEndpoint(request.url())) {
      const bearer = request.headers().authorization;
      if (bearer?.startsWith('Bearer ')) {
        // Reuse only the bearer from the real staging API request.
        // Never emit tokens, headers, credentials, response bodies or PII.
        tenantProofRequest = { url: request.url(), bearer };
      }
    }
  });
  page.on('response', (response) => {
    const path = authPath(response.url());
    if (path) authResponses.push(path + ':' + response.status());
    if (response.request().method() === 'GET' && isTenantEndpoint(response.url())) {
      tenantProofResponse = response;
    }
  });
  page.on('requestfailed', (request) => {
    const path = authPath(request.url());
    if (!path) return;
    let hostClass = 'UNEXPECTED_HOST';
    try {
      const host = new URL(request.url()).hostname;
      if (host === 'airtrust-api-staging.airtrust.workers.dev') hostClass = 'STAGING_API';
      else if (host === 'staging.airtrust.pages.dev') hostClass = 'STAGING_PAGES';
    } catch { /* unknown host is not trusted */ }
    const reason = request.failure() || '';
    const safeReason = /^net::ERR_[A-Z0-9_]+$/.test(reason) ? reason : 'NETWORK_ERROR';
    authNetworkFailures.push(path + ':' + hostClass + ':' + safeReason);
  });

  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  if (releaseShortSha) {
    await assertLiveFrontendShaFromPage(page, releaseShortSha, 'login');
  }

  // Direct browser-origin health probe: detects CORS/transport failures before
  // sending any real credentials. Safe GET only; never a mocked auth response.
  const browserHealthStatus = await page.evaluate(async () => {
    try {
      const response = await fetch(
        'https://airtrust-api-staging.airtrust.workers.dev/api/health',
        { method: 'GET', mode: 'cors', credentials: 'omit', cache: 'no-store' },
      );
      return response.status;
    } catch { return -1; }
  });
  if (browserHealthStatus !== 200) {
    throw new Error('QA_BROWSER_STAGING_API_PREFLIGHT_FAILED:' + browserHealthStatus);
  }

  async function submitRealLogin(timeoutMs: number) {
    await page.locator('input[type="email"]').waitFor({ state: 'visible' });
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(password);

    const rememberMe = page.getByRole('checkbox', { name: /lembrar de mim/i });
    if ((await rememberMe.count()) > 0) await rememberMe.check();

    await page.getByRole('button', { name: /entrar|sign in/i }).click();
    try {
      await page.waitForURL((url) => !url.pathname.startsWith('/login'), {
        timeout: timeoutMs, waitUntil: 'domcontentloaded',
      });
      return true;
    } catch { return false; }
  }

  let loginSucceeded = await submitRealLogin(25_000);
  if (!loginSucceeded) {
    // Bounded recovery only when the genuine staging login POST failed at the
    // network layer and no server status was received. Never retry 401/403,
    // missing credentials, production-host attempts, or security violations.
    const transportFailure = authNetworkFailures.some((entry) =>
      entry.startsWith('/api/auth/login:STAGING_API:'));
    const serverResponded = authResponses.some((entry) =>
      entry.startsWith('/api/auth/login:'));
    if (transportFailure && !serverResponded && guard.violations.length === 0) {
      // eslint-disable-next-line no-console
      console.log('[frontend-pr-ui-qa] bounded retry after real staging login transport failure');
      await page.goto('/login', { waitUntil: 'domcontentloaded' });
      if (releaseShortSha) {
        await assertLiveFrontendShaFromPage(page, releaseShortSha, 'login-retry');
      }
      loginSucceeded = await submitRealLogin(35_000);
    }
  }
  if (!loginSucceeded) {
    const stillOnLogin = new URL(page.url()).pathname.startsWith('/login');
    throw new Error(
      'STAGING_LOGIN_NAVIGATION_FAILED:still_on_login=' + stillOnLogin +
      ';post_seen=' + loginRequests.includes('/api/auth/login') +
      ';auth_responses=' + (authResponses.join(',') || 'none') +
      ';network_failures=' + (authNetworkFailures.join(',') || 'none') +
      ';blocked_count=' + guard.violations.length,
    );
  }
  await expect(page).not.toHaveURL(/\/login/);

  // The session must have come from a real POST to the staging auth API.
  expect(
    loginRequests.some((p) => p.includes('/api/auth/')),
    'no real POST /api/auth/* observed during login',
  ).toBeTruthy();

  guard.assertClean();

  // The canonical QA examiner credential can have one OR multiple active
  // company associations. AppLayout deliberately renders the company <select>
  // only when isAdmin && empresas.length > 1, so absence of the selector is NOT
  // evidence that the canonical QA tenant is unavailable.
  //
  // Resolve the authoritative tenant list/current tenant from the real
  // GET /api/auth/empresas response issued by AuthContext during login. Only
  // drive the real UI selector when an actual tenant switch is required.
  //
  // Never mock auth/API and never manipulate local/session storage directly.
  if (profile === 'admin') {
    type TenantProof = {
      success?: boolean;
      data?: {
        empresaAtualId?: number;
        empresas?: Array<{ id?: number; nome?: string; codigo?: string }>;
      };
    };
    let empresasPayload: TenantProof | null = null;

    if (tenantProofResponse?.ok()) {
      empresasPayload = await tenantProofResponse.json().catch(() => null) as TenantProof | null;
    } else if (tenantProofResponse && [401, 403].includes(tenantProofResponse.status())) {
      throw new Error(`QA_EMPRESAS_AUTH_REJECTED:${tenantProofResponse.status()}`);
    }

    if (!empresasPayload?.data?.empresas) {
      // AuthContext may abort /auth/empresas on its own timeout while preserving
      // an otherwise valid login. Verify the active tenant through the same
      // real, authenticated, staging-only API; two bounded read-only attempts.
      if (!tenantProofRequest) {
        throw new Error('QA_EMPRESAS_AUTH_REQUEST_NOT_OBSERVED');
      }
      const { url, bearer } = tenantProofRequest;
      const stagingOrigin = new URL(
        process.env.STAGING_API_BASE_URL || 'https://airtrust-api-staging.airtrust.workers.dev',
      ).origin;
      if (new URL(url).origin !== stagingOrigin) {
        throw new Error('QA_EMPRESAS_NON_STAGING_ORIGIN');
      }

      let lastReason = 'NO_RESPONSE';
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const response = await page.request.get(url, {
            headers: { Authorization: bearer },
            timeout: 15_000,
          });
          if ([401, 403].includes(response.status())) {
            throw new Error(`QA_EMPRESAS_AUTH_REJECTED:${response.status()}`);
          }
          if (response.ok()) {
            empresasPayload = await response.json().catch(() => null) as TenantProof | null;
            if (empresasPayload?.success !== false && Array.isArray(empresasPayload?.data?.empresas)) {
              break;
            }
            empresasPayload = null;
            lastReason = 'INVALID_TENANT_PAYLOAD';
          } else {
            lastReason = `HTTP_${response.status()}`;
          }
        } catch (error) {
          if (error instanceof Error && error.message.startsWith('QA_EMPRESAS_AUTH_REJECTED')) {
            throw error;
          }
          lastReason = error instanceof Error ? error.name : 'NETWORK_ERROR';
        }
      }
      if (!empresasPayload?.data?.empresas) {
        throw new Error(`QA_EMPRESAS_UNAVAILABLE_AFTER_REAL_LOGIN:${lastReason}`);
      }
    }

    const empresas = Array.isArray(empresasPayload?.data?.empresas)
      ? empresasPayload.data.empresas
      : [];
    const qaCompany = empresas.find((empresa) => empresa?.codigo === 'qa_examiner_training');
    if (!qaCompany?.id) {
      throw new Error('QA_EXAMINER_TENANT_NOT_AVAILABLE');
    }

    const qaCompanyId = Number(qaCompany.id);
    const currentCompanyId = Number(empresasPayload?.data?.empresaAtualId || 0);

    if (currentCompanyId !== qaCompanyId) {
      const qaCompanyValue = String(qaCompanyId);
      const companySelect = page.locator('select').filter({
        has: page.locator(`option[value="${qaCompanyValue}"]`),
      }).first();

      await expect(
        companySelect,
        'canonical QA company selector required for tenant switch but not reachable',
      ).toBeVisible();

      const switchedEmpresasResponsePromise = page.waitForResponse(
        (response) => {
          if (response.request().method() !== 'GET') return false;
          try {
            return new URL(response.url()).pathname === '/api/auth/empresas';
          } catch {
            return false;
          }
        },
        { timeout: 20_000 },
      );

      await companySelect.selectOption(qaCompanyValue);

      const switchedEmpresasResponse = await switchedEmpresasResponsePromise;
      if (!switchedEmpresasResponse.ok()) {
        throw new Error(`QA_EXAMINER_TENANT_SWITCH_RESPONSE_FAILED:${switchedEmpresasResponse.status()}`);
      }

      const switchedPayload = await switchedEmpresasResponse.json().catch(() => null) as
        | { data?: { empresaAtualId?: number } }
        | null;
      if (Number(switchedPayload?.data?.empresaAtualId || 0) !== qaCompanyId) {
        throw new Error('QA_EXAMINER_TENANT_SWITCH_NOT_CONFIRMED');
      }

      // Re-check the candidate SHA after tenant switch/reload.
      if (releaseShortSha) {
        await assertLiveFrontendShaFromPage(page, releaseShortSha, 'qa-tenant-selected');
      }

      // eslint-disable-next-line no-console
      console.log('[frontend-pr-ui-qa] canonical QA tenant selected through the real UI');
    } else {
      // Single-company sessions legitimately have no selector. The real auth
      // response is sufficient proof that the session is already tenant-pinned.
      // eslint-disable-next-line no-console
      console.log('[frontend-pr-ui-qa] canonical QA tenant already current');
    }

    guard.assertClean();
  }

  // eslint-disable-next-line no-console
  console.log(`[frontend-pr-ui-qa] authenticated with the ${profile} credential pair`);

  await page.context().storageState({ path: AUTH_FILE });
});

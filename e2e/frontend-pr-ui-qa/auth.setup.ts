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
import { test as setup, expect } from '@playwright/test';

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
  page.on('request', (request) => {
    if (request.method() === 'POST' && /\/api\/auth\//.test(request.url())) {
      loginRequests.push(new URL(request.url()).pathname);
    }
  });

  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  if (releaseShortSha) {
    await assertLiveFrontendShaFromPage(page, releaseShortSha, 'login');
  }

  await page.locator('input[type="email"]').waitFor({ state: 'visible' });
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);

  const rememberMe = page.getByRole('checkbox', { name: /lembrar de mim/i });
  if ((await rememberMe.count()) > 0) {
    await rememberMe.check();
  }

  const empresasResponsePromise = page.waitForResponse(
    (response) => {
      if (response.request().method() !== 'GET') return false;
      try {
        return new URL(response.url()).pathname === '/api/auth/empresas';
      } catch {
        return false;
      }
    },
    { timeout: 45_000 },
  );

  await page.getByRole('button', { name: /entrar|sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 45_000 });
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
    const empresasResponse = await empresasResponsePromise;
    if (!empresasResponse.ok()) {
      throw new Error(`QA_EMPRESAS_RESPONSE_FAILED:${empresasResponse.status()}`);
    }

    const empresasPayload = await empresasResponse.json().catch(() => null) as
      | {
          success?: boolean;
          data?: {
            empresaAtualId?: number;
            empresas?: Array<{ id?: number; nome?: string; codigo?: string }>;
          };
        }
      | null;

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

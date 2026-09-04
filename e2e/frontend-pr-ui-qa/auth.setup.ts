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

  await page.getByRole('button', { name: /entrar|sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 45_000 });
  await expect(page).not.toHaveURL(/\/login/);

  // The session must have come from a real POST to the staging auth API.
  expect(
    loginRequests.some((p) => p.includes('/api/auth/')),
    'no real POST /api/auth/* observed during login',
  ).toBeTruthy();

  guard.assertClean();

  // The canonical QA examiner credential can have more than one company
  // association in staging. A fresh login follows the user's default company,
  // which is not a reliable selector for governed QA. Pin the session through
  // the real AppLayout company selector so AuthContext.selectEmpresa() performs
  // the canonical /api/auth/select-empresa exchange and token rotation.
  //
  // Never manipulate local/session storage directly here.
  if (profile === 'admin') {
    const qaCompanyName = 'AirTrust Staging Examiner QA';
    const qaCompanyOption = page.locator('select option', { hasText: qaCompanyName }).first();
    if ((await qaCompanyOption.count()) === 0) {
      throw new Error('QA_EXAMINER_TENANT_NOT_AVAILABLE');
    }

    const qaCompanyValue = await qaCompanyOption.getAttribute('value');
    if (!qaCompanyValue) {
      throw new Error('QA_EXAMINER_TENANT_VALUE_MISSING');
    }

    const companySelect = page.locator('select').filter({
      has: page.locator(`option[value="${qaCompanyValue}"]`),
    }).first();
    await expect(companySelect, 'canonical QA company selector not reachable').toBeVisible();

    const currentValue = await companySelect.inputValue();
    if (currentValue !== qaCompanyValue) {
      await companySelect.selectOption(qaCompanyValue);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
      await expect
        .poll(async () => {
          const option = page.locator(`select option[value="${qaCompanyValue}"]:checked`).first();
          return (await option.count()) > 0;
        }, { timeout: 20_000 })
        .toBe(true);
    }

    // Re-check the candidate SHA after tenant switch/reload.
    if (releaseShortSha) {
      await assertLiveFrontendShaFromPage(page, releaseShortSha, 'qa-tenant-selected');
    }

    guard.assertClean();
    // eslint-disable-next-line no-console
    console.log('[frontend-pr-ui-qa] canonical QA tenant selected through the real UI');
  }

  // eslint-disable-next-line no-console
  console.log(`[frontend-pr-ui-qa] authenticated with the ${profile} credential pair`);

  await page.context().storageState({ path: AUTH_FILE });
});

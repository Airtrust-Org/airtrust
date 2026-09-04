/**
 * Real authentication against the staging frontend for the Frontend PR UI QA.
 *
 * NO fake JWT, NO manual localStorage session, NO route fulfilment of
 * /auth/me or /auth/empresas. The browser drives the real staging login form
 * and the real staging API issues the session.
 *
 * Credentials come from the `staging` GitHub Environment:
 *   E2E_EMAIL / E2E_PASSWORD           -> STAGING_SMOKE_EMAIL / STAGING_SMOKE_PASSWORD
 *   QA_ADMIN_EMAIL / QA_ADMIN_PASSWORD -> optional admin profile for #282 surfaces
 */
import { test as setup, expect } from '@playwright/test';

import { AUTH_FILE } from '../frontend-pr-ui-qa.config';

setup('real staging login', async ({ page }) => {
  const email = process.env.QA_ADMIN_EMAIL || process.env.E2E_EMAIL;
  const password = process.env.QA_ADMIN_PASSWORD || process.env.E2E_PASSWORD;

  if (!email || !password) {
    throw new Error('FRONTEND_PR_UI_QA_CREDENTIALS_MISSING: set E2E_EMAIL/E2E_PASSWORD');
  }

  const loginRequests: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && /\/api\/auth\//.test(request.url())) {
      loginRequests.push(new URL(request.url()).pathname);
    }
  });

  await page.goto('/login', { waitUntil: 'domcontentloaded' });
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
  expect(loginRequests.some((p) => p.includes('/api/auth/'))).toBeTruthy();

  await page.context().storageState({ path: AUTH_FILE });
});

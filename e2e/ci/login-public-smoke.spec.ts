import { expect, test } from '@playwright/test';

const apiBase = process.env.VITE_API_URL || 'http://127.0.0.1:8787';

test('renders the public login shell without credentials', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/login');

  await expect(page.locator('input[type="email"]')).toBeVisible();
  await expect(page.locator('input[type="password"]')).toBeVisible();
  await expect(page.locator('button[type="submit"]')).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test('worker health contract is available to the public shell', async ({ request }) => {
  const response = await request.get(`${apiBase}/api/health`);
  expect(response.status()).toBe(200);
  await expect(response.json()).resolves.toMatchObject({ success: true });
});

test('private LMS data remains closed without authentication', async ({ request }) => {
  const response = await request.get(`${apiBase}/api/lms/cursos`);
  expect([401, 403]).toContain(response.status());

  const body = await response.json();
  expect(body.success).toBe(false);
});

test('public certificate validation rejects malformed verification codes before querying data', async ({ request }) => {
  const response = await request.get(`${apiBase}/api/certificados/validar/not-a-valid-hash`);
  expect(response.status()).toBe(400);
  await expect(response.json()).resolves.toMatchObject({
    success: false,
    valido: false,
  });
});

test('disabled backup API stays authenticated instead of exposing maintenance data', async ({ request }) => {
  const response = await request.get(`${apiBase}/api/backup`);
  expect(response.status()).toBe(401);

  const body = await response.json();
  expect(body.success).toBe(false);
});

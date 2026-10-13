import { expect, test } from '@playwright/test';

// Independent synthetic identity; never inherit the global QA setup's storage state.
test.use({ storageState: { cookies: [], origins: [] } });

const QA_EMAIL = 'qa-frms-ux@staging.airtrust.invalid';
const PASSWORD = String(process.env.E2E_PASSWORD ?? '');

test('staging QA FRMS: 14 fictitious roster entries, exactly seven pending check-ins', async ({ page }) => {
  if (!PASSWORD) throw new Error('STAGING_FRMS_UX_QA_SECRET_NOT_CONFIGURED');
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(QA_EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: /entrar|sign in/i }).click();
  await page.waitForURL(url => !url.pathname.startsWith('/login'), { timeout: 30000 });

  const snapshotResponse = page.waitForResponse(response =>
    response.url().includes('/api/frms/operational-snapshot') &&
    response.url().includes('2026-10-13'), { timeout: 45000 });
  await page.goto('/frms?data=2026-10-13');
  const response = await snapshotResponse;
  expect(response.status(), 'Missing governed context must never pass as all green').toBe(200);
  const payload = await response.json() as {
    success?: boolean;
    summary?: { total_tripulantes?: number; checkins_recebidos?: number; checkins_pendentes?: number };
    data?: Array<{ nome?: string; checkin_status?: string }>;
  };
  expect(payload.success).toBe(true);
  expect(payload.summary?.total_tripulantes).toBe(14);
  expect(payload.summary?.checkins_recebidos).toBe(7);
  expect(payload.summary?.checkins_pendentes).toBe(7);
  expect(payload.data?.filter(item => item.checkin_status === 'PENDENTE')).toHaveLength(7);
  expect(payload.data?.every(item => item.nome?.startsWith('QA FRMS Pessoa '))).toBe(true);

  const pendingButton = page.getByRole('button', { name: /Check-ins a receber/i });
  await expect(pendingButton).toBeVisible({ timeout: 20000 });
  await pendingButton.click();
  await expect(pendingButton).toHaveAttribute('aria-pressed','true');
  await expect(page.getByText(/Situação operacional indisponível/i)).toHaveCount(0);
});

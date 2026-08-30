import { expect, test } from '@playwright/test';

const adminEmail = String(process.env.STAGING_SMOKE_EMAIL || '').trim();
const adminPassword = String(process.env.STAGING_SMOKE_PASSWORD || '');

async function loginThroughUi(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: /entrar|sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 });
}

test.describe('staging FRMS maintenance release QA', () => {
  test('mechanic home is reduced to fatigue, Pasta 360 and password', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('button', { name: /Fadiga Diária/i })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: /Minha Pasta 360/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Trocar Senha/i })).toBeVisible();

    await expect(page.getByText(/Contexto derivado do funcion[aá]rio/i)).toHaveCount(0);
    await expect(page.getByText(/Minhas Sessões de Simulador/i)).toHaveCount(0);
    await expect(page.getByText(/Minhas Fichas de Treinamento de Voo/i)).toHaveCount(0);
    await expect(page.getByText(/Meus Treinamentos EAD/i)).toHaveCount(0);
    await expect(page.getByText(/Minha Escala/i)).toHaveCount(0);

    await page.getByRole('button', { name: /Fadiga Diária/i }).click();
    await expect(page).toHaveURL(/\/frms\/checkin/);
    await expect(page.getByRole('heading', { name: 'Minha fadiga hoje' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Check-in para Mecânicos e Inspetores/i)).toBeVisible();
  });

  test('tenant admin sees Operations and Maintenance and opens maintenance dashboard', async ({ browser }) => {
    if (!adminEmail || !adminPassword) {
      throw new Error('STAGING_SMOKE_EMAIL/STAGING_SMOKE_PASSWORD ausentes para QA do administrador');
    }

    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await loginThroughUi(page, adminEmail, adminPassword);
      await page.goto('/frms?area=manutencao');

      await expect(page.getByRole('navigation', { name: 'Áreas FRMS' })).toBeVisible({ timeout: 20_000 });
      await expect(page.getByRole('link', { name: 'Operações', exact: true })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Manutenção', exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Fadiga da Manutenção' })).toBeVisible({ timeout: 20_000 });
      await expect(page.getByRole('heading', { name: 'Equipe de manutenção' })).toBeVisible();
    } finally {
      await context.close();
    }
  });
});

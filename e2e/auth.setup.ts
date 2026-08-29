/**
 * E2E Auth Setup — salva o storage state após login.
 * Executado uma única vez antes de todos os testes.
 *
 * Requer:
 *   E2E_EMAIL=usuario@empresa.com
 *   E2E_PASSWORD=senha_aqui
 *
 * Uso:
 *   E2E_EMAIL=... E2E_PASSWORD=... npx playwright test --project=setup
 */

import { test as setup, expect } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const AUTH_FILE = path.join(__dirname, '.auth/user.json');

setup('autenticar usuário', async ({ page }) => {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'E2E_EMAIL e E2E_PASSWORD devem ser definidos para executar o auth setup.\n' +
        'Exemplo: E2E_EMAIL=seu@email.com E2E_PASSWORD=suasenha npx playwright test --project=setup',
    );
  }

  await page.goto('/login', { waitUntil: 'domcontentloaded' });

  // Preenche login form (usando type selectors — mais robusto que getByLabel + i18n)
  await page.locator('input[type="email"]').waitFor({ state: 'visible' });
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  // Alguns layouts não exibem "lembrar de mim"; só marca quando o controle existir.
  const rememberMe = page.getByRole('checkbox', { name: /lembrar de mim/i });
  if ((await rememberMe.count()) > 0) {
    await rememberMe.check();
  }
  await page.getByRole('button', { name: /entrar|sign in/i }).click();

  // Aguarda redirecionamento pós-login (app navega para "/" após autenticação)
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30000 });
  await expect(page).not.toHaveURL(/\/login/);

  // Salva estado de autenticação
  await page.context().storageState({ path: AUTH_FILE });
});

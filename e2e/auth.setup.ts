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
  const rawBase = process.env.E2E_API_BASE_URL?.replace(/\/+$/, '');

  if (!email || !password) {
    throw new Error(
      'E2E_EMAIL e E2E_PASSWORD devem ser definidos para executar o auth setup.\n' +
        'Exemplo: E2E_EMAIL=seu@email.com E2E_PASSWORD=suasenha npx playwright test --project=setup',
    );
  }

  if (rawBase) {
    // Normalize: if base already ends with /api, call /auth/login directly.
    // If base does NOT end with /api, call /api/auth/login.
    // This prevents double /api/api/ when E2E_API_BASE_URL=<worker>/api.
    const loginUrl = rawBase.endsWith('/api')
      ? `${rawBase}/auth/login`
      : `${rawBase}/api/auth/login`;

    // Regression guard: never allow /api/api/ in the login URL.
    if (loginUrl.includes('/api/api/')) {
      throw new Error(
        `BUG: double /api/api/ in login URL "${loginUrl}". ` +
        `E2E_API_BASE_URL was "${process.env.E2E_API_BASE_URL}". ` +
        `Add a regression test for this path.`,
      );
    }

    const response = await page.request.post(loginUrl, {
      data: { email, senha: password },
    });
    if (!response.ok()) {
      throw new Error(`Login QA no ambiente alvo retornou HTTP ${response.status()}`);
    }
    const payload = (await response.json()) as {
      data?: { accessToken?: unknown; refreshToken?: unknown };
    };
    const accessToken = payload.data?.accessToken;
    const refreshToken = payload.data?.refreshToken;
    if (typeof accessToken !== 'string' || typeof refreshToken !== 'string') {
      throw new Error('Login QA no ambiente alvo não retornou a sessão esperada');
    }

    await page.goto('/login');
    await page.evaluate(
      ({ nextAccessToken, nextRefreshToken }) => {
        localStorage.setItem('airtrust_token', nextAccessToken);
        localStorage.setItem('airtrust_refresh_token', nextRefreshToken);
        localStorage.setItem('airtrust_persist_login', '1');
      },
      { nextAccessToken: accessToken, nextRefreshToken: refreshToken },
    );
    await page.context().storageState({ path: AUTH_FILE });
    return;
  }

  await page.goto('/login');
  await expect(page.locator('input[type="email"]')).toBeVisible();

  // Preenche login form (usando type selectors — mais robusto que getByLabel + i18n)
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  // Alguns layouts não exibem "lembrar de mim"; só marca quando o controle existir.
  const rememberMe = page.getByRole('checkbox', { name: /lembrar de mim/i });
  if ((await rememberMe.count()) > 0) {
    await rememberMe.check();
  }
  // O staging publicado expõe o formulário em inglês ("Sign In"), enquanto
  // outros ambientes mantêm "Entrar". Ambos são o mesmo submit real.
  await page.getByRole('button', { name: /^(entrar|sign in)$/i }).click();

  // Aguarda redirecionamento pós-login (app navega para "/" após autenticação)
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30000 });
  await expect(page).not.toHaveURL(/\/login/);

  // Salva estado de autenticação
  await page.context().storageState({ path: AUTH_FILE });
});

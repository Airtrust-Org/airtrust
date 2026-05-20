import { Page } from '@playwright/test';

/**
 * Helper de Autenticação - VERSÃO FINAL CORRIGIDA
 * Realiza login via API e injeta token em TODAS as chaves possíveis
 */

export async function login(page: Page, email = 'admin@airtrust.com', password = 'Admin@123') {
  console.log('� Iniciando login via API...');

  // 1. Login via API
  const response = await page.request.post(
    'https://airtrust-api-production.airtrust.workers.dev/api/auth/login',
    {
      data: { email, password },
      headers: { 'Content-Type': 'application/json' },
    },
  );

  if (!response.ok()) {
    throw new Error(`❌ Login API falhou: ${response.status()}`);
  }

  const result = (await response.json()) as {
    success: boolean;
    data: { accessToken: string; user: { nome: string; email: string; role: string; id: number } };
  };

  if (!result.success || !result.data.accessToken) {
    throw new Error('Login API returned no token');
  }

  const token = result.data.accessToken;
  const user = result.data.user;

  console.log('✅ Token recebido:', token.substring(0, 20) + '...');

  // 2. Navegar para o frontend
  await page.goto('https://3662f2ca.airtrust-production.pages.dev/');
  await page.waitForLoadState('networkidle');

  // 3. Injetar token no localStorage (TODAS as variações possíveis)
  await page.evaluate(
    ({ token, user }) => {
      // Limpar tudo primeiro
      localStorage.clear();
      sessionStorage.clear();

      // Tentar TODAS as chaves possíveis
      const keys = [
        // Chaves principais do AuthContext (CRITICAL)
        'airtrust_token',
        'airtrust_refresh_token',
        // Variantes genéricas
        'token',
        'auth_token',
        'authToken',
        'accessToken',
        'access_token',
        'jwt',
        'jwtToken',
      ];

      keys.forEach((key) => {
        localStorage.setItem(key, token);
        sessionStorage.setItem(key, token);
      });

      // Salvar também com Bearer
      localStorage.setItem('token', `Bearer ${token}`);

      // Salvar user info
      const userKeys = ['user', 'currentUser', 'auth_user', 'authUser'];
      userKeys.forEach((key) => {
        localStorage.setItem(key, JSON.stringify(user));
      });

      console.log('✅ Token injetado em localStorage e sessionStorage');
    },
    { token, user },
  );

  // 4. Recarregar página para frontend detectar
  console.log('🔄 Recarregando página...');
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000); // Aguardar app inicializar

  // 5. Verificar se está logado (tentar múltiplos seletores)
  console.log('🔍 Verificando se está autenticado...');

  try {
    await Promise.race([
      // Seletores comuns de menu de usuário
      page.waitForSelector('[data-testid="user-menu"]', { timeout: 5000 }),
      page.waitForSelector('button[aria-label*="usuário"]', { timeout: 5000 }),
      page.waitForSelector('button[aria-label*="Usuário"]', { timeout: 5000 }),
      page.waitForSelector('.user-avatar', { timeout: 5000 }),
      page.waitForSelector('.user-menu', { timeout: 5000 }),

      // Elementos que aparecem apenas quando logado
      page.waitForSelector('text=Admin Sistema', { timeout: 5000 }),
      page.waitForSelector('text=Sair', { timeout: 5000 }),
      page.waitForSelector('text=Logout', { timeout: 5000 }),

      // Rotas que exigem autenticação
      page.waitForSelector('a[href*="/funcionarios"]', { timeout: 5000 }),
      page.waitForSelector('nav a:has-text("Funcionários")', { timeout: 5000 }),
    ]);

    console.log('✅ Autenticação verificada com sucesso!');
    return true;
  } catch (error) {
    // Debug: Tirar screenshot
    await page.screenshot({
      path: 'debug-login-failed.png',
      fullPage: true,
    });

    // Debug: Ver o que tem nos storages
    const storageDebug = await page.evaluate(() => ({
      localStorage: Object.keys(localStorage).reduce((acc, key) => {
        acc[key] = localStorage.getItem(key)?.substring(0, 50) + '...';
        return acc;
      }, {} as Record<string, string>),
      sessionStorage: Object.keys(sessionStorage).reduce((acc, key) => {
        acc[key] = sessionStorage.getItem(key)?.substring(0, 50) + '...';
        return acc;
      }, {} as Record<string, string>),
      cookies: document.cookie,
      url: window.location.href,
    }));

    console.error('❌ Storage após tentativa de login:', JSON.stringify(storageDebug, null, 2));

    // Debug: Ver o HTML da página
    const bodyText = await page.locator('body').innerText();
    console.error('📄 Texto da página:', bodyText.substring(0, 500));

    throw new Error(
      '❌ Frontend não detectou autenticação após login.\n' +
        'Screenshot salvo em: debug-login-failed.png\n' +
        'Storage debug impresso acima.',
    );
  }
}

export async function logout(page: Page) {
  await page.click('button[aria-label*="usuário"], .user-menu');
  await page.click('text=Sair, text=Logout');
  await page.waitForURL('**/login');
}

export async function isLoggedIn(page: Page): Promise<boolean> {
  try {
    await page.waitForSelector('[data-testid="user-menu"], .user-avatar', { timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

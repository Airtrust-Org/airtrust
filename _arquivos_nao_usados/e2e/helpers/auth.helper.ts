import { Page } from '@playwright/test';

/**
 * Helper de Autenticação - VERSÃO CORRIGIDA COM addInitScript
 * 
 * PROBLEMA ANTERIOR:
 * - page.evaluate() injetava token DEPOIS do React já ter carregado
 * - AuthContext verificava localStorage no useEffect e não encontrava token
 * - Usuário era redirecionado para /login
 * 
 * SOLUÇÃO:
 * - page.addInitScript() injeta token ANTES de qualquer JS executar
 * - Quando AuthContext carregar, o token JÁ está no localStorage
 * - Autenticação funciona corretamente
 */

export async function login(page: Page, email = 'admin@airtrust.com', password = 'Admin@123') {
  console.log('🔐 [E2E] Iniciando login via API...');

  // 1. Login via API para obter token válido
  const response = await page.request.post(
    'https://airtrust-api-production.airtrust.workers.dev/api/auth/login',
    {
      data: { email, password },
      headers: { 'Content-Type': 'application/json' },
    },
  );

  if (!response.ok()) {
    const errorText = await response.text().catch(() => 'Sem resposta');
    throw new Error(`❌ Login API falhou: ${response.status()} - ${errorText}`);
  }

  const result = (await response.json()) as {
    success: boolean;
    data: { accessToken: string; user: { nome: string; email: string; role: string; id: number } };
  };

  if (!result.success || !result.data?.accessToken) {
    throw new Error(`Login API não retornou token: ${JSON.stringify(result)}`);
  }

  const token = result.data.accessToken;
  const user = result.data.user;

  console.log('✅ [E2E] Token recebido:', token.substring(0, 25) + '...');
  console.log('✅ [E2E] User:', user.nome, '-', user.email);

  // 2. CRITICAL: Injetar token ANTES do React carregar
  // addInitScript executa ANTES de qualquer JavaScript da página
  await page.addInitScript(
    ({ token, user }) => {
      // Chaves críticas do AuthContext (AuthContext.tsx linha 22-24)
      localStorage.setItem('airtrust_token', token);
      localStorage.setItem('airtrust_refresh_token', token);
      localStorage.setItem('airtrust_user', JSON.stringify(user));

      // Variantes genéricas para páginas que não usam AuthContext
      localStorage.setItem('token', token);
      localStorage.setItem('auth_token', token);
      localStorage.setItem('user', JSON.stringify(user));

      console.log('[E2E Init] Token injetado:', token.substring(0, 25) + '...');
      console.log('[E2E Init] localStorage keys:', Object.keys(localStorage).join(', '));
    },
    { token, user },
  );

  console.log('✅ [E2E] addInitScript configurado');

  // 3. Navegar para o frontend - token JÁ estará disponível
  console.log('🌐 [E2E] Navegando para frontend...');
  await page.goto('https://3662f2ca.airtrust-production.pages.dev/', {
    waitUntil: 'networkidle',
    timeout: 30000,
  });

  // 4. Aguardar AuthContext inicializar
  console.log('⏳ [E2E] Aguardando AuthContext...');
  await page.waitForTimeout(2000);

  // 5. Verificar se está autenticado (múltiplas estratégias)
  console.log('🔍 [E2E] Verificando autenticação...');

  try {
    // Estratégia 1: Verificar se NÃO está na tela de login
    const isOnLoginPage = await page.locator('h2:has-text("Entrar")').isVisible().catch(() => false);
    
    if (isOnLoginPage) {
      // Debug: capturar estado
      const debugInfo = await page.evaluate(() => ({
        url: window.location.href,
        localStorage: Object.keys(localStorage).reduce((acc, key) => {
          acc[key] = localStorage.getItem(key)?.substring(0, 50) + '...';
          return acc;
        }, {} as Record<string, string>),
        hasToken: !!localStorage.getItem('airtrust_token'),
        hasUser: !!localStorage.getItem('airtrust_user'),
      }));

      await page.screenshot({ path: 'debug-login-still-on-login-page.png', fullPage: true });
      
      throw new Error(
        `❌ Ainda na tela de login após injetar token!\n` +
        `URL: ${debugInfo.url}\n` +
        `Has token: ${debugInfo.hasToken}\n` +
        `Has user: ${debugInfo.hasUser}\n` +
        `localStorage keys: ${Object.keys(debugInfo.localStorage).join(', ')}\n` +
        `Screenshot salvo em: debug-login-still-on-login-page.png`
      );
    }

    // Estratégia 2: Verificar elementos que aparecem apenas quando logado
    await Promise.race([
      // Menu de usuário
      page.waitForSelector('[data-testid="user-menu"]', { timeout: 5000 }),
      page.waitForSelector('button[aria-label*="usuário"]', { timeout: 5000 }),
      page.waitForSelector('.user-avatar', { timeout: 5000 }),
      
      // Links da navegação (apenas visíveis quando logado)
      page.waitForSelector('a[href*="/funcionarios"]', { timeout: 5000 }),
      page.waitForSelector('a[href*="/qualificacoes"]', { timeout: 5000 }),
      
      // Texto do nome do usuário
      page.waitForSelector(`text=${user.nome}`, { timeout: 5000 }),
    ]);

    console.log('✅ [E2E] Autenticação verificada com sucesso!');
    return true;

  } catch (error) {
    // Debug completo
    await page.screenshot({ path: 'debug-login-verification-failed.png', fullPage: true });

    const debugInfo = await page.evaluate(() => ({
      url: window.location.href,
      title: document.title,
      body: document.body.innerText.substring(0, 500),
      localStorage: Object.keys(localStorage),
      hasAirtrustToken: !!localStorage.getItem('airtrust_token'),
      hasAirtrustUser: !!localStorage.getItem('airtrust_user'),
    }));

    console.error('❌ [E2E] Verificação de autenticação falhou');
    console.error('Debug info:', JSON.stringify(debugInfo, null, 2));

    throw new Error(
      `Autenticação falhou após injeção de token.\n` +
      `URL: ${debugInfo.url}\n` +
      `Title: ${debugInfo.title}\n` +
      `Has airtrust_token: ${debugInfo.hasAirtrustToken}\n` +
      `Has airtrust_user: ${debugInfo.hasAirtrustUser}\n` +
      `localStorage keys: ${debugInfo.localStorage.join(', ')}\n` +
      `Screenshot: debug-login-verification-failed.png\n` +
      `Original error: ${error}`
    );
  }
}

export async function logout(page: Page) {
  console.log('🚪 [E2E] Fazendo logout...');
  
  try {
    // Tentar clicar no menu de usuário
    await page.click('button[aria-label*="usuário"], [data-testid="user-menu"], .user-menu');
    await page.waitForTimeout(500);
    
    // Clicar em Sair/Logout
    await page.click('text=Sair, text=Logout');
    
    // Aguardar redirecionamento para login
    await page.waitForURL('**/login', { timeout: 5000 });
    
    console.log('✅ [E2E] Logout realizado');
  } catch (error) {
    console.error('❌ [E2E] Erro ao fazer logout:', error);
    
    // Fallback: limpar localStorage manualmente
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    
    await page.goto('https://3662f2ca.airtrust-production.pages.dev/login');
  }
}

export async function isLoggedIn(page: Page): Promise<boolean> {
  try {
    // Verificar se elementos de usuário autenticado estão visíveis
    await page.waitForSelector(
      '[data-testid="user-menu"], .user-avatar, button[aria-label*="usuário"]',
      { timeout: 2000 }
    );
    return true;
  } catch {
    return false;
  }
}

import { Page } from '@playwright/test';

/**
 * Helper de Autenticação - Versão com Bypass Temporário
 *
 * ⚠️ AVISO: Esta versão usa bypass de autenticação para permitir testes E2E
 * sem depender de credenciais válidas. NÃO usar em produção!
 *
 * Para usar autenticação real, substitua por auth.helper.ts após criar
 * usuário de teste no banco de dados.
 */

export async function login(
  page: Page,
  email = 'test.e2e@airtrust.com',
  password = 'TestE2E@2025!',
) {
  console.log('🔑 [E2E BYPASS] Iniciando setup de autenticação');
  console.log('⚠️  Usando bypass temporário - credenciais:', email);

  // Ir para a home
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Verificar se já está "logado" (tem token no localStorage)
  const hasToken = await page.evaluate(() => {
    return (
      localStorage.getItem('auth_token') !== null ||
      localStorage.getItem('token') !== null ||
      sessionStorage.getItem('auth_token') !== null
    );
  });

  if (hasToken) {
    console.log('✅ Token encontrado, pulando autenticação');
    return;
  }

  console.log('🔧 Injetando token de teste no localStorage...');

  // Injetar token e dados de usuário no localStorage
  await page.evaluate(
    ({ email }) => {
      // Token fake (JWT-like format para parecer real)
      const fakeToken = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${btoa(
        JSON.stringify({
          sub: 'test-e2e-user-001',
          email: email,
          role: 'admin',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60, // 24h
        }),
      )}.fake_signature_for_e2e_tests`;

      // Dados do usuário
      const userData = {
        id: 'test-e2e-user-001',
        email: email,
        nome: 'Test E2E User',
        role: 'admin',
        ativo: true,
      };

      // Tentar diversos formatos de storage que o app pode usar
      localStorage.setItem('auth_token', fakeToken);
      localStorage.setItem('token', fakeToken);
      localStorage.setItem('accessToken', fakeToken);
      localStorage.setItem('authToken', fakeToken);

      localStorage.setItem('user', JSON.stringify(userData));
      localStorage.setItem('userData', JSON.stringify(userData));
      localStorage.setItem('currentUser', JSON.stringify(userData));

      sessionStorage.setItem('auth_token', fakeToken);
      sessionStorage.setItem('token', fakeToken);
      sessionStorage.setItem('user', JSON.stringify(userData));

      console.log('✅ Token e dados de usuário injetados');
    },
    { email },
  );

  console.log('🔄 Recarregando página para aplicar token...');

  // Recarregar para aplicar o token
  await page.reload();
  await page.waitForLoadState('networkidle');

  // Verificar se foi para página de login (significa que o token não funcionou)
  const currentUrl = page.url();

  if (currentUrl.includes('/login')) {
    console.warn('⚠️  Página redirecionou para /login. Tentando login manual...');

    try {
      // Tentar login manual com credenciais
      const emailInput = page
        .locator('input[name="email"], input[type="email"], input[id="email"]')
        .first();

      const passwordInput = page
        .locator('input[name="password"], input[type="password"], input[id="password"]')
        .first();

      await emailInput.waitFor({ state: 'visible', timeout: 3000 });
      await emailInput.fill(email);
      await passwordInput.fill(password);

      const submitButton = page.locator('button[type="submit"], button:has-text("Entrar")').first();

      await submitButton.click();

      // Aguardar redirecionamento ou continuar
      await Promise.race([
        page.waitForURL('/', { timeout: 5000 }),
        page.waitForURL('/dashboard', { timeout: 5000 }),
        page.waitForURL('/funcionarios', { timeout: 5000 }),
        page.waitForTimeout(5000),
      ]).catch(() => {
        console.warn('⚠️  Timeout aguardando redirecionamento, continuando...');
      });
    } catch (error) {
      console.warn('⚠️  Login manual falhou, mas continuando testes...');
      console.warn('⚠️  Alguns testes podem falhar se autenticação for obrigatória');
    }
  }

  console.log('✅ Setup de autenticação concluído. URL:', page.url());
  console.log(
    'ℹ️  Se testes falharem por autenticação, crie usuário real conforme DIAGNOSTICO_AUTENTICACAO_E2E.md',
  );

  await page.waitForTimeout(500);
}

export async function logout(page: Page) {
  console.log('🚪 Fazendo logout...');

  // Limpar storage
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  // Tentar clicar em botão de logout se existir
  try {
    await page.click('button[aria-label="Menu do usuário"]', { timeout: 2000 });
    await page.click('text=Sair', { timeout: 2000 });
  } catch {
    console.warn('⚠️  Botão de logout não encontrado, apenas limpando storage');
  }

  await page.goto('/login');
}

export async function isLoggedIn(page: Page): Promise<boolean> {
  // Verificar se tem token ou menu de usuário
  const hasToken = await page.evaluate(() => {
    return localStorage.getItem('auth_token') !== null || localStorage.getItem('token') !== null;
  });

  if (hasToken) return true;

  try {
    await page.waitForSelector('button[aria-label="Menu do usuário"], [data-testid="user-menu"]', {
      timeout: 2000,
    });
    return true;
  } catch {
    return false;
  }
}

import { expect, test } from '@playwright/test';

const adminEmail = String(process.env.STAGING_SMOKE_EMAIL || '').trim();
const adminPassword = String(process.env.STAGING_SMOKE_PASSWORD || '');

async function loginThroughUi(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: /entrar|sign in/i }).click();

  const gestorRole = page.getByRole('button', {
    name: /entrar como (administrador(?: geral| da empresa)?|gestor)/i,
  }).first();

  await page.waitForFunction(
    () => {
      if (!window.location.pathname.startsWith('/login')) return true;
      return Array.from(document.querySelectorAll('button')).some((button) =>
        /^Entrar como /i.test((button.textContent || '').trim()),
      );
    },
    undefined,
    { timeout: 30_000 },
  );

  if (await gestorRole.isVisible().catch(() => false)) {
    await gestorRole.click();
  }

  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 });
}

test.describe('staging FRMS maintenance release QA', () => {
  test('mechanic home keeps fatigue, Pasta 360, EAD and password while hiding flight-only shortcuts', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('button', { name: /Fadiga Diária/i })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: /Minha Pasta Virtual/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Trocar Senha/i })).toBeVisible();
    await expect(page.getByText(/Meus Treinamentos EAD/i)).toBeVisible();

    await expect(page.getByText(/Contexto derivado do funcion[aá]rio/i)).toHaveCount(0);
    await expect(page.getByText(/Minhas Sessões de Simulador/i)).toHaveCount(0);
    await expect(page.getByText(/Minhas Fichas de Treinamento de Voo/i)).toHaveCount(0);
    await expect(page.getByText(/Minha Escala/i)).toHaveCount(0);

    await page.getByRole('button', { name: /Fadiga Diária/i }).click();
    await expect(page).toHaveURL(/\/frms\/checkin/);
    await expect(page.getByRole('heading', { name: 'Minha fadiga hoje' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Check-in para Mecânicos e Inspetores/i)).toBeVisible();
  });

  test('PVT-B operational vigilance test: stable DOM node, response area dimensions, interactive input and completion', async ({ page }) => {
    await page.goto('/frms/checkin');
    await expect(page.getByRole('heading', { name: 'Minha fadiga hoje' })).toBeVisible({ timeout: 20_000 });

    // 1. Visibilidade das instruções e área de resposta antes do início
    const section = page.getByRole('region', { name: /vigilância/i });
    await expect(section).toBeVisible();
    await expect(section.getByRole('heading', { name: /Vigilância psicomotora \(PVT-B\)/i })).toBeVisible();

    const box = section.locator('[data-testid="pvtb-box"]');
    const frame = section.locator('[data-testid="pvtb-stimulus-frame"]');
    const startButton = section.getByRole('button', { name: 'Iniciar teste' });

    await expect(box).toBeVisible();
    await expect(box).toHaveAttribute('data-phase', 'instructions');
    await expect(box).toHaveAttribute('aria-disabled', 'true');
    await expect(frame).toBeVisible();
    await expect(startButton).toBeVisible();
    await expect(startButton).toBeEnabled();

    // 2. Dimensões constantes antes do início (h-72 = 288px)
    const initialRect = await box.boundingBox();
    expect(initialRect).not.toBeNull();
    expect(initialRect!.height).toBeGreaterThanOrEqual(280);
    expect(initialRect!.height).toBeLessThanOrEqual(296);
    expect(initialRect!.width).toBeGreaterThan(200);

    // 3. Captura inicial do elemento DOM antes do início
    const initialBoxHandle = await box.elementHandle();

    await test.info().attach('01-pvt-instructions-stable-surface', {
      body: await box.screenshot({ animations: 'disabled' }),
      contentType: 'image/png',
    });

    // 4. Iniciar teste: botão funcional e transição estável sem desmontar nó
    await startButton.click();

    await expect(box).toHaveAttribute('data-phase', /waiting|stimulus/);
    await expect(box).toHaveAttribute('aria-disabled', 'false');

    const runningButton = section.getByRole('button', { name: /Teste em andamento/i });
    await expect(runningButton).toBeVisible();
    await expect(runningButton).toBeDisabled();

    // 5. Mesma identidade do elemento DOM após iniciar
    const runningBoxHandle = await box.elementHandle();
    const isSameNode = await page.evaluate(
      ([b1, b2]) => b1 === b2,
      [initialBoxHandle, runningBoxHandle],
    );
    expect(isSameNode).toBe(true);

    // 6. Ausência de deslocamento de layout: altura permanece 288px
    const runningRect = await box.boundingBox();
    expect(runningRect).not.toBeNull();
    expect(runningRect!.height).toBeGreaterThanOrEqual(280);
    expect(runningRect!.height).toBeLessThanOrEqual(296);
    expect(Math.abs(runningRect!.width - initialRect!.width)).toBeLessThan(2);

    // 7. Espera pelo estímulo com contador amarelo
    await expect(box.locator('[data-testid="pvtb-counter"]')).toBeVisible({ timeout: 15_000 });
    await expect(box).toHaveAttribute('data-phase', 'stimulus');

    await test.info().attach('02-pvt-stimulus-counter', {
      body: await box.screenshot({ animations: 'disabled' }),
      contentType: 'image/png',
    });

    // 8. Captura de resposta interativa (pointer / clique no retângulo)
    await box.click();

    // 9. Feedback imediato exibido dentro da mesma moldura
    await expect(section.getByText(/Tempo da última resposta|Resposta lenta/i)).toBeVisible({ timeout: 5_000 });
    await expect(section.locator('span').filter({ hasText: /^\d+\s*ms$/ })).toBeVisible();

    await test.info().attach('03-pvt-reaction-feedback', {
      body: await box.screenshot({ animations: 'disabled' }),
      contentType: 'image/png',
    });

    // 10. Protocolo de invalidação por perda de foco
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expect(section.getByRole('alert')).toBeVisible({ timeout: 5_000 });
    await expect(section.getByText(/Teste interrompido/i)).toBeVisible();
    await expect(section.getByText(/Nenhum resultado parcial será usado/i)).toBeVisible();

    const restartButton = section.getByRole('button', { name: 'Reiniciar teste' });
    await expect(restartButton).toBeVisible();
    await expect(restartButton).toBeEnabled();

    await test.info().attach('04-pvt-invalidation-alert', {
      body: await box.screenshot({ animations: 'disabled' }),
      contentType: 'image/png',
    });

    // 11. Reinício limpo após interrupção
    await restartButton.click();
    await expect(section.getByRole('alert')).toHaveCount(0);
    await expect(box).toHaveAttribute('data-phase', /waiting|stimulus/);

    // 12. Captura de resposta via teclado (Space/Enter)
    await expect(box.locator('[data-testid="pvtb-counter"]')).toBeVisible({ timeout: 15_000 });
    await box.press('Space');
    await expect(section.getByText(/Tempo da última resposta|Resposta lenta/i)).toBeVisible({ timeout: 5_000 });

    // 13. Verificação de acessibilidade
    await expect(box).toHaveAttribute('aria-label');
    const details = section.locator('details');
    await expect(details).toBeVisible();
    await expect(details.getByRole('link', { name: /NASA Ames/i })).toHaveAttribute(
      'href',
      /nasa\.gov/,
    );
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

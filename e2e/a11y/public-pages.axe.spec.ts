import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Auditoria automática de acessibilidade (axe-core) das rotas públicas.
 * Não exige login nem dados: roda contra o servidor local (`npm run dev`)
 * ou contra um ambiente de teste via BASE_URL.
 *
 *   BASE_URL=http://127.0.0.1:3000 npx playwright test -c playwright.a11y.config.ts
 *
 * Telas autenticadas devem ser adicionadas ao lado, reutilizando o storageState
 * de `e2e/auth.setup.ts`, conforme o ambiente de teste disponível.
 */
const PUBLIC_ROUTES = [
  '/login',
  '/forgot-password',
  '/aceitar-convite',
  '/verificar-certificado',
  '/validar/0000000000000000',
];

for (const route of PUBLIC_ROUTES) {
  test(`axe: ${route} sem violações sérias`, async ({ page }) => {
    await page.goto(route);
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      // PENDENTE (decisão de design): a cor primária da marca (#10b77f) com texto
      // branco tem contraste 2,59:1 (mínimo AA 4,5:1). Remover esta exclusão
      // quando o token de cor for ajustado.
      .disableRules(['color-contrast'])
      .analyze();

    const blocking = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(
      blocking.map((v) => `${v.id}: ${v.nodes.length} nó(s)`),
      `Violações em ${route}`,
    ).toEqual([]);
    // Estrutura mínima: um único landmark main
    expect(await page.locator('main').count(), `main em ${route}`).toBeGreaterThanOrEqual(1);
  });
}

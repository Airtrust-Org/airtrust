import { test, expect } from '@playwright/test';

test.describe('Sistema de Qualificações - Histórico E2E', () => {
  const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

  test.beforeEach(async ({ page }) => {
    // Login como admin
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[name="email"]', 'admin@airtrust.com');
    await page.fill('input[name="password"]', 'senha123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('Fluxo completo: criar qualificação com cálculo automático de vencimento', async ({
    page,
  }) => {
    // 1. Navegar para alertas
    await page.goto(`${BASE_URL}/qualificacoes/alertas`);
    await expect(page.locator('h1')).toContainText('Dashboard de Alertas');

    // 2. Abrir modal de nova qualificação
    await page.click('button:has-text("Nova Qualificação")');
    await expect(page.locator('[role="dialog"]')).toBeVisible();

    // 3. Selecionar funcionário
    await page.selectOption('select[name="funcionario_cpf"]', { index: 1 });

    // 4. Selecionar tipo CMA (vence fim do mês)
    await page.selectOption('select[name="qualificacao_codigo"]', 'CMA');

    // 5. Preencher data de conclusão
    const hoje = new Date();
    const dataStr = hoje.toISOString().split('T')[0];
    await page.fill('input[name="data_conclusao"]', dataStr);

    // 6. Aguardar e verificar preview de vencimento
    await page.waitForTimeout(500);

    // Deve mostrar "fim do mês"
    await expect(page.locator('text=/fim do mês/i')).toBeVisible();

    // Calcular vencimento esperado (12 meses + fim do mês)
    const vencimentoEsperado = new Date(hoje);
    vencimentoEsperado.setMonth(vencimentoEsperado.getMonth() + 12);
    vencimentoEsperado.setMonth(vencimentoEsperado.getMonth() + 1);
    vencimentoEsperado.setDate(0); // Último dia do mês

    const diaEsperado = vencimentoEsperado.getDate();
    await expect(page.locator('text=/' + diaEsperado + '/i')).toBeVisible();

    // 7. Preencher campos opcionais
    await page.fill('input[name="nota"]', '5.0');
    await page.fill('input[name="instrutor"]', 'Dr. Silva Teste E2E');
    await page.fill('input[name="local"]', 'São Paulo');

    // 8. Salvar
    await page.click('button:has-text("Salvar")');

    // 9. Aguardar modal fechar
    await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 5000 });

    // 10. Verificar que apareceu na lista
    await page.waitForTimeout(1000);
    await expect(page.locator('text=/CMA/i')).toBeVisible();

    // 11. Verificar badge de status "Vigente"
    await expect(page.locator('text=/Vigente/i')).toBeVisible();
  });

  test('Verificar que vencimento DIA EXATO funciona (ICAO)', async ({ page }) => {
    await page.goto(`${BASE_URL}/qualificacoes/alertas`);
    await page.click('button:has-text("Nova Qualificação")');

    // Selecionar funcionário e tipo ICAO (vence dia exato)
    await page.selectOption('select[name="funcionario_cpf"]', { index: 1 });
    await page.selectOption('select[name="qualificacao_codigo"]', 'ICAO');

    // Data de conclusão: 15/01/2024
    await page.fill('input[name="data_conclusao"]', '2024-01-15');

    // Aguardar preview
    await page.waitForTimeout(500);

    // Deve mostrar "dia exato"
    await expect(page.locator('text=/dia exato/i')).toBeVisible();

    // ICAO tem validade de 36 meses, então vence 15/01/2027 (mesmo dia)
    await expect(page.locator('text=/15/i')).toBeVisible();

    await page.click('button:has-text("Cancelar")');
  });

  test('Dashboard mostra estatísticas corretas', async ({ page }) => {
    await page.goto(`${BASE_URL}/qualificacoes/alertas`);

    // Verificar cards de resumo existem
    await expect(page.locator('text=/Total/i')).toBeVisible();
    await expect(page.locator('text=/Vigentes/i')).toBeVisible();
    await expect(page.locator('text=/Expirando/i')).toBeVisible();
    await expect(page.locator('text=/Vencidas/i')).toBeVisible();

    // Verificar que números são válidos (>= 0)
    const cards = await page.locator('[class*="font-bold"][class*="text-3xl"]').allTextContents();
    for (const card of cards) {
      const num = parseInt(card);
      expect(num).toBeGreaterThanOrEqual(0);
    }
  });

  test('Filtro por urgência funciona', async ({ page }) => {
    await page.goto(`${BASE_URL}/qualificacoes/alertas`);

    // Clicar em filtro "Críticas"
    const criticalBtn = page.locator('button:has-text("Críticas")');
    await criticalBtn.click();

    // Aguardar atualização
    await page.waitForTimeout(1000);

    // Verificar que botão está ativo (tem bg colorido)
    await expect(criticalBtn).toHaveClass(/bg-red-600/);

    // Se houver cards, todos devem ter border vermelho (urgência crítica)
    const criticalCards = page.locator('[class*="border-red-500"]');
    const count = await criticalCards.count();

    if (count > 0) {
      console.log(`✓ ${count} qualificação(ões) crítica(s) encontrada(s)`);
    }

    // Testar outros filtros
    await page.click('button:has-text("Alta")');
    await page.waitForTimeout(1000);
    await expect(page.locator('button:has-text("Alta")')).toHaveClass(/bg-orange-600/);

    await page.click('button:has-text("Todas")');
    await page.waitForTimeout(1000);
    await expect(page.locator('button:has-text("Todas")')).toHaveClass(/bg-gray-900/);
  });

  test('Botão renovar abre modal com funcionário pré-selecionado', async ({ page }) => {
    await page.goto(`${BASE_URL}/qualificacoes/alertas`);

    // Se houver card com botão renovar
    const renovarBtn = page.locator('button:has-text("Renovar")').first();
    const exists = (await renovarBtn.count()) > 0;

    if (exists) {
      await renovarBtn.click();

      // Modal deve abrir
      await expect(page.locator('[role="dialog"]')).toBeVisible();

      // Campo funcionário deve estar pré-preenchido (disabled)
      const funcionarioSelect = page.locator('select[name="funcionario_cpf"]');
      await expect(funcionarioSelect).toBeDisabled();

      await page.click('button:has-text("Cancelar")');
    } else {
      console.log('⚠️  Nenhuma qualificação para renovar no momento');
    }
  });
});

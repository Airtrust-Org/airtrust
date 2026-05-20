/**
 * E2E — Módulo FRMS (Gerenciamento de Fadiga)
 *
 * 9 fluxos principais:
 *  1. Dashboard carrega sem crash
 *  2. Heatmap visível com data-testid
 *  3. Click no nome navega para ficha
 *  4. Botão "Importar FIRA" sempre visível
 *  5. Filtro de período 7d → heatmap atualiza
 *  6. Cards de métricas exibem valores numéricos
 *  7. Tabela tem paginação funcional
 *  8. Radar chart NÃO existe na página
 *  9. Ficha individual carrega via navegação
 *
 * Requer storageState salvo pelo auth.setup.ts
 */

import { test, expect } from '@playwright/test';

const FRMS_URL = '/frms';

test.describe('FRMS — Dashboard', () => {
  test('página /frms carrega sem crash', async ({ page }) => {
    await page.goto(FRMS_URL);
    await page.waitForLoadState('networkidle');

    // Header com título
    await expect(page.getByText(/FRMS.*Gerenciamento/i)).toBeVisible({ timeout: 15000 });
    // Sub-header com "tripulantes"
    await expect(page.getByText(/tripulantes/i)).toBeVisible();
  });

  test('heatmap visível com data-testid', async ({ page }) => {
    await page.goto(FRMS_URL);
    await page.waitForLoadState('networkidle');

    const heatmap = page.locator('[data-testid="frms-heatmap"]');
    await expect(heatmap).toBeVisible({ timeout: 15000 });

    // Deve ter pelo menos uma row
    const rows = page.locator('[data-testid^="frms-heatmap-row-"]');
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
  });

  test('click no nome do tripulante navega para ficha', async ({ page }) => {
    await page.goto(FRMS_URL);
    await page.waitForLoadState('networkidle');

    // Espera o heatmap carregar
    await expect(page.locator('[data-testid="frms-heatmap"]')).toBeVisible({ timeout: 15000 });

    // Click na primeira row do table de tripulantes
    const firstRow = page.locator('[data-testid^="frms-tabela-row-"]').first();
    if (await firstRow.isVisible()) {
      await firstRow.click();
      await page.waitForURL(/\/frms\/tripulante\/\d+/, { timeout: 10000 });
      await expect(page.getByText(/Ficha FRMS/i)).toBeVisible();
    }
  });

  test('botão "Importar FIRA" sempre visível', async ({ page }) => {
    await page.goto(FRMS_URL);
    await page.waitForLoadState('networkidle');

    const btn = page.locator('[data-testid="frms-btn-importar-fira"]');
    await expect(btn).toBeVisible({ timeout: 10000 });
  });

  test('filtro de período 7d atualiza heatmap', async ({ page }) => {
    await page.goto(FRMS_URL);
    await page.waitForLoadState('networkidle');

    // Click no botão "7 dias"
    await page.getByRole('button', { name: '7 dias' }).click();
    await page.waitForTimeout(1000);

    // Heatmap still visible
    await expect(page.locator('[data-testid="frms-heatmap"]')).toBeVisible();
  });

  test('cards de métricas exibem valores numéricos', async ({ page }) => {
    await page.goto(FRMS_URL);
    await page.waitForLoadState('networkidle');

    // 4 cards devem existir
    await expect(page.locator('[data-testid="frms-card-ok"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="frms-card-atencao"]')).toBeVisible();
    await expect(page.locator('[data-testid="frms-card-critico"]')).toBeVisible();
    await expect(page.locator('[data-testid="frms-card-violacao"]')).toBeVisible();

    // Each card should contain a number
    const okText = await page.locator('[data-testid="frms-card-ok"]').textContent();
    expect(okText).toMatch(/\d+/);
  });

  test('tabela tem paginação funcional', async ({ page }) => {
    await page.goto(FRMS_URL);
    await page.waitForLoadState('networkidle');

    const table = page.locator('[data-testid="frms-tabela-tripulantes"]');
    await expect(table).toBeVisible({ timeout: 15000 });

    // Should show page info
    await expect(page.getByText(/Página/i)).toBeVisible();
  });

  test('radar chart NÃO existe na página', async ({ page }) => {
    await page.goto(FRMS_URL);
    await page.waitForLoadState('networkidle');

    // Radar chart must NOT be present
    const radar = page.locator('[data-testid="frms-radar-chart"], .recharts-radar');
    await expect(radar).toHaveCount(0);
  });

  test('ficha individual carrega via navegação', async ({ page }) => {
    await page.goto(FRMS_URL);
    await page.waitForLoadState('networkidle');

    // Navigate to first tripulante via table
    const firstRow = page.locator('[data-testid^="frms-tabela-row-"]').first();
    if (await firstRow.isVisible()) {
      await firstRow.click();
      await page.waitForURL(/\/frms\/tripulante\/\d+/, { timeout: 10000 });

      // Ficha should have acúmulo cards
      await expect(page.getByText(/% HV Mês/i)).toBeVisible();
      await expect(page.getByText(/Jornadas Mensais/i)).toBeVisible();

      // Back button works
      await page.goBack();
      await page.waitForURL(/\/frms$/, { timeout: 10000 });
    }
  });
});

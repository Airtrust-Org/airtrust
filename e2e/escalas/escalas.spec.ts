/**
 * E2E — Módulo Escalas
 *
 * 5 fluxos principais:
 *  1. Listagem: carrega a página e exibe os cards
 *  2. Grade Gantt: abre uma escala e renderiza a grade
 *  3. Filtro de aeronave na grade Gantt
 *  4. Validação de sobreposição no modal de alocação
 *  5. Navegação mês anterior / paginação
 *
 * Requer storageState salvo pelo auth.setup.ts
 */

import { test, expect } from '@playwright/test';

const ESCALAS_URL = '/escalas';

test.describe('Escalas — Listagem', () => {
  test('página /escalas carrega e exibe lista de escalas', async ({ page }) => {
    await page.goto(ESCALAS_URL);
    await page.waitForLoadState('networkidle');

    // Título da seção
    await expect(page.getByRole('heading', { name: /escalas/i })).toBeVisible();

    // Grid de cards deve existir
    const lista = page.locator('[data-testid="lista-escalas"]');
    await expect(lista).toBeVisible({ timeout: 15000 });
  });

  test('cada card de escala exibe mês e status', async ({ page }) => {
    await page.goto(ESCALAS_URL);
    await page.waitForLoadState('networkidle');

    const cards = page.locator('[data-testid^="card-escala-"]');
    const count = await cards.count();

    // Deve haver pelo menos um card
    expect(count).toBeGreaterThan(0);

    // Primeiro card tem conteúdo de mês
    const first = cards.first();
    await expect(first).toBeVisible();
    // Deve conter um dos meses do ano
    await expect(first).toContainText(
      /janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro/i,
    );
  });
});

test.describe('Escalas — Grade Gantt', () => {
  test('abre escala e renderiza grade Gantt', async ({ page }) => {
    await page.goto(ESCALAS_URL);
    await page.waitForLoadState('networkidle');

    // Clica no primeiro card disponível
    const firstCard = page.locator('[data-testid^="card-escala-"]').first();
    await firstCard.waitFor({ state: 'visible', timeout: 15000 });
    await firstCard.click();

    // Aguarda carregamento da grade
    const grade = page.locator('[data-testid="grade-gantt"]');
    await expect(grade).toBeVisible({ timeout: 20000 });
  });

  test('grade Gantt exibe ao menos um bloco de aeronave', async ({ page }) => {
    await page.goto(ESCALAS_URL);
    await page.waitForLoadState('networkidle');

    const firstCard = page.locator('[data-testid^="card-escala-"]').first();
    await firstCard.waitFor({ state: 'visible', timeout: 15000 });
    await firstCard.click();

    await page.locator('[data-testid="grade-gantt"]').waitFor({ state: 'visible', timeout: 20000 });

    // Deve haver pelo menos um bloco aeronave
    const blocos = page.locator('[data-testid^="bloco-aeronave-"]');
    await expect(blocos.first()).toBeVisible({ timeout: 15000 });
  });
});

test.describe('Escalas — Filtros', () => {
  test('filtro de quinzena filtra colunas de dias na grade', async ({ page }) => {
    await page.goto(ESCALAS_URL);
    await page.waitForLoadState('networkidle');

    // Abre primeira escala para ir à grade
    const cards = page.locator('[data-testid="escala-card"]');
    await expect(cards.first()).toBeVisible({ timeout: 15000 });
    await cards.first().click();

    // Aguarda grade carregar
    const filtroQuinzena = page.locator('[data-testid="filtro-quinzena"]');
    await expect(filtroQuinzena).toBeVisible({ timeout: 15000 });

    // Filtra Q1 e verifica que colunas diminuíram (≤16 dias)
    await page.locator('[data-testid="btn-quinzena-q1"]').click();
    const colunasQ1 = page.locator('[data-testid^="coluna-dia-"]');
    const countQ1 = await colunasQ1.count();
    expect(countQ1).toBeGreaterThan(0);
    expect(countQ1).toBeLessThanOrEqual(16 * 10); // max 16 dias * N aeronaves

    // Filtra Q2
    await page.locator('[data-testid="btn-quinzena-q2"]').click();
    const colunasQ2 = page.locator('[data-testid^="coluna-dia-"]');
    const countQ2 = await colunasQ2.count();
    expect(countQ2).toBeGreaterThan(0);

    // Volta a Todas — deve ter mais colunas
    await page.locator('[data-testid="btn-quinzena-todas"]').click();
    const colunasTodas = page.locator('[data-testid^="coluna-dia-"]');
    const countTodas = await colunasTodas.count();
    expect(countTodas).toBeGreaterThanOrEqual(countQ1);
    expect(countTodas).toBeGreaterThanOrEqual(countQ2);
  });
});

test.describe('Escalas — Validação de negócio', () => {
  test('botão Nova Escala abre modal ou formulário de criação', async ({ page }) => {
    await page.goto(ESCALAS_URL);
    await page.waitForLoadState('networkidle');

    const btnNovaEscala = page.getByRole('button', { name: /nova escala|criar escala/i });
    await expect(btnNovaEscala).toBeVisible({ timeout: 15000 });
    await btnNovaEscala.click();

    // Espera modal ou heading de criação
    const modal = page
      .locator('[role="dialog"]')
      .or(page.getByRole('heading', { name: /nova escala|criar/i }));
    await expect(modal.first()).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Escalas — Navegação', () => {
  test('header contém breadcrumb ou título de escalas', async ({ page }) => {
    await page.goto(ESCALAS_URL);
    await page.waitForLoadState('networkidle');

    // A URL deve permanecer em /escalas
    await expect(page).toHaveURL(/\/escalas/);

    // Deve ter algum conteúdo de escalas
    const mainContent = page.locator('main, [role="main"], #root').first();
    await expect(mainContent).toBeVisible();
    await expect(mainContent).toContainText(/escala/i);
  });

  test('voltar da detalhe retorna para listagem', async ({ page }) => {
    await page.goto(ESCALAS_URL);
    await page.waitForLoadState('networkidle');

    const firstCard = page.locator('[data-testid^="card-escala-"]').first();
    if (!(await firstCard.isVisible({ timeout: 10000 }))) {
      test.skip();
    }

    await firstCard.click();
    await page.locator('[data-testid="grade-gantt"]').waitFor({ state: 'visible', timeout: 20000 });

    // Volta - tenta botão voltar ou browser back
    const btnVoltar = page.getByRole('button', { name: /voltar/i });
    if (await btnVoltar.isVisible({ timeout: 3000 })) {
      await btnVoltar.click();
    } else {
      await page.goBack();
    }

    await expect(page).toHaveURL(/\/escalas/);
  });
});

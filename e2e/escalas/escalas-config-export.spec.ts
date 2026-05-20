import { expect, test } from '@playwright/test';

const ESCALAS_URL = '/escalas';
const CONFIG_URL = '/escalas/configuracoes';

async function garantirSessao(page: import('@playwright/test').Page) {
  if (!page.url().includes('/login')) return;

  await page.getByRole('button', { name: 'Admin' }).click();
  await page.getByRole('button', { name: /^Entrar$/ }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30000 });
}

async function abrirEscalaDisponivel(page: import('@playwright/test').Page) {
  await page.goto(ESCALAS_URL);
  await garantirSessao(page);
  if (!page.url().includes('/escalas')) {
    await page.goto(ESCALAS_URL);
  }
  await page.waitForLoadState('networkidle');

  const cards = page.locator('[data-testid^="card-escala-"]');
  await expect(cards.first()).toBeVisible({ timeout: 20000 });
  await cards.first().click();

  await expect(page.getByRole('heading', { name: /Escala \d+\/\d+/i })).toBeVisible({
    timeout: 20000,
  });
}

test.describe('Escalas — configuracao e exportacao', () => {
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
      window.print = () => undefined;
    });
  });

  test('configuracao de tipos de evento exibe campo de sigla ao editar', async ({ page }) => {
    await page.goto(CONFIG_URL);
    await garantirSessao(page);
    if (!page.url().includes('/escalas/configuracoes')) {
      await page.goto(CONFIG_URL);
    }
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /Tipos de Evento/i }).click();
    await expect(page.getByRole('heading', { name: /Tipos de Evento/i })).toBeVisible();

    await page.getByRole('button', { name: 'Editar' }).first().click();

    const siglaInput = page.locator('input[placeholder="Sigla"]');
    await expect(siglaInput).toBeVisible();
    await expect(siglaInput).toHaveAttribute('maxlength', '2');
  });

  test('grade de tripulantes usa toda a largura e abre modal antes de exportar PDF', async ({
    page,
  }) => {
    await abrirEscalaDisponivel(page);

    await page.getByRole('button', { name: /^Tripulantes$/ }).click();
    const grade = page.locator('[data-testid="grade-tripulantes"]');
    await expect(grade).toBeVisible({ timeout: 20000 });

    const dimensoes = await grade.evaluate((section) => {
      const container = section.querySelector('div.overflow-x-auto') as HTMLElement | null;
      const table = section.querySelector('table') as HTMLElement | null;

      return {
        containerWidth: container?.getBoundingClientRect().width ?? 0,
        tableWidth: table?.getBoundingClientRect().width ?? 0,
      };
    });

    expect(dimensoes.containerWidth).toBeGreaterThan(0);
    expect(dimensoes.tableWidth).toBeGreaterThanOrEqual(dimensoes.containerWidth - 2);

    await page.getByRole('button', { name: /Mais/i }).click();
    await page.getByRole('button', { name: /^Exportar PDF$/i }).click();

    await expect(page.getByRole('heading', { name: /Exportar PDF/i })).toBeVisible();

    const popupPromise = page.waitForEvent('popup');
    await page.getByRole('button', { name: /Abrir PDF da visualização/i }).click();

    const popup = await popupPromise;
    await popup.waitForLoadState('domcontentloaded');
    await expect(popup.locator('main.airtrust-export-shell')).toBeVisible({ timeout: 20000 });
    await expect(popup.locator('body')).toContainText(/Cobertura de Tripulantes/i);
    await expect(popup.locator('body')).toContainText(/Escala Operacional/i);
    await expect(popup.locator('body')).toContainText(/Legenda e marcadores/i);
    await expect(popup.locator('body')).toContainText(/Elaborado por/i);
    await expect(popup.locator('body')).toContainText(/Aprovado por|Publicado por/i);
    await expect(popup.locator('[data-testid="grade-tripulantes"]')).toBeVisible();
  });

  test('visao por aeronave permite selecionar equipamentos para gerar PDFs separados', async ({
    page,
  }) => {
    await abrirEscalaDisponivel(page);

    await expect(page.locator('[data-testid="grade-gantt"]')).toBeVisible({ timeout: 20000 });

    await page.getByRole('button', { name: /Mais/i }).click();
    await page.getByRole('button', { name: /^Exportar PDF$/i }).click();

    await expect(page.getByRole('heading', { name: /Exportar PDF/i })).toBeVisible();
    await page.getByText(/Um PDF por equipamento/i).click();

    const firstCheckbox = page.locator('input[type="checkbox"]').first();
    await expect(firstCheckbox).toBeVisible();
    await firstCheckbox.uncheck();

    const popupPromise = page.waitForEvent('popup');
    await page.getByRole('button', { name: /Gerar \d+ PDF/i }).click();

    const popup = await popupPromise;
    await popup.waitForLoadState('domcontentloaded');
    await expect(popup.locator('main.airtrust-export-shell')).toBeVisible({ timeout: 20000 });
    await expect(popup.locator('body')).toContainText(/Equipamento /i);

    const blocos = popup.locator('[data-testid^="bloco-aeronave-"]');
    await expect(blocos.first()).toBeVisible({ timeout: 20000 });
    expect(await blocos.count()).toBe(1);
  });
});

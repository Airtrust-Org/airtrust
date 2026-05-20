import { expect, test } from '@playwright/test';

const ESCALAS_URL = '/escalas';

async function garantirSessao(page: import('@playwright/test').Page) {
  if (!page.url().includes('/login')) return;

  await page.getByRole('button', { name: 'Admin' }).click();
  await page.getByRole('button', { name: /^Entrar$/ }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30000 });
}

test.describe('Escalas — consistencia entre Aeronaves e Tripulantes', () => {
  test('grade por Tripulantes exibe sigla compacta e tooltip coerente para eventos operacionais', async ({
    page,
  }) => {
    await page.goto(ESCALAS_URL);
    await garantirSessao(page);
    if (!page.url().includes('/escalas')) {
      await page.goto(ESCALAS_URL);
    }
    await page.waitForLoadState('networkidle');

    const firstCard = page.locator('[data-testid^="card-escala-"]').first();
    await expect(firstCard).toBeVisible({ timeout: 20000 });
    await firstCard.click();

    await expect(page.getByRole('heading', { name: /Escala \d+\/\d+/i })).toBeVisible({
      timeout: 20000,
    });

    await page.getByRole('button', { name: /^Tripulantes$/ }).click();
    await expect(page.getByRole('heading', { name: /Cobertura de Tripulantes/i })).toBeVisible({
      timeout: 20000,
    });

    const resultado = await page.evaluate(() => {
      const table = document.querySelector('[data-testid="grade-tripulantes"] table');
      if (!table) return null;

      const rows = Array.from(table.querySelectorAll('tbody tr'));

      for (const row of rows) {
        const dayCells = Array.from(row.querySelectorAll('td')).slice(1);
        const cell = dayCells.find((td) => {
          const text = td.textContent?.trim() ?? '';
          if (!text || text === '+') return false;
          return Boolean(td.querySelector('[title]'));
        });
        const titleHolder = cell?.querySelector('[title]');

        if (cell && titleHolder) {
          return {
            cellText: cell.textContent?.trim() ?? null,
            title: titleHolder.getAttribute('title') ?? null,
          };
        }
      }

      return null;
    });

    expect(resultado).not.toBeNull();
    expect(resultado?.cellText).toMatch(/^[A-Z0-9]{1,2}$/);
    expect(resultado?.title).toBeTruthy();
    expect(resultado?.title).not.toContain('Conflito de agenda');
  });
});

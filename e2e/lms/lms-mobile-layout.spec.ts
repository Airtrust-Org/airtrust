import { expect, test } from '@playwright/test';

async function getHeadingBox(
  page: Parameters<typeof test>[0]['page'],
  path: string,
  title: RegExp,
) {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: title })).toBeVisible({ timeout: 20000 });
  await page.waitForTimeout(600);

  const box = await page.getByRole('heading', { name: title }).first().boundingBox();
  if (!box) {
    throw new Error(`Heading not measurable for ${path}`);
  }

  return box;
}

test.describe('LMS - layout padrao', () => {
  test('cabecalho do LMS alinha com os outros modulos', async ({ page }) => {
    const simuladores = await getHeadingBox(page, '/simuladores', /simuladores/i);
    const qualificacoes = await getHeadingBox(
      page,
      '/qualificacoes',
      /qualifica[cç][õo]es e certifica[cç][õo]es/i,
    );
    const lms = await getHeadingBox(page, '/lms/cursos', /cat[aá]logo lms/i);

    expect(Math.abs(lms.x - simuladores.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(lms.y - simuladores.y)).toBeLessThanOrEqual(2);
    expect(Math.abs(lms.x - qualificacoes.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(lms.y - qualificacoes.y)).toBeLessThanOrEqual(2);
  });

  test('catalogo nao gera overflow horizontal e fecha modal no backdrop', async ({ page }) => {
    await page.goto('/lms/cursos', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /cat[aá]logo lms/i })).toBeVisible({
      timeout: 20000,
    });

    const metrics = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));

    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth + 1);

    const editar = page.getByRole('button', { name: /editar/i }).first();
    await expect(editar).toBeVisible({ timeout: 15000 });
    await editar.click();

    const salvar = page.getByRole('button', { name: /salvar altera[cç][õo]es/i });
    await expect(salvar).toBeVisible({ timeout: 10000 });

    await page.mouse.click(8, 8);
    await expect(salvar).toBeHidden({ timeout: 10000 });
  });
});

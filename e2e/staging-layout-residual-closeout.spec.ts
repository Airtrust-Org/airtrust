import { expect, test, type Page } from '@playwright/test';

const STAGING_API_BASE_URL =
  process.env.STAGING_API_BASE_URL || 'https://airtrust-api-staging.airtrust.workers.dev';
const RUN_MARKER = process.env.QA_RUN_MARKER || `layout-closeout-${Date.now()}`;

async function waitForApp(page: Page) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
  await expect(page.locator('body')).toBeVisible();
  const body = await page.locator('body').innerText();
  expect(body).not.toMatch(/SQLITE_ERROR|D1_ERROR|no such (?:table|column)|stack trace/i);
  expect(new URL(page.url()).pathname).not.toMatch(/^\/login(?:\/|$)/);
}

async function readBearer(page: Page): Promise<string> {
  const token = await page.evaluate(
    () =>
      window.localStorage.getItem('airtrust_token') ||
      window.sessionStorage.getItem('airtrust_token') ||
      '',
  );
  expect(token, 'authenticated staging bearer missing from browser storage').not.toBe('');
  return token;
}

function authHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  };
}

test.describe.serial('layout/UX residual audit closeout', () => {
  test('N-03 Controle de Voos has no horizontal overflow at 375px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/controle-voos', { waitUntil: 'domcontentloaded' });
    await waitForApp(page);

    const dimensions = await page.evaluate(() => ({
      viewport: window.innerWidth,
      root: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
    }));

    expect(
      Math.max(dimensions.root, dimensions.body),
      'Controle de Voos overflows horizontally at 375px',
    ).toBeLessThanOrEqual(dimensions.viewport + 1);

    await expect(page.getByRole('main').or(page.locator('main')).first()).toBeVisible();
  });

  test('N-09 SGSO listed synthetic record opens its real detail route', async ({ page }) => {
    await page.goto('/sgso', { waitUntil: 'domcontentloaded' });
    await waitForApp(page);
    const token = await readBearer(page);
    const marker = `AIRTRUST-QA-N09-${RUN_MARKER}`;

    const create = await page.request.post(`${STAGING_API_BASE_URL}/api/sgso/relatos`, {
      headers: {
        ...authHeaders(token),
        'Content-Type': 'application/json',
      },
      data: {
        tipo: 'PERIGO',
        anonimo: true,
        data_ocorrencia: new Date().toISOString(),
        local_descricao: 'Synthetic staging QA',
        fase_voo: 'NAO_APLICAVEL',
        condicao_meteorologica: 'NAO_APLICAVEL',
        descricao: `${marker} synthetic record used only for list-to-detail runtime proof.`,
      },
    });

    expect(create.status(), 'failed to create synthetic SGSO staging fixture').toBe(201);
    const created = await create.json();
    expect(created?.success).toBe(true);
    const protocolo = String(created?.data?.numero_protocolo || '');
    const id = Number(created?.data?.id || 0);
    expect(protocolo).not.toBe('');
    expect(id).toBeGreaterThan(0);

    await page.goto('/sgso', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      window.localStorage.setItem('airtrust.sgso.activeTab', 'relatos');
    });
    await page.goto('/sgso?view=workspace', { waitUntil: 'domcontentloaded' });
    await waitForApp(page);

    const card = page.locator('div').filter({ hasText: protocolo }).filter({
      has: page.getByRole('button', { name: /^Abrir$/ }),
    }).first();

    await expect(card, 'created SGSO fixture was not present in the list').toBeVisible({
      timeout: 20_000,
    });

    await card.getByRole('button', { name: /^Abrir$/ }).click();
    await page.waitForURL(new RegExp(`/sgso/relatos/${id}(?:\\?|$)`), { timeout: 20_000 });
    await waitForApp(page);
    await expect(page.getByText(new RegExp(`Relato\\s+${protocolo}`, 'i')).first()).toBeVisible();
  });

  test('N-07 Pasta 360 upload lists exactly one non-zero synthetic document and cleans it up', async ({
    page,
  }) => {
    let uploadedId = 0;
    let funcionarioId = 0;

    await page.goto('/funcionarios', { waitUntil: 'domcontentloaded' });
    await waitForApp(page);

    await expect(page.getByText(/QA Participante|QA Instrutor/i).first()).toBeVisible({
      timeout: 20_000,
    });

    const pastaButton = page.getByRole('button', { name: /Pasta 360/i }).first();
    await expect(pastaButton).toBeVisible();
    await pastaButton.click();
    await page.waitForURL(/\/funcionarios\/\d+\/ficha\?[^#]*tab=pasta/, { timeout: 20_000 });
    await waitForApp(page);

    const match = new URL(page.url()).pathname.match(/\/funcionarios\/(\d+)\/ficha/);
    funcionarioId = Number(match?.[1] || 0);
    expect(funcionarioId).toBeGreaterThan(0);

    await expect(page.getByRole('heading', { name: /Pasta 360/i })).toBeVisible();

    const uploadTrigger = page
      .getByRole('button', { name: /Upload Documento/i })
      .or(page.getByRole('button', { name: /Adicionar documento/i }))
      .first();
    await expect(uploadTrigger).toBeVisible();
    await uploadTrigger.click();

    await expect(page.getByRole('heading', { name: /Upload de Documento/i })).toBeVisible();

    const pdf = Buffer.from(
      `%PDF-1.4\n% AirTrust synthetic N07 staging QA\n${'0'.repeat(2048)}\n%%EOF\n`,
      'utf8',
    );

    await page.locator('input[type="file"]').setInputFiles({
      name: `AIRTRUST-QA-N07-${RUN_MARKER}.pdf`,
      mimeType: 'application/pdf',
      buffer: pdf,
    });

    const uploadResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url() === `${STAGING_API_BASE_URL}/api/pasta-virtual/upload`,
      { timeout: 30_000 },
    );

    try {
      await page.getByRole('button', { name: /^Enviar$/ }).click();
      const response = await uploadResponse;
      expect(response.status(), 'Pasta 360 upload did not return 201').toBe(201);
      const payload = await response.json();
      uploadedId = Number(payload?.data?.id || 0);
      expect(uploadedId).toBeGreaterThan(0);

      await expect(page.getByRole('heading', { name: /Upload de Documento/i })).toBeHidden({
        timeout: 20_000,
      });

      const token = await readBearer(page);
      const listing = await page.request.get(
        `${STAGING_API_BASE_URL}/api/pasta-virtual/${funcionarioId}`,
        { headers: authHeaders(token) },
      );
      expect(listing.ok(), 'Pasta 360 listing failed after upload').toBe(true);

      const listPayload = await listing.json();
      const arquivos = Array.isArray(listPayload?.data?.arquivos) ? listPayload.data.arquivos : [];
      const matches = arquivos.filter((documento: { id?: number }) => Number(documento?.id) === uploadedId);

      expect(matches, 'uploaded document duplicated or missing from canonical listing').toHaveLength(1);
      expect(Number(matches[0]?.tamanho || 0), 'uploaded document is listed as 0 KB').toBe(pdf.byteLength);
      expect(Number(matches[0]?.tamanho || 0)).toBeGreaterThan(1024);

      const zeroByteRows = arquivos.filter(
        (documento: { id?: number; tamanho?: number }) =>
          Number(documento?.id) === uploadedId && Number(documento?.tamanho || 0) <= 0,
      );
      expect(zeroByteRows, 'same uploaded document also appeared as a 0 KB row').toHaveLength(0);
    } finally {
      if (uploadedId > 0) {
        const token = await readBearer(page);
        const cleanup = await page.request.delete(
          `${STAGING_API_BASE_URL}/api/pasta-virtual/${uploadedId}`,
          { headers: authHeaders(token) },
        );
        expect(
          cleanup.ok() || cleanup.status() === 404,
          'failed to clean the synthetic Pasta 360 document',
        ).toBe(true);
      }
    }
  });
});

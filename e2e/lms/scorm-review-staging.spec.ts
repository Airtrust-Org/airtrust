import { expect, test } from '@playwright/test';

const FORBIDDEN_TEXT = [
  'Não autenticado',
  '"success":false',
  '✓ Concluído!',
  'Curso concluído e registrado com sucesso',
];

type BrowserEvidence = {
  cookies: Array<{ name: string; domain: string; path: string; sameSite: string; secure: boolean }>;
  frames: { wrapperUrl: string | null; scormUrl: string | null };
  requests: Array<{
    url: string;
    status: number;
    contentType: string | null;
    cacheControl: string | null;
    location: string | null;
    requestSentCookie: boolean;
    requestSentAuthorization: boolean;
    responseSetCookie: { sameSite: string | null; secure: boolean } | null;
  }>;
  menu?: Record<string, unknown>;
};

function sanitizeUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  return `${url.origin}${url.pathname}`;
}

async function assertForbiddenTextIsAbsent(locator: import('@playwright/test').Locator) {
  for (const text of FORBIDDEN_TEXT) {
    await expect(locator).not.toContainText(text);
  }
}

test.use({ video: 'on' });

test('SCORM review carrega conteúdo e o menu de Emergências Gerais fecha', async ({
  page,
  context,
}, testInfo) => {
  const evidence: BrowserEvidence = {
    cookies: [],
    frames: { wrapperUrl: null, scormUrl: null },
    requests: [],
  };
  const evidenceTasks: Array<Promise<void>> = [];

  // When running against a PR preview, the frontend is built with VITE_API_URL
  // already pointing to the preview Worker — no route interception needed.
  // When running against the published staging Pages, the compiled API base
  // may still point to production, so we relay through the staging Worker.
  const apiBaseUrl = process.env.E2E_API_BASE_URL;
  if (apiBaseUrl) {
    const resolvedApiBase = apiBaseUrl.replace(/\/$/, '');
    await page.route('https://api.airtrust.online/api/**', async (route) => {
      const requested = new URL(route.request().url());
      const upstream = await page.request.fetch(
        `${resolvedApiBase}${requested.pathname}${requested.search}`,
        {
          method: route.request().method(),
          headers: route.request().headers(),
          data: route.request().postDataBuffer() ?? undefined,
        },
      );
      const responseHeaders = upstream.headers();
      delete responseHeaders['content-encoding'];
      delete responseHeaders['content-length'];
      delete responseHeaders['transfer-encoding'];
      await route.fulfill({
        status: upstream.status(),
        headers: responseHeaders,
        body: await upstream.body(),
      });
    });
  }

  page.on('response', (response) => {
    const url = new URL(response.url());
    if (!url.pathname.startsWith('/api/lms/scorm/')) return;
    evidenceTasks.push(
      response
        .request()
        .allHeaders()
        .then((requestHeaders) => {
          const responseHeaders = response.headers();
          const setCookie = responseHeaders['set-cookie'] ?? '';
          const sameSite = setCookie.match(/samesite=([^;]+)/i)?.[1] ?? null;
          evidence.requests.push({
            url: sanitizeUrl(response.url()),
            status: response.status(),
            contentType: responseHeaders['content-type'] ?? null,
            cacheControl: responseHeaders['cache-control'] ?? null,
            location: responseHeaders.location ? sanitizeUrl(responseHeaders.location) : null,
            requestSentCookie: Boolean(requestHeaders.cookie),
            requestSentAuthorization: Boolean(requestHeaders.authorization),
            responseSetCookie: setCookie
              ? { sameSite, secure: /(?:^|;)\s*secure(?:;|$)/i.test(setCookie) }
              : null,
          });
        }),
    );
  });

  try {
    await page.goto('/lms/player/2?review=1');
    await expect(page.getByText('Modo consulta — somente leitura')).toBeVisible();

    // Emergências Gerais uses the LMS native SCORM player (not an iframe).
    // The SCORM content renders in the main area with navigation buttons.
    await expect(page.getByText('Emergências Gerais')).toBeVisible();

    // Confirm the SCORM wrapper loaded with slide counter
    await expect(page.getByText(/Onde você está:/)).toBeVisible();

    // Verify no forbidden text anywhere on the page
    await assertForbiddenTextIsAbsent(page.locator('body'));

    // Advance slides: click "Próximo" twice
    const nextButton = page.getByRole('button', { name: /Próximo/i });
    await expect(nextButton).toBeVisible();
    await nextButton.click();
    await page.waitForTimeout(1000);
    await expect(page.getByText(/Onde você está: 2/i)).toBeVisible();

    await nextButton.click();
    await page.waitForTimeout(1000);
    await expect(page.getByText(/Onde você está: 3/i)).toBeVisible();

    // Go back one slide
    const prevButton = page.getByRole('button', { name: /Voltar slide/i });
    await expect(prevButton).toBeVisible();
    await prevButton.click();
    await page.waitForTimeout(1000);
    await expect(page.getByText(/Onde você está: 2/i)).toBeVisible();

    // Exit the course
    const exitButton = page.getByRole('button', { name: /Voltar/i });
    await exitButton.click();
    await page.waitForURL(/\/lms\/cursos/);

    // Reopen in review mode — should stay read-only
    await page.goto('/lms/player/2?review=1');
    await expect(page.getByText('Modo consulta — somente leitura')).toBeVisible();
    await assertForbiddenTextIsAbsent(page.locator('body'));

    await page.screenshot({
      path: testInfo.outputPath('scorm-review-menu-closed.png'),
      fullPage: true,
    });
  } finally {
    await Promise.all(evidenceTasks);
    evidence.cookies = (await context.cookies()).map((cookie) => ({
      name: cookie.name,
      domain: cookie.domain,
      path: cookie.path,
      sameSite: cookie.sameSite,
      secure: cookie.secure,
    }));
    await testInfo.attach('scorm-browser-evidence.json', {
      body: JSON.stringify(evidence, null, 2),
      contentType: 'application/json',
    });
  }
});

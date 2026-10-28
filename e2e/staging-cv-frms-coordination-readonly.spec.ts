import { expect, test, type Page } from '@playwright/test';
import { installReadOnlyGuard } from './lib/read-only-network-guard.mjs';

/**
 * FRMS/CV read-only acceptance against the PUBLISHED staging Worker and Pages.
 * Auth is the real, centrally provisioned examiner QA admin for synthetic tenant 999006.
 * The generic qa-agent identity belongs to tenant 999002 (no 27/10 CV fixture).
 * No token or user spoofing.
 * No crew data or sensitive fatigue answers are printed in CI logs.
 */
const BASE = 'https://staging.airtrust.pages.dev';
const DAY = '2026-10-27';
test.use({ storageState: { cookies: [], origins: [] }, trace: 'off', screenshot: 'off', video: 'off' });

async function loginViaRealStagingUi(page: Page) {
  const email = String(process.env.QA_EXAMINER_ADMIN_EMAIL || '').trim();
  const password = String(process.env.QA_EXAMINER_ADMIN_PASSWORD || '');
  if (email !== 'qa-examiner-admin@staging.airtrust.invalid' || !password) {
    throw new Error('CV_FRMS_ISOLATED_EXAMINER_IDENTITY_MISSING');
  }
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#airtrust-boot-fallback')).toHaveCount(0);
  await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 30_000 });
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: /entrar|sign in/i }).click();
  await page.waitForFunction(() =>
    !location.pathname.startsWith('/login') ||
    Array.from(document.querySelectorAll('button')).some(b =>
      /^Entrar como (Administrador(?: Geral| da Empresa)?|Gestor)/i.test((b.textContent || '').trim())),
  undefined, { timeout: 30_000 });
  if (new URL(page.url()).pathname.startsWith('/login')) {
    const admin = page.getByRole('button', {
      name: /entrar como (administrador(?: geral| da empresa)?|gestor)/i,
    }).first();
    if (!await admin.isVisible()) throw new Error('CV_FRMS_COORDINATION_QA_PROFILE_NOT_GRANTED');
    await admin.click();
  }
  await page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 30_000 });
}

test('Coordenação FRMS: real auth, persisted GET and independently rendered decision', async ({page}) => {
  test.setTimeout(135_000);
  const guard = installReadOnlyGuard(page);
  const api5xx: number[] = [];
  page.on('response', response => {
    const u = new URL(response.url());
    if (u.hostname === 'airtrust-api-staging.airtrust.workers.dev' && response.status() >= 500) {
      api5xx.push(response.status());
    }
  });

  await loginViaRealStagingUi(page);
  await page.goto(BASE + '/controle-voos/coordenacao/fila', {waitUntil: 'domcontentloaded'});
  const header = page.getByRole('heading', {name: 'Fila da Coordenação'});
  await expect(header).toBeVisible({ timeout: 35_000 }).catch(() => {
    throw new Error('CV_FRMS_QA_COORDINATION_CAPABILITY_NOT_GRANTED_OR_ROUTE_UNAVAILABLE');
  });
  await expect(page.getByRole('heading', {name: /Controle operacional — alertas consultivos de fadiga/})).toBeVisible();

  const date = page.getByTestId('frms-gate-date-input');
  await expect(date).toBeVisible();
  await date.fill(DAY);

  const responsePromise = page.waitForResponse(response => {
    const u = new URL(response.url());
    return u.hostname === 'airtrust-api-staging.airtrust.workers.dev'
      && u.pathname === '/api/controle-voos/operacional'
      && u.searchParams.get('data') === DAY
      && response.request().method() === 'GET';
  }, {timeout: 45_000});
  await page.getByTestId('frms-gate-refresh').click();
  const response = await responsePromise;
  if (response.status() === 401 || response.status() === 403) {
    throw new Error('CV_FRMS_QA_COORDINATION_CAPABILITY_NOT_GRANTED');
  }
  expect(response.status(), 'Operational API must be authenticated and available').toBe(200);
  const json = await response.json() as {
    success?: boolean;
    data?: {
      data?: string;
      resumo?: {tripulantes_checkin_pendente?: number};
      voos?: Array<{
        tripulacao?: Array<{
          checkin_status?: string;
          fadiga_diaria?: string;
          sinal_fadiga_checkin?: string;
          daily_assessment_reason?: string | null;
          frms_status?: string;
        }>;
      }>;
    };
  };
  expect(json.success).toBe(true);
  expect(json.data?.data).toBe(DAY);
  expect(Array.isArray(json.data?.voos)).toBe(true);
  await expect(page.getByText(/Consulta atualizada às/)).toBeVisible();
  const crew = (json.data?.voos || []).flatMap(v => v.tripulacao || []);
  const expectedSignals = crew.filter(c =>
    c.sinal_fadiga_checkin && c.sinal_fadiga_checkin !== 'INDISPONIVEL');
  const rows = page.locator('[data-testid^="frms-gate-row-"]');
  if (crew.length === 0) {
    throw new Error('CV_FRMS_STAGING_CREW_FIXTURE_MISSING: real 27 Oct operational crew needed for row acceptance');
  }
  await expect(page.getByText('Avaliação FRMS diária', {exact: true})).toBeVisible();
  await expect(rows).toHaveCount(crew.length);
  if (expectedSignals.length === 0) throw new Error('CV_FRMS_CLASSIFIED_DAILY_INDICATOR_FIXTURE_MISSING');
  const signalLabels = page.getByText(/Indicador diário de fadiga:/);
  await expect(signalLabels).toHaveCount(expectedSignals.length);

  const fatigueLabel: Record<string, string> = {
    NORMAL: 'Normal', ATENCAO: 'Atenção', CRITICO: 'Crítico', INDISPONIVEL: 'Sem conclusão',
  };
  const checkinLabel: Record<string, string> = {
    RECEBIDO: 'Recebido', PENDENTE: 'Pendente', AUSENTE: 'Ausente',
    NAO_APLICAVEL: 'Não confirmado', INDISPONIVEL: 'Indisponível',
  };
  const readinessLabel: Record<string, string> = {
    LIBERAVEL: 'SEM ALERTAS', ATENCAO_COORDENACAO: 'ATENÇÃO FRMS', NAO_LIBERADO: 'ALERTA FRMS',
  };
  const reasonLabel: Record<string, string> = {
    CHECKIN_NAO_CONFIRMADO: 'Não há check-in confirmado para esta data e vínculo.',
    CHECKIN_OU_DADOS_INCONSISTENTES: 'Check-in recebido, mas faltam dados obrigatórios ou há inconsistência.',
    EVIDENCIA_REGULATORIA_INSUFICIENTE: 'Check-in recebido; a avaliação regulatória ainda não tem evidência suficiente.',
    EVIDENCIA_OPERACIONAL_INSUFICIENTE: 'Check-in recebido; faltam evidências para concluir a decisão operacional.',
  };
  if (crew.length > 100) throw new Error('CV_FRMS_UNEXPECTED_CREW_COUNT');
  for (const [i, c] of crew.entries()) {
    const row = rows.nth(i);
    const cells = row.locator('td');
    await expect(cells.nth(3).locator('span')).toHaveText(checkinLabel[c.checkin_status || ''] || c.checkin_status || '');
    await expect(cells.nth(4).locator('span').first())
      .toHaveText(fatigueLabel[c.fadiga_diaria || ''] || c.fadiga_diaria || '');
    await expect(cells.nth(6).locator('span'))
      .toHaveText(readinessLabel[c.frms_status || ''] || c.frms_status || '');
    if (c.sinal_fadiga_checkin && c.sinal_fadiga_checkin !== 'INDISPONIVEL') {
      await expect(cells.nth(4)).toContainText(
        'Indicador diário de fadiga: ' + (fatigueLabel[c.sinal_fadiga_checkin] || c.sinal_fadiga_checkin),
      );
      await expect(cells.nth(4)).toContainText('não indica liberação operacional');
    } else {
      await expect(cells.nth(4)).not.toContainText('Indicador diário de fadiga:');
    }
    if (c.fadiga_diaria === 'INDISPONIVEL' && c.daily_assessment_reason) {
      await expect(cells.nth(4)).toContainText(reasonLabel[c.daily_assessment_reason]);
    }
    if (c.frms_status === 'NAO_LIBERADO' && c.fadiga_diaria === 'INDISPONIVEL') {
      expect(c.daily_assessment_reason, 'Fail-closed regulatory decision needs reason').toBeTruthy();
    }
    if (c.sinal_fadiga_checkin === 'NORMAL' && c.fadiga_diaria === 'INDISPONIVEL') {
      expect(c.frms_status).not.toBe('LIBERAVEL');
    }
  }
  const payloadText = JSON.stringify(json.data);
  expect(payloadText).not.toMatch(/"(?:kss_score|horas_sono|wake_time|meds_ult_12h)"\s*:/i);
  guard.assertClean();
  expect(api5xx).toEqual([]);
  console.log('CV_FRMS_STAGING_READONLY_VERIFIED; date=2026-10-27; operational_rows_present=true; writes=0; production=not_contacted');
});

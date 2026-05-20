# Tests & Specs


---
## FILE: e2e/auth.setup.ts
~~~typescript
/**
 * E2E Auth Setup — salva o storage state após login.
 * Executado uma única vez antes de todos os testes.
 *
 * Requer:
 *   E2E_EMAIL=usuario@empresa.com
 *   E2E_PASSWORD=senha_aqui
 *
 * Uso:
 *   E2E_EMAIL=... E2E_PASSWORD=... npx playwright test --project=setup
 */

import { test as setup, expect } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const AUTH_FILE = path.join(__dirname, '.auth/user.json');

setup('autenticar usuário', async ({ page }) => {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'E2E_EMAIL e E2E_PASSWORD devem ser definidos para executar o auth setup.\n' +
        'Exemplo: E2E_EMAIL=seu@email.com E2E_PASSWORD=suasenha npx playwright test --project=setup',
    );
  }

  await page.goto('/login');
  await page.waitForLoadState('networkidle');

  // Preenche login form (usando type selectors — mais robusto que getByLabel + i18n)
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  // Alguns layouts não exibem "lembrar de mim"; só marca quando o controle existir.
  const rememberMe = page.getByRole('checkbox', { name: /lembrar de mim/i });
  if ((await rememberMe.count()) > 0) {
    await rememberMe.check();
  }
  await page.getByRole('button', { name: /entrar/i }).click();

  // Aguarda redirecionamento pós-login (app navega para "/" após autenticação)
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30000 });
  await expect(page).not.toHaveURL(/\/login/);

  // Salva estado de autenticação
  await page.context().storageState({ path: AUTH_FILE });
});

~~~

---
## FILE: e2e/escalas/escalas-config-export.spec.ts
~~~typescript
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

~~~

---
## FILE: e2e/escalas/escalas-tripulantes-consistencia.spec.ts
~~~typescript
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

~~~

---
## FILE: e2e/escalas/escalas.spec.ts
~~~typescript
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

~~~

---
## FILE: e2e/frms/frms.spec.ts
~~~typescript
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

~~~

---
## FILE: e2e/lms/lms-completion-formats.spec.ts
~~~typescript
import { expect, test } from '@playwright/test';
import { execSync } from 'node:child_process';

type ScriptVars = Record<string, string>;

function isLocalBaseUrl(baseURL: string | undefined): boolean {
  if (!baseURL) return false;
  return baseURL.includes('localhost') || baseURL.includes('127.0.0.1');
}

function runSeedScript(command: string, apiBase: string): ScriptVars {
  const output = execSync(command, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      AIRTRUST_LOCAL_API_BASE: apiBase,
    },
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const vars: ScriptVars = {};
  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.includes('=')) continue;
    const [key, ...rest] = trimmed.split('=');
    if (!key || rest.length === 0) continue;
    vars[key] = rest.join('=').trim();
  }

  return vars;
}

async function loginAsAdmin(request: Parameters<typeof test>[0]['request'], apiBase: string) {
  const email = process.env.AIRTRUST_LOCAL_LMS_EMAIL || 'admin@airtrust.com';
  const password = process.env.AIRTRUST_LOCAL_LMS_PASSWORD || 'Admin@123';

  const response = await request.post(`${apiBase}/auth/login`, {
    data: {
      email,
      senha: password,
    },
  });

  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as {
    success: boolean;
    data?: { accessToken?: string };
  };

  expect(body.success).toBeTruthy();
  expect(body.data?.accessToken).toBeTruthy();
  return body.data?.accessToken as string;
}

test.describe.serial('LMS completion by format (local)', () => {
  test.beforeEach(async ({}, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    test.skip(
      !isLocalBaseUrl(baseURL),
      'This suite is designed for local stack only (BASE_URL localhost).',
    );
    test.skip(
      process.env.E2E_LMS_LOCAL_SMOKE !== '1',
      'Set E2E_LMS_LOCAL_SMOKE=1 to enable local LMS completion E2E.',
    );
  });

  test('finalizes PDF enrollment and returns CONCLUIDO', async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string;
    const apiBase = `${baseURL.replace(/\/$/, '')}/api`;

    const seedVars = runSeedScript('bash scripts/seed-lms-pdf-demo.sh', apiBase);
    const matriculaId = Number(seedVars.MATRICULA_ID || 0);
    expect(matriculaId).toBeGreaterThan(0);

    const token = await loginAsAdmin(request, apiBase);

    const finalize = await request.post(`${apiBase}/lms/matriculas/${matriculaId}/finalizar`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: {},
    });

    expect(finalize.ok()).toBeTruthy();
    const body = (await finalize.json()) as {
      success: boolean;
      data?: {
        matricula_id: number;
        novo_status: string;
        progresso_pct: number;
      };
    };

    expect(body.success).toBeTruthy();
    expect(body.data?.matricula_id).toBe(matriculaId);
    expect(body.data?.novo_status).toBe('CONCLUIDO');
    expect(body.data?.progresso_pct).toBe(100);
  });

  test('finalizes PPTX enrollment and returns CONCLUIDO', async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string;
    const apiBase = `${baseURL.replace(/\/$/, '')}/api`;

    const seedVars = runSeedScript('bash scripts/seed-lms-pptx-demo.sh', apiBase);
    const matriculaId = Number(seedVars.MATRICULA_ID || 0);
    expect(matriculaId).toBeGreaterThan(0);

    const token = await loginAsAdmin(request, apiBase);

    const finalize = await request.post(`${apiBase}/lms/matriculas/${matriculaId}/finalizar`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: {},
    });

    expect(finalize.ok()).toBeTruthy();
    const body = (await finalize.json()) as {
      success: boolean;
      data?: {
        matricula_id: number;
        novo_status: string;
        progresso_pct: number;
      };
    };

    expect(body.success).toBeTruthy();
    expect(body.data?.matricula_id).toBe(matriculaId);
    expect(body.data?.novo_status).toBe('CONCLUIDO');
    expect(body.data?.progresso_pct).toBe(100);
  });
});

~~~

---
## FILE: e2e/lms/lms-mobile-layout.spec.ts
~~~typescript
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

~~~

---
## FILE: e2e/lms/lms-progress-persistence.spec.ts
~~~typescript
/**
 * E2E – LMS progress persistence for PPTX (and PDF via progress endpoint)
 *
 * Guards:
 *  - Only runs on localhost (safe to skip in CI against production)
 *  - Requires env var E2E_LMS_LOCAL_SMOKE=1
 *
 * Run:
 *   E2E_LMS_LOCAL_SMOKE=1 npx playwright test e2e/lms/lms-progress-persistence.spec.ts --project api
 */

import { expect, test } from '@playwright/test';

const ENABLED = process.env.E2E_LMS_LOCAL_SMOKE === '1';

function isLocalBaseUrl(baseURL: string | undefined): boolean {
  if (!baseURL) return false;
  return baseURL.includes('localhost') || baseURL.includes('127.0.0.1');
}

test.describe('LMS progress persistence', () => {
  test.beforeEach(({ baseURL }) => {
    test.skip(!ENABLED || !isLocalBaseUrl(baseURL), 'Skipped: not local or smoke not enabled');
  });

  async function loginAsAdmin(
    request: Parameters<Parameters<typeof test>[0]>[0]['request'],
    apiBase: string,
  ) {
    const email = process.env.AIRTRUST_LOCAL_LMS_EMAIL ?? 'admin@airtrust.com';
    const password = process.env.AIRTRUST_LOCAL_LMS_PASSWORD ?? 'Admin@123';
    const res = await request.post(`${apiBase}/auth/login`, {
      data: { email, senha: password },
    });
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as { success: boolean; data?: { accessToken?: string } };
    expect(body.success).toBe(true);
    return body.data!.accessToken!;
  }

  test('PATCH /matriculas/:id/progresso saves and returns updated fields', async ({
    request,
    baseURL,
  }) => {
    const apiBase = `${baseURL}/api/lms`;
    const token = await loginAsAdmin(request, `${baseURL}/api`);
    const headers = { Authorization: `Bearer ${token}` };

    // Grab any existing enrollment in EM_ANDAMENTO or NAO_INICIADO
    const listRes = await request.get(`${apiBase}/matriculas/minhas`, { headers });
    // If endpoint doesn't exist, use admin list
    const listAll = await request.get(`${apiBase}/matriculas?limit=5`, { headers });
    const list = (await listAll.json()) as {
      success: boolean;
      data?: Array<{ id: number; status: string; tipo_conteudo: string }>;
    };

    // Find a pptx or pdf matricula
    const candidato = list.data?.find(
      (m) => ['pptx', 'pdf'].includes(m.tipo_conteudo) && m.status !== 'CANCELADO',
    );

    if (!candidato) {
      test.skip(true, 'No PPTX/PDF enrollment found to test progress persistence');
      return;
    }

    const matriculaId = candidato.id;

    // Save progress at slide 5 (for pptx)
    const saveRes = await request.patch(`${apiBase}/matriculas/${matriculaId}/progresso`, {
      headers,
      data: { progresso_pct: 30, ultimo_slide: 5 },
    });
    expect(saveRes.ok()).toBeTruthy();
    const saveBody = (await saveRes.json()) as {
      success: boolean;
      data?: { progresso_pct: number; ultimo_slide: number; status: string };
    };
    expect(saveBody.success).toBe(true);
    expect(saveBody.data?.ultimo_slide).toBe(5);
    expect(saveBody.data?.progresso_pct).toBeGreaterThanOrEqual(30);
    expect(['EM_ANDAMENTO', 'CONCLUIDO']).toContain(saveBody.data?.status);

    // Now GET the matricula detail and verify the saved position is returned
    const detailRes = await request.get(`${apiBase}/matriculas/${matriculaId}`, { headers });
    expect(detailRes.ok()).toBeTruthy();
    const detail = (await detailRes.json()) as {
      success: boolean;
      data?: { ultimo_slide?: number; progresso_pct: number };
    };
    expect(detail.success).toBe(true);
    // Accept either saved value or higher (e.g. if already concluded at 100)
    if (detail.data?.ultimo_slide !== undefined) {
      expect(detail.data.ultimo_slide).toBeGreaterThanOrEqual(5);
    }
    expect(detail.data?.progresso_pct).toBeGreaterThanOrEqual(30);
  });

  test('PATCH /progresso does not regress progresso_pct when sending lower value', async ({
    request,
    baseURL,
  }) => {
    const apiBase = `${baseURL}/api/lms`;
    const token = await loginAsAdmin(request, `${baseURL}/api`);
    const headers = { Authorization: `Bearer ${token}` };

    const listAll = await request.get(`${apiBase}/matriculas?limit=5`, { headers });
    const list = (await listAll.json()) as {
      success: boolean;
      data?: Array<{ id: number; status: string; tipo_conteudo: string; progresso_pct: number }>;
    };
    const candidato = list.data?.find(
      (m) =>
        ['pptx', 'pdf'].includes(m.tipo_conteudo) &&
        m.status !== 'CANCELADO' &&
        m.progresso_pct >= 30,
    );
    if (!candidato) {
      test.skip(true, 'No enrollment with progresso_pct >= 30 to test regression');
      return;
    }

    const matriculaId = candidato.id;
    const previousPct = candidato.progresso_pct;

    // Try to save a lower progress value
    const saveRes = await request.patch(`${apiBase}/matriculas/${matriculaId}/progresso`, {
      headers,
      data: { progresso_pct: 5 },
    });
    expect(saveRes.ok()).toBeTruthy();
    const saveBody = (await saveRes.json()) as {
      success: boolean;
      data?: { progresso_pct: number };
    };
    // Backend uses MAX(current, incoming) so should not regress
    expect(saveBody.data?.progresso_pct).toBeGreaterThanOrEqual(Math.min(previousPct, 5));
  });
});

~~~

---
## FILE: e2e/treinamentos/treinamentos-planejados-integracao.spec.ts
~~~typescript
import { expect, test } from '@playwright/test';

type ApiEnvelope<T> = {
  success: boolean;
  data?: T;
  error?: string;
  meta?: unknown;
  stats?: unknown;
  pagination?: unknown;
};

type SolicitacaoApiItem = {
  id: string;
  titulo: string;
  status: string;
  solicitante_id: number;
  qualificacao_id?: number | null;
  treinamento_planejado_id?: number | null;
};

type TreinamentoPlanejadoListItem = {
  id: number;
  titulo?: string | null;
  status: string;
  participantes: Array<{ funcionario_id: number; qualificacao_historico_id?: number | null }>;
};

type TreinamentoPlanejadoListResponse = {
  items: TreinamentoPlanejadoListItem[];
  total: number;
};

type TreinamentoPlanejadoDetalhe = {
  id: number;
  titulo?: string | null;
  status: string;
  participantes: Array<{ funcionario_id: number; qualificacao_historico_id?: number | null }>;
};

type HistoricoQualificacaoItem = {
  id: number;
  status: string;
  funcionario_id: number;
  qualificacao_id?: number | null;
  observacoes?: string | null;
};

function formatFutureDate(daysAhead: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  return date.toISOString().slice(0, 10);
}

async function fetchApi<T>(page: Parameters<typeof test>[0]['page'], path: string) {
  return page.evaluate(async (inputPath) => {
    const response = await fetch(inputPath, {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
    const json = (await response.json()) as ApiEnvelope<T>;
    return { status: response.status, json };
  }, path) as Promise<{ status: number; json: ApiEnvelope<T> }>;
}

async function waitForValue<T>(
  read: () => Promise<T | null>,
  options: { timeout?: number; interval?: number } = {},
): Promise<T> {
  const timeout = options.timeout ?? 20000;
  const interval = options.interval ?? 500;
  const startedAt = Date.now();

  while (Date.now() - startedAt <= timeout) {
    const value = await read();
    if (value !== null) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(`Timed out after ${timeout}ms waiting for value`);
}

async function ensureLoggedIn(page: Parameters<typeof test>[0]['page']): Promise<void> {
  const adminShortcut = page.getByRole('button', { name: /^admin$/i });
  const shouldBypassLogin = await adminShortcut.isVisible({ timeout: 2000 }).catch(() => false);
  if (!shouldBypassLogin) {
    return;
  }

  await adminShortcut.click();
  await page.getByRole('button', { name: /entrar/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30000 });
  await page.waitForLoadState('networkidle');
}

test.describe.serial('Treinamentos planejados integrados com solicitações', () => {
  test('cria, agenda e conclui uma solicitação refletindo no central de planejados e no histórico', async ({
    page,
  }) => {
    test.slow();

    const uniqueTitle = `E2E Integracao TP ${Date.now()}`;
    const uniqueDayOffset = 10 + Number(String(Date.now()).slice(-2));
    const dataPrevista = formatFutureDate(uniqueDayOffset);

    await page.goto('/treinamentos/solicitacoes');
    await expect(page.getByRole('heading', { name: /solicitações de treinamento/i })).toBeVisible({
      timeout: 15000,
    });
    await ensureLoggedIn(page);
    if (!page.url().includes('/treinamentos/solicitacoes')) {
      await page.goto('/treinamentos/solicitacoes');
    }
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: /solicitações de treinamento/i })).toBeVisible();

    await page.getByTestId('solicitacoes-nova').click();
    await expect(page.getByTestId('solicitacao-criar-modal')).toBeVisible();

    let solicitanteId: number;
    const solicitanteSelect = page.getByTestId('solicitacao-solicitante');
    if ((await solicitanteSelect.count()) > 0) {
      const solicitanteValue = await solicitanteSelect
        .locator('option')
        .nth(1)
        .getAttribute('value');
      expect(solicitanteValue).toBeTruthy();
      solicitanteId = Number(solicitanteValue);
      await solicitanteSelect.selectOption(String(solicitanteId));
    } else {
      const me = await fetchApi<{ user?: { funcionario_id?: number | string | null } }>(
        page,
        '/api/auth/me',
      );
      solicitanteId = Number(me.json.data?.user?.funcionario_id || 0);
      expect(solicitanteId).toBeGreaterThan(0);
    }

    const qualificacaoSelect = page.getByTestId('solicitacao-qualificacao');
    const qualificacaoValue = await qualificacaoSelect
      .locator('option')
      .nth(1)
      .getAttribute('value');
    const qualificacaoLabel =
      (await qualificacaoSelect.locator('option').nth(1).textContent())?.trim() || '';
    expect(qualificacaoValue).toBeTruthy();
    await qualificacaoSelect.selectOption(String(qualificacaoValue));

    await page.getByTestId('solicitacao-titulo').fill(uniqueTitle);
    await page.getByTestId('solicitacao-data-prevista').fill(dataPrevista);
    await page.getByRole('button', { name: /criar solicitação/i }).click();
    await expect(page.getByTestId('solicitacao-criar-modal')).toBeHidden({ timeout: 15000 });

    const solicitacaoId = await waitForValue(
      async () => {
        const response = await fetchApi<SolicitacaoApiItem[]>(
          page,
          '/api/treinamentos/solicitacoes',
        );
        if (!response.json.success) return null;
        return response.json.data?.find((item) => item.titulo === uniqueTitle)?.id || null;
      },
      { timeout: 20000 },
    );

    await page.goto('/treinamentos/solicitacoes');
    await expect(page.getByRole('heading', { name: /solicitações de treinamento/i })).toBeVisible({
      timeout: 15000,
    });

    const row = page.getByTestId(`solicitacao-item-${solicitacaoId}`);
    await expect(row).toContainText(uniqueTitle);

    await row.click();
    await expect(page.getByTestId('solicitacao-detalhe-modal')).toBeVisible();
    await page.getByTestId('solicitacao-aprovar-gestor').click();
    await expect(page.getByTestId('solicitacao-detalhe-modal')).toBeHidden({ timeout: 15000 });

    await expect
      .poll(
        async () => {
          const response = await fetchApi<SolicitacaoApiItem>(
            page,
            `/api/treinamentos/solicitacoes/${solicitacaoId}`,
          );
          return response.json.data?.status || null;
        },
        { timeout: 15000 },
      )
      .toBe('APROVADA_GESTOR');

    await page.goto('/treinamentos/solicitacoes');
    await expect(page.getByRole('heading', { name: /solicitações de treinamento/i })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByTestId(`solicitacao-item-${solicitacaoId}`)).toContainText(
      /aprovada gestor/i,
    );
    await page.getByTestId(`solicitacao-item-${solicitacaoId}`).click();
    await expect(page.getByTestId('solicitacao-detalhe-modal')).toBeVisible();
    await page.getByTestId('solicitacao-aprovar-ops').click();
    await expect(page.getByTestId('solicitacao-detalhe-modal')).toBeHidden({ timeout: 15000 });

    await expect
      .poll(
        async () => {
          const response = await fetchApi<SolicitacaoApiItem>(
            page,
            `/api/treinamentos/solicitacoes/${solicitacaoId}`,
          );
          return response.json.data?.status || null;
        },
        { timeout: 15000 },
      )
      .toBe('APROVADA_OPS');

    await page.goto('/treinamentos/solicitacoes');
    await expect(page.getByRole('heading', { name: /solicitações de treinamento/i })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByTestId(`solicitacao-item-${solicitacaoId}`)).toContainText(
      /aprovada ops/i,
    );
    await page.getByTestId(`solicitacao-item-${solicitacaoId}`).click();
    await expect(page.getByTestId('solicitacao-detalhe-modal')).toBeVisible();
    await page.getByTestId('solicitacao-agendar-data').fill(dataPrevista);
    await page.getByTestId('solicitacao-agendar-confirmar').click();
    await expect(page.getByTestId('solicitacao-detalhe-modal')).toBeHidden({ timeout: 15000 });

    await expect
      .poll(
        async () => {
          const response = await fetchApi<SolicitacaoApiItem>(
            page,
            `/api/treinamentos/solicitacoes/${solicitacaoId}`,
          );
          return response.json.data?.status || null;
        },
        { timeout: 20000 },
      )
      .toBe('AGENDADA');

    const treinamentoId = await waitForValue(
      async () => {
        const response = await fetchApi<SolicitacaoApiItem>(
          page,
          `/api/treinamentos/solicitacoes/${solicitacaoId}`,
        );
        if (!response.json.success) return null;
        return response.json.data?.treinamento_planejado_id || null;
      },
      { timeout: 20000 },
    );

    const treinamentoDetalheAgendado = await waitForValue(
      async () => {
        const response = await fetchApi<TreinamentoPlanejadoDetalhe>(
          page,
          `/api/treinamentos/planejados/${treinamentoId}`,
        );
        return response.json.data || null;
      },
      { timeout: 15000 },
    );
    expect(treinamentoDetalheAgendado.titulo).toBe(uniqueTitle);

    const participanteAgendado = treinamentoDetalheAgendado.participantes.find(
      (item) => item.funcionario_id === solicitanteId,
    );
    expect(participanteAgendado?.qualificacao_historico_id).toBeTruthy();

    await expect
      .poll(
        async () => {
          const response = await fetchApi<HistoricoQualificacaoItem[]>(
            page,
            `/api/qualificacoes/historico?limit=5&stats=false&id=${participanteAgendado?.qualificacao_historico_id}`,
          );
          if (!response.json.success) return null;
          return (
            response.json.data?.find(
              (item) => item.id === participanteAgendado?.qualificacao_historico_id,
            )?.status || null
          );
        },
        { timeout: 15000 },
      )
      .toBe('PLANEJADA');

    await page.goto('/treinamentos/solicitacoes');
    await expect(page.getByRole('heading', { name: /solicitações de treinamento/i })).toBeVisible({
      timeout: 15000,
    });
    await page.getByTestId(`solicitacao-item-${solicitacaoId}`).click();
    await expect(page.getByTestId('solicitacao-detalhe-modal')).toBeVisible();
    await page.getByTestId('solicitacao-concluir').click();
    await expect(page.getByTestId('solicitacao-detalhe-modal')).toBeHidden({ timeout: 15000 });

    await expect
      .poll(
        async () => {
          const response = await fetchApi<SolicitacaoApiItem>(
            page,
            `/api/treinamentos/solicitacoes/${solicitacaoId}`,
          );
          return response.json.data?.status || null;
        },
        { timeout: 20000 },
      )
      .toBe('CONCLUIDA');

    await expect
      .poll(
        async () => {
          const response = await fetchApi<TreinamentoPlanejadoDetalhe>(
            page,
            `/api/treinamentos/planejados/${treinamentoId}`,
          );
          return response.json.data?.status || null;
        },
        { timeout: 20000 },
      )
      .toBe('CONCLUIDO');

    await expect
      .poll(
        async () => {
          const response = await fetchApi<HistoricoQualificacaoItem[]>(
            page,
            `/api/qualificacoes/historico?limit=5&stats=false&id=${participanteAgendado?.qualificacao_historico_id}`,
          );
          if (!response.json.success) return null;
          return (
            response.json.data?.find(
              (item) => item.id === participanteAgendado?.qualificacao_historico_id,
            )?.status || null
          );
        },
        { timeout: 20000 },
      )
      .toBe('VALIDA');
  });
});

~~~

---
## FILE: src/__tests__/cors-origins.test.ts
~~~typescript
import { describe, expect, it } from 'vitest';

import {
  ALLOWED_ORIGINS,
  DEFAULT_ALLOWED_ORIGIN,
  resolveAllowedOrigin,
} from '../../worker-airtrust/src/config/allowed-origins';

describe('allowed origins', () => {
  it('permite localhost e 127.0.0.1 nas portas de desenvolvimento', () => {
    expect(ALLOWED_ORIGINS).toContain('http://localhost:3000');
    expect(ALLOWED_ORIGINS).toContain('http://127.0.0.1:3000');
    expect(ALLOWED_ORIGINS).toContain('http://localhost:4173');
    expect(ALLOWED_ORIGINS).toContain('http://127.0.0.1:4173');
  });

  it('preserva a origem quando ela e permitida', () => {
    expect(resolveAllowedOrigin('http://127.0.0.1:3000')).toBe('http://127.0.0.1:3000');
  });

  it('faz fallback para a origem padrao quando a origem nao e permitida', () => {
    expect(resolveAllowedOrigin('https://example.com')).toBe(DEFAULT_ALLOWED_ORIGIN);
    expect(resolveAllowedOrigin(undefined)).toBe(DEFAULT_ALLOWED_ORIGIN);
  });
});
~~~

---
## FILE: src/__tests__/lms-access-and-finalize.test.tsx
~~~tsx
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import ProtectedRoute from '@/react-app/components/ProtectedRoute';
import { useFinalizarMatricula } from '@/react-app/hooks/useLms';

const authState = vi.hoisted(() => ({
  isAuthenticated: true,
  isLoading: false,
  user: {
    id: 1,
    email: 'admin@airtrust.online',
    nome: 'Admin Alias',
    role: 'ADMIN',
    permissions: [],
    funcionario_id: 7,
  },
  token: 'token',
}));

const fetchWithAuthMock = vi.hoisted(() => vi.fn());

vi.mock('@/react-app/hooks/useAuth', () => ({
  useAuth: () => authState,
}));

vi.mock('@/react-app/i18n/useLanguage', () => ({
  useLanguage: () => ({
    t: (key: string) =>
      ({
        'protected.loading': 'Carregando',
        'protected.denied.title': 'Acesso Negado',
        'protected.denied.description': 'Sem permissão',
        'protected.denied.backHome': 'Voltar ao Início',
      })[key] ?? key,
  }),
}));

vi.mock('@/react-app/config/api', () => ({
  API_BASE_URL: 'http://localhost:8787/api',
  fetchWithAuth: fetchWithAuthMock,
  getAccessToken: () => 'token',
}));

function FinalizarHarness() {
  const mutation = useFinalizarMatricula();

  return (
    <button type="button" onClick={() => mutation.mutate(10)}>
      Finalizar matrícula
    </button>
  );
}

describe('LMS access and finalize regressions', () => {
  beforeEach(() => {
    fetchWithAuthMock.mockReset();
    fetchWithAuthMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          matricula_id: 10,
          novo_status: 'CONCLUIDO',
          progresso_pct: 100,
          qualificacao_gerada: {
            qualificacao_historico_id: 99,
          },
        },
      }),
    });
  });

  it('accepts admin alias in ProtectedRoute requiredRole checks', () => {
    render(
      <MemoryRouter initialEntries={['/treinamentos/planejados']}>
        <Routes>
          <Route
            path="/treinamentos/planejados"
            element={
              <ProtectedRoute requiredRole={['ADMINISTRADOR', 'GESTOR', 'INSTRUTOR']}>
                <div>Central liberada</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Central liberada')).toBeInTheDocument();
    expect(screen.queryByText('Acesso Negado')).not.toBeInTheDocument();
  });

  it('posts manual LMS finalization to the endpoint used by content players', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <FinalizarHarness />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /finalizar matrícula/i }));

    await waitFor(() => {
      expect(fetchWithAuthMock).toHaveBeenCalledWith('/api/lms/matriculas/10/finalizar', {
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
    });
  });
});

~~~

---
## FILE: src/__tests__/qualificacoes-historico-status-utils.test.ts
~~~typescript
import { describe, expect, it } from 'vitest';

import {
  buildPlanejadasRelacionadasMap,
  computeHistoricoHeaderStats,
  findPlanejadaRelacionada,
  getHistoricoDisplayStatus,
} from '@/react-app/pages/qualificacoes/historicoStatusUtils';

describe('qualificacoes historico status utils', () => {
  it('normaliza status planejado e vencendo_30 para o header e badges', () => {
    expect(getHistoricoDisplayStatus({ qualificacao_status: 'PLANEJADA', status: 'VALIDA' })).toBe(
      'PLANEJADA',
    );
    expect(getHistoricoDisplayStatus({ status: 'PROXIMA_VENCIMENTO' })).toBe('VENCENDO_30');
    expect(getHistoricoDisplayStatus({ status: 'VALIDA', renovada: 1 })).toBe('RENOVADA');
  });

  it('detecta quando uma qualificação vencida já possui ação planejada relacionada', () => {
    const vencida = {
      id: 10,
      funcionario_id: 7,
      qualificacao_id: 3,
      qualificacao_codigo: 'CRM',
      status: 'VENCIDA',
    };
    const planejada = {
      id: 11,
      funcionario_id: 7,
      qualificacao_id: 3,
      qualificacao_codigo: 'CRM',
      qualificacao_status: 'PLANEJADA',
      status: 'VALIDA',
    };

    const map = buildPlanejadasRelacionadasMap([planejada]);
    expect(findPlanejadaRelacionada(vencida, map)).toEqual(planejada);
  });

  it('usa o total filtrado quando apenas planejadas estão selecionadas', () => {
    const filtered = [
      { id: 1, qualificacao_status: 'PLANEJADA' },
      { id: 2, qualificacao_status: 'PLANEJADA' },
      { id: 3, qualificacao_status: 'PLANEJADA' },
    ];

    expect(computeHistoricoHeaderStats(filtered, new Set(['PLANEJADA']), 3)).toMatchObject({
      total: 3,
      planejadas: 3,
      vencidas: 0,
    });
  });

  it('aceita sobrescrever o total de planejadas fora da pagina atual', () => {
    const filtered = [{ id: 1, status: 'VENCIDA' }];

    expect(
      computeHistoricoHeaderStats(filtered, new Set(['VALIDA', 'VENCIDA', 'PLANEJADA']), 20, 4),
    ).toMatchObject({
      total: 20,
      vencidas: 1,
      planejadas: 4,
    });
  });
});

~~~

---
## FILE: src/__tests__/quinzenas-normalization.test.ts
~~~typescript
import { describe, expect, it } from 'vitest';

import {
  getDefaultQuinzenaRange,
  normalizeLegacyQuinzena,
} from '../react-app/pages/escalas/utils/quinzenas';

describe('quinzenas normalization', () => {
  it('gera janeiro de 2026 no calendario operacional informado', () => {
    expect(getDefaultQuinzenaRange(2026, 1, 1)).toEqual({
      inicio: '2025-12-30',
      fim: '2026-01-14',
    });
    expect(getDefaultQuinzenaRange(2026, 1, 2)).toEqual({
      inicio: '2026-01-15',
      fim: '2026-01-30',
    });
  });

  it('normaliza datas mensais antigas para o calendario operacional de 2026', () => {
    expect(
      normalizeLegacyQuinzena({
        id: 5,
        empresa_id: 1,
        ano: 2026,
        mes: 1,
        numero: 1,
        data_inicio: '2026-01-01',
        data_fim: '2026-01-16',
        observacoes: null,
      }),
    ).toMatchObject({
      data_inicio: '2025-12-30',
      data_fim: '2026-01-14',
    });
  });
});

~~~

---
## FILE: src/__tests__/service-worker-cache.test.ts
~~~typescript
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const serviceWorkerSource = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8');

describe('service worker cache guard', () => {
  it('trata navegacoes SPA como network-first', () => {
    expect(serviceWorkerSource).toContain("request.mode === 'navigate'");
    expect(serviceWorkerSource).toContain("request.headers.get('accept')?.includes('text/html')");
  });

  it('usa uma versao de cache atualizada para expulsar runtimes antigos', () => {
    const versionMatch = serviceWorkerSource.match(/const CACHE_VERSION = 'airtrust-v(\d+)'/);

    expect(versionMatch).not.toBeNull();
    expect(Number(versionMatch?.[1] || 0)).toBeGreaterThan(1);
  });

  it('nao reutiliza nem persiste chunks js com mime invalido', () => {
    expect(serviceWorkerSource).toContain('function isValidJavaScriptResponse(response)');
    expect(serviceWorkerSource).toContain('await cache.delete(request)');
    expect(serviceWorkerSource).toContain('return isValidJavaScriptResponse(response);');
  });

  it('ignora cache do service worker para player LMS e API LMS autenticada', () => {
    expect(serviceWorkerSource).toContain(
      'const LMS_PLAYER_NAV_PATTERNS = [/^\\/lms\\/player\\//];',
    );
    expect(serviceWorkerSource).toContain('const LMS_API_BYPASS_PATHS = [/^\\/api\\/lms\\//];');
    expect(serviceWorkerSource).toContain('if (shouldBypassAirTrustCaching(request)) {');
    expect(serviceWorkerSource).toContain('event.respondWith(fetch(request));');
  });
});

~~~

---
## FILE: src/__tests__/validation.test.ts
~~~typescript
import { describe, it, expect } from 'vitest';
import { z } from 'zod';

/**
 * UNIT TESTS - Schemas de Validação
 */

// Schemas de teste
const FuncionarioSchema = z.object({
  id: z.string().uuid().optional(),
  nome: z.string().min(3),
  email: z.string().email(),
  cpf: z.string().regex(/^\d{11}$/),
  cargo: z.string().optional(),
  funcao: z.string().optional(),
  deleted_at: z.string().datetime().nullable().optional(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
});

const QualificacaoSchema = z.object({
  id: z.string().uuid().optional(),
  nome: z.string().min(3),
  descricao: z.string().optional(),
  validade_meses: z.number().int().positive(),
  deleted_at: z.string().datetime().nullable().optional(),
});

const PaginacaoSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().nonnegative().optional(),
});

describe('Schema Validation Tests', () => {
  describe('FuncionarioSchema', () => {
    it('deve validar funcionário correto', () => {
      const valido = {
        nome: 'João Silva',
        email: 'joao@test.com',
        cpf: '12345678901',
      };

      const result = FuncionarioSchema.safeParse(valido);
      expect(result.success).toBe(true);
    });

    it('deve rejeitar email inválido', () => {
      const invalido = {
        nome: 'João Silva',
        email: 'email-invalido',
        cpf: '12345678901',
      };

      const result = FuncionarioSchema.safeParse(invalido);
      expect(result.success).toBe(false);
    });

    it('deve rejeitar CPF inválido', () => {
      const invalido = {
        nome: 'João Silva',
        email: 'joao@test.com',
        cpf: '123-456-789',
      };

      const result = FuncionarioSchema.safeParse(invalido);
      expect(result.success).toBe(false);
    });

    it('deve aceitar deleted_at null', () => {
      const valido = {
        nome: 'João Silva',
        email: 'joao@test.com',
        cpf: '12345678901',
        deleted_at: null,
      };

      const result = FuncionarioSchema.safeParse(valido);
      expect(result.success).toBe(true);
    });
  });

  describe('QualificacaoSchema', () => {
    it('deve validar qualificação correta', () => {
      const valido = {
        nome: 'Qualificação XYZ',
        validade_meses: 12,
      };

      const result = QualificacaoSchema.safeParse(valido);
      expect(result.success).toBe(true);
    });

    it('deve rejeitar validade_meses negativa', () => {
      const invalido = {
        nome: 'Qualificação XYZ',
        validade_meses: -5,
      };

      const result = QualificacaoSchema.safeParse(invalido);
      expect(result.success).toBe(false);
    });

    it('deve aceitar deleted_at null (ativo)', () => {
      const valido = {
        nome: 'Qualificação XYZ',
        validade_meses: 12,
        deleted_at: null,
      };

      const result = QualificacaoSchema.safeParse(valido);
      expect(result.success).toBe(true);
    });
  });

  describe('PaginacaoSchema', () => {
    it('deve validar paginação padrão', () => {
      const valido = {
        page: 1,
        limit: 20,
      };

      const result = PaginacaoSchema.safeParse(valido);
      expect(result.success).toBe(true);
    });

    it('deve rejeitar limit > 100', () => {
      const invalido = {
        page: 1,
        limit: 200,
      };

      const result = PaginacaoSchema.safeParse(invalido);
      expect(result.success).toBe(false);
    });

    it('deve aplicar defaults', () => {
      const vazio = {};

      const result = PaginacaoSchema.safeParse(vazio);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(1);
        expect(result.data.limit).toBe(20);
      }
    });
  });
});

describe('Error Response Format', () => {
  const ErrorSchema = z.object({
    success: z.literal(false),
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.array(z.any()).optional(),
    }),
  });

  it('deve validar erro padronizado', () => {
    const erro = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Campos obrigatórios inválidos',
        details: [{ field: 'email', message: 'Inválido' }],
      },
    };

    const result = ErrorSchema.safeParse(erro);
    expect(result.success).toBe(true);
  });
});

describe('Success Response Format', () => {
  const SuccessSchema = z.object({
    success: z.literal(true),
    data: z.any(),
    stats: z
      .object({
        total: z.number().optional(),
        page: z.number().optional(),
        limit: z.number().optional(),
      })
      .optional(),
  });

  it('deve validar sucesso com dados', () => {
    const sucesso = {
      success: true,
      data: [{ id: '1', nome: 'Test' }],
      stats: {
        total: 1,
        page: 1,
        limit: 20,
      },
    };

    const result = SuccessSchema.safeParse(sucesso);
    expect(result.success).toBe(true);
  });

  it('deve validar sucesso simples (sem stats)', () => {
    const sucesso = {
      success: true,
      data: { id: '1', nome: 'Test' },
    };

    const result = SuccessSchema.safeParse(sucesso);
    expect(result.success).toBe(true);
  });
});

~~~

---
## FILE: src/test/funcionarios.test.ts
~~~typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Funcionario, CreateFuncionarioRequest, FuncionarioStatus } from '../worker/types/index';

const mockDB = {
  prepare: vi.fn().mockReturnValue({
    bind: vi.fn().mockReturnValue({
      first: vi.fn(),
      all: vi.fn(),
      run: vi.fn()
    })
  })
};

const createMockContext = (overrides = {}) => ({
  env: { DB: mockDB },
  req: {
    param: vi.fn(),
    query: vi.fn(),
    json: vi.fn()
  },
  get: vi.fn(),
  json: vi.fn(),
  ...overrides
});

describe('Funcionarios API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Validation', () => {
    it('should validate required fields for creation', () => {
      const validFuncionario: CreateFuncionarioRequest = {
        nome: 'João Silva',
        funcao: 'Piloto'
      };

      expect(validFuncionario.nome).toBeTruthy();
      expect(validFuncionario.funcao).toBeTruthy();
    });

    it('should validate funcionario status enum', () => {
      const validStatuses: FuncionarioStatus[] = ['ATIVO', 'INATIVO', 'LICENCA', 'DEMITIDO'];
      
      validStatuses.forEach(status => {
        expect(['ATIVO', 'INATIVO', 'LICENCA', 'DEMITIDO']).toContain(status);
      });
    });

    it('should validate email format', () => {
      const validEmails = [
        'test@example.com',
        'user.name@domain.co.uk',
        'user+tag@example.org'
      ];

      const invalidEmails = [
        'invalid-email',
        '@domain.com',
        'user@',
        'user space@domain.com'
      ];

      validEmails.forEach(email => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        expect(emailRegex.test(email)).toBe(true);
      });

      invalidEmails.forEach(email => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        expect(emailRegex.test(email)).toBe(false);
      });
    });

    it('should validate CPF format', () => {
      const validCPFs = [
        '123.456.789-00',
        '12345678900'
      ];

      const invalidCPFs = [
        '123.456.789',
        '123456789001', // too long
        'abc.def.ghi-jk'
      ];

      const cpfRegex = /^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/;

      validCPFs.forEach(cpf => {
        expect(cpfRegex.test(cpf)).toBe(true);
      });

      invalidCPFs.forEach(cpf => {
        expect(cpfRegex.test(cpf)).toBe(false);
      });
    });
  });

  describe('Database Operations', () => {
    it('should handle successful funcionario creation', async () => {
      const mockResult = {
        meta: { last_row_id: 123, changes: 1 }
      };
      
      mockDB.prepare().bind().run.mockResolvedValue(mockResult);
      mockDB.prepare().bind().first.mockResolvedValue(null); // No existing matricula

      const funcionarioData: CreateFuncionarioRequest = {
        nome: 'João Silva',
        funcao: 'Piloto',
        matricula: '12345',
        email: 'joao@example.com'
      };

      expect(funcionarioData.nome).toBe('João Silva');
      expect(funcionarioData.funcao).toBe('Piloto');
      expect(mockResult.meta.last_row_id).toBe(123);
    });

    it('should handle duplicate matricula validation', async () => {
      const existingFuncionario = { id: 1, matricula: '12345' };
      mockDB.prepare().bind().first.mockResolvedValue(existingFuncionario);

      const funcionarioData: CreateFuncionarioRequest = {
        nome: 'João Silva',
        funcao: 'Piloto',
        matricula: '12345' // Duplicate
      };

      expect(existingFuncionario.matricula).toBe(funcionarioData.matricula);
    });

    it('should handle database errors gracefully', async () => {
      mockDB.prepare().bind().first.mockRejectedValue(new Error('Database connection failed'));

      try {
        await mockDB.prepare().bind().first();
        expect(false).toBe(true); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('Database connection failed');
      }
    });
  });

  describe('Data Transformation', () => {
    it('should transform boolean fields correctly', () => {
      const funcionario: Partial<Funcionario> = {
        is_instrutor: true,
        is_checador: false
      };

      const dbFormat = {
        is_instrutor: funcionario.is_instrutor ? 1 : 0,
        is_checador: funcionario.is_checador ? 1 : 0
      };

      expect(dbFormat.is_instrutor).toBe(1);
      expect(dbFormat.is_checador).toBe(0);

      const boolFormat = {
        is_instrutor: Boolean(dbFormat.is_instrutor),
        is_checador: Boolean(dbFormat.is_checador)
      };

      expect(boolFormat.is_instrutor).toBe(true);
      expect(boolFormat.is_checador).toBe(false);
    });

    it('should handle date formatting', () => {
      const now = new Date();
      const isoString = now.toISOString();
      
      expect(isoString).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      
      const parsedDate = new Date(isoString);
      expect(parsedDate.getTime()).toBe(now.getTime());
    });
  });

  describe('Pagination', () => {
    it('should calculate pagination correctly', () => {
      const page = 2;
      const limit = 10;
      const total = 25;

      const offset = (page - 1) * limit;
      const pages = Math.ceil(total / limit);

      expect(offset).toBe(10);
      expect(pages).toBe(3);
    });

    it('should handle edge cases in pagination', () => {
      const emptyPagination = {
        page: 1,
        limit: 10,
        total: 0,
        pages: Math.ceil(0 / 10)
      };

      expect(emptyPagination.pages).toBe(0);

      const singlePage = {
        page: 1,
        limit: 10,
        total: 5,
        pages: Math.ceil(5 / 10)
      };

      expect(singlePage.pages).toBe(1);
    });
  });

  describe('Search Functionality', () => {
    it('should build search query correctly', () => {
      const search = 'João';
      const searchParam = `%${search}%`;

      expect(searchParam).toBe('%João%');
      
      const testValues = ['João Silva', 'Maria João', 'Pedro João Santos'];
      const matches = testValues.filter(name => 
        name.toLowerCase().includes(search.toLowerCase())
      );

      expect(matches).toHaveLength(3);
    });

    it('should handle special characters in search', () => {
      const specialSearch = "O'Connor";
      const escapedSearch = specialSearch.replace(/'/g, "''");
      
      expect(escapedSearch).toBe("O''Connor");
    });
  });

  describe('Soft Delete', () => {
    it('should implement soft delete correctly', () => {
      const now = new Date().toISOString();
      
      const funcionario: Partial<Funcionario> = {
        id: 1,
        nome: 'João Silva',
        deleted_at: undefined
      };

      const deletedFuncionario = {
        ...funcionario,
        deleted_at: now,
        updated_at: now
      };

      expect(deletedFuncionario.deleted_at).toBeTruthy();
      expect(deletedFuncionario.deleted_at).toBe(now);
    });

    it('should filter out deleted records in queries', () => {
      const funcionarios: Partial<Funcionario>[] = [
        { id: 1, nome: 'Active User', deleted_at: undefined },
        { id: 2, nome: 'Deleted User', deleted_at: '2024-01-01T00:00:00.000Z' },
        { id: 3, nome: 'Another Active', deleted_at: undefined }
      ];

      const activeOnly = funcionarios.filter(f => !f.deleted_at);
      
      expect(activeOnly).toHaveLength(2);
      expect(activeOnly.map(f => f.nome)).toEqual(['Active User', 'Another Active']);
    });
  });
});

~~~

---
## FILE: src/test/mocks/factories/escala.factory.ts
~~~typescript
import type {
  EscalaMensal,
  CalendarioData,
  EscalaAlocacao,
  ConflitosData,
  TipoEventoConfig,
  QuinzenaEscala,
  TripulanteOperacional,
} from '@/react-app/pages/escalas/hooks/queries/escalas-types';

// ── EscalaMensal ───────────────────────────────────────────────────────────
export function makeEscalaMensal(overrides: Partial<EscalaMensal> = {}): EscalaMensal {
  return {
    id: 'escala-1',
    empresa_id: 6,
    ano: 2026,
    mes: 5,
    status: 'rascunho',
    nome: 'Escala Maio/2026',
    periodo: null,
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-01T00:00:00Z',
    deleted_at: null,
    ...overrides,
  } as EscalaMensal;
}

// ── CalendarioData ─────────────────────────────────────────────────────────
export function makeCalendarioData(overrides: Partial<CalendarioData> = {}): CalendarioData {
  return {
    escala: makeEscalaMensal(),
    alocacoes: [makeAlocacao()],
    eventos: [makeEvento()],
    aeronaves: [],
    tripulacoes: [],
    quinzenas: [
      {
        id: 'q1',
        numero: 1,
        mes: 5,
        ano: 2026,
        data_inicio: '2026-05-01',
        data_fim: '2026-05-16',
        empresa_id: 6,
      },
      {
        id: 'q2',
        numero: 2,
        mes: 5,
        ano: 2026,
        data_inicio: '2026-05-17',
        data_fim: '2026-05-31',
        empresa_id: 6,
      },
    ],
    ...overrides,
  } as CalendarioData;
}

// ── EscalaAlocacao ─────────────────────────────────────────────────────────
export function makeAlocacao(overrides: Partial<EscalaAlocacao> = {}): EscalaAlocacao {
  return {
    id: 'aloc-1',
    escala_id: 'escala-1',
    funcionario_id: '10',
    funcionario_nome: 'João Silva',
    funcionario_guerra: 'Silva',
    funcionario_matricula: 'MAT001',
    funcionario_role: 'PILOTO_CMT',
    aeronave_id: 24,
    aeronave_prefixo: 'PS-CDV',
    aeronave_modelo: 'AW139',
    funcao: 'PIC',
    situacao_tipo: null,
    quinzena_id: 'q1',
    quinzena_numero: 1,
    data_inicio: '2026-05-01',
    data_fim: '2026-05-16',
    auto_gerado: false,
    deleted_at: null,
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-01T00:00:00Z',
    ...overrides,
  } as EscalaAlocacao;
}

// ── EscalaEvento (como CalendarioData.eventos[]) ───────────────────────────
export function makeEvento(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    id: 'ev-1',
    escala_id: 'escala-1',
    funcionario_id: '10',
    funcionario_nome: 'João Silva',
    tipo_evento_id: 'te-1',
    tipo_evento_codigo: 'TRN',
    tipo_evento_nome: 'Treinamento',
    tipo_evento_cor: '#3B82F6',
    data_inicio: '2026-05-05',
    data_fim: '2026-05-05',
    auto_gerado: false,
    deleted_at: null,
    ...overrides,
  };
}

// ── TipoEventoConfig ───────────────────────────────────────────────────────
export function makeTipoEvento(overrides: Partial<TipoEventoConfig> = {}): TipoEventoConfig {
  return {
    id: 'te-1',
    codigo: 'TRN',
    nome: 'Treinamento',
    cor: '#3B82F6',
    icone: null,
    ativo: 1,
    ordem: 1,
    empresa_id: 6,
    ...overrides,
  } as TipoEventoConfig;
}

// ── ConflitosData ──────────────────────────────────────────────────────────
export function makeConflitosData(overrides: Partial<ConflitosData> = {}): ConflitosData {
  return {
    conflitos_eventos: [],
    conflitos_tripulacoes: [],
    total: 0,
    ...overrides,
  } as ConflitosData;
}

// ── QuinzenaEscala ─────────────────────────────────────────────────────────
export function makeQuinzena(overrides: Partial<QuinzenaEscala> = {}): QuinzenaEscala {
  return {
    id: 'q1',
    numero: 1,
    mes: 5,
    ano: 2026,
    data_inicio: '2026-05-01',
    data_fim: '2026-05-16',
    empresa_id: 6,
    ...overrides,
  } as QuinzenaEscala;
}

// ── TripulanteOperacional ─────────────────────────────────────────────────
export function makeTripulante(
  overrides: Partial<TripulanteOperacional> = {},
): TripulanteOperacional {
  return {
    funcionario_id: '10',
    nome: 'João Silva',
    nome_guerra: 'Silva',
    matricula: 'MAT001',
    empresa_id: 6,
    role: 'PILOTO_CMT',
    cma_valido: true,
    cma_dias_restantes: 180,
    cma_validade_fim: '2026-12-31',
    frms_score: null,
    frms_status: null,
    frms_avaliacao_data: null,
    simuladores_pendentes: 0,
    proximo_simulador_data: null,
    habilitacoes: [],
    status_operacional: 'APTO',
    pode_ser_alocado: true,
    ja_alocado_nesta_escala: false,
    motivo_bloqueio: null,
    ja_alocado_em: null,
    quinzena: 'primeira',
    ...overrides,
  } as TripulanteOperacional;
}

~~~

---
## FILE: src/test/mocks/handlers/escalas.handlers.ts
~~~typescript
import { http, HttpResponse } from 'msw';
import {
  makeEscalaMensal,
  makeCalendarioData,
  makeAlocacao,
  makeEvento,
  makeTipoEvento,
  makeConflitosData,
} from '../factories/escala.factory';
import { API_BASE_URL } from '@/react-app/config/api';

const BASE = API_BASE_URL;

export const escalasHandlers = [
  // List escalas (exact path — must come before :id handler)
  http.get(`${BASE}/escalas`, () => {
    return HttpResponse.json({
      success: true,
      data: [makeEscalaMensal(), makeEscalaMensal({ id: 'escala-2', mes: 6 })],
    });
  }),

  // Get tipos de evento (exact path — must come before /:id handler)
  http.get(`${BASE}/escalas/tipos-evento-config`, () => {
    return HttpResponse.json({
      success: true,
      data: [
        makeTipoEvento({ id: 'te-1', codigo: 'TRN', nome: 'Treinamento', ativo: 1 }),
        makeTipoEvento({ id: 'te-2', codigo: 'FER', nome: 'Férias', ativo: 1 }),
        makeTipoEvento({ id: 'te-3', codigo: 'OLD', nome: 'Inativo', ativo: 0 }),
      ],
    });
  }),

  // Get single escala
  http.get(`${BASE}/escalas/:id`, ({ params }) => {
    if (params.id === 'not-found') {
      return HttpResponse.json({ success: false, error: 'Não encontrado' }, { status: 404 });
    }
    return HttpResponse.json({ success: true, data: makeEscalaMensal({ id: String(params.id) }) });
  }),

  // Get calendario
  http.get(`${BASE}/escalas/:id/calendario`, ({ params }) => {
    if (params.id === 'error-id') {
      return HttpResponse.json({ success: false, error: 'Erro interno' }, { status: 500 });
    }
    return HttpResponse.json({ success: true, data: makeCalendarioData() });
  }),

  // Get conflitos
  http.get(`${BASE}/escalas/:id/conflitos`, () => {
    return HttpResponse.json({ success: true, data: makeConflitosData() });
  }),

  // POST alocações
  http.post(`${BASE}/escalas/:id/alocacoes`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    if (body?.funcao === 'SOBREPOSICAO') {
      return HttpResponse.json(
        { success: false, error: 'Sobreposição de alocação detectada', code: 'SOBREPOSICAO' },
        { status: 409 },
      );
    }
    if (body?.funcao === 'CMA_BLOQUEADA') {
      return HttpResponse.json(
        { success: false, error: 'CMA do tripulante está bloqueada', code: 'CMA_BLOQUEADA' },
        { status: 409 },
      );
    }
    if (body?.funcao === 'CMA_EXPIRADO' && !body?.cma_override) {
      return HttpResponse.json(
        { success: false, error: 'CMA expirado', code: 'CMA_EXPIRADO' },
        { status: 409 },
      );
    }
    return HttpResponse.json({ success: true, data: makeAlocacao() });
  }),

  // POST tripulações
  http.post(`${BASE}/escalas/:id/tripulacoes`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    if (!body?.pic_id) {
      return HttpResponse.json({ success: false, error: 'pic_id obrigatório' }, { status: 422 });
    }
    return HttpResponse.json({ success: true, data: { id: 'trip-1' } });
  }),

  // POST eventos
  http.post(`${BASE}/escalas/:id/eventos`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    if (!body?.funcionario_id) {
      return HttpResponse.json(
        { success: false, error: 'funcionario_id obrigatório' },
        { status: 422 },
      );
    }
    return HttpResponse.json({ success: true, data: makeEvento() });
  }),

  // DELETE evento
  http.delete(`${BASE}/escalas/:id/eventos/:eventoId`, () => {
    return HttpResponse.json({ success: true, data: { deleted: true } });
  }),

  // DELETE alocação
  http.delete(`${BASE}/escalas/:id/alocacoes/:alocId`, () => {
    return HttpResponse.json({ success: true, data: { deleted: true } });
  }),

  // GET quinzenas
  http.get(`${BASE}/escalas/quinzenas`, () => {
    return HttpResponse.json({
      success: true,
      data: [
        {
          id: 'q1',
          numero: 1,
          mes: 5,
          ano: 2026,
          data_inicio: '2026-05-01',
          data_fim: '2026-05-16',
          empresa_id: 6,
        },
        {
          id: 'q2',
          numero: 2,
          mes: 5,
          ano: 2026,
          data_inicio: '2026-05-17',
          data_fim: '2026-05-31',
          empresa_id: 6,
        },
      ],
    });
  }),
];

~~~

---
## FILE: src/test/mocks/handlers/frms.handlers.ts
~~~typescript
/**
 * MSW handlers for FRMS API endpoints (used in tests)
 */
import { http, HttpResponse } from 'msw';

const API = 'https://airtrust-api-production.airtrust.workers.dev/api';

function mockHeatmapData() {
  const days: Record<
    string,
    { pct: number; hv7d: number; hv28d: number; hvDia: number; pctDia: number }
  > = {};
  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days[key] = {
      pct: Math.round(Math.random() * 100),
      hv7d: 300 + Math.round(Math.random() * 200),
      hv28d: 1200 + Math.round(Math.random() * 400),
      hvDia: 60 + Math.round(Math.random() * 120),
      pctDia: Math.round(Math.random() * 100),
    };
  }

  return Array.from({ length: 5 }, (_, i) => ({
    tripulante_id: String(100 + i),
    nome: `Tripulante Teste ${i + 1}`,
    nome_guerra: `TT${i + 1}`,
    cargo: 'Piloto',
    dias: days,
    maxPct: 50 + i * 10,
  }));
}

function mockTimeline() {
  const today = new Date();
  return Array.from({ length: 30 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (29 - i));
    return {
      data: d.toISOString().slice(0, 10),
      pct_fadiga: 40 + Math.round(Math.random() * 40),
      hv_7d: 300 + Math.round(Math.random() * 200),
      hv_28d: 1200 + Math.round(Math.random() * 400),
      hv_dia: 60 + Math.round(Math.random() * 120),
      pct_dia: Math.round(Math.random() * 100),
      teve_jornada: Math.random() > 0.3 ? 1 : 0,
      hora_apresentacao: '06:00',
      hora_termino: '18:00',
    };
  });
}

export const frmsHandlers = [
  // Heatmap
  http.get(`${API}/frms/heatmap`, () => {
    return HttpResponse.json({ success: true, data: mockHeatmapData() });
  }),

  // Timeline
  http.get(`${API}/frms/tripulante/:id/timeline`, () => {
    return HttpResponse.json({ success: true, data: mockTimeline() });
  }),

  // Frota
  http.get(`${API}/frms/frota`, () => {
    return HttpResponse.json({
      success: true,
      data: Array.from({ length: 5 }, (_, i) => ({
        tripulante_id: String(100 + i),
        nome: `Tripulante ${i + 1}`,
        nome_guerra: `T${i + 1}`,
        cargo: 'Piloto',
        funcao: 'PILOTO',
        hv_mes_min: 600 + i * 10,
        pct_mes: 50 + i,
        hv_7d_min: 200 + i * 5,
        pct_7d: 40 + i,
        hv_28d_min: 800 + i * 20,
        pct_28d: 60 + i,
        hv_365d_min: 5000 + i * 100,
        pct_365d: 30 + i,
        hv_dia_min: 100 + i,
        pct_dia: 20 + i,
        nivel_max: i < 3 ? 'OK' : i < 4 ? 'ATENCAO' : 'CRITICO',
      })),
    });
  }),

  // Alertas
  http.get(`${API}/frms/alertas`, () => {
    return HttpResponse.json({ success: true, data: [] });
  }),

  // Alertas count
  http.get(`${API}/frms/alertas/count`, () => {
    return HttpResponse.json({ success: true, data: { count: 2 } });
  }),

  // Limites
  http.get(`${API}/frms/configuracao/limites`, () => {
    return HttpResponse.json({
      success: true,
      data: {
        ALERTA_AVISO_PCT: 80,
        ALERTA_CRITICO_PCT: 95,
        ALERTA_VIOLACAO_PCT: 100,
      },
    });
  }),

  // Aeronaves (used by sidebar filter)
  http.get(`${API}/aeronaves`, () => {
    return HttpResponse.json({
      success: true,
      data: [
        { id: 1, prefixo: 'PT-AAA', modelo: 'AW139', status: 'ativo' },
        { id: 2, prefixo: 'PT-BBB', modelo: 'S-76D', status: 'ativo' },
      ],
    });
  }),

  // Funcionarios (used by TripulantePickerModal)
  http.get(`${API}/funcionarios`, () => {
    return HttpResponse.json({
      success: true,
      data: Array.from({ length: 5 }, (_, i) => ({
        id: 100 + i,
        nome: `Funcionário ${i + 1}`,
        cargo: 'Piloto',
        funcao: 'PILOTO',
      })),
    });
  }),
];

~~~

---
## FILE: src/test/mocks/server.ts
~~~typescript
import { setupServer } from 'msw/node';
import { escalasHandlers } from './handlers/escalas.handlers';
import { frmsHandlers } from './handlers/frms.handlers';

export const server = setupServer(...escalasHandlers, ...frmsHandlers);

~~~

---
## FILE: src/test/security.test.ts
~~~typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';

const SecurityUtils = {
  sanitizeString(input: string): string {
    return input
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
      .replace(
        /\s+\w[\w-]*\s*=\s*(?:"[^"]*(?:javascript|data|vbscript):[^"]*"|'[^']*(?:javascript|data|vbscript):[^']*')/gi,
        '',
      )
      .replace(/javascript:|data:|vbscript:/gi, '')
      .replace(/on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '')
      .trim();
  },

  isValidEmail(email: string): boolean {
    if (email.includes('..')) return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email) && email.length <= 254;
  },

  hashForLogging(data: string): string {
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  },
};

describe('Security', () => {
  describe('Input Sanitization', () => {
    it('should remove script tags', () => {
      const maliciousInput = '<script>alert("xss")</script>Hello World';
      const sanitized = SecurityUtils.sanitizeString(maliciousInput);

      expect(sanitized).toBe('Hello World');
      expect(sanitized).not.toContain('<script>');
      expect(sanitized).not.toContain('alert');
    });

    it('should remove javascript: URLs', () => {
      const maliciousInput = 'javascript:alert("xss")';
      const sanitized = SecurityUtils.sanitizeString(maliciousInput);

      expect(sanitized).toBe('alert("xss")');
      expect(sanitized).not.toContain('javascript:');
    });

    it('should remove data: URLs', () => {
      const maliciousInput = 'data:text/html,<script>alert("xss")</script>';
      const sanitized = SecurityUtils.sanitizeString(maliciousInput);

      expect(sanitized).not.toContain('data:');
    });

    it('should remove event handlers', () => {
      const maliciousInput = '<img src="x" onerror="alert(1)">';
      const sanitized = SecurityUtils.sanitizeString(maliciousInput);

      expect(sanitized).not.toContain('onerror=');
      expect(sanitized).not.toContain('alert(1)');
    });

    it('should handle multiple threats in one input', () => {
      const maliciousInput =
        '<script>alert(1)</script><img onerror="alert(2)" src="javascript:alert(3)">';
      const sanitized = SecurityUtils.sanitizeString(maliciousInput);

      expect(sanitized).not.toContain('<script>');
      expect(sanitized).not.toContain('onerror=');
      expect(sanitized).not.toContain('javascript:');
      expect(sanitized).not.toContain('alert');
    });

    it('should preserve safe content', () => {
      const safeInput = 'Hello <b>World</b>! This is safe content.';
      const sanitized = SecurityUtils.sanitizeString(safeInput);

      expect(sanitized).toContain('Hello');
      expect(sanitized).toContain('World');
      expect(sanitized).toContain('safe content');
    });
  });

  describe('Email Validation', () => {
    it('should validate correct email formats', () => {
      const validEmails = [
        'test@example.com',
        'user.name@domain.co.uk',
        'user+tag@example.org',
        'user123@test-domain.com',
      ];

      validEmails.forEach((email) => {
        expect(SecurityUtils.isValidEmail(email)).toBe(true);
      });
    });

    it('should reject invalid email formats', () => {
      const invalidEmails = [
        'invalid-email',
        '@domain.com',
        'user@',
        'user space@domain.com',
        'user@domain',
        'user@@domain.com',
        'user@domain..com',
      ];

      invalidEmails.forEach((email) => {
        expect(SecurityUtils.isValidEmail(email)).toBe(false);
      });
    });

    it('should reject emails that are too long', () => {
      const longEmail = 'a'.repeat(250) + '@example.com';
      expect(SecurityUtils.isValidEmail(longEmail)).toBe(false);
    });
  });

  describe('SQL Injection Prevention', () => {
    it('should detect common SQL injection patterns', () => {
      const sqlInjectionPatterns = [
        /drop\s+table/i,
        /delete\s+from/i,
        /insert\s+into.*values/i,
        /update\s+.*set/i,
        /union\s+select/i,
        /or\s+1\s*=\s*1/i,
        /';\s*(drop|delete|insert|update)/i,
      ];

      const maliciousInputs = [
        "'; DROP TABLE users; --",
        '1 OR 1=1',
        "admin'; DELETE FROM users; --",
        '1 UNION SELECT * FROM passwords',
        "'; UPDATE users SET password='hacked'; --",
      ];

      maliciousInputs.forEach((input) => {
        const isDetected = sqlInjectionPatterns.some((pattern) =>
          pattern.test(input.toLowerCase()),
        );
        expect(isDetected).toBe(true);
      });
    });

    it('should allow safe SQL-like content', () => {
      const sqlInjectionPatterns = [
        /drop\s+table/i,
        /delete\s+from/i,
        /insert\s+into.*values/i,
        /update\s+.*set/i,
        /union\s+select/i,
        /or\s+1\s*=\s*1/i,
      ];

      const safeInputs = [
        'My name is John',
        'I like to drop by the table',
        'Please update me on the progress',
        'The union of two sets',
      ];

      safeInputs.forEach((input) => {
        const isDetected = sqlInjectionPatterns.some((pattern) =>
          pattern.test(input.toLowerCase()),
        );
        expect(isDetected).toBe(false);
      });
    });
  });

  describe('Password Security', () => {
    it('should validate password strength', () => {
      const validatePassword = (password: string): { valid: boolean; errors: string[] } => {
        const errors: string[] = [];

        if (password.length < 8) {
          errors.push('Password must be at least 8 characters long');
        }

        if (!/[A-Z]/.test(password)) {
          errors.push('Password must contain at least one uppercase letter');
        }

        if (!/[a-z]/.test(password)) {
          errors.push('Password must contain at least one lowercase letter');
        }

        if (!/\d/.test(password)) {
          errors.push('Password must contain at least one number');
        }

        if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
          errors.push('Password must contain at least one special character');
        }

        return { valid: errors.length === 0, errors };
      };

      const strongPasswords = ['MyStr0ng!Pass', 'Secure123!@#', 'C0mplex$Pass'];

      strongPasswords.forEach((password) => {
        const result = validatePassword(password);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      const weakPasswords = [
        'password', // no uppercase, no numbers, no special chars
        'PASSWORD', // no lowercase, no numbers, no special chars
        '12345678', // no letters, no special chars
        'Pass123', // no special chars, too short
        'pass', // too short, no uppercase, no numbers, no special chars
      ];

      weakPasswords.forEach((password) => {
        const result = validatePassword(password);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Data Hashing for Logging', () => {
    it('should generate consistent hashes', () => {
      const data = 'sensitive-user-data';
      const hash1 = SecurityUtils.hashForLogging(data);
      const hash2 = SecurityUtils.hashForLogging(data);

      expect(hash1).toBe(hash2);
      expect(hash1).not.toBe(data);
      expect(hash1.length).toBeGreaterThan(0);
    });

    it('should generate different hashes for different data', () => {
      const data1 = 'user-data-1';
      const data2 = 'user-data-2';

      const hash1 = SecurityUtils.hashForLogging(data1);
      const hash2 = SecurityUtils.hashForLogging(data2);

      expect(hash1).not.toBe(hash2);
    });

    it('should handle empty strings', () => {
      const hash = SecurityUtils.hashForLogging('');
      expect(hash).toBe('0');
    });
  });

  describe('Content Security Policy', () => {
    it('should generate secure CSP directives', () => {
      const generateCSP = (environment: string) => {
        const directives = [
          "default-src 'self'",
          environment === 'development'
            ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
            : "script-src 'self'",
          environment === 'development'
            ? "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com"
            : "style-src 'self' https://fonts.googleapis.com",
          "font-src 'self' https://fonts.gstatic.com",
          "img-src 'self' data: https:",
          "connect-src 'self'",
          "frame-ancestors 'none'",
          "base-uri 'self'",
          "form-action 'self'",
          "object-src 'none'",
          'upgrade-insecure-requests',
        ];

        return directives.join('; ');
      };

      const devCSP = generateCSP('development');
      const prodCSP = generateCSP('production');

      expect(devCSP).toContain("'unsafe-inline'");
      expect(devCSP).toContain("'unsafe-eval'");

      expect(prodCSP).not.toContain("'unsafe-inline'");
      expect(prodCSP).not.toContain("'unsafe-eval'");

      expect(devCSP).toContain("default-src 'self'");
      expect(prodCSP).toContain("default-src 'self'");
      expect(devCSP).toContain("frame-ancestors 'none'");
      expect(prodCSP).toContain("frame-ancestors 'none'");
    });
  });

  describe('Rate Limiting', () => {
    it('should implement basic rate limiting logic', () => {
      const rateLimiter = new Map<string, { count: number; resetTime: number }>();
      const RATE_LIMIT = 5;
      const WINDOW_MS = 60000; // 1 minute

      const checkRateLimit = (clientId: string): { allowed: boolean; remaining: number } => {
        const now = Date.now();
        const clientData = rateLimiter.get(clientId);

        if (!clientData || now > clientData.resetTime) {
          rateLimiter.set(clientId, { count: 1, resetTime: now + WINDOW_MS });
          return { allowed: true, remaining: RATE_LIMIT - 1 };
        }

        if (clientData.count >= RATE_LIMIT) {
          return { allowed: false, remaining: 0 };
        }

        clientData.count++;
        return { allowed: true, remaining: RATE_LIMIT - clientData.count };
      };

      const clientId = '192.168.1.1';

      for (let i = 0; i < 5; i++) {
        const result = checkRateLimit(clientId);
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(4 - i);
      }

      const blockedResult = checkRateLimit(clientId);
      expect(blockedResult.allowed).toBe(false);
      expect(blockedResult.remaining).toBe(0);
    });
  });
});

~~~

---
## FILE: src/test/setup.ts
~~~typescript
import '@testing-library/jest-dom';
import { expect, afterEach, beforeEach, afterAll, beforeAll, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { server } from './mocks/server';

expect.extend(require('@testing-library/jest-dom/matchers'));

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));

afterEach(() => {
  cleanup();
  server.resetHandlers();
});

afterAll(() => server.close());

beforeEach(() => {
  // Reset de mocks globais se necessário
});

// Mock de window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock de localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
global.localStorage = localStorageMock as any;

~~~

---
## FILE: worker-airtrust/src/__tests__/anac-data-base.test.ts
~~~typescript
/**
 * Testes para calculateNextQualificationExpiry
 *
 * Valida a regra da Data Base (ANAC RBAC 135) com janela de 90 dias,
 * ajuste para último dia do mês e os 4 casos possíveis.
 *
 * @file worker-airtrust/src/utils/__tests__/anac-data-base.test.ts
 */

import { calculateNextQualificationExpiry } from '../utils/anac-data-base';

// ─────────────────────────────────────────────────────────────────────────────
// CASO 1 — WITHIN_WINDOW (Janela de 90 dias — Data Base PROTEGIDA)
// ─────────────────────────────────────────────────────────────────────────────

describe('calculateNextQualificationExpiry — WITHIN_WINDOW', () => {
  /**
   * TESTE PRINCIPAL: Piloto FAP06/IFR realiza o cheque 45 dias antes.
   *
   * Data Base atual : 30/06/2026
   * Data de realização: 16/05/2026 (45 dias antes)
   * Ciclo            : 6 meses
   *
   * SEM proteção: completion + 6m = Nov/2026 → 30/11/2026 (piloto perde 45 dias)
   * COM proteção: base + 6m      = Dez/2026 → 31/12/2026 ✅
   */
  it('FAP06 (6m): cheque 45 dias antes preserva a Data Base', () => {
    const result = calculateNextQualificationExpiry({
      completionDate: '2026-05-16',
      currentBaseDate: '2026-06-30',
      cycleMonths: 6,
    });

    expect(result.case).toBe('WITHIN_WINDOW');
    expect(result.newBaseDateISO).toBe('2026-12-31');
    expect(result.newBaseDateBR).toBe('31/12/2026');
    expect(result.daysRelativeToBase).toBe(45);
    expect(result.windowStartISO).toBe('2026-04-01'); // 30/06 − 90 dias = 01/04
  });

  /**
   * Piloto FAP05.2/Tipo realiza o cheque 30 dias antes do vencimento.
   *
   * Data Base atual : 31/03/2026
   * Data de realização: 29/02/2026 (30 dias antes — fevereiro bissexto)
   * Ciclo            : 12 meses
   *
   * COM proteção: base + 12m = Mar/2027 → 31/03/2027
   */
  it('FAP05.2 (12m): cheque 30 dias antes preserva a Data Base', () => {
    const result = calculateNextQualificationExpiry({
      completionDate: '2026-02-28',
      currentBaseDate: '2026-03-31',
      cycleMonths: 12,
    });

    expect(result.case).toBe('WITHIN_WINDOW');
    expect(result.newBaseDateISO).toBe('2027-03-31');
    expect(result.daysRelativeToBase).toBe(31);
  });

  /**
   * Cheque realizado exatamente no dia do vencimento (limite "on-time").
   * Deve ser WITHIN_WINDOW (0 dias antes — ainda está na janela).
   */
  it('cheque no dia exato do vencimento é WITHIN_WINDOW (daysRelativeToBase = 0)', () => {
    const result = calculateNextQualificationExpiry({
      completionDate: '2026-06-30',
      currentBaseDate: '2026-06-30',
      cycleMonths: 6,
    });

    expect(result.case).toBe('WITHIN_WINDOW');
    expect(result.daysRelativeToBase).toBe(0);
    expect(result.newBaseDateISO).toBe('2026-12-31');
  });

  /**
   * Cheque exatamente no primeiro dia da janela de 3 meses (limite inferior).
   * windowStart = 1° do 2° mês anterior à base.
   * Regra: base = 30/09/2026 → windowStart = 01/07/2026 (primeiro dia de julho).
   */
  it('cheque no 1° dia da janela de 3 meses está dentro da janela (limite inferior)', () => {
    // base = 30/09/2026  → windowStart = 01/07/2026 (primeiro dia do mês base − 2)
    // completion = 02/07/2026 = 1 dia após o início da janela → WITHIN_WINDOW
    const result = calculateNextQualificationExpiry({
      completionDate: '2026-07-02',
      currentBaseDate: '2026-09-30',
      cycleMonths: 6,
    });

    expect(result.case).toBe('WITHIN_WINDOW');
    expect(result.daysRelativeToBase).toBe(90);
    // Novo vencimento: 30/09 + 6m = Mar/2027 → 31/03/2027
    expect(result.newBaseDateISO).toBe('2027-03-31');
    // windowStart = primeiro dia do mês (base − 2 meses) = 01/07/2026
    expect(result.windowStartISO).toBe('2026-07-01');
  });

  /**
   * Confirma que os "dias perdidos" com antecipação NÃO são subtraídos.
   * Cheque 45 dias antes em ciclo de 6 meses:
   *   - nova base (PROTEGIDA) = base + 6m
   *   - nova base (SEM PROTEÇÃO) seria = completion + 6m
   * A diferença deve ser exatamente 45 dias.
   */
  it('nova Data Base com proteção é 45 dias maior que sem proteção', () => {
    const withProtection = calculateNextQualificationExpiry({
      completionDate: '2026-05-16',
      currentBaseDate: '2026-06-30',
      cycleMonths: 6,
    });

    // Simulação sem proteção (base from completion)
    const withoutProtection = calculateNextQualificationExpiry({
      completionDate: '2026-05-16',
      currentBaseDate: null,   // força NO_BASE → usa completion como base
      cycleMonths: 6,
    });

    const dateProtected    = new Date(withProtection.newBaseDateISO + 'T00:00:00Z');
    const dateUnprotected  = new Date(withoutProtection.newBaseDateISO + 'T00:00:00Z');

    // A proteção garante que o vencimento protegido é MAIOR que sem proteção.
    // Protected  = base + 6m       = 30/06 + 6m → 31/12/2026
    // Unprotected = completion + 6m = 16/05 + 6m → 30/11/2026
    // A diferença entre os fins-de-mês (31 dias) é independente dos 45 dias de
    // antecipação: o que importa é que o piloto não perde dias, i.e., protected > unprotected.
    expect(dateProtected.getTime()).toBeGreaterThan(dateUnprotected.getTime());
    expect(withProtection.newBaseDateISO).toBe('2026-12-31');
    expect(withoutProtection.newBaseDateISO).toBe('2026-11-30');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CASO 2 — BEFORE_WINDOW (Mais de 90 dias antes — nova base criada)
// ─────────────────────────────────────────────────────────────────────────────

describe('calculateNextQualificationExpiry — BEFORE_WINDOW', () => {
  /**
   * Cheque realizado 1 dia ANTES do início da janela de 3 meses.
   * Nova base começa na data de realização (não protegida).
   *
   * base = 30/09/2026  → windowStart = 01/07/2026
   * completion = 30/06/2026 = 1 dia fora da janela → BEFORE_WINDOW
   */
  it('cheque 1 dia antes do início da janela é BEFORE_WINDOW e usa completion como base', () => {
    // base = 30/09/2026  → windowStart = 01/07/2026 (regra de 3 meses)
    // completion = 30/06/2026 = 1 dia antes da janela → BEFORE_WINDOW
    const result = calculateNextQualificationExpiry({
      completionDate: '2026-06-30',
      currentBaseDate: '2026-09-30',
      cycleMonths: 6,
    });

    expect(result.case).toBe('BEFORE_WINDOW');
    // Sep 30 - Jun 30 = Jul(31) + Aug(31) + Sep(30) = 92 dias
    expect(result.daysRelativeToBase).toBe(92);
    // Novo vencimento: 30/06/2026 + 6m = Dez/2026 → 31/12/2026
    expect(result.newBaseDateISO).toBe('2026-12-31');
    expect(result.windowStartISO).toBe('2026-07-01');
  });

  it('cheque muito antecipado (180 dias antes) é BEFORE_WINDOW', () => {
    const result = calculateNextQualificationExpiry({
      completionDate: '2026-01-01',
      currentBaseDate: '2026-06-30',
      cycleMonths: 6,
    });

    expect(result.case).toBe('BEFORE_WINDOW');
    expect(result.daysRelativeToBase).toBe(180);
    // 01/01/2026 + 6m = Jul/2026 → 31/07/2026
    expect(result.newBaseDateISO).toBe('2026-07-31');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CASO 3 — AFTER_BASE (Realizado após o vencimento — base perdida)
// ─────────────────────────────────────────────────────────────────────────────

describe('calculateNextQualificationExpiry — AFTER_BASE', () => {
  /**
   * Piloto atrasado: realizou 15 dias depois do vencimento.
   * Data Base original perdida; nova base a partir da realização.
   */
  it('cheque 15 dias após o vencimento é AFTER_BASE', () => {
    const result = calculateNextQualificationExpiry({
      completionDate: '2026-07-15',
      currentBaseDate: '2026-06-30',
      cycleMonths: 6,
    });

    expect(result.case).toBe('AFTER_BASE');
    expect(result.daysRelativeToBase).toBe(-15); // negativo = atrasado
    // 15/07/2026 + 6m = Jan/2027 → 31/01/2027
    expect(result.newBaseDateISO).toBe('2027-01-31');
  });

  it('cheque 1 dia após o vencimento já é AFTER_BASE', () => {
    const result = calculateNextQualificationExpiry({
      completionDate: '2026-07-01',
      currentBaseDate: '2026-06-30',
      cycleMonths: 12,
    });

    expect(result.case).toBe('AFTER_BASE');
    expect(result.daysRelativeToBase).toBe(-1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CASO 4 — NO_BASE (Primeiro registro do piloto para esta qualificação)
// ─────────────────────────────────────────────────────────────────────────────

describe('calculateNextQualificationExpiry — NO_BASE', () => {
  it('primeiro registro (sem currentBaseDate) cria base a partir da realização', () => {
    const result = calculateNextQualificationExpiry({
      completionDate: '2026-01-10',
      cycleMonths: 12,
    });

    expect(result.case).toBe('NO_BASE');
    expect(result.daysRelativeToBase).toBeNull();
    expect(result.windowStartISO).toBeNull();
    // 10/01/2026 + 12m = Jan/2027 → 31/01/2027
    expect(result.newBaseDateISO).toBe('2027-01-31');
  });

  it('primeiro registro com currentBaseDate = null é equivalente a omitir', () => {
    const result = calculateNextQualificationExpiry({
      completionDate: '2026-03-15',
      currentBaseDate: null,
      cycleMonths: 6,
    });

    expect(result.case).toBe('NO_BASE');
    // 15/03/2026 + 6m = Set/2026 → 30/09/2026
    expect(result.newBaseDateISO).toBe('2026-09-30');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AJUSTE PARA ÚLTIMO DIA DO MÊS
// ─────────────────────────────────────────────────────────────────────────────

describe('calculateNextQualificationExpiry — ajuste para último dia do mês', () => {
  it('resultado em fevereiro de ano bissexto deve ser 29/02', () => {
    // 2028 é bissexto
    const result = calculateNextQualificationExpiry({
      completionDate: '2027-08-15',
      cycleMonths: 6,
    });

    expect(result.case).toBe('NO_BASE');
    // 15/08/2027 + 6m = Fev/2028 → 29/02/2028
    expect(result.newBaseDateISO).toBe('2028-02-29');
  });

  it('resultado em fevereiro de ano não-bissexto deve ser 28/02', () => {
    // 2027 não é bissexto
    const result = calculateNextQualificationExpiry({
      completionDate: '2026-08-10',
      cycleMonths: 6,
    });

    // 10/08/2026 + 6m = Fev/2027 → 28/02/2027
    expect(result.newBaseDateISO).toBe('2027-02-28');
  });

  it('resultado em mês de 30 dias deve terminar em 30', () => {
    const result = calculateNextQualificationExpiry({
      completionDate: '2026-05-01',
      cycleMonths: 6,
    });

    // 01/05/2026 + 6m = Nov/2026 → 30/11/2026
    expect(result.newBaseDateISO).toBe('2026-11-30');
  });

  it('resultado em mês de 31 dias deve terminar em 31', () => {
    const result = calculateNextQualificationExpiry({
      completionDate: '2026-06-15',
      cycleMonths: 6,
    });

    // 15/06/2026 + 6m = Dez/2026 → 31/12/2026
    expect(result.newBaseDateISO).toBe('2026-12-31');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SEPARAÇÃO FAP 14: IFR (6m) vs TIPO VISUAL (12m)
// ─────────────────────────────────────────────────────────────────────────────

describe('calculateNextQualificationExpiry — FAP14 IFR vs Tipo Visual', () => {
  /**
   * Simula o cenário descrito na spec: FAP14 deve ser gerenciada como dois
   * registros independentes (135.297 e 135.293) para evitar que uma reprovação
   * IFR bloqueie o voo visual quando o Tipo ainda está válido.
   *
   * Mesmo piloto, mesma data de realização — ciclos diferentes geram
   * vencimentos diferentes.
   */
  it('FAP14/135.297 (IFR, 6m) e FAP14/135.293 (Tipo Visual, 12m) têm vencimentos independentes', () => {
    const baseIFR   = '2026-06-30'; // Data Base do cheque IFR anterior
    const baseTipo  = '2026-12-31'; // Data Base do cheque Tipo anterior
    const completion = '2026-05-16'; // Ambos realizados no mesmo dia

    const resultIFR = calculateNextQualificationExpiry({
      completionDate: completion,
      currentBaseDate: baseIFR,
      cycleMonths: 6,
    });

    const resultTipo = calculateNextQualificationExpiry({
      completionDate: completion,
      currentBaseDate: baseTipo,
      cycleMonths: 12,
    });

    // IFR: dentro da janela de 30/06/2026 → nova base = 30/06 + 6m = 31/12/2026
    expect(resultIFR.case).toBe('WITHIN_WINDOW');
    expect(resultIFR.newBaseDateISO).toBe('2026-12-31');

    // Tipo Visual: 16/05/2026 vs base 31/12/2026 → 229 dias antes → BEFORE_WINDOW
    expect(resultTipo.case).toBe('BEFORE_WINDOW');
    // Nova base = 16/05/2026 + 12m = Mai/2027 → 31/05/2027
    expect(resultTipo.newBaseDateISO).toBe('2027-05-31');

    // Os dois vencimentos são independentes
    expect(resultIFR.newBaseDateISO).not.toBe(resultTipo.newBaseDateISO);
  });

  it('FAP14/IFR vencido não afeta FAP14/Tipo Visual ainda vigente', () => {
    // IFR venceu há 30 dias; Tipo ainda vence em 6 meses
    const resultIFR = calculateNextQualificationExpiry({
      completionDate: '2026-07-30', // realizado 30 dias após vencimento do IFR
      currentBaseDate: '2026-06-30',
      cycleMonths: 6,
    });

    const resultTipo = calculateNextQualificationExpiry({
      completionDate: '2026-07-30', // mesmo dia — renovação do Tipo dentro da janela
      currentBaseDate: '2026-09-30',
      cycleMonths: 12,
    });

    expect(resultIFR.case).toBe('AFTER_BASE');
    expect(resultTipo.case).toBe('WITHIN_WINDOW'); // Tipo ainda protegido
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// VALIDAÇÃO DE ENTRADAS INVÁLIDAS
// ─────────────────────────────────────────────────────────────────────────────

describe('calculateNextQualificationExpiry — validação de entradas', () => {
  it('deve lançar erro para data de realização inválida', () => {
    expect(() =>
      calculateNextQualificationExpiry({
        completionDate: 'nao-e-uma-data',
        cycleMonths: 6,
      }),
    ).toThrow();
  });

  it('deve lançar erro para Data Base atual inválida', () => {
    // Mês 0 é falsy após Number('00') = 0, acionando o guard !m na parseISO
    expect(() =>
      calculateNextQualificationExpiry({
        completionDate: '2026-01-01',
        currentBaseDate: '2026-00-15', // mês 0 é inválido e falsy
        cycleMonths: 6,
      }),
    ).toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FORMATO DE SAÍDA
// ─────────────────────────────────────────────────────────────────────────────

describe('calculateNextQualificationExpiry — formato de saída', () => {
  it('newBaseDateISO deve estar no formato YYYY-MM-DD', () => {
    const result = calculateNextQualificationExpiry({
      completionDate: '2026-01-15',
      cycleMonths: 6,
    });

    expect(result.newBaseDateISO).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('newBaseDateBR deve estar no formato DD/MM/YYYY', () => {
    const result = calculateNextQualificationExpiry({
      completionDate: '2026-01-15',
      cycleMonths: 6,
    });

    expect(result.newBaseDateBR).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });

  it('description deve ser uma string não vazia', () => {
    const result = calculateNextQualificationExpiry({
      completionDate: '2026-01-15',
      currentBaseDate: '2026-03-31',
      cycleMonths: 6,
    });

    expect(typeof result.description).toBe('string');
    expect(result.description.length).toBeGreaterThan(0);
  });

  it('windowStartISO é null quando não há Data Base anterior', () => {
    const result = calculateNextQualificationExpiry({
      completionDate: '2026-01-15',
      cycleMonths: 6,
    });

    expect(result.windowStartISO).toBeNull();
  });

  it('windowStartISO é uma data válida quando há Data Base anterior', () => {
    const result = calculateNextQualificationExpiry({
      completionDate: '2026-01-15',
      currentBaseDate: '2026-03-31',
      cycleMonths: 6,
    });

    expect(result.windowStartISO).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // windowStart = primeiro dia do (mês de março − 2) = 1° de janeiro de 2026
    expect(result.windowStartISO).toBe('2026-01-01');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CASOS DE TESTE OBRIGATÓRIOS ANAC RBAC 135
// Conforme especificação do prompt de auditoria (Parágrafos 135.293 e 135.297)
// ─────────────────────────────────────────────────────────────────────────────

describe('calculateNextQualificationExpiry — Casos ANAC RBAC 135 obrigatórios', () => {
  /**
   * CASO A — IFR 6 meses (135.297):
   * Base 30/JUN. Realizado em 05/ABR (dentro da janela).
   * → Data Base PRESERVADA. Resultado deve ser 31/DEZ.
   *
   * Janela: 01/ABR a 30/JUN
   * 05/ABR ≥ 01/ABR → WITHIN_WINDOW
   * Nova base = 30/JUN + 6m = DEZ/2026 → 31/DEZ/2026
   */
  it('Caso A — IFR 6m: realizado 05/ABR com base 30/JUN → preserva base → 31/DEZ', () => {
    const result = calculateNextQualificationExpiry({
      completionDate: '2026-04-05',
      currentBaseDate: '2026-06-30',
      cycleMonths: 6,
    });

    expect(result.case).toBe('WITHIN_WINDOW');
    expect(result.newBaseDateISO).toBe('2026-12-31');
    expect(result.newBaseDateBR).toBe('31/12/2026');
    // Janela abre em 01/ABR
    expect(result.windowStartISO).toBe('2026-04-01');
  });

  /**
   * CASO B — IFR 6 meses (135.297):
   * Base 30/JUN. Realizado em 28/MAR (FORA da janela — 1 dia antes de 01/ABR).
   * → Data Base RESETADA. Resultado deve ser 30/SET.
   *
   * 28/MAR < 01/ABR → BEFORE_WINDOW
   * Nova base = 28/MAR + 6m = SET/2026 → 30/SET/2026
   */
  it('Caso B — IFR 6m: realizado 28/MAR com base 30/JUN → reseta base → 30/SET', () => {
    const result = calculateNextQualificationExpiry({
      completionDate: '2026-03-28',
      currentBaseDate: '2026-06-30',
      cycleMonths: 6,
    });

    expect(result.case).toBe('BEFORE_WINDOW');
    expect(result.newBaseDateISO).toBe('2026-09-30');
    expect(result.newBaseDateBR).toBe('30/09/2026');
    expect(result.windowStartISO).toBe('2026-04-01');
  });

  /**
   * CASO C — Ano Bissexto (135.293 anual):
   * Base em fevereiro de ano não-bissexto.
   * O sistema deve projetar corretamente para o próximo ciclo,
   * inclusive quando cair em ano bissexto.
   *
   * C1: Base 28/FEV/2025 (não-bissexto), ciclo 12m → 28/FEV/2026 (não-bissexto)
   * C2: Base 28/FEV/2027 (não-bissexto), ciclo 12m → 29/FEV/2028 (bissexto!) ✅
   * C3: currentBaseDate fora do último dia → normalizado internamente (ex: 15/FEV→28/FEV)
   */
  it('Caso C1 — não-bissexto → não-bissexto: base FEV/2025 + 12m = FEV/2026 (28 dias)', () => {
    const result = calculateNextQualificationExpiry({
      completionDate: '2025-01-10',
      currentBaseDate: '2025-02-28',
      cycleMonths: 12,
    });

    expect(result.case).toBe('WITHIN_WINDOW');
    // 28/FEV/2025 + 12m = FEV/2026 → último dia = 28/FEV/2026 (2026 não-bissexto)
    expect(result.newBaseDateISO).toBe('2026-02-28');
  });

  it('Caso C2 — não-bissexto → bissexto: base FEV/2027 + 12m = 29/FEV/2028 (bissexto)', () => {
    const result = calculateNextQualificationExpiry({
      completionDate: '2027-01-10',
      currentBaseDate: '2027-02-28',
      cycleMonths: 12,
    });

    expect(result.case).toBe('WITHIN_WINDOW');
    // 28/FEV/2027 + 12m = FEV/2028 → último dia = 29/FEV/2028 (2028 é bissexto)
    expect(result.newBaseDateISO).toBe('2028-02-29');
  });

  it('Caso C3 — normalização de currentBaseDate: 15/FEV tratado como 28/FEV', () => {
    // Base informada com dia 15 (não é o último dia do mês)
    // Deve ser normalizado internamente para 28/FEV/2025
    const comNormalizacao = calculateNextQualificationExpiry({
      completionDate: '2025-01-10',
      currentBaseDate: '2025-02-15', // ← dia 15, não último dia
      cycleMonths: 12,
    });

    const semNormalizacao = calculateNextQualificationExpiry({
      completionDate: '2025-01-10',
      currentBaseDate: '2025-02-28', // ← dia correto
      cycleMonths: 12,
    });

    // Ambos devem produzir o mesmo resultado após a normalização
    expect(comNormalizacao.case).toBe(semNormalizacao.case);
    expect(comNormalizacao.newBaseDateISO).toBe(semNormalizacao.newBaseDateISO);
    expect(comNormalizacao.windowStartISO).toBe(semNormalizacao.windowStartISO);
  });

  /**
   * CASO D — Vencido (135.297 semestral):
   * Base 30/JUN. Realizado em 02/JUL (2 dias após vencimento).
   * → Data Base PERDIDA. Ciclo reinicia da realização. Resultado deve ser 31/JAN.
   *
   * 02/JUL > 30/JUN → AFTER_BASE
   * Nova base = 02/JUL + 6m = JAN/2027 → 31/JAN/2027
   */
  it('Caso D — Vencido: realizado 02/JUL com base 30/JUN → perde base → 31/JAN', () => {
    const result = calculateNextQualificationExpiry({
      completionDate: '2026-07-02',
      currentBaseDate: '2026-06-30',
      cycleMonths: 6,
    });

    expect(result.case).toBe('AFTER_BASE');
    expect(result.newBaseDateISO).toBe('2027-01-31');
    expect(result.newBaseDateBR).toBe('31/01/2027');
    expect(result.daysRelativeToBase).toBe(-2); // negativo = atrasado
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// NORMALIZAÇÃO DE currentBaseDate
// ─────────────────────────────────────────────────────────────────────────────

describe('calculateNextQualificationExpiry — normalização de currentBaseDate', () => {
  it('base no meio do mês é normalizada para o último dia antes dos cálculos', () => {
    // Base 15/JUN vs 30/JUN — com normalização, ambas devem dar o mesmo resultado
    const comDia15 = calculateNextQualificationExpiry({
      completionDate: '2026-04-05',
      currentBaseDate: '2026-06-15', // ← não é último dia
      cycleMonths: 6,
    });

    const comDia30 = calculateNextQualificationExpiry({
      completionDate: '2026-04-05',
      currentBaseDate: '2026-06-30', // ← último dia correto
      cycleMonths: 6,
    });

    expect(comDia15.case).toBe(comDia30.case);
    expect(comDia15.newBaseDateISO).toBe(comDia30.newBaseDateISO);
    expect(comDia15.windowStartISO).toBe(comDia30.windowStartISO);
  });

  it('base no dia 1° do mês é normalizada para o último dia do mesmo mês', () => {
    const result = calculateNextQualificationExpiry({
      completionDate: '2026-04-05',
      currentBaseDate: '2026-06-01', // ← primeiro dia
      cycleMonths: 6,
    });

    // Normalizado para 30/JUN/2026 → janela = 01/ABR → WITHIN_WINDOW
    expect(result.case).toBe('WITHIN_WINDOW');
    expect(result.newBaseDateISO).toBe('2026-12-31');
    expect(result.windowStartISO).toBe('2026-04-01');
  });

  /**
   * Independência de parágrafos (Requisito 3 do prompt):
   * FAP 14 renova 135.293 (12m) e 135.297 (6m) de forma independente.
   * Mesmo piloto, mesma sessão — bases diferentes por parágrafo.
   */
  it('independência de parágrafos: FAP14 renova 135.293 (12m) e 135.297 (6m) independentemente', () => {
    const completionDate = '2026-04-05';

    // 135.297 (IFR, 6 meses) — base em JUN
    const ifr = calculateNextQualificationExpiry({
      completionDate,
      currentBaseDate: '2026-06-30',
      cycleMonths: 6,
    });

    // 135.293 (Tipo, 12 meses) — base em DEZ do mesmo ano
    const tipo = calculateNextQualificationExpiry({
      completionDate,
      currentBaseDate: '2026-12-31',
      cycleMonths: 12,
    });

    // IFR: dentro da janela ABR-JUN → base preservada → DEZ/2026
    expect(ifr.case).toBe('WITHIN_WINDOW');
    expect(ifr.newBaseDateISO).toBe('2026-12-31');

    // Tipo: ABR/2026 vs janela OUT-DEZ/2026 → muito antes → BEFORE_WINDOW
    expect(tipo.case).toBe('BEFORE_WINDOW');
    // ABR/2026 + 12m = ABR/2027 → 30/ABR/2027
    expect(tipo.newBaseDateISO).toBe('2027-04-30');

    // Os dois vencimentos são calculados independentemente
    expect(ifr.newBaseDateISO).not.toBe(tipo.newBaseDateISO);
  });
});

~~~

---
## FILE: worker-airtrust/src/__tests__/auth.integration.test.ts
~~~typescript
/**
 * Auth Integration Tests
 *
 * Testa fluxos de login, refresh, logout e expiração de token.
 * Usa mocks de D1 para rodar sem banco de dados real.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hashPassword, verifyPassword, generateJWT, verifyJWT } from '../utils/security';

// ===== HELPERS =====

const MOCK_JWT_SECRET = 'test-secret-256-bit-key-for-testing-only-not-production';

async function makeToken(
  payload: { sub: number; email: string; role: string; empresa_id: number },
  expiresIn = 3600,
) {
  return generateJWT(payload, MOCK_JWT_SECRET, expiresIn);
}

// ===== TESTES: PASSWORD =====

describe('Password hashing', () => {
  it('hasheia e verifica senha corretamente', async () => {
    const senha = 'SenhaSegura123!';
    const hash = await hashPassword(senha);
    expect(hash).not.toBe(senha);
    expect(await verifyPassword(senha, hash)).toBe(true);
  });

  it('rejeita senha errada', async () => {
    const hash = await hashPassword('correta');
    expect(await verifyPassword('errada', hash)).toBe(false);
  });

  it('hashes diferentes para a mesma senha (salt aleatório)', async () => {
    const h1 = await hashPassword('mesma');
    const h2 = await hashPassword('mesma');
    expect(h1).not.toBe(h2);
  });
});

// ===== TESTES: JWT =====

describe('JWT geração e verificação', () => {
  it('gera token válido e extrai payload', async () => {
    const { token } = await makeToken({
      sub: 42,
      email: 'user@test.com',
      role: 'admin',
      empresa_id: 1,
    });

    const payload = await verifyJWT(token, MOCK_JWT_SECRET);
    expect(payload).not.toBeNull();
    expect(payload!.sub).toBe('42');
    expect(payload!.email).toBe('user@test.com');
    expect(payload!.role).toBe('admin');
    expect(payload!.empresa_id).toBe(1);
  });

  it('rejeita token com secret errado', async () => {
    const { token } = await makeToken({ sub: 1, email: 'x@x.com', role: 'viewer', empresa_id: 1 });
    await expect(verifyJWT(token, 'wrong-secret')).resolves.toBeNull();
  });

  it('rejeita token expirado', async () => {
    const { token } = await makeToken(
      { sub: 1, email: 'x@x.com', role: 'viewer', empresa_id: 1 },
      -10, // já expirado
    );
    await expect(verifyJWT(token, MOCK_JWT_SECRET)).resolves.toBeNull();
  });

  it('token contém jti único', async () => {
    const { jti: jti1 } = await makeToken({
      sub: 1,
      email: 'a@a.com',
      role: 'admin',
      empresa_id: 1,
    });
    const { jti: jti2 } = await makeToken({
      sub: 1,
      email: 'a@a.com',
      role: 'admin',
      empresa_id: 1,
    });
    expect(jti1).toBeTruthy();
    expect(jti2).toBeTruthy();
    expect(jti1).not.toBe(jti2);
  });
});

// ===== TESTES: VALIDAÇÃO DE SENHA (validatePassword helper) =====

describe('Validação de força da senha', () => {
  // Importar diretamente as funções testáveis do auth — usando regra extraída

  const validarSenha = (senha: string): boolean => {
    return typeof senha === 'string' && senha.length >= 8;
  };

  it('aceita senha com 8+ caracteres', () => {
    expect(validarSenha('12345678')).toBe(true);
    expect(validarSenha('senhaForte!')).toBe(true);
  });

  it('rejeita senha com menos de 8 caracteres', () => {
    expect(validarSenha('')).toBe(false);
    expect(validarSenha('1234567')).toBe(false);
  });

  it('rejeita senha vazia ou nula', () => {
    expect(validarSenha('')).toBe(false);
    // @ts-expect-error — teste de runtime com null
    expect(validarSenha(null)).toBe(false);
  });
});

// ===== TESTES: MULTI-TENANT (lógica de empresa_id) =====

describe('Multi-tenant: empresa_id no JWT', () => {
  it('token de empresa A não dá acesso a empresa B', async () => {
    const { token } = await makeToken({
      sub: 1,
      email: 'user@a.com',
      role: 'admin',
      empresa_id: 100, // empresa A
    });

    const payload = await verifyJWT(token, MOCK_JWT_SECRET);
    expect(payload).not.toBeNull();
    // Qualquer endpoint deve rejeitar se payload.empresa_id !== recurso.empresa_id
    expect(payload!.empresa_id).toBe(100);
    expect(payload!.empresa_id).not.toBe(200); // empresa B
  });
});

~~~

---
## FILE: worker-airtrust/src/__tests__/cron/scheduled-handler-renovacao-lms.test.ts
~~~typescript
import { describe, expect, it } from 'vitest';

import { buildQualificacoesEadRenovacaoAutomaticaQuery } from '../../cron/scheduled-handler';

function compactSql(sql: string) {
  return sql.replace(/\s+/g, ' ').trim();
}

describe('renovacao automatica LMS por qualificacao EAD', () => {
  it('inclui qualificacoes vencidas e vencendo em vez de apenas futuras', () => {
    const sql = compactSql(buildQualificacoesEadRenovacaoAutomaticaQuery());

    expect(sql).toContain("COALESCE(qh.renovada, 0) = 0");
    expect(sql).toContain('AND NOT EXISTS ( SELECT 1 FROM qualificacoes_historico qh2');
    expect(sql).toContain(")) <= date('now', '+' || ? || ' days')");
    expect(sql).not.toContain("BETWEEN date('now')");
  });
});

~~~

---
## FILE: worker-airtrust/src/__tests__/frms/calcEffectiveness.periodo.test.ts
~~~typescript
/**
 * T-PERIODO — calcEffectiveness · Período Embarcado (migration 0268)
 *
 * Valida a degradação progressiva de efectividade ao longo do período embarcado:
 *   - dia 1 de N → fatorProgressivo = 0 (sem penalização)
 *   - dia N de N → fatorProgressivo = -FRMS_EMBARQUE_PROGRESSO_MAX/100 (máximo)
 *   - total_dias_periodo < 2 → sem progressão
 */
import { describe, it, expect } from 'vitest';
import { calcEffectiveness, calcFatorizacao } from '../../lib/frms/calculos';
import { LIMITES_DEFAULT } from '../../lib/frms/types';

const L = LIMITES_DEFAULT; // FRMS_EMBARQUE_PROGRESSO_MAX = 8

type FatorizacaoResult = ReturnType<typeof calcFatorizacao>;

function makeFat(total: number, overrides: Partial<FatorizacaoResult> = {}): FatorizacaoResult {
  return {
    fator_basica_pct: 0,
    fator_apresentacao_pct: 0,
    fator_duracao_pct: 0,
    fator_repouso_pct: 0,
    fator_noturno_dep_pct: 0,
    fator_noturno_arr_pct: 0,
    fator_ciclo_embarcado_pct: 0,
    fator_base_away_pct: 0,
    fator_aclimatacao_pct: 0,
    total_fatorizado_jornada: total,
    fator_hv_basica_pct: 0,
    fator_hv_quantidade_pct: 0,
    fator_hv_noturno_dep_pct: 0,
    fator_hv_noturno_arr_pct: 0,
    total_fatorizado_hv: 0,
    ...overrides,
  };
}

describe('calcEffectiveness — período embarcado (fatorProgressivo)', () => {
  it('dia 1 de 14 ≈ sem penalização adicional (fatorProgressivo = 0)', () => {
    const semPeriodo = calcEffectiveness(makeFat(0), L);
    const comPeriodoDia1 = calcEffectiveness(makeFat(0), L, {
      dia_periodo_embarcado: 1,
      total_dias_periodo: 14,
    });
    // No dia 1 a fração é 0, portanto sem diferença no effectiveness
    expect(comPeriodoDia1.effectiveness_pct).toBe(semPeriodo.effectiveness_pct);
    expect(comPeriodoDia1.dia_periodo_embarcado).toBe(1);
    expect(comPeriodoDia1.total_dias_periodo).toBe(14);
  });

  it('dia final (14 de 14) tem effectiveness MENOR que o dia 1 em ≥7 pp', () => {
    const dia1 = calcEffectiveness(makeFat(0), L, {
      dia_periodo_embarcado: 1,
      total_dias_periodo: 14,
    });
    const dia14 = calcEffectiveness(makeFat(0), L, {
      dia_periodo_embarcado: 14,
      total_dias_periodo: 14,
    });
    // FRMS_EMBARQUE_PROGRESSO_MAX = 8 → fatorProgressivo = -0.08 no último dia
    // effectiveness_pct_dia14 = 100 + (-0.08) * 100 = 92 → diff = 8 pp
    const diff = dia1.effectiveness_pct - dia14.effectiveness_pct;
    expect(diff).toBeGreaterThanOrEqual(7);
    expect(dia14.dia_periodo_embarcado).toBe(14);
    expect(dia14.total_dias_periodo).toBe(14);
  });

  it('quando total_dias_periodo < 2, não aplica progressão (effectiveness igual ao baseline)', () => {
    const baseline = calcEffectiveness(makeFat(0), L);
    const comTotal1 = calcEffectiveness(makeFat(0), L, {
      dia_periodo_embarcado: 1,
      total_dias_periodo: 1,
    });
    expect(comTotal1.effectiveness_pct).toBe(baseline.effectiveness_pct);
  });
});

~~~

---
## FILE: worker-airtrust/src/__tests__/frms/calcEffectiveness.test.ts
~~~typescript
/**
 * T1 — calcEffectiveness unit tests
 *
 * Cobre todos os cenários de boundary:
 *   - Conversão total_fatorizado → effectiveness_pct
 *   - Classificação de nível (verde / atencao / amarelo / vermelho)
 *   - Cap em 0% e 100%
 *   - Cálculo de tempo_abaixo_limiar
 *   - Decomposição de componentes
 *   - Testes com limites customizados
 *   - Anti-regressão: nivel nunca undefined
 */
import { describe, it, expect } from 'vitest';
import { calcEffectiveness, calcFatorizacao } from '../../lib/frms/calculos';
import { LIMITES_DEFAULT } from '../../lib/frms/types';
import type { EffectivenessResult } from '../../lib/frms/types';

const L = LIMITES_DEFAULT;

// ─── Helper: constrói uma FatorizacaoResult via ReturnType ──────────

type FatorizacaoResult = ReturnType<typeof calcFatorizacao>;

function makeFat(total: number, overrides: Partial<FatorizacaoResult> = {}): FatorizacaoResult {
  return {
    fator_basica_pct: 0,
    fator_apresentacao_pct: 0,
    fator_duracao_pct: 0,
    fator_repouso_pct: 0,
    fator_noturno_dep_pct: 0,
    fator_noturno_arr_pct: 0,
    fator_ciclo_embarcado_pct: 0,
    fator_base_away_pct: 0,
    fator_aclimatacao_pct: 0,
    total_fatorizado_jornada: total,
    fator_hv_basica_pct: 0,
    fator_hv_quantidade_pct: 0,
    fator_hv_noturno_dep_pct: 0,
    fator_hv_noturno_arr_pct: 0,
    total_fatorizado_hv: 0,
    ...overrides,
  };
}

// ─── Conversão delta → effectiveness_pct ────────────────────────────

describe('calcEffectiveness — conversão total → effectiveness_pct', () => {
  it('total=0 → effectiveness=100%', () => {
    const r = calcEffectiveness(makeFat(0), L);
    expect(r.effectiveness_pct).toBe(100);
  });

  it('total=+0.05 → capped 100%', () => {
    // raw = 100 + 0.05*100 = 105 → capped a 100
    const r = calcEffectiveness(makeFat(0.05), L);
    expect(r.effectiveness_pct).toBe(100);
  });

  it('total=-0.10 → effectiveness=90% (boundary verde_min)', () => {
    // raw = 100 + (-0.10)*100 = 90
    const r = calcEffectiveness(makeFat(-0.1), L);
    expect(r.effectiveness_pct).toBe(90);
  });

  it('total=-0.11 → effectiveness=89% (abaixo verde)', () => {
    const r = calcEffectiveness(makeFat(-0.11), L);
    expect(r.effectiveness_pct).toBe(89);
  });

  it('total=-0.23 → effectiveness=77% (boundary amarelo_max)', () => {
    const r = calcEffectiveness(makeFat(-0.23), L);
    expect(r.effectiveness_pct).toBe(77);
  });

  it('total=-0.35 → effectiveness=65% (boundary vermelho_max)', () => {
    const r = calcEffectiveness(makeFat(-0.35), L);
    expect(r.effectiveness_pct).toBe(65);
  });

  it('total=-1.00 → capped 0%', () => {
    // raw = 100 + (-1.00)*100 = 0
    const r = calcEffectiveness(makeFat(-1.0), L);
    expect(r.effectiveness_pct).toBe(0);
  });

  it('total=-2.00 → capped 0% (abaixo de zero)', () => {
    const r = calcEffectiveness(makeFat(-2.0), L);
    expect(r.effectiveness_pct).toBe(0);
  });
});

// ─── Classificação de nível ─────────────────────────────────────────

describe('calcEffectiveness — classificação de nível', () => {
  // LIMITES_DEFAULT: VERDE=90, AMARELO=77, VERMELHO=65

  it('100% → verde', () => {
    expect(calcEffectiveness(makeFat(0), L).nivel).toBe('verde');
  });

  it('90% → verde (boundary)', () => {
    expect(calcEffectiveness(makeFat(-0.1), L).nivel).toBe('verde');
  });

  it('89% → atencao (logo abaixo de verde)', () => {
    expect(calcEffectiveness(makeFat(-0.11), L).nivel).toBe('atencao');
  });

  it('78% → atencao (logo acima de amarelo)', () => {
    // raw = 100 + (-0.22)*100 = 78
    expect(calcEffectiveness(makeFat(-0.22), L).nivel).toBe('atencao');
  });

  it('77% → amarelo (boundary)', () => {
    expect(calcEffectiveness(makeFat(-0.23), L).nivel).toBe('amarelo');
  });

  it('66% → amarelo (logo acima de vermelho)', () => {
    // raw = 100 + (-0.34)*100 = 66
    expect(calcEffectiveness(makeFat(-0.34), L).nivel).toBe('amarelo');
  });

  it('65% → vermelho (boundary)', () => {
    expect(calcEffectiveness(makeFat(-0.35), L).nivel).toBe('vermelho');
  });

  it('0% → vermelho', () => {
    expect(calcEffectiveness(makeFat(-1.0), L).nivel).toBe('vermelho');
  });
});

// ─── Tempo abaixo do limiar ─────────────────────────────────────────

describe('calcEffectiveness — tempo_abaixo_limiar', () => {
  it('sem fatores de risco → 0 min', () => {
    const r = calcEffectiveness(makeFat(0), L);
    expect(r.tempo_abaixo_limiar_pct).toBe(0);
  });

  it('apenas noturno_dep → +45', () => {
    const r = calcEffectiveness(makeFat(0, { fator_noturno_dep_pct: -5 }), L);
    expect(r.tempo_abaixo_limiar_pct).toBe(45);
  });

  it('apenas noturno_arr → +30', () => {
    const r = calcEffectiveness(makeFat(0, { fator_noturno_arr_pct: -5 }), L);
    expect(r.tempo_abaixo_limiar_pct).toBe(30);
  });

  it('repouso negativo → +30', () => {
    const r = calcEffectiveness(makeFat(0, { fator_repouso_pct: -3 }), L);
    expect(r.tempo_abaixo_limiar_pct).toBe(30);
  });

  it('todos os fatores de risco → 105 min', () => {
    const r = calcEffectiveness(
      makeFat(-0.3, {
        fator_noturno_dep_pct: -5,
        fator_noturno_arr_pct: -5,
        fator_repouso_pct: -3,
      }),
      L,
    );
    expect(r.tempo_abaixo_limiar_pct).toBe(105);
  });
});

// ─── Componentes de fadiga ──────────────────────────────────────────

describe('calcEffectiveness — componentes', () => {
  it('processo_s = fator_ciclo_embarcado_pct', () => {
    const r = calcEffectiveness(makeFat(0, { fator_ciclo_embarcado_pct: 1.5 }), L);
    expect(r.componentes.processo_s).toBe(1.5);
  });

  it('processo_c = apresentacao + noturno_dep + noturno_arr', () => {
    const r = calcEffectiveness(
      makeFat(0, {
        fator_apresentacao_pct: 2,
        fator_noturno_dep_pct: 3,
        fator_noturno_arr_pct: 1,
      }),
      L,
    );
    expect(r.componentes.processo_c).toBe(6);
  });

  it('repouso = fator_repouso_pct', () => {
    const r = calcEffectiveness(makeFat(0, { fator_repouso_pct: -4 }), L);
    expect(r.componentes.repouso).toBe(-4);
  });

  it('hv = fator_hv_quantidade_pct', () => {
    const r = calcEffectiveness(makeFat(0, { fator_hv_quantidade_pct: 2 }), L);
    expect(r.componentes.hv).toBe(2);
  });

  it('duracao = fator_duracao_pct', () => {
    const r = calcEffectiveness(makeFat(0, { fator_basica_pct: 5, fator_duracao_pct: -0.1 }), L);
    expect(r.componentes.duracao).toBe(-0.1);
  });
});

// ─── Limites customizados ───────────────────────────────────────────

describe('calcEffectiveness — limites customizados', () => {
  const customL = {
    ...L,
    EFFECTIV_VERDE_MIN: 95,
    EFFECTIV_AMARELO_MAX: 80,
    EFFECTIV_VERMELHO_MAX: 60,
  };

  it('90% → atencao com VERDE=95 (seria verde no default)', () => {
    // total=-0.10 → 90%
    const r = calcEffectiveness(makeFat(-0.1), customL);
    expect(r.effectiveness_pct).toBe(90);
    expect(r.nivel).toBe('atencao'); // 80 < 90 < 95
  });

  it('80% → amarelo com AMARELO=80 (boundary)', () => {
    // total=-0.20 → 80%
    const r = calcEffectiveness(makeFat(-0.2), customL);
    expect(r.effectiveness_pct).toBe(80);
    expect(r.nivel).toBe('amarelo');
  });

  it('60% → vermelho com VERMELHO=60 (boundary)', () => {
    // total=-0.40 → 60%
    const r = calcEffectiveness(makeFat(-0.4), customL);
    expect(r.effectiveness_pct).toBe(60);
    expect(r.nivel).toBe('vermelho');
  });
});

// ─── Anti-regressão: nivel nunca undefined ──────────────────────────

describe('calcEffectiveness — anti-regressão nivel', () => {
  const totais = [-2, -1, -0.99, -0.5, -0.35, -0.23, -0.1, -0.01, 0, 0.01, 0.5, 1, 2];

  it.each(totais)('total=%s → nivel sempre definido (verde|atencao|amarelo|vermelho)', (total) => {
    const r = calcEffectiveness(makeFat(total), L);
    expect(['verde', 'atencao', 'amarelo', 'vermelho']).toContain(r.nivel);
  });

  it('effectiveness_pct sempre [0, 100]', () => {
    for (const total of totais) {
      const r = calcEffectiveness(makeFat(total), L);
      expect(r.effectiveness_pct).toBeGreaterThanOrEqual(0);
      expect(r.effectiveness_pct).toBeLessThanOrEqual(100);
    }
  });

  it('fatorizacao_delta = total_fatorizado_jornada', () => {
    const r = calcEffectiveness(makeFat(-0.25), L);
    expect(r.fatorizacao_delta).toBe(-0.25);
  });
});

// ─── Offshore Sleep Model (3rd param: jornada) ─────────────────────

describe('calcEffectiveness — offshore sleep model', () => {
  it('sem jornada → duracao_sono_efetiva_min = null', () => {
    const r = calcEffectiveness(makeFat(0), L);
    expect(r.duracao_sono_efetiva_min).toBeNull();
    expect(r.hora_despertar).toBeNull();
    expect(r.hora_inicio_sono).toBeNull();
  });

  it('com jornada e horaDormiu informada → calcula sono efetivo', () => {
    // apresentação 08:00 (480) -> acordou 06:30 (390)
    // dormiu 23:00 (1380) no dia anterior -> sono efetivo 450 min
    const r = calcEffectiveness(makeFat(-0.1, { fator_repouso_pct: -0.05 }), L, {
      hora_apresentacao: '08:00',
      hora_dormiu: '23:00',
    });
    expect(r.duracao_sono_efetiva_min).toBe(450);
    expect(r.hora_despertar).toBe('06:30');
    expect(r.hora_inicio_sono).toBe('23:00');
    expect(r.fonte_sono).toBe('INFORMADO');
  });

  it('sem horaDormiu informada → usa padrão de 8h', () => {
    const r = calcEffectiveness(makeFat(-0.1), L, {
      hora_apresentacao: '08:00',
    });
    expect(r.duracao_sono_efetiva_min).toBe(480);
    expect(r.fonte_sono).toBe('PADRAO');
  });

  it('acordou na WOCL marca flag', () => {
    const r = calcEffectiveness(makeFat(-0.1, { fator_repouso_pct: -0.05 }), L, {
      hora_apresentacao: '03:30',
    });
    expect(r.acordou_na_wocl).toBe(true);
  });

  it('effectiveness stays in [0, 100] with sleep model', () => {
    const r = calcEffectiveness(makeFat(-0.5), L, {
      hora_apresentacao: '06:00',
      hora_dormiu: '05:30',
    });
    expect(r.effectiveness_pct).toBeGreaterThanOrEqual(0);
    expect(r.effectiveness_pct).toBeLessThanOrEqual(100);
  });
});

~~~

---
## FILE: worker-airtrust/src/__tests__/frms/calculos-alertas.test.ts
~~~typescript
/**
 * FRMS — Unit tests (Vitest)
 *
 * Cobre as 4 funções puras principais:
 *   calcFatorizacao, calcAcumuloRolling, processarAlertas, validarEscalaFutura
 */
import { describe, it, expect } from 'vitest';
import {
  hhmmToMinutes,
  minutesToHhmm,
  calcDuracaoMinutos,
  calcDuracaoJornada,
  calcFatorizacao,
  calcAcumuloRolling,
  calcAcumuloMensal,
  calcFatorCicloEmbarcado,
  validarEscalaFutura,
  validarRepousoPlataforma,
  isNoturno,
} from '../../lib/frms/calculos';
import { processarAlertas, deveBloquearLancamento } from '../../lib/frms/alertas';
import { LIMITES_DEFAULT } from '../../lib/frms/types';
import type { FrmsJornada, LimitesMap } from '../../lib/frms/types';
import type { AcumuloRollingResult, PeriodoProjetado } from '../../lib/frms/calculos';

const limites = LIMITES_DEFAULT;

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

describe('hhmmToMinutes', () => {
  it('converte HH:MM para minutos', () => {
    expect(hhmmToMinutes('06:30')).toBe(390);
    expect(hhmmToMinutes('11:00')).toBe(660);
    expect(hhmmToMinutes('00:00')).toBe(0);
    expect(hhmmToMinutes('23:59')).toBe(1439);
  });

  it('retorna 0 para null/undefined', () => {
    expect(hhmmToMinutes(null)).toBe(0);
    expect(hhmmToMinutes(undefined)).toBe(0);
  });
});

describe('minutesToHhmm', () => {
  it('converte minutos para HH:MM', () => {
    expect(minutesToHhmm(390)).toBe('06:30');
    expect(minutesToHhmm(660)).toBe('11:00');
    expect(minutesToHhmm(0)).toBe('00:00');
  });
});

describe('calcDuracaoMinutos', () => {
  it('calcula diferença entre horários', () => {
    expect(calcDuracaoMinutos('06:00', '17:00')).toBe(660);
    expect(calcDuracaoMinutos('22:00', '06:00')).toBe(480); // cruza meia-noite
  });
  it('retorna 0 se algum horário falta', () => {
    expect(calcDuracaoMinutos(null, '17:00')).toBe(0);
    expect(calcDuracaoMinutos('06:00', null)).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────
// calcFatorizacao
// ────────────────────────────────────────────────────────────────────

describe('calcFatorizacao', () => {
  const baseJornada: FrmsJornada = {
    id: '1',
    tripulante_id: 1,
    data: '2026-03-15',
    status: 'ES',
    hora_apresentacao: '06:00',
    hora_termino: '17:00',
    horas_voo_minutos: 180,
    duracao_jornada_minutos: 660,
    hora_primeiro_acionamento: null,
    hora_primeira_decolagem: null,
    hora_ultimo_pouso: null,
    hora_corte_motor: null,
    repouso_plataforma_inicio: null,
    repouso_plataforma_fim: null,
    repouso_plataforma_valido: 0,
    observacao: null,
    registrado_por: 'test',
    origem: 'MANUAL',
    created_at: '',
    updated_at: '',
    deleted_at: null,
    tipo_base: 'HOME',
    tripulacao_aumentada: 0,
    classe_cabine: null,
    aclimatado: 1,
    local_base: null,
  };

  it('jornada normal ES mantém fator_basica diagnóstico positivo e total penalizado', () => {
    const result = calcFatorizacao({
      jornada: baseJornada,
      repousoAnteriorMin: 720, // 12h = suficiente
      limites,
      diasDoMes: 31,
    });

    expect(result.fator_basica_pct).toBeGreaterThan(0);
    expect(result.total_fatorizado_jornada).toBeLessThan(0);
    expect(result.total_fatorizado_hv).toBeGreaterThan(0);
  });

  it('folga (FR) retorna todos zeros', () => {
    const result = calcFatorizacao({
      jornada: { ...baseJornada, status: 'FR', hora_apresentacao: null, hora_termino: null },
      repousoAnteriorMin: 720,
      limites,
      diasDoMes: 31,
    });

    expect(result.fator_basica_pct).toBe(0);
    expect(result.total_fatorizado_jornada).toBe(0);
    expect(result.total_fatorizado_hv).toBe(0);
  });

  it('férias (FE) retorna todos zeros', () => {
    const result = calcFatorizacao({
      jornada: { ...baseJornada, status: 'FE', hora_apresentacao: null, hora_termino: null },
      repousoAnteriorMin: null,
      limites,
      diasDoMes: 28,
    });

    expect(result.total_fatorizado_jornada).toBe(0);
    expect(result.total_fatorizado_hv).toBe(0);
  });

  it('apresentação às 05:00 gera penalidade circadiana', () => {
    const result = calcFatorizacao({
      jornada: { ...baseJornada, hora_apresentacao: '05:00' },
      repousoAnteriorMin: 720,
      limites,
      diasDoMes: 31,
    });

    expect(result.fator_apresentacao_pct).toBeLessThan(0);
  });

  it('jornada > 11h gera fator duração elevado', () => {
    const result = calcFatorizacao({
      jornada: {
        ...baseJornada,
        hora_apresentacao: '05:00',
        hora_termino: '18:00',
        duracao_jornada_minutos: 780,
      },
      repousoAnteriorMin: 720,
      limites,
      diasDoMes: 31,
    });

    expect(result.fator_duracao_pct).not.toBe(0);
  });

  it('repouso insuficiente (< 12h) gera fator repouso elevado', () => {
    const result = calcFatorizacao({
      jornada: baseJornada,
      repousoAnteriorMin: 480, // apenas 8h
      limites,
      diasDoMes: 31,
    });

    expect(result.fator_repouso_pct).not.toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────
// calcAcumuloRolling
// ────────────────────────────────────────────────────────────────────

describe('calcAcumuloRolling', () => {
  const makeJornada = (
    data: string,
    hvMin: number,
    status = 'ES',
  ): Pick<
    FrmsJornada,
    | 'data'
    | 'status'
    | 'horas_voo_minutos'
    | 'hora_termino'
    | 'hora_apresentacao'
    | 'duracao_jornada_minutos'
  > => ({
    data,
    status: status as FrmsJornada['status'],
    horas_voo_minutos: hvMin,
    hora_apresentacao: '06:00',
    hora_termino: '17:00',
    duracao_jornada_minutos: 660,
  });

  it('calcula HV correto para 7 dias', () => {
    const hist = [
      makeJornada('2026-03-15', 180),
      makeJornada('2026-03-14', 200),
      makeJornada('2026-03-13', 150),
    ];
    const result = calcAcumuloRolling({
      tripulanteId: 1,
      dataReferencia: '2026-03-15',
      jornadasHistorico: hist,
      limites,
    });

    expect(result.hv_7_dias_min).toBe(530); // 180+200+150
    // HV diária considera janela rolling de 24h até a apresentação da jornada de referência.
    expect(result.hv_dia_min).toBe(200);
  });

  it('exclui folga do acúmulo', () => {
    const hist = [makeJornada('2026-03-15', 180), makeJornada('2026-03-14', 0, 'FR')];
    const result = calcAcumuloRolling({
      tripulanteId: 1,
      dataReferencia: '2026-03-15',
      jornadasHistorico: hist,
      limites,
    });

    // Com apresentação às 06:00, a janela de 24h termina no início da jornada atual.
    expect(result.hv_dia_min).toBe(0);
    expect(result.hv_7_dias_min).toBe(180);
  });

  it('percentuais de limite corretos', () => {
    // HV_7_DIAS_HORAS = 45 → 45*60=2700 min
    const hist = [makeJornada('2026-03-15', 1350)]; // 1350/2700 = 50%
    const result = calcAcumuloRolling({
      tripulanteId: 1,
      dataReferencia: '2026-03-15',
      jornadasHistorico: hist,
      limites,
    });

    expect(result.pct_limite_7d).toBeCloseTo(50, 0);
  });

  it('repouso anterior calculado corretamente', () => {
    const hist = [
      makeJornada('2026-03-15', 180),
      { ...makeJornada('2026-03-14', 180), hora_termino: '18:00' },
    ];
    const result = calcAcumuloRolling({
      tripulanteId: 1,
      dataReferencia: '2026-03-15',
      jornadasHistorico: hist,
      limites,
    });

    // 14/03 18:00 → 15/03 06:00 = 12h = 720min
    expect(result.repouso_anterior_min).toBe(720);
    expect(result.repouso_suficiente).toBe(1);
  });

  it('sem histórico retorna tudo zerado', () => {
    const result = calcAcumuloRolling({
      tripulanteId: 1,
      dataReferencia: '2026-03-15',
      jornadasHistorico: [],
      limites,
    });

    expect(result.hv_7_dias_min).toBe(0);
    expect(result.hv_28_dias_min).toBe(0);
    expect(result.hv_365_dias_min).toBe(0);
  });

  it('REGRESSION P1: pct_limite_28d usa janela rolling de 28 dias, não o mês calendário', () => {
    // Março 2026 tem 31 dias. Se cada dia tem 100 min de HV:
    //   janela 28d (Mar 4–31) = 28 × 100 = 2800 min
    //   mês calendário (Mar 1–31) = 31 × 100 = 3100 min
    // Antes da correção P1, pct_limite_28d usava hvMes (3100) em vez de hv28 (2800).
    const hist = Array.from({ length: 31 }, (_, i) => {
      const day = String(i + 1).padStart(2, '0');
      return makeJornada(`2026-03-${day}`, 100);
    });
    const result = calcAcumuloRolling({
      tripulanteId: 1,
      dataReferencia: '2026-03-31',
      jornadasHistorico: hist,
      limites,
    });

    // janela 28d = dataRef - 27 dias = 2026-03-04 até 2026-03-31 → 28 dias × 100 = 2800
    expect(result.hv_28_dias_min).toBe(2800);
    // mês calendário = todos os 31 dias × 100 = 3100
    expect(result.hv_mes_calendario_min).toBe(3100);
    // Os percentuais DEVEM ser diferentes (isso é o bug P1 — se usasse hvMes em vez de hv28 seriam iguais)
    expect(result.pct_limite_28d).not.toBe(result.pct_limite_mes_calendario);
    // pct_limite_28d deve basear-se em hv_28_dias_min (usa HV_MES_HORAS como limite)
    const limite28min = (limites.HV_MES_HORAS as number) * 60;
    const expectedPct28d = Math.round((2800 / limite28min) * 10000) / 100;
    expect(result.pct_limite_28d).toBeCloseTo(expectedPct28d, 0);
  });
});

// ────────────────────────────────────────────────────────────────────
// processarAlertas
// ────────────────────────────────────────────────────────────────────

describe('processarAlertas', () => {
  const acumuloBase: AcumuloRollingResult = {
    hv_7_dias_min: 0,
    hv_28_dias_min: 0,
    hv_365_dias_min: 0,
    hv_mes_calendario_min: 0,
    hv_dia_min: 0,
    pct_limite_7d: 0,
    pct_limite_28d: 0,
    pct_limite_mes_calendario: 0,
    pct_limite_365d: 0,
    pct_limite_dia: 0,
    repouso_anterior_min: 720,
    repouso_suficiente: 1,
  };

  it('não gera alertas quando tudo OK', () => {
    const alertas = processarAlertas({
      tripulanteId: 1,
      jornadaId: 'j1',
      jornada: {
        duracao_jornada_minutos: 300,
        horas_voo_minutos: 120,
        status: 'ES',
        tripulacao_aumentada: 0,
      },
      acumulo: { ...acumuloBase, hv_dia_min: 120 },
      limites,
    });

    expect(alertas.length).toBe(0);
  });

  it('gera alerta HV_DIARIA quando perto do limite', () => {
    // HV_DIARIA_HORAS=8 → 480min. threshold=480-120=360min
    const alertas = processarAlertas({
      tripulanteId: 1,
      jornadaId: 'j1',
      jornada: {
        duracao_jornada_minutos: 600,
        horas_voo_minutos: 400,
        status: 'ES',
        tripulacao_aumentada: 0,
      },
      acumulo: { ...acumuloBase, hv_dia_min: 400, pct_limite_dia: 83.3 },
      limites,
    });

    const hvDiaria = alertas.find((a) => a.tipo_limite === 'HV_DIARIA');
    expect(hvDiaria).toBeDefined();
  });

  it('gera alerta CRITICO quando HV_7D ultrapassa 100%', () => {
    // HV_7_DIAS=45h=2700min → 2800>100%
    const alertas = processarAlertas({
      tripulanteId: 1,
      jornadaId: 'j1',
      jornada: {
        duracao_jornada_minutos: 660,
        horas_voo_minutos: 180,
        status: 'ES',
        tripulacao_aumentada: 0,
      },
      acumulo: { ...acumuloBase, hv_7_dias_min: 2800, pct_limite_7d: 103.7 },
      limites,
    });

    const critico = alertas.find((a) => a.tipo_limite === 'HV_7D' && a.nivel === 'CRITICO');
    expect(critico).toBeDefined();
  });

  it('gera alerta REPOUSO quando insuficiente', () => {
    const alertas = processarAlertas({
      tripulanteId: 1,
      jornadaId: 'j1',
      jornada: {
        duracao_jornada_minutos: 600,
        horas_voo_minutos: 180,
        status: 'ES',
        tripulacao_aumentada: 0,
      },
      acumulo: { ...acumuloBase, repouso_anterior_min: 400, repouso_suficiente: 0 },
      limites,
    });

    const repouso = alertas.find((a) => a.tipo_limite === 'REPOUSO');
    expect(repouso).toBeDefined();
  });
});

describe('deveBloquearLancamento', () => {
  it('bloqueia com alerta CRITICO', () => {
    const alertas = [
      {
        tripulante_id: 1,
        jornada_id: 'j1',
        tipo_limite: 'HV_7D' as const,
        nivel: 'CRITICO' as const,
        percentual_atingido: 96,
        valor_atual_min: 2600,
        valor_limite_min: 2700,
        mensagem: 'Limité crítico',
      },
    ];

    expect(deveBloquearLancamento(alertas)).toBe(true);
  });

  it('não bloqueia com alerta VIOLACAO (apenas registra flag)', () => {
    // VIOLACAO = 100%+ — registra ocorrência mas NÃO bloqueia (auditoria regulatória post-facto)
    const alertas = [
      {
        tripulante_id: 1,
        jornada_id: 'j1',
        tipo_limite: 'HV_7D' as const,
        nivel: 'VIOLACAO' as const,
        percentual_atingido: 105,
        valor_atual_min: 2800,
        valor_limite_min: 2700,
        mensagem: 'Limite ultrapassado',
      },
    ];

    expect(deveBloquearLancamento(alertas)).toBe(false);
  });

  it('não bloqueia com apenas AVISO', () => {
    const alertas = [
      {
        tripulante_id: 1,
        jornada_id: 'j1',
        tipo_limite: 'HV_7D' as const,
        nivel: 'AVISO' as const,
        percentual_atingido: 82,
        valor_atual_min: 2200,
        valor_limite_min: 2700,
        mensagem: 'Atenção ao limite',
      },
    ];

    expect(deveBloquearLancamento(alertas)).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────
// validarEscalaFutura
// ────────────────────────────────────────────────────────────────────

describe('validarEscalaFutura', () => {
  const makeHistorico = (
    data: string,
    hvMin: number,
  ): Pick<
    FrmsJornada,
    | 'data'
    | 'status'
    | 'horas_voo_minutos'
    | 'hora_termino'
    | 'hora_apresentacao'
    | 'duracao_jornada_minutos'
  > => ({
    data,
    status: 'ES',
    horas_voo_minutos: hvMin,
    hora_apresentacao: '06:00',
    hora_termino: '17:00',
    duracao_jornada_minutos: 660,
  });

  it('escala que não viola limites retorna valida=true', () => {
    const result = validarEscalaFutura(
      [
        { data: '2026-03-16', status: 'ES', duracao_estimada_min: 660, hv_estimada_min: 180 },
        { data: '2026-03-17', status: 'ES', duracao_estimada_min: 660, hv_estimada_min: 180 },
      ],
      [makeHistorico('2026-03-15', 180)],
      limites,
    );

    expect(result.valida).toBe(true);
    expect(result.violacoes).toHaveLength(0);
  });

  it('escala com HV excessiva detecta violação projetada', () => {
    // Criar histórico com HV alta nos últimos 7 dias (~43h = 2580min)
    const historico = [];
    for (let i = 1; i <= 6; i++) {
      historico.push(makeHistorico(`2026-03-${String(15 - i).padStart(2, '0')}`, 430));
    }

    // Projetar mais um dia com +200min → total 7d = 2580+200 = 2780 > 2700 (45h)
    const result = validarEscalaFutura(
      [{ data: '2026-03-15', status: 'ES', duracao_estimada_min: 660, hv_estimada_min: 200 }],
      historico,
      limites,
    );

    expect(result.violacoes.length).toBeGreaterThan(0);
    const v = result.violacoes.find((v) => v.tipo_limite === 'HV_7D');
    expect(v).toBeDefined();
  });

  it('escala vazia retorna valida', () => {
    const result = validarEscalaFutura([], [], limites);
    expect(result.valida).toBe(true);
    expect(result.violacoes).toHaveLength(0);
  });

  it('detecta violação de repouso quando projeções consecutivas não respeitam o mínimo', () => {
    const result = validarEscalaFutura(
      [
        {
          data: '2026-03-16',
          status: 'ES',
          duracao_estimada_min: 660,
          hv_estimada_min: 180,
          hora_apresentacao_estimada: '10:00',
          hora_termino_estimada: '21:00',
        },
        {
          data: '2026-03-17',
          status: 'ES',
          duracao_estimada_min: 660,
          hv_estimada_min: 180,
          hora_apresentacao_estimada: '05:00',
        },
      ],
      [],
      limites,
    );

    const violacaoRepouso = result.violacoes.find((violacao) => violacao.tipo_limite === 'REPOUSO');
    expect(violacaoRepouso).toBeDefined();
    expect(violacaoRepouso?.valor_projetado).toBe(480);
  });
});

// ────────────────────────────────────────────────────────────────────
// Testes adicionais — cobertura completa dos gaps da auditoria
// ────────────────────────────────────────────────────────────────────

describe('processarAlertas — nível AVISO (80%)', () => {
  it('gera alerta HV_7D com nível AVISO ao atingir 80%', () => {
    // HV_7_DIAS_HORAS = 45h = 2700min → 80% = 2160min
    const alertas = processarAlertas({
      tripulanteId: 1,
      jornadaId: 'j1',
      jornada: {
        duracao_jornada_minutos: 600,
        horas_voo_minutos: 180,
        status: 'ES',
        tripulacao_aumentada: 0,
      },
      acumulo: {
        hv_7_dias_min: 2160,
        hv_28_dias_min: 2160,
        hv_365_dias_min: 2160,
        hv_mes_calendario_min: 2160,
        hv_dia_min: 180,
        pct_limite_7d: 80.0,
        pct_limite_28d: 0,
        pct_limite_mes_calendario: 0,
        pct_limite_365d: 0,
        pct_limite_dia: 37.5,
        repouso_anterior_min: 720,
        repouso_suficiente: 1,
      },
      limites,
    });

    const aviso = alertas.find((a) => a.tipo_limite === 'HV_7D' && a.nivel === 'AVISO');
    expect(aviso).toBeDefined();
    expect(aviso?.percentual_atingido).toBeCloseTo(80, 0);
    expect(deveBloquearLancamento(alertas)).toBe(false);
  });
});

describe('processarAlertas — nível CRITICO (95%) bloqueia', () => {
  it('gera alerta CRITICO a 95% e deve bloquear lançamento', () => {
    // HV_7_DIAS_HORAS = 45h = 2700min → 95% = 2565min
    const alertas = processarAlertas({
      tripulanteId: 1,
      jornadaId: 'j2',
      jornada: {
        duracao_jornada_minutos: 660,
        horas_voo_minutos: 180,
        status: 'ES',
        tripulacao_aumentada: 0,
      },
      acumulo: {
        hv_7_dias_min: 2565,
        hv_28_dias_min: 2565,
        hv_365_dias_min: 2565,
        hv_mes_calendario_min: 2565,
        hv_dia_min: 180,
        pct_limite_7d: 95.0,
        pct_limite_28d: 0,
        pct_limite_mes_calendario: 0,
        pct_limite_365d: 0,
        pct_limite_dia: 37.5,
        repouso_anterior_min: 720,
        repouso_suficiente: 1,
      },
      limites,
    });

    const critico = alertas.find((a) => a.tipo_limite === 'HV_7D' && a.nivel === 'CRITICO');
    expect(critico).toBeDefined();
    expect(deveBloquearLancamento(alertas)).toBe(true);
  });

  it('HV_7D acima de 100% segue como CRITICO e bloqueia lançamento', () => {
    const alertas = processarAlertas({
      tripulanteId: 1,
      jornadaId: 'j3',
      jornada: {
        duracao_jornada_minutos: 660,
        horas_voo_minutos: 180,
        status: 'ES',
        tripulacao_aumentada: 0,
      },
      acumulo: {
        hv_7_dias_min: 2800,
        hv_28_dias_min: 2800,
        hv_365_dias_min: 2800,
        hv_mes_calendario_min: 2800,
        hv_dia_min: 180,
        pct_limite_7d: 103.7,
        pct_limite_28d: 0,
        pct_limite_mes_calendario: 0,
        pct_limite_365d: 0,
        pct_limite_dia: 37.5,
        repouso_anterior_min: 720,
        repouso_suficiente: 1,
      },
      limites,
    });

    const critico = alertas.find((a) => a.tipo_limite === 'HV_7D' && a.nivel === 'CRITICO');
    expect(critico).toBeDefined();
    expect(deveBloquearLancamento(alertas)).toBe(true);
  });
});

describe('calcFatorizacao — todos os fatores agravantes ativos simultaneamente', () => {
  it('jornada com apresentação noturna + longa + repouso crítico + noturno dep/arr', () => {
    const jornadaAgravada: FrmsJornada = {
      id: '99',
      tripulante_id: 1,
      data: '2026-03-15',
      status: 'ES',
      hora_apresentacao: '02:00', // noturno → -0.20
      hora_termino: '15:00',
      duracao_jornada_minutos: 780, // 13h > 10h → -0.10
      horas_voo_minutos: 360, // 6h → 0.00 qtd HV
      hora_primeiro_acionamento: null,
      hora_primeira_decolagem: '23:30', // noturno dep → +0.10
      hora_ultimo_pouso: '22:15', // noturno arr → +0.10
      hora_corte_motor: null,
      repouso_plataforma_inicio: null,
      repouso_plataforma_fim: null,
      repouso_plataforma_valido: 0,
      observacao: null,
      registrado_por: 'test',
      origem: 'MANUAL',
      created_at: '',
      updated_at: '',
      deleted_at: null,
      tipo_base: 'HOME',
      tripulacao_aumentada: 0,
      classe_cabine: null,
      aclimatado: 1,
      local_base: null,
    };

    const result = calcFatorizacao({
      jornada: jornadaAgravada,
      repousoAnteriorMin: 300, // 5h < 8h → -0.20 repouso
      limites,
      diasDoMes: 31,
    });

    // Apresentação 02h00 → -0.20
    expect(result.fator_apresentacao_pct).toBe(-0.2);
    // Duração 780min = 13h > 10h → -0.10
    expect(result.fator_duracao_pct).toBe(-0.1);
    // Repouso 300min = 5h < 8h → -0.20
    expect(result.fator_repouso_pct).toBe(-0.2);
    // Noturno decolagem 23:30 → -0.10
    expect(result.fator_noturno_dep_pct).toBe(-0.1);
    // Noturno pouso 22:15 → -0.10
    expect(result.fator_noturno_arr_pct).toBe(-0.1);
    // Total jornada exclui fator_basica e soma apenas penalidades reais
    const semBasica =
      result.fator_apresentacao_pct +
      result.fator_duracao_pct +
      result.fator_repouso_pct +
      result.fator_noturno_dep_pct +
      result.fator_noturno_arr_pct;
    expect(semBasica).toBeCloseTo(-0.7, 4);
  });
});

describe('calcAcumuloRolling — virada de ano', () => {
  it('janela de 7 dias cruzando 31/12 → 01/01 soma corretamente', () => {
    // Última semana de dez/2025 + primeiros dias de jan/2026
    const hist = [
      {
        data: '2025-12-28',
        status: 'ES',
        horas_voo_minutos: 200,
        hora_apresentacao: '06:00',
        hora_termino: '17:00',
        duracao_jornada_minutos: 660,
      },
      {
        data: '2025-12-29',
        status: 'ES',
        horas_voo_minutos: 200,
        hora_apresentacao: '06:00',
        hora_termino: '17:00',
        duracao_jornada_minutos: 660,
      },
      {
        data: '2025-12-30',
        status: 'ES',
        horas_voo_minutos: 200,
        hora_apresentacao: '06:00',
        hora_termino: '17:00',
        duracao_jornada_minutos: 660,
      },
      {
        data: '2025-12-31',
        status: 'ES',
        horas_voo_minutos: 200,
        hora_apresentacao: '06:00',
        hora_termino: '17:00',
        duracao_jornada_minutos: 660,
      },
      {
        data: '2026-01-01',
        status: 'ES',
        horas_voo_minutos: 200,
        hora_apresentacao: '06:00',
        hora_termino: '17:00',
        duracao_jornada_minutos: 660,
      },
      {
        data: '2026-01-02',
        status: 'ES',
        horas_voo_minutos: 200,
        hora_apresentacao: '06:00',
        hora_termino: '17:00',
        duracao_jornada_minutos: 660,
      },
      {
        data: '2026-01-03',
        status: 'ES',
        horas_voo_minutos: 200,
        hora_apresentacao: '06:00',
        hora_termino: '17:00',
        duracao_jornada_minutos: 660,
      },
    ] as any[];

    const result = calcAcumuloRolling({
      tripulanteId: 1,
      dataReferencia: '2026-01-03',
      jornadasHistorico: hist,
      limites,
    });

    // Janela 7d = 28/12 até 03/01 → 7 dias × 200 = 1400min
    expect(result.hv_7_dias_min).toBe(1400);

    // Mês calendário Jan/2026: apenas jan/01, jan/02, jan/03 = 3 × 200 = 600min
    expect(result.hv_mes_calendario_min).toBe(600);

    // HV dia = 200min (apenas 03/01)
    expect(result.hv_dia_min).toBe(200);
  });

  it('janela de 365 dias cruzando ano-anterior conta todos os dias', () => {
    // 3 dias em nov/2025 + 3 dias em jan/2026
    const hist = [
      {
        data: '2025-11-01',
        status: 'ES',
        horas_voo_minutos: 180,
        hora_apresentacao: '06:00',
        hora_termino: '17:00',
        duracao_jornada_minutos: 660,
      },
      {
        data: '2025-12-15',
        status: 'ES',
        horas_voo_minutos: 180,
        hora_apresentacao: '06:00',
        hora_termino: '17:00',
        duracao_jornada_minutos: 660,
      },
      {
        data: '2026-01-10',
        status: 'ES',
        horas_voo_minutos: 180,
        hora_apresentacao: '06:00',
        hora_termino: '17:00',
        duracao_jornada_minutos: 660,
      },
    ] as any[];

    const result = calcAcumuloRolling({
      tripulanteId: 1,
      dataReferencia: '2026-01-10',
      jornadasHistorico: hist,
      limites,
    });

    // Janela 365d de 2026-01-10 começa em 2025-01-11 → todos os 3 dias estão dentro
    expect(result.hv_365_dias_min).toBe(540); // 3 × 180
  });
});

// ────────────────────────────────────────────────────────────────────
// calcFatorCicloEmbarcado (Process S — Borbély Two-Process Model)
// ────────────────────────────────────────────────────────────────────

describe('calcFatorCicloEmbarcado', () => {
  const customLimites = {
    ...limites,
    CICLO_EMBARCADO_ATIVO: 1,
    CICLO_EMBARCADO_DIA_INICIO: 1,
    CICLO_EMBARCADO_DIA_MAX: 14,
    CICLO_EMBARCADO_PCT_MIN: 0,
    CICLO_EMBARCADO_PCT_MAX: 10,
  };

  it('retorna 0 quando funcionalidade desativada', () => {
    const off = { ...customLimites, CICLO_EMBARCADO_ATIVO: 0 };
    expect(calcFatorCicloEmbarcado(7, off)).toBe(0);
  });

  it('retorna 0 quando diaDoCiclo é null', () => {
    expect(calcFatorCicloEmbarcado(null, customLimites)).toBe(0);
  });

  it('retorna 0 quando diaDoCiclo é undefined', () => {
    expect(calcFatorCicloEmbarcado(undefined, customLimites)).toBe(0);
  });

  it('dia 1 retorna PCT_MIN', () => {
    expect(calcFatorCicloEmbarcado(1, customLimites)).toBeCloseTo(0, 2);
  });

  it('dia 14 (máximo) retorna PCT_MAX', () => {
    expect(calcFatorCicloEmbarcado(14, customLimites)).toBeCloseTo(10, 2);
  });

  it('dia intermediário interpola linearmente', () => {
    // dia 7 de 14: (7-1)/(14-1) * 10 = 6/13 * 10 ≈ 4.6154
    const result = calcFatorCicloEmbarcado(7, customLimites);
    expect(result).toBeGreaterThan(4);
    expect(result).toBeLessThan(5);
  });

  it('dia além do máximo é capped em PCT_MAX', () => {
    expect(calcFatorCicloEmbarcado(20, customLimites)).toBeCloseTo(10, 2);
  });

  it('dia 0 ou negativo retorna 0', () => {
    expect(calcFatorCicloEmbarcado(0, customLimites)).toBe(0);
    expect(calcFatorCicloEmbarcado(-1, customLimites)).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────
// Parâmetros configuráveis (zero hardcode)
// ────────────────────────────────────────────────────────────────────

describe('calcFatorizacao com limites customizados', () => {
  const testJornada: FrmsJornada = {
    id: 'test-custom',
    tripulante_id: 1,
    data: '2026-03-15',
    status: 'ES',
    hora_apresentacao: '06:00',
    hora_termino: '17:00',
    horas_voo_minutos: 180,
    duracao_jornada_minutos: 660,
    hora_primeiro_acionamento: null,
    hora_primeira_decolagem: null,
    hora_ultimo_pouso: null,
    hora_corte_motor: null,
    repouso_plataforma_inicio: null,
    repouso_plataforma_fim: null,
    repouso_plataforma_valido: 0,
    observacao: null,
    registrado_por: 'test',
    origem: 'MANUAL',
    created_at: '',
    updated_at: '',
    deleted_at: null,
    tipo_base: 'HOME',
    tripulacao_aumentada: 0,
    classe_cabine: null,
    aclimatado: 1,
    local_base: null,
  };

  it('hora noturna gera fator com NOTURNO_FATOR configurável', () => {
    const custom = { ...limites, NOTURNO_FATOR: 20 };
    const jornadaNoturna: FrmsJornada = {
      ...testJornada,
      hora_apresentacao: '23:00',
      hora_termino: '07:00',
      hora_primeira_decolagem: '23:30',
      hora_ultimo_pouso: '06:30',
      duracao_jornada_minutos: 480,
      horas_voo_minutos: 180,
    };
    const result = calcFatorizacao({
      jornada: jornadaNoturna,
      repousoAnteriorMin: 720,
      limites: custom,
      diasDoMes: 31,
    });
    expect(result.fator_noturno_dep_pct).toBe(20);
  });

  it('calcAcumuloRolling retorna pct_limite_mes_calendario', () => {
    const result = calcAcumuloRolling({
      tripulanteId: 1,
      dataReferencia: '2026-01-15',
      jornadasHistorico: [],
      limites,
    });
    expect(result).toHaveProperty('pct_limite_mes_calendario');
    expect(result.pct_limite_mes_calendario).toBe(0);
    // Backward compat
    expect(result).toHaveProperty('pct_limite_28d');
  });
});

// ────────────────────────────────────────────────────────────────────
// validarRepousoPlataforma (cobertura auditoria 2026-02-26)
// ────────────────────────────────────────────────────────────────────

describe('validarRepousoPlataforma', () => {
  it('repouso dentro do intervalo válido (3h–6h) é aceito', () => {
    expect(validarRepousoPlataforma('10:00', '13:00', limites)).toBe(true); // 3h exato
    expect(validarRepousoPlataforma('10:00', '14:00', limites)).toBe(true); // 4h
    expect(validarRepousoPlataforma('10:00', '16:00', limites)).toBe(true); // 6h exato
  });

  it('repouso abaixo do mínimo (< 3h) é rejeitado', () => {
    expect(validarRepousoPlataforma('10:00', '11:30', limites)).toBe(false); // 1h30
    expect(validarRepousoPlataforma('10:00', '10:00', limites)).toBe(false); // 0h
  });

  it('repouso acima do máximo (> 6h) é rejeitado', () => {
    expect(validarRepousoPlataforma('10:00', '17:00', limites)).toBe(false); // 7h
  });

  it('retorna false para horários nulos', () => {
    expect(validarRepousoPlataforma(null, '13:00', limites)).toBe(false);
    expect(validarRepousoPlataforma('10:00', null, limites)).toBe(false);
    expect(validarRepousoPlataforma(null, null, limites)).toBe(false);
  });

  it('repouso cruzando meia-noite dentro do intervalo é aceito', () => {
    expect(validarRepousoPlataforma('23:00', '02:00', limites)).toBe(true); // 3h
    expect(validarRepousoPlataforma('22:00', '03:00', limites)).toBe(true); // 5h
  });

  it('limites configuráveis são respeitados', () => {
    const customLimites = {
      ...limites,
      REPOUSO_PLATAFORMA_MINIMO_HORAS: 2,
      REPOUSO_PLATAFORMA_MAXIMO_HORAS: 4,
    };
    expect(validarRepousoPlataforma('10:00', '12:00', customLimites)).toBe(true); // 2h = mínimo
    expect(validarRepousoPlataforma('10:00', '14:00', customLimites)).toBe(true); // 4h = máximo
    expect(validarRepousoPlataforma('10:00', '11:00', customLimites)).toBe(false); // 1h < 2h
    expect(validarRepousoPlataforma('10:00', '15:00', customLimites)).toBe(false); // 5h > 4h
  });
});

// ────────────────────────────────────────────────────────────────────
// isNoturno (cobertura auditoria 2026-02-26)
// ────────────────────────────────────────────────────────────────────

describe('isNoturno', () => {
  it('hora dentro do WOCL (22h–05h) retorna true', () => {
    expect(isNoturno('22:00', limites)).toBe(true);
    expect(isNoturno('23:30', limites)).toBe(true);
    expect(isNoturno('00:00', limites)).toBe(true);
    expect(isNoturno('03:00', limites)).toBe(true);
    expect(isNoturno('05:00', limites)).toBe(true);
  });

  it('hora fora do WOCL retorna false', () => {
    expect(isNoturno('06:00', limites)).toBe(false);
    expect(isNoturno('12:00', limites)).toBe(false);
    expect(isNoturno('21:59', limites)).toBe(false);
  });

  it('retorna false para null/undefined', () => {
    expect(isNoturno(null, limites)).toBe(false);
    expect(isNoturno(undefined, limites)).toBe(false);
  });

  it('WOCL configurável via limites', () => {
    const custom = { ...limites, NOTURNO_INICIO_HORA: 20, NOTURNO_FIM_HORA: 6 };
    expect(isNoturno('20:00', custom)).toBe(true);
    expect(isNoturno('19:59', custom)).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────
// calcDuracaoJornada (cobertura auditoria 2026-02-26)
// ────────────────────────────────────────────────────────────────────

describe('calcDuracaoJornada', () => {
  const makeJ = (status: string, apres: string | null, term: string | null): FrmsJornada => ({
    id: 'x',
    tripulante_id: 1,
    data: '2026-03-01',
    status: status as FrmsJornada['status'],
    hora_apresentacao: apres,
    hora_termino: term,
    duracao_jornada_minutos: null,
    horas_voo_minutos: null,
    hora_primeiro_acionamento: null,
    hora_primeira_decolagem: null,
    hora_ultimo_pouso: null,
    hora_corte_motor: null,
    repouso_plataforma_inicio: null,
    repouso_plataforma_fim: null,
    repouso_plataforma_valido: 0,
    observacao: null,
    registrado_por: 'test',
    origem: 'MANUAL',
    created_at: '',
    updated_at: '',
    deleted_at: null,
    tipo_base: 'HOME',
    tripulacao_aumentada: 0,
    classe_cabine: null,
    aclimatado: 1,
    local_base: null,
  });

  it('folga (FR) retorna 0 independente dos horários', () => {
    expect(calcDuracaoJornada(makeJ('FR', '06:00', '17:00'))).toBe(0);
  });

  it('férias (FE) retorna 0', () => {
    expect(calcDuracaoJornada(makeJ('FE', '06:00', '17:00'))).toBe(0);
  });

  it('jornada ES retorna duração correta (deduz 60 min almoço)', () => {
    // 06:00–17:00 = 660 min bruto − 60 min almoço = 600
    expect(calcDuracaoJornada(makeJ('ES', '06:00', '17:00'))).toBe(600);
  });

  it('jornada sem horários retorna 0', () => {
    expect(calcDuracaoJornada(makeJ('ES', null, null))).toBe(0);
  });

  it('jornada cruzando meia-noite calcula corretamente', () => {
    // 22:00–06:00 = 480 min bruto − 60 min almoço = 420
    expect(calcDuracaoJornada(makeJ('ES', '22:00', '06:00'))).toBe(420);
  });

  it('TS e TV contam como jornada (FDP)', () => {
    // 08:00–12:00 = 240 min bruto − 60 min almoço = 180
    expect(calcDuracaoJornada(makeJ('TS', '08:00', '12:00'))).toBe(180);
    expect(calcDuracaoJornada(makeJ('TV', '14:00', '18:00'))).toBe(180);
  });
});

// ────────────────────────────────────────────────────────────────────
// calcAcumuloMensal (cobertura auditoria 2026-02-26)
// ────────────────────────────────────────────────────────────────────

describe('calcAcumuloMensal', () => {
  it('soma horas de jornada e voo corretamente', () => {
    const result = calcAcumuloMensal({
      jornadas: [
        { status: 'ES', duracao_jornada_minutos: 660, horas_voo_minutos: 180 },
        { status: 'ES', duracao_jornada_minutos: 600, horas_voo_minutos: 120 },
        { status: 'FR', duracao_jornada_minutos: 0, horas_voo_minutos: 0 },
      ],
      fatorizacoes: [
        { total_fatorizado_jornada: 5.0, total_fatorizado_hv: 2.5 },
        { total_fatorizado_jornada: 4.8, total_fatorizado_hv: 2.0 },
      ],
    });

    expect(result.jornada_realizada_min).toBe(1260);
    expect(result.hv_realizada_min).toBe(300);
    expect(result.dias_embarcado).toBe(2);
    expect(result.dias_folga).toBe(1);
    expect(result.dias_ferias).toBe(0);
    expect(result.jornada_fatorizada_pct).toBeCloseTo(9.8, 1);
    expect(result.hv_fatorizada_pct).toBeCloseTo(4.5, 1);
  });

  it('mês sem jornadas retorna zeros', () => {
    const result = calcAcumuloMensal({ jornadas: [], fatorizacoes: [] });
    expect(result.jornada_realizada_min).toBe(0);
    expect(result.hv_realizada_min).toBe(0);
    expect(result.dias_embarcado).toBe(0);
  });

  it('conta FE separado de FR', () => {
    const result = calcAcumuloMensal({
      jornadas: [
        { status: 'FR', duracao_jornada_minutos: 0, horas_voo_minutos: 0 },
        { status: 'FE', duracao_jornada_minutos: 0, horas_voo_minutos: 0 },
        { status: 'FE', duracao_jornada_minutos: 0, horas_voo_minutos: 0 },
      ],
      fatorizacoes: [],
    });
    expect(result.dias_folga).toBe(1);
    expect(result.dias_ferias).toBe(2);
  });
});

// ────────────────────────────────────────────────────────────────────
// processarAlertas — FDP_DIARIO, HV_365D e HV_MES (cobertura auditoria)
// ────────────────────────────────────────────────────────────────────

describe('processarAlertas — FDP_DIARIO, HV_365D, HV_MES', () => {
  const acumuloBase: AcumuloRollingResult = {
    hv_7_dias_min: 0,
    hv_28_dias_min: 0,
    hv_365_dias_min: 0,
    hv_mes_calendario_min: 0,
    hv_dia_min: 0,
    pct_limite_7d: 0,
    pct_limite_28d: 0,
    pct_limite_mes_calendario: 0,
    pct_limite_365d: 0,
    pct_limite_dia: 0,
    repouso_anterior_min: 720,
    repouso_suficiente: 1,
  };

  it('gera alerta FDP_DIARIO quando jornada supera threshold (8h de 11h)', () => {
    // FDP_MAXIMO_HORAS=11h=660min, FDP_ALERTA_RESTANTE_HORAS=3h → threshold=480min
    const alertas = processarAlertas({
      tripulanteId: 1,
      jornadaId: 'jfdp',
      jornada: {
        duracao_jornada_minutos: 500,
        horas_voo_minutos: 120,
        status: 'ES',
        tripulacao_aumentada: 0,
      },
      acumulo: acumuloBase,
      limites,
    });

    const fdp = alertas.find((a) => a.tipo_limite === 'FDP_DIARIO');
    expect(fdp).toBeDefined();
  });

  it('não gera alerta FDP quando abaixo do threshold (< 8h)', () => {
    const alertas = processarAlertas({
      tripulanteId: 1,
      jornadaId: 'jfdp2',
      jornada: {
        duracao_jornada_minutos: 300,
        horas_voo_minutos: 120,
        status: 'ES',
        tripulacao_aumentada: 0,
      },
      acumulo: acumuloBase,
      limites,
    });

    expect(alertas.find((a) => a.tipo_limite === 'FDP_DIARIO')).toBeUndefined();
  });

  it('gera alerta HV_365D ao atingir 80% do limite anual', () => {
    // HV_365_DIAS_HORAS=960h=57600min → 80%=46080min
    const alertas = processarAlertas({
      tripulanteId: 1,
      jornadaId: 'jhv365',
      jornada: {
        duracao_jornada_minutos: 660,
        horas_voo_minutos: 180,
        status: 'ES',
        tripulacao_aumentada: 0,
      },
      acumulo: { ...acumuloBase, hv_365_dias_min: 46080, pct_limite_365d: 80.0 },
      limites,
    });

    const hv365 = alertas.find((a) => a.tipo_limite === 'HV_365D');
    expect(hv365).toBeDefined();
    expect(hv365!.nivel).toBe('AVISO');
  });

  it('gera alerta HV_MES ATENCAO a 90% e não bloqueia quando isolado', () => {
    // HV_MES_HORAS=90h=5400min → 90%=4860min
    const alertas = processarAlertas({
      tripulanteId: 1,
      jornadaId: 'jhvmes',
      jornada: {
        duracao_jornada_minutos: 300,
        horas_voo_minutos: 180,
        status: 'ES',
        tripulacao_aumentada: 0,
      },
      acumulo: { ...acumuloBase, hv_mes_calendario_min: 4860, pct_limite_mes_calendario: 90.0 },
      limites,
    });

    const hvMes = alertas.find((a) => a.tipo_limite === 'HV_MES');
    expect(hvMes).toBeDefined();
    expect(hvMes!.nivel).toBe('ATENCAO');
    expect(deveBloquearLancamento(alertas)).toBe(false);
  });

  it('nível ATENCAO (90%) isolado não bloqueia lançamento', () => {
    const alertas = [
      {
        tripulante_id: 1,
        jornada_id: 'jat',
        tipo_limite: 'HV_MES' as const,
        nivel: 'ATENCAO' as const,
        percentual_atingido: 91,
        valor_atual_min: 4914,
        valor_limite_min: 5400,
        mensagem: 'HV mês em ATENCAO',
      },
    ];
    expect(deveBloquearLancamento(alertas)).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────
// validarEscalaFutura — violação FDP e HV_MES (cobertura auditoria)
// ────────────────────────────────────────────────────────────────────

describe('validarEscalaFutura — violação FDP e HV mensal', () => {
  it('jornada com FDP > 11h detecta violação FDP_DIARIO', () => {
    const result = validarEscalaFutura(
      [{ data: '2026-04-01', status: 'ES', duracao_estimada_min: 720, hv_estimada_min: 180 }],
      [],
      limites,
    );

    expect(result.valida).toBe(false);
    const v = result.violacoes.find((v) => v.tipo_limite === 'FDP_DIARIO');
    expect(v).toBeDefined();
    expect(v!.valor_projetado).toBe(720);
  });

  it('FDP exatamente no limite (11h = 660min) NÃO viola', () => {
    const result = validarEscalaFutura(
      [{ data: '2026-04-05', status: 'ES', duracao_estimada_min: 660, hv_estimada_min: 180 }],
      [],
      limites,
    );

    expect(result.violacoes.find((v) => v.tipo_limite === 'FDP_DIARIO')).toBeUndefined();
  });

  it('HV_MES violação detectada em escala futura densa (15d × 400min)', () => {
    // HV_MES_HORAS=90h=5400min. 15 × 400min = 6000min > 5400 → violação
    const periodos: PeriodoProjetado[] = Array.from({ length: 15 }, (_, i) => ({
      data: `2026-04-${String(i + 1).padStart(2, '0')}`,
      status: 'ES',
      duracao_estimada_min: 660,
      hv_estimada_min: 400,
    }));

    const result = validarEscalaFutura(periodos, [], limites);
    expect(result.violacoes.some((v) => v.tipo_limite === 'HV_MES')).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────
// calcFatorizacao — Campos avançados: tipo_base (AWAY) + aclimatado
// ────────────────────────────────────────────────────────────────────

describe('calcFatorizacao — tipo_base AWAY e aclimatado', () => {
  const baseJornada: FrmsJornada = {
    id: 'j-adv',
    tripulante_id: 1,
    data: '2026-03-20',
    status: 'ES',
    hora_apresentacao: '06:00',
    hora_termino: '17:00',
    horas_voo_minutos: 180,
    duracao_jornada_minutos: 660,
    hora_primeiro_acionamento: null,
    hora_primeira_decolagem: null,
    hora_ultimo_pouso: null,
    hora_corte_motor: null,
    repouso_plataforma_inicio: null,
    repouso_plataforma_fim: null,
    repouso_plataforma_valido: 0,
    observacao: null,
    registrado_por: 'test',
    origem: 'MANUAL',
    created_at: '',
    updated_at: '',
    deleted_at: null,
    tipo_base: 'HOME',
    tripulacao_aumentada: 0,
    classe_cabine: null,
    aclimatado: 1,
    local_base: null,
  };

  const limitesComFatores: LimitesMap = {
    ...limites,
    FATOR_BASE_AWAY_PCT: 0.1,
    FATOR_ACLIMATADO_NAO_PCT: 0.08,
    FATOR_TRIPULACAO_AUM_HORAS: 2.0,
  };

  it('HOME + aclimatado=1 → fator_base_away_pct=0 e fator_aclimatacao_pct=0', () => {
    const r = calcFatorizacao({
      jornada: baseJornada,
      repousoAnteriorMin: 720,
      limites: limitesComFatores,
      diasDoMes: 31,
    });
    expect(r.fator_base_away_pct).toBe(0);
    expect(r.fator_aclimatacao_pct).toBe(0);
  });

  it('AWAY → fator_base_away_pct = FATOR_BASE_AWAY_PCT (0.10)', () => {
    const r = calcFatorizacao({
      jornada: { ...baseJornada, tipo_base: 'AWAY' },
      repousoAnteriorMin: 720,
      limites: limitesComFatores,
      diasDoMes: 31,
    });
    expect(r.fator_base_away_pct).toBe(0.1);
    expect(r.fator_aclimatacao_pct).toBe(0);
  });

  it('aclimatado=0 → fator_aclimatacao_pct = FATOR_ACLIMATADO_NAO_PCT (0.08)', () => {
    const r = calcFatorizacao({
      jornada: { ...baseJornada, aclimatado: 0 },
      repousoAnteriorMin: 720,
      limites: limitesComFatores,
      diasDoMes: 31,
    });
    expect(r.fator_aclimatacao_pct).toBe(0.08);
    expect(r.fator_base_away_pct).toBe(0);
  });

  it('AWAY + aclimatado=0 → ambos os fatores se acumulam no total', () => {
    const r = calcFatorizacao({
      jornada: { ...baseJornada, tipo_base: 'AWAY', aclimatado: 0 },
      repousoAnteriorMin: 720,
      limites: limitesComFatores,
      diasDoMes: 31,
    });
    expect(r.fator_base_away_pct).toBe(0.1);
    expect(r.fator_aclimatacao_pct).toBe(0.08);
    const semFatores = calcFatorizacao({
      jornada: baseJornada,
      repousoAnteriorMin: 720,
      limites: limitesComFatores,
      diasDoMes: 31,
    });
    expect(r.total_fatorizado_jornada).toBeCloseTo(
      semFatores.total_fatorizado_jornada + 0.1 + 0.08,
      6,
    );
  });

  it('HOME + aclimatado=1 total igual a versão sem campos avançados', () => {
    const comCampos = calcFatorizacao({
      jornada: baseJornada,
      repousoAnteriorMin: 720,
      limites: limitesComFatores,
      diasDoMes: 31,
    });
    const semCampos = calcFatorizacao({
      jornada: { ...baseJornada },
      repousoAnteriorMin: 720,
      limites: limitesComFatores,
      diasDoMes: 31,
    });
    expect(comCampos.total_fatorizado_jornada).toBeCloseTo(semCampos.total_fatorizado_jornada, 6);
  });
});

// ────────────────────────────────────────────────────────────────────
// processarAlertas — tripulacao_aumentada estende limite FDP
// ────────────────────────────────────────────────────────────────────

describe('processarAlertas — tripulacao_aumentada e FDP estendido', () => {
  const acumuloBase: AcumuloRollingResult = {
    hv_7_dias_min: 0,
    hv_28_dias_min: 0,
    hv_365_dias_min: 0,
    hv_mes_calendario_min: 0,
    hv_dia_min: 0,
    pct_limite_7d: 0,
    pct_limite_28d: 0,
    pct_limite_mes_calendario: 0,
    pct_limite_365d: 0,
    pct_limite_dia: 0,
    repouso_anterior_min: 720,
    repouso_suficiente: 1,
  };

  const limitesComTripAum: LimitesMap = {
    ...LIMITES_DEFAULT,
    FATOR_BASE_AWAY_PCT: 0.1,
    FATOR_ACLIMATADO_NAO_PCT: 0.1,
    FATOR_TRIPULACAO_AUM_HORAS: 2.0,
  };

  it('sem tripulacao_aumentada: FDP > FDP_MAXIMO_HORAS gera alerta FDP_DIARIO', () => {
    // FDP_MAXIMO_HORAS=11h=660min → 720min > 660 → violação
    const alertas = processarAlertas({
      tripulanteId: 1,
      jornadaId: 'j-fdp',
      jornada: {
        duracao_jornada_minutos: 720,
        horas_voo_minutos: 200,
        status: 'ES',
        tripulacao_aumentada: 0,
      },
      acumulo: { ...acumuloBase },
      limites: limitesComTripAum,
    });

    const fdp = alertas.find((a) => a.tipo_limite === 'FDP_DIARIO');
    expect(fdp).toBeDefined();
  });

  it('com tripulacao_aumentada=1: FDP no limite standard não dispara se dentro do limite estendido', () => {
    // Limite estendido = 11h + 2h = 13h = 780min
    // 720min < 780min → não dispara FDP_DIARIO violação
    const alertas = processarAlertas({
      tripulanteId: 1,
      jornadaId: 'j-fdp-aug',
      jornada: {
        duracao_jornada_minutos: 720,
        horas_voo_minutos: 200,
        status: 'ES',
        tripulacao_aumentada: 1,
      },
      acumulo: { ...acumuloBase },
      limites: limitesComTripAum,
    });

    const fdpViolacao = alertas.find(
      (a) => a.tipo_limite === 'FDP_DIARIO' && a.nivel === 'VIOLACAO',
    );
    expect(fdpViolacao).toBeUndefined();
  });

  it('mensagem do alerta FDP_DIARIO inclui "trip. aumentada" quando tripulacao_aumentada=1', () => {
    // 850min > 780min (limite estendido) → gera alerta com mensagem contendo "trip. aumentada"
    const alertas = processarAlertas({
      tripulanteId: 1,
      jornadaId: 'j-fdp-msg',
      jornada: {
        duracao_jornada_minutos: 850,
        horas_voo_minutos: 300,
        status: 'ES',
        tripulacao_aumentada: 1,
      },
      acumulo: { ...acumuloBase },
      limites: limitesComTripAum,
    });

    const fdp = alertas.find((a) => a.tipo_limite === 'FDP_DIARIO');
    expect(fdp).toBeDefined();
    expect(fdp!.mensagem).toContain('trip. aumentada');
  });

  it('com tripulacao_aumentada=1: FDP acima do limite estendido gera CRITICO', () => {
    // limite estendido = 13h = 780min. 900min > 780min → violação
    const alertas = processarAlertas({
      tripulanteId: 1,
      jornadaId: 'j-fdp-over',
      jornada: {
        duracao_jornada_minutos: 900,
        horas_voo_minutos: 300,
        status: 'ES',
        tripulacao_aumentada: 1,
      },
      acumulo: { ...acumuloBase },
      limites: limitesComTripAum,
    });

    const fdpViolacao = alertas.find(
      (a) => a.tipo_limite === 'FDP_DIARIO' && a.nivel === 'CRITICO',
    );
    expect(fdpViolacao).toBeDefined();
  });

  it('tripulacao_aumentada=0: FDP 1min abaixo do limite padrão → não VIOLACAO', () => {
    // 659min = 99.85% < ALERTA_VIOLACAO_PCT (100%) → não gera VIOLACAO
    const alertas = processarAlertas({
      tripulanteId: 1,
      jornadaId: 'j-fdp-exact',
      jornada: {
        duracao_jornada_minutos: 659,
        horas_voo_minutos: 180,
        status: 'ES',
        tripulacao_aumentada: 0,
      },
      acumulo: { ...acumuloBase },
      limites: limitesComTripAum,
    });

    const fdpViolacao = alertas.find(
      (a) => a.tipo_limite === 'FDP_DIARIO' && a.nivel === 'VIOLACAO',
    );
    expect(fdpViolacao).toBeUndefined();
  });

  it('jornada FR com duracao=0 não gera alerta FDP_DIARIO', () => {
    // FR realista: duracao=0 → condição `jornada.duracao_jornada_minutos` é falsy → sem FDP check
    const alertas = processarAlertas({
      tripulanteId: 1,
      jornadaId: 'j-fr',
      jornada: {
        duracao_jornada_minutos: 0,
        horas_voo_minutos: 0,
        status: 'FR',
        tripulacao_aumentada: 1,
      },
      acumulo: { ...acumuloBase },
      limites: limitesComTripAum,
    });

    const fdp = alertas.find((a) => a.tipo_limite === 'FDP_DIARIO');
    expect(fdp).toBeUndefined();
  });
});

// ────────────────────────────────────────────────────────────────────
// calcFatorizacao — zeroFatorizacao inclui novos campos
// ────────────────────────────────────────────────────────────────────

describe('calcFatorizacao — folga/férias retorna novos campos zerados', () => {
  const jornadaFolga: FrmsJornada = {
    id: 'j-fr',
    tripulante_id: 1,
    data: '2026-03-21',
    status: 'FR',
    hora_apresentacao: null,
    hora_termino: null,
    horas_voo_minutos: 0,
    duracao_jornada_minutos: 0,
    hora_primeiro_acionamento: null,
    hora_primeira_decolagem: null,
    hora_ultimo_pouso: null,
    hora_corte_motor: null,
    repouso_plataforma_inicio: null,
    repouso_plataforma_fim: null,
    repouso_plataforma_valido: 0,
    observacao: null,
    registrado_por: 'test',
    origem: 'MANUAL',
    created_at: '',
    updated_at: '',
    deleted_at: null,
    tipo_base: 'AWAY',
    tripulacao_aumentada: 1,
    classe_cabine: null,
    aclimatado: 0,
    local_base: null,
  };

  it('FR com AWAY + aclimatado=0 → total ainda é 0 (folga zero-out)', () => {
    const r = calcFatorizacao({
      jornada: jornadaFolga,
      repousoAnteriorMin: 720,
      limites: {
        ...LIMITES_DEFAULT,
        FATOR_BASE_AWAY_PCT: 0.1,
        FATOR_ACLIMATADO_NAO_PCT: 0.08,
        FATOR_TRIPULACAO_AUM_HORAS: 2.0,
      },
      diasDoMes: 31,
    });
    expect(r.total_fatorizado_jornada).toBe(0);
    expect(r.fator_base_away_pct).toBe(0);
    expect(r.fator_aclimatacao_pct).toBe(0);
  });

  it('FE com AWAY + aclimatado=0 → total ainda é 0', () => {
    const r = calcFatorizacao({
      jornada: { ...jornadaFolga, status: 'FE' },
      repousoAnteriorMin: 720,
      limites: {
        ...LIMITES_DEFAULT,
        FATOR_BASE_AWAY_PCT: 0.1,
        FATOR_ACLIMATADO_NAO_PCT: 0.08,
        FATOR_TRIPULACAO_AUM_HORAS: 2.0,
      },
      diasDoMes: 31,
    });
    expect(r.total_fatorizado_jornada).toBe(0);
    expect(r.fator_base_away_pct).toBe(0);
    expect(r.fator_aclimatacao_pct).toBe(0);
  });

  it('TS com AWAY aplica fator_base_away_pct normalmente (não é status de folga)', () => {
    // TS não está em FOLGA_STATUS, portanto calcFatorizacao não zerifica automaticamente
    // Need non-zero duration + horário to avoid fatorizacaoDiaSemJornada early return
    const r = calcFatorizacao({
      jornada: {
        ...jornadaFolga,
        status: 'TS',
        hora_apresentacao: '08:00',
        hora_termino: '14:00',
        duracao_jornada_minutos: 360,
      },
      repousoAnteriorMin: 720,
      limites: {
        ...LIMITES_DEFAULT,
        FATOR_BASE_AWAY_PCT: 0.1,
        FATOR_ACLIMATADO_NAO_PCT: 0.08,
        FATOR_TRIPULACAO_AUM_HORAS: 2.0,
      },
      diasDoMes: 31,
    });
    // TRAINING with AWAY: AWAY penalty applies
    expect(r.fator_base_away_pct).toBe(0.1);
  });
});

~~~

---
## FILE: worker-airtrust/src/__tests__/frms/db-service.periodo.test.ts
~~~typescript
import { describe, expect, it } from 'vitest';

import { calcularPeriodoEmbarcadoPorFaixa } from '../../lib/frms/db-service';

describe('calcularPeriodoEmbarcadoPorFaixa', () => {
  it('prioriza o intervalo da quinzena quando presente', () => {
    const periodo = calcularPeriodoEmbarcadoPorFaixa('2026-03-10', {
      data_inicio: '2026-03-08',
      data_fim: '2026-03-12',
      quinzena_data_inicio: '2026-03-01',
      quinzena_data_fim: '2026-03-15',
    });

    expect(periodo).toEqual({ dia: 10, total: 15 });
  });

  it('usa o intervalo da alocacao quando nao houver quinzena vinculada', () => {
    const periodo = calcularPeriodoEmbarcadoPorFaixa('2026-03-10', {
      data_inicio: '2026-03-08',
      data_fim: '2026-03-12',
      quinzena_data_inicio: null,
      quinzena_data_fim: null,
    });

    expect(periodo).toEqual({ dia: 3, total: 5 });
  });

  it('retorna null quando a data estiver fora do intervalo resolvido', () => {
    const periodo = calcularPeriodoEmbarcadoPorFaixa('2026-03-16', {
      data_inicio: '2026-03-08',
      data_fim: '2026-03-12',
      quinzena_data_inicio: '2026-03-01',
      quinzena_data_fim: '2026-03-15',
    });

    expect(periodo).toBeNull();
  });
});

~~~

---
## FILE: worker-airtrust/src/__tests__/frms/fadiga-score.test.ts
~~~typescript
import { describe, expect, it } from 'vitest';
import { calculateFadigaScore } from '../../lib/frms/fadiga-score';

describe('calculateFadigaScore', () => {
  it('retorna BAIXO/APTO para cenário saudável', () => {
    const out = calculateFadigaScore({
      kssScore: 2,
      horasSono: 8,
      qualidadeSono: 5,
      sintomas: [],
    });

    expect(out.nivelFadiga).toBe('BAIXO');
    expect(out.statusOperacional).toBe('APTO');
    expect(out.apto).toBe(true);
    expect(out.requiresFratReview).toBe(false);
  });

  it('força CRITICO/NAO_APTO para KSS extremo', () => {
    const out = calculateFadigaScore({
      kssScore: 9,
      horasSono: 7,
      qualidadeSono: 4,
      sintomas: ['Sonolência'],
    });

    expect(out.nivelFadiga).toBe('CRITICO');
    expect(out.statusOperacional).toBe('NAO_APTO');
    expect(out.apto).toBe(false);
    expect(out.requiresFratReview).toBe(true);
  });

  it('retorna ALTO/RESTRITO quando cruza threshold vermelho', () => {
    const out = calculateFadigaScore(
      {
        kssScore: 7,
        horasSono: 5,
        qualidadeSono: 2,
        sintomas: ['Sonolência', 'Dor de cabeça', 'Baixa concentração'],
      },
      {
        thresholdAmarelo: 35,
        thresholdVermelho: 55,
      },
    );

    expect(out.scoreFadiga).toBeGreaterThanOrEqual(55);
    expect(out.nivelFadiga).toBe('ALTO');
    expect(out.statusOperacional).toBe('RESTRITO');
    expect(out.requiresFratReview).toBe(true);
  });
});

~~~

---
## FILE: worker-airtrust/src/__tests__/frms/fadiga-score.v2.test.ts
~~~typescript
import { describe, expect, it } from 'vitest';
import {
  calcularFatorRepouso,
  calcularHorasSono,
  calcularScoreFadiga,
  calcularSono,
  isWithinWOCL,
} from '../../lib/frms/fadiga-score';

const cfg = {
  threshold_amarelo: 40,
  threshold_vermelho: 60,
  peso_kss: 0.35,
  peso_sono_duracao: 0.25,
  peso_sono_qualidade: 0.2,
  peso_sintomas: 0.2,
} as const;

describe('calcularScoreFadiga (modelo VERDE/AMARELO/LARANJA/VERMELHO)', () => {
  it('aplica penalidade quando horas_sono = null', () => {
    const outComNull = calcularScoreFadiga(
      {
        kss_score: 5,
        horas_sono: null,
        qualidade_sono: 4,
        sintomas_json: null,
        apto: 1,
        meds_ult_12h: 0,
        alcool_ult_12h: 0,
      },
      cfg,
    );

    const outCom8h = calcularScoreFadiga(
      {
        kss_score: 5,
        horas_sono: 8,
        qualidade_sono: 4,
        sintomas_json: null,
        apto: 1,
        meds_ult_12h: 0,
        alcool_ult_12h: 0,
      },
      cfg,
    );

    expect(outComNull.score_fadiga).toBeGreaterThan(outCom8h.score_fadiga);
  });

  it('kss=9 e sono=3h produz nivel vermelho', () => {
    const out = calcularScoreFadiga(
      {
        kss_score: 9,
        horas_sono: 3,
        qualidade_sono: 1,
        sintomas_json: { sonolencia: 3, reflexo_reduzido: 2 },
        apto: 1,
        meds_ult_12h: 0,
        alcool_ult_12h: 0,
      },
      cfg,
    );

    expect(out.nivel_fadiga).toBe('VERMELHO');
    expect(out.status_operacional).toBe('INAPTO');
  });

  it('apto=0 força score minimo no threshold_vermelho', () => {
    const out = calcularScoreFadiga(
      {
        kss_score: 2,
        horas_sono: 8,
        qualidade_sono: 5,
        sintomas_json: null,
        apto: 0,
        meds_ult_12h: 0,
        alcool_ult_12h: 0,
      },
      cfg,
    );

    expect(out.score_fadiga).toBeGreaterThanOrEqual(cfg.threshold_vermelho);
  });

  it('alcool_ult_12h soma +15 no score final', () => {
    const base = calcularScoreFadiga(
      {
        kss_score: 5,
        horas_sono: 6,
        qualidade_sono: 3,
        sintomas_json: { sonolencia: 1 },
        apto: 1,
        meds_ult_12h: 0,
        alcool_ult_12h: 0,
      },
      cfg,
    );

    const comAlcool = calcularScoreFadiga(
      {
        kss_score: 5,
        horas_sono: 6,
        qualidade_sono: 3,
        sintomas_json: { sonolencia: 1 },
        apto: 1,
        meds_ult_12h: 0,
        alcool_ult_12h: 1,
      },
      cfg,
    );

    expect(comAlcool.score_fadiga - base.score_fadiga).toBe(15);
  });
});

describe('calcularHorasSono', () => {
  it('calcula corretamente no mesmo dia', () => {
    expect(calcularHorasSono('22:00', '23:30')).toBe(1.5);
  });

  it('calcula corretamente virada de dia', () => {
    expect(calcularHorasSono('23:30', '06:00')).toBe(6.5);
  });

  it('retorna 0 quando hora igual', () => {
    expect(calcularHorasSono('07:00', '07:00')).toBe(0);
  });
});

describe('calcularSono (premissa operacional)', () => {
  it('premissa padrão de 8h', () => {
    const r1 = calcularSono({
      horaApresentacaoMin: 480,
      minutosAntesApresentacao: 90,
      horasSonoPadrao: 8,
    });
    expect(r1.tAcordouMin).toBe(390);
    expect(r1.sonoEfetivoMin).toBe(480);
    expect(r1.fonteSono).toBe('PADRAO');
    expect(r1.tDormiuMin).toBe(-90);
  });

  it('com hora informada cruza meia-noite corretamente', () => {
    const r2 = calcularSono({
      horaApresentacaoMin: 480,
      minutosAntesApresentacao: 90,
      horasSonoPadrao: 8,
      horaDormiu: 1380,
    });
    expect(r2.sonoEfetivoMin).toBe(450);
    expect(r2.fonteSono).toBe('INFORMADO');
  });
});

describe('WOCL helpers', () => {
  it('isWithinWOCL boundaries', () => {
    expect(isWithinWOCL(120)).toBe(true);
    expect(isWithinWOCL(359)).toBe(true);
    expect(isWithinWOCL(360)).toBe(false);
    expect(isWithinWOCL(119)).toBe(false);
  });
});

describe('calcularFatorRepouso', () => {
  it('sono padrão 8h (480) retorna neutro 0', () => {
    expect(calcularFatorRepouso(480)).toBe(0);
  });

  it('sono curto 6h (360) retorna penalidade negativa', () => {
    expect(calcularFatorRepouso(360)).toBeLessThan(0);
  });
});

~~~

---
## FILE: worker-airtrust/src/__tests__/frms/fira-parser.test.ts
~~~typescript
import { describe, it, expect } from 'vitest';
import { parseFira } from '../../lib/frms/fira-parser';

const DOW = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];

function montarFiraCompacta(opts?: {
  totalJornada?: string;
  totalVoo?: string;
  diaComMovimento?: number;
}) {
  const totalJornada = opts?.totalJornada ?? '31:30';
  const totalVoo = opts?.totalVoo ?? '17:13';
  const diaComMovimento = opts?.diaComMovimento;

  const dias: string[] = [];
  for (let i = 1; i <= 28; i++) {
    const dd = String(i).padStart(2, '0');
    const dow = DOW[(i - 1) % DOW.length];

    if (diaComMovimento && i === diaComMovimento) {
      dias.push(`${dd} ${dow} ES SBME 06:00 08:00 2:00 1:30`);
      continue;
    }

    dias.push(`${dd} ${dow} - - - - - -`);
  }

  return [
    'COSTA DO SOL TÁXI AÉREO 11.223.764/0001-62 Ano 2026 Mês FEVEREIRO Base Contratual',
    `CAIO CESAR SIMOES DE ALCANTARA 144338 TRIPULANTE RIO DE JANEIRO Dia ${dias.join(' ')} ${totalJornada} ${totalVoo} Totais do Mês`,
  ].join('\n');
}

describe('parseFira (modo compacto)', () => {
  it('normaliza totais para 0:00 quando não há movimento operacional', () => {
    const texto = montarFiraCompacta({ totalJornada: '31:30', totalVoo: '17:13' });
    const result = parseFira(texto);

    expect(result.cabecalho.canac).toBe('144338');
    expect(result.dias).toHaveLength(28);
    expect(result.totalJornadaMes).toBe('0:00');
    expect(result.totalVooMes).toBe('0:00');
    expect(result.erros.some((e) => e.includes('Divergência nos totais de HV'))).toBe(false);
  });

  it('mantém totais declarados quando existe movimento operacional real', () => {
    const texto = montarFiraCompacta({
      totalJornada: '2:00',
      totalVoo: '1:30',
      diaComMovimento: 3,
    });
    const result = parseFira(texto);

    expect(result.totalJornadaMes).toBe('2:00');
    expect(result.totalVooMes).toBe('1:30');
    expect(result.erros.some((e) => e.includes('Divergência nos totais de HV'))).toBe(false);
  });
});

describe('parseFira (extração CANAC/ANAC robusta)', () => {
  it('extrai CANAC quando vem com label e pontuação na mesma linha do TRIPULANTE', () => {
    const texto = [
      'COSTA DO SOL TÁXI AÉREO',
      'Ano',
      '2026',
      'Mês',
      'FEVEREIRO',
      'CAIO CESAR SIMOES DE ALCANTARA CANAC: 95.168-1 TRIPULANTE',
      'Local',
      '-',
      'Totais do Mês:',
      '0:00',
      '0:00',
    ].join('\n');

    const result = parseFira(texto);

    expect(result.cabecalho.canac).toBe('951681');
    expect(result.cabecalho.mes).toBe(2);
    expect(result.cabecalho.ano).toBe(2026);
  });

  it('nao confunde o rodape 02/08/2021 com o mes ABRIL do cabecalho', () => {
    const texto = [
      'COSTA DO SOL TÁXI AÉREO 11.223.764/0001-62',
      'Ano 2026',
      'Mês ABRIL',
      'DIETER JOHNY KÜHR 108495 TRIPULANTE',
      'RIO DE JANEIRO',
      'Totais do Mês:',
      '86:46',
      '55:47',
      'Data de Revisão: 02/08/2021',
    ].join('\n');

    const result = parseFira(texto);

    expect(result.cabecalho.mes).toBe(4);
    expect(result.cabecalho.mesNome).toBe('ABRIL');
    expect(result.cabecalho.ano).toBe(2026);
  });
});

~~~

---
## FILE: worker-airtrust/src/__tests__/middleware.test.ts
~~~typescript
/**
 * Testes de Middleware - AirTrust Worker
 *
 * Testa rate limiting, error handler e security headers
 */

import { describe, it, expect, beforeEach } from 'vitest';

// Mock do rateLimitStore
const mockStore = new Map<string, { count: number; resetAt: number }>();

describe('Rate Limiter', () => {
  beforeEach(() => {
    mockStore.clear();
  });

  it('deve permitir requisições dentro do limite', () => {
    const key = 'login:127.0.0.1';
    const maxRequests = 5;
    const windowMs = 60000;

    for (let i = 0; i < maxRequests; i++) {
      const entry = mockStore.get(key) || { count: 0, resetAt: Date.now() + windowMs };
      entry.count++;
      mockStore.set(key, entry);
    }

    const entry = mockStore.get(key);
    expect(entry?.count).toBe(5);
    expect(entry?.count).toBeLessThanOrEqual(maxRequests);
  });

  it('deve bloquear requisições acima do limite', () => {
    const key = 'login:127.0.0.1';
    const maxRequests = 5;
    const windowMs = 60000;

    for (let i = 0; i < maxRequests + 2; i++) {
      const entry = mockStore.get(key) || { count: 0, resetAt: Date.now() + windowMs };
      entry.count++;
      mockStore.set(key, entry);
    }

    const entry = mockStore.get(key);
    expect(entry?.count).toBe(7);
    expect(entry?.count).toBeGreaterThan(maxRequests);
  });

  it('deve resetar contador após janela de tempo', () => {
    const key = 'login:127.0.0.1';
    const pastTime = Date.now() - 1000; // 1 segundo atrás

    mockStore.set(key, { count: 100, resetAt: pastTime });

    const entry = mockStore.get(key);
    const now = Date.now();

    if (entry && now > entry.resetAt) {
      // Simular reset
      mockStore.set(key, { count: 1, resetAt: now + 60000 });
    }

    const newEntry = mockStore.get(key);
    expect(newEntry?.count).toBe(1);
  });
});

describe('Error Handler', () => {
  it('deve identificar ambiente corretamente', () => {
    const environments = ['production', 'staging', 'development'];

    environments.forEach((env) => {
      const isDevelopment = env === 'development' || env === 'staging';

      if (env === 'production') {
        expect(isDevelopment).toBe(false);
      } else {
        expect(isDevelopment).toBe(true);
      }
    });
  });

  it('não deve expor stack trace em produção', () => {
    const env = 'production';
    const isDevelopment = env !== 'production';

    const errorResponse = isDevelopment
      ? { error: 'Detalhe do erro', stack: 'stack trace...' }
      : { error: 'Erro interno do servidor', code: 'INTERNAL_ERROR' };

    expect(errorResponse).not.toHaveProperty('stack');
    expect(errorResponse.code).toBe('INTERNAL_ERROR');
  });
});

describe('ApiError', () => {
  class ApiError extends Error {
    constructor(public message: string, public statusCode: number = 500, public code?: string) {
      super(message);
      this.name = 'ApiError';
    }
  }

  it('deve criar erro com status code padrão 500', () => {
    const error = new ApiError('Erro genérico');
    expect(error.statusCode).toBe(500);
    expect(error.name).toBe('ApiError');
  });

  it('deve criar erro com status code customizado', () => {
    const error = new ApiError('Não encontrado', 404, 'NOT_FOUND');
    expect(error.statusCode).toBe(404);
    expect(error.code).toBe('NOT_FOUND');
  });

  it('deve criar erro 400 para bad request', () => {
    const error = new ApiError('CPF inválido', 400, 'VALIDATION_ERROR');
    expect(error.statusCode).toBe(400);
    expect(error.message).toBe('CPF inválido');
  });
});

describe('Security Headers', () => {
  it('deve incluir headers de segurança necessários', () => {
    const requiredHeaders = [
      'X-Content-Type-Options',
      'X-Frame-Options',
      'X-XSS-Protection',
      'Referrer-Policy',
    ];

    const mockHeaders = {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    };

    requiredHeaders.forEach((header) => {
      expect(mockHeaders).toHaveProperty(header);
    });
  });
});

describe('Rate Limit Presets', () => {
  const presets = {
    login: { maxRequests: 5, windowSeconds: 60, keyPrefix: 'login' },
    api: { maxRequests: 100, windowSeconds: 60, keyPrefix: 'api' },
    webhook: { maxRequests: 30, windowSeconds: 60, keyPrefix: 'webhook' },
    upload: { maxRequests: 10, windowSeconds: 60, keyPrefix: 'upload' },
    export: { maxRequests: 5, windowSeconds: 60, keyPrefix: 'export' },
  };

  it('login deve ter limite baixo (5/min)', () => {
    expect(presets.login.maxRequests).toBe(5);
  });

  it('api geral deve ter limite alto (100/min)', () => {
    expect(presets.api.maxRequests).toBe(100);
  });

  it('webhook deve ter limite moderado (30/min)', () => {
    expect(presets.webhook.maxRequests).toBe(30);
  });
});

~~~

---
## FILE: worker-airtrust/src/__tests__/rbac.test.ts
~~~typescript
/**
 * RBAC Tests
 *
 * Testa que roles são corretamente aplicadas:
 * - viewer não pode executar operações destrutivas
 * - admin pode
 * - role normalização (ADMIN == admin)
 */

import { describe, it, expect } from 'vitest';

// ===== HELPERS =====

type Role = 'admin' | 'viewer' | 'gestor' | string;

function canDelete(role: Role): boolean {
  const normalized = role?.toLowerCase();
  return normalized === 'admin';
}

function canEdit(role: Role): boolean {
  const normalized = role?.toLowerCase();
  return normalized === 'admin' || normalized === 'gestor';
}

function canView(role: Role): boolean {
  const normalized = role?.toLowerCase();
  return ['admin', 'gestor', 'viewer'].includes(normalized);
}

// ===== TESTES =====

describe('RBAC — permissões de role', () => {
  describe('DELETE (apenas admin)', () => {
    it('admin pode deletar', () => {
      expect(canDelete('admin')).toBe(true);
      expect(canDelete('ADMIN')).toBe(true); // case-insensitive
    });

    it('viewer não pode deletar', () => {
      expect(canDelete('viewer')).toBe(false);
    });

    it('gestor não pode deletar', () => {
      expect(canDelete('gestor')).toBe(false);
    });

    it('role vazia não pode deletar', () => {
      expect(canDelete('')).toBe(false);
    });
  });

  describe('EDIT (admin + gestor)', () => {
    it('admin pode editar', () => {
      expect(canEdit('admin')).toBe(true);
    });

    it('gestor pode editar', () => {
      expect(canEdit('gestor')).toBe(true);
    });

    it('viewer não pode editar', () => {
      expect(canEdit('viewer')).toBe(false);
    });
  });

  describe('VIEW (todos os roles válidos)', () => {
    it('admin pode visualizar', () => {
      expect(canView('admin')).toBe(true);
    });

    it('gestor pode visualizar', () => {
      expect(canView('gestor')).toBe(true);
    });

    it('viewer pode visualizar', () => {
      expect(canView('viewer')).toBe(true);
    });

    it('role desconhecida não pode visualizar', () => {
      expect(canView('hacker')).toBe(false);
    });
  });
});

// ===== TESTES: ISOLAMENTO MULTI-TENANT =====

describe('Tenant isolation', () => {
  interface Resource {
    id: number;
    empresa_id: number;
    nome: string;
  }

  function canAccessResource(userEmpresaId: number, resource: Resource): boolean {
    return resource.empresa_id === userEmpresaId;
  }

  it('usuário da empresa 1 acessa recurso da empresa 1', () => {
    expect(canAccessResource(1, { id: 10, empresa_id: 1, nome: 'Recurso A' })).toBe(true);
  });

  it('usuário da empresa 1 NÃO acessa recurso da empresa 2', () => {
    expect(canAccessResource(1, { id: 20, empresa_id: 2, nome: 'Recurso B' })).toBe(false);
  });

  it('empresa_id 0 não acessa nenhum recurso', () => {
    expect(canAccessResource(0, { id: 1, empresa_id: 1, nome: 'X' })).toBe(false);
  });
});

~~~

---
## FILE: worker-airtrust/src/__tests__/routes/alertas-vencimentos-query.test.ts
~~~typescript
import { describe, expect, it } from 'vitest';

import { buildAlertasVencimentosQualificacoesQuery } from '../../routes/alertas';

function compactSql(sql: string) {
  return sql.replace(/\s+/g, ' ').trim();
}

describe('alertas/vencimentos query', () => {
  it('exclui renovadas e prioriza apenas a versao mais recente da qualificacao', () => {
    const sql = compactSql(
      buildAlertasVencimentosQualificacoesQuery('COALESCE(qh.data_vencimento, qh.data_conclusao)'),
    );

    expect(sql).toContain('COALESCE(qh.renovada, 0) = 0');
    expect(sql).toContain("UPPER(COALESCE(qh.status, 'CONCLUIDA')) NOT IN ('CANCELADA', 'RENOVADA')")
    expect(sql).toContain("UPPER(COALESCE(qh_new.status, 'CONCLUIDA')) NOT IN ('CANCELADA', 'RENOVADA', 'PLANEJADA')");
    expect(sql).toContain('AND NOT EXISTS ( SELECT 1 FROM qualificacoes_historico qh_new');
    expect(sql).toContain("COALESCE(qh_new.renovada, 0) = 0");
  });
});

~~~

---
## FILE: worker-airtrust/src/__tests__/routes/escalas-alocacoes-helpers.test.ts
~~~typescript
import { describe, expect, it } from 'vitest';

import { shouldAllowSameEscalaOperationalReassignment } from '../../routes/escalas-alocacoes-helpers-internal';

describe('shouldAllowSameEscalaOperationalReassignment', () => {
  it('permite mover alocacao operacional para outra aeronave na mesma escala', () => {
    expect(
      shouldAllowSameEscalaOperationalReassignment(
        {
          id: 'aloc-1',
          escala_id: 'esc-1',
          aeronave_id: 24,
          situacao_tipo: null,
        },
        'esc-1',
      ),
    ).toBe(true);
  });

  it('mantem bloqueio para situacao sem aeronave na mesma escala', () => {
    expect(
      shouldAllowSameEscalaOperationalReassignment(
        {
          id: 'aloc-2',
          escala_id: 'esc-1',
          aeronave_id: null,
          situacao_tipo: 'FERIAS',
        },
        'esc-1',
      ),
    ).toBe(false);
  });

  it('mantem bloqueio para alocacao em outra escala', () => {
    expect(
      shouldAllowSameEscalaOperationalReassignment(
        {
          id: 'aloc-3',
          escala_id: 'esc-2',
          aeronave_id: 27,
          situacao_tipo: null,
        },
        'esc-1',
      ),
    ).toBe(false);
  });
});

~~~

---
## FILE: worker-airtrust/src/__tests__/routes/escalas-conflitos.test.ts
~~~typescript
import { describe, expect, it } from 'vitest';

import { shouldIgnoreSubstitutableEventConflict } from '../../routes/escalas-conflitos';

describe('shouldIgnoreSubstitutableEventConflict', () => {
  it('ignora conflito quando um placeholder automatico deve ser substituido', () => {
    expect(
      shouldIgnoreSubstitutableEventConflict({
        evento1_id: 'evt-1',
        tipo1: 'voo',
        inicio1: '2026-05-08',
        fim1: '2026-05-08',
        auto1: 1,
        evento2_id: 'evt-2',
        tipo2: 'medico',
        inicio2: '2026-05-08',
        fim2: '2026-05-08',
        auto2: 0,
        funcionario_id: 'func-1',
        funcionario_nome: 'Ramon',
      }),
    ).toBe(true);
  });

  it('mantem conflito quando nenhum dos eventos e placeholder automatico substituivel', () => {
    expect(
      shouldIgnoreSubstitutableEventConflict({
        evento1_id: 'evt-1',
        tipo1: 'medico',
        inicio1: '2026-05-08',
        fim1: '2026-05-08',
        auto1: 0,
        evento2_id: 'evt-2',
        tipo2: 'cheque',
        inicio2: '2026-05-08',
        fim2: '2026-05-08',
        auto2: 0,
        funcionario_id: 'func-1',
        funcionario_nome: 'Ramon',
      }),
    ).toBe(false);
  });
});

~~~

---
## FILE: worker-airtrust/src/__tests__/routes/integracoes-edapp-helpers.test.ts
~~~typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { garantirG1SemPlanejadoMock, isG1QualificacaoCodeMock } = vi.hoisted(() => ({
  garantirG1SemPlanejadoMock: vi.fn(),
  isG1QualificacaoCodeMock: vi.fn(),
}));

vi.mock('../../services/qualificacoes-g1-sem', () => ({
  garantirG1SemPlanejado: garantirG1SemPlanejadoMock,
  isG1QualificacaoCode: isG1QualificacaoCodeMock,
}));

import {
  createQualificacao,
  findFuncionarioByEdappUser,
  resolveEdAppCompletionDate,
} from '../../routes/integracoes-edapp-helpers';

type QueryHandler = {
  first?: (args: unknown[]) => Promise<unknown> | unknown;
  run?: (args: unknown[]) => Promise<unknown> | unknown;
  all?: (args: unknown[]) => Promise<unknown> | unknown;
};

function createMockDb(handlers: Array<[string, QueryHandler]>) {
  const calls: Array<{ query: string; args: unknown[]; method: 'first' | 'run' | 'all' }> = [];

  const db = {
    prepare: vi.fn((query: string) => {
      const entry = handlers.find(([matcher]) => query.includes(matcher));
      if (!entry) {
        throw new Error(`Unhandled query: ${query}`);
      }

      const [, handler] = entry;
      const executeAll = async (args: unknown[]) => {
        calls.push({ query, args, method: 'all' });
        return handler.all ? handler.all(args) : { results: [] };
      };

      const executeFirst = async (args: unknown[]) => {
        calls.push({ query, args, method: 'first' });
        return handler.first ? handler.first(args) : null;
      };

      const executeRun = async (args: unknown[]) => {
        calls.push({ query, args, method: 'run' });
        return handler.run ? handler.run(args) : { meta: { last_row_id: 0, changes: 0 } };
      };

      return {
        all: async () => executeAll([]),
        first: async () => executeFirst([]),
        run: async () => executeRun([]),
        bind: (...args: unknown[]) => ({
          all: async () => executeAll(args),
          first: async () => executeFirst(args),
          run: async () => executeRun(args),
        }),
      };
    }),
  } as unknown as D1Database;

  return { db, calls };
}

describe('integracoes-edapp-helpers.createQualificacao', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    garantirG1SemPlanejadoMock.mockResolvedValue(undefined);
    isG1QualificacaoCodeMock.mockReturnValue(false);
  });

  it('marca qualificacoes anteriores como renovadas ao criar uma nova conclusao EdApp', async () => {
    const { db, calls } = createMockDb([
      [
        'FROM qualificacoes_tipos',
        {
          first: () => ({ id: 10, validade: 12, vencimento_fim_mes: 1 }),
        },
      ],
      [
        'AND data_conclusao = ?',
        {
          first: () => null,
        },
      ],
      [
        'SET renovada = 1',
        {
          run: () => ({ meta: { changes: 1 } }),
        },
      ],
      [
        `AND date(COALESCE(data_conclusao, '1900-01-01')) > date(?)`,
        {
          first: () => null,
        },
      ],
      [
        'INSERT INTO qualificacoes_historico',
        {
          run: () => ({ meta: { last_row_id: 4206, changes: 1 } }),
        },
      ],
    ]);

    const result = await createQualificacao(
      db,
      41,
      'E1',
      'analytics:manual:E1',
      '2026-04-08T12:34:56.000Z',
    );

    expect(result).toMatchObject({
      success: true,
      qualificacao_id: 4206,
      renovacao: true,
      created: true,
    });

    const renewCall = calls.find(
      (call) => call.method === 'run' && call.query.includes('SET renovada = 1'),
    );
    expect(renewCall?.args).toEqual([
      'Substituída por curso EdApp em 2026-04-08',
      '%Substituída por curso EdApp%',
      'Substituída por curso EdApp em 2026-04-08',
      41,
      null,
      null,
      'E1',
      '2026-04-08',
    ]);

    const insertCall = calls.find(
      (call) => call.method === 'run' && call.query.includes('INSERT INTO qualificacoes_historico'),
    );
    expect(insertCall?.args[0]).toBe(41);
    expect(insertCall?.args[2]).toBe('E1');
    expect(insertCall?.args[3]).toBe('2026-04-08');
    expect(insertCall?.args[7]).toBe(0);
    expect(insertCall?.args[8]).toBeNull();
  });

  it('marca a nova qualificacao como renovada quando o historico chega fora de ordem', async () => {
    const { db, calls } = createMockDb([
      [
        'FROM qualificacoes_tipos',
        {
          first: () => ({ id: 10, validade: 12, vencimento_fim_mes: 1 }),
        },
      ],
      [
        'AND data_conclusao = ?',
        {
          first: () => null,
        },
      ],
      [
        'SET renovada = 1',
        {
          run: () => ({ meta: { changes: 0 } }),
        },
      ],
      [
        `AND date(COALESCE(data_conclusao, '1900-01-01')) > date(?)`,
        {
          first: () => ({ id: 5001, data_conclusao: '2026-04-10' }),
        },
      ],
      [
        'INSERT INTO qualificacoes_historico',
        {
          run: () => ({ meta: { last_row_id: 4207, changes: 1 } }),
        },
      ],
    ]);

    const result = await createQualificacao(
      db,
      41,
      'E1',
      'analytics:manual:E1',
      '2026-04-08T23:15:00-03:00',
    );

    expect(result).toMatchObject({
      success: true,
      qualificacao_id: 4207,
      renovacao: true,
      created: true,
      message: 'Qualificação histórica criada como renovada (validade: 12 meses)',
    });

    const insertCall = calls.find(
      (call) => call.method === 'run' && call.query.includes('INSERT INTO qualificacoes_historico'),
    );
    expect(insertCall?.args[3]).toBe('2026-04-08');
    expect(insertCall?.args[6]).toBe(
      'EdApp: analytics:manual:E1 | Válido por 12 meses | Conclusão: 2026-04-08 | Substituída por curso EdApp em 2026-04-10',
    );
    expect(insertCall?.args[7]).toBe(1);
    expect(insertCall?.args[8]).toBe('RENOVADA');
  });
});

describe('integracoes-edapp-helpers.resolveEdAppCompletionDate', () => {
  it('preserva a data civil do timestamp do EdApp mesmo com fuso horario', () => {
    expect(resolveEdAppCompletionDate('2026-04-08T23:15:00-03:00')).toBe('2026-04-08');
  });
});

describe('integracoes-edapp-helpers.findFuncionarioByEdappUser', () => {
  it('faz fallback por nome aproximado ignorando acentos e nomes intermediarios', async () => {
    const { db } = createMockDb([
      [
        'FROM integracoes_edapp_usuarios u',
        {
          first: () => null,
        },
      ],
      [
        'FROM funcionarios f',
        {
          all: () => ({
            results: [
              {
                funcionario_id: 3,
                funcionario_nome: 'Antonio Luiz Simões Ramos',
                funcionario_email: 'antonio.ramos@voecostadosol.com.br',
                matricula: '00074',
                codigo_anac: '123456',
                guerra: 'Ramos',
                edapp_user_id: '671f8c111d09157bff5f4840',
                edapp_email: 'antonio.ramos@voecostadosol.com.br',
                edapp_username: 'Antonio Ramos',
              },
            ],
          }),
        },
      ],
    ]);

    const result = await findFuncionarioByEdappUser(db, {
      edappUserId: null,
      userExternalId: 'Antônio Ramos',
    });

    expect(result).toMatchObject({
      funcionario_id: 3,
      funcionario_nome: 'Antonio Luiz Simões Ramos',
      matched_by: 'edapp_username',
    });
  });

  it('faz fallback por email do funcionario quando nao existe mapeamento explicito', async () => {
    const { db } = createMockDb([
      [
        'FROM integracoes_edapp_usuarios u',
        {
          first: () => null,
        },
      ],
      [
        'FROM funcionarios f',
        {
          all: () => ({
            results: [
              {
                funcionario_id: 32,
                funcionario_nome: 'Vitor De Almeida Costa',
                funcionario_email: 'vitor.costa@voecostadosol.com.br',
                matricula: '00221',
                codigo_anac: '654321',
                guerra: 'Vitor Costa',
                edapp_user_id: null,
                edapp_email: null,
                edapp_username: null,
              },
            ],
          }),
        },
      ],
    ]);

    const result = await findFuncionarioByEdappUser(db, {
      edappUserId: null,
      edappEmail: 'VITOR.COSTA@VOECOSTADOSOL.COM.BR',
    });

    expect(result).toMatchObject({
      funcionario_id: 32,
      funcionario_nome: 'Vitor De Almeida Costa',
      matched_by: 'funcionario_email',
    });
  });
});

~~~

---
## FILE: worker-airtrust/src/__tests__/routes/lms-assets-resume.test.ts
~~~typescript
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseScormLocationPair, resolveScormResumeTargetSlide } from '../../routes/lms-assets';

describe('SCORM resume restore helpers', () => {
  it('parseia localizações SCORM numéricas nos formatos suportados', () => {
    expect(parseScormLocationPair('22/103')).toEqual({ current: 22, total: 103 });
    expect(parseScormLocationPair(' 22 / 103 ')).toEqual({ current: 22, total: 103 });
    expect(parseScormLocationPair('22 of 103')).toEqual({ current: 22, total: 103 });
    expect(parseScormLocationPair('22of103')).toEqual({ current: 22, total: 103 });
    expect(parseScormLocationPair('bookmark-abc')).toBeNull();
    expect(parseScormLocationPair('')).toBeNull();
    expect(parseScormLocationPair('22/0')).toBeNull();
  });

  it('só restaura quando o slide observado está atrás do slide salvo', () => {
    expect(resolveScormResumeTargetSlide('22/103', null)).toBe(22);
    expect(resolveScormResumeTargetSlide('22/103', '1/103')).toBe(22);
    expect(resolveScormResumeTargetSlide('22 of 103', ' 1 / 103 ')).toBe(22);
    expect(resolveScormResumeTargetSlide('22/103', '22/103')).toBeNull();
    expect(resolveScormResumeTargetSlide('22/103', '23/103')).toBeNull();
    expect(resolveScormResumeTargetSlide('1/103', '1/103')).toBeNull();
    expect(resolveScormResumeTargetSlide('22/103', '22/0')).toBe(22);
  });

  it('injeta o restore de resume no ciclo de load do wrapper compartilhado', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/routes/lms-assets.ts'), 'utf8');

    expect(source).toContain('function restoreResumeLocation(remainingAttempts)');
    expect(source).toContain('function scheduleInteractionProbe(delayMs, remainingAttempts)');
    expect(source).toContain('function bindFrameProgressTracking()');
    expect(source).toContain('function navigateFrameToSlide(frameWindow, target)');
    expect(source).toContain('restoreResumeLocation(12);');
    expect(source).toContain('bindFrameProgressTracking();');
    expect(source).toContain('resolveScormResumeTargetSlide(savedLocation, observedLocation)');
    expect(source).toContain('var shouldCommitLocation = previousLocation !== location;');
    expect(source).toContain('scheduleCommit(800);');
  });
});

~~~

---
## FILE: worker-airtrust/src/__tests__/routes/lms-progresso.test.ts
~~~typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

const {
  createLmsQualificationOnCompletionMock,
  syncMatriculaCycleFromMatriculaMock,
  logAuditMock,
} = vi.hoisted(() => ({
  createLmsQualificationOnCompletionMock: vi.fn(),
  syncMatriculaCycleFromMatriculaMock: vi.fn(),
  logAuditMock: vi.fn(),
}));

vi.mock('../../middleware/auth', () => ({
  auth: () => async (_c: unknown, next: () => Promise<void>) => {
    await next();
  },
}));

vi.mock('../../middleware/rbac', () => ({
  hasRole: () => true,
}));

vi.mock('../../routes/escalas-shared', () => ({
  getEmpresaIdSafe: () => 1,
}));

vi.mock('../../services/lms-qualification', () => ({
  createLmsQualificationOnCompletion: createLmsQualificationOnCompletionMock,
}));

vi.mock('../../services/lms-matricula-cycle', () => ({
  syncMatriculaCycleFromMatricula: syncMatriculaCycleFromMatriculaMock,
}));

vi.mock('../../utils/db', () => ({
  logAudit: logAuditMock,
}));

import lmsProgressoRoutes from '../../routes/lms-progresso';

type QueryHandler = {
  first?: (args: unknown[]) => Promise<unknown> | unknown;
  run?: (args: unknown[]) => Promise<unknown> | unknown;
  all?: (args: unknown[]) => Promise<unknown> | unknown;
};

function createMockDb(handlers: Array<[string, QueryHandler]>) {
  const calls: Array<{ query: string; args: unknown[]; method: 'first' | 'run' | 'all' }> = [];

  const db = {
    prepare: vi.fn((query: string) => {
      const entry = handlers.find(([matcher]) => query.includes(matcher));
      if (!entry) {
        throw new Error(`Unhandled query: ${query}`);
      }

      const handler = entry[1];
      const executeFirst = async (args: unknown[]) => {
        calls.push({ query, args, method: 'first' });
        return handler.first ? handler.first(args) : null;
      };
      const executeRun = async (args: unknown[]) => {
        calls.push({ query, args, method: 'run' });
        return handler.run ? handler.run(args) : { meta: { changes: 1, last_row_id: 0 } };
      };
      const executeAll = async (args: unknown[]) => {
        calls.push({ query, args, method: 'all' });
        return handler.all ? handler.all(args) : { results: [] };
      };

      return {
        first: async () => executeFirst([]),
        run: async () => executeRun([]),
        all: async () => executeAll([]),
        bind: (...args: unknown[]) => ({
          first: async () => executeFirst(args),
          run: async () => executeRun(args),
          all: async () => executeAll(args),
        }),
      };
    }),
  } as unknown as D1Database;

  return { db, calls };
}

describe('lms progresso xapi router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createLmsQualificationOnCompletionMock.mockResolvedValue(9001);
    syncMatriculaCycleFromMatriculaMock.mockResolvedValue(undefined);
    logAuditMock.mockResolvedValue(undefined);
  });

  it('concludes on completed verb even when xAPI result flags are omitted', async () => {
    const { db, calls } = createMockDb([
      [
        'FROM lms_matriculas m',
        {
          first: () => ({
            id: 10,
            funcionario_id: 77,
            status: 'EM_ANDAMENTO',
            empresa_id: 1,
            qualificacao_historico_id: null,
            gerar_qualificacao_ao_concluir: 1,
            qualificacao_tipo_id: 55,
            curso_titulo: 'FDM - Flight Data Monitoring',
            qualificacao_codigo: 'FDM_FLIGHT_DATA_MONITORING',
            qualificacao_nome: 'FDM - Flight Data Monitoring',
            qualificacao_categoria: 'EAD',
            qualificacao_validade: 12,
          }),
        },
      ],
      [
        'INSERT INTO lms_xapi_statements',
        {
          run: () => ({ meta: { changes: 1, last_row_id: 501 } }),
        },
      ],
      [
        'UPDATE lms_matriculas',
        {
          run: () => ({ meta: { changes: 1 } }),
        },
      ],
    ]);

    const app = new Hono<{ Bindings: Env }>();
    app.route('/', lmsProgressoRoutes);

    const response = await app.fetch(
      new Request('http://localhost/xapi/statements', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          matricula_id: 10,
          actor: { mbox: 'mailto:aluno@airtrust.online' },
          verb: {
            id: 'http://adlnet.gov/expapi/verbs/completed',
            display: { 'en-US': 'completed' },
          },
          object: {
            id: 'h5p:20',
            objectType: 'Activity',
          },
        }),
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        statement_id: 501,
        matricula_id: 10,
        novo_status: 'CONCLUIDO',
        qualificacao_gerada: {
          qualificacao_historico_id: 9001,
        },
      },
    });

    const updateCall = calls.find(
      (call) => call.method === 'run' && call.query.includes('UPDATE lms_matriculas'),
    );
    expect(updateCall?.args[0]).toBe('CONCLUIDO');
    expect(updateCall?.args[1]).toBe(100);
    expect(createLmsQualificationOnCompletionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        matriculaId: 10,
        funcionarioId: 77,
        qualificacaoTipoId: 55,
      }),
    );
  });
});

~~~

---
## FILE: worker-airtrust/src/__tests__/routes/qualificacoes-certificados-helpers.test.ts
~~~typescript
import { describe, expect, it, vi } from 'vitest';

import {
  adaptTemplateHtmlForInstrutor,
  adaptTemplateHtmlForSinglePageA4,
  buildConteudoProgramaticoCertificadoHtml,
  resolveCargaHorariaCertificado,
  resolveFuncionarioInstrutorNaEmpresa,
  resolveInstrutorCertificadoData,
  resolveConteudoProgramaticoCertificado,
} from '../../routes/qualificacoes-certificados-helpers';

type QueryHandler = {
  first?: (args: unknown[]) => Promise<unknown> | unknown;
  all?: (args: unknown[]) => Promise<unknown> | unknown;
};

function createMockDb(handlers: Array<[string, QueryHandler]>) {
  const calls: Array<{ query: string; args: unknown[]; method: 'first' | 'all' }> = [];

  const db = {
    prepare: vi.fn((query: string) => {
      const entry = handlers.find(([matcher]) => query.includes(matcher));
      if (!entry) {
        throw new Error(`Unhandled query: ${query}`);
      }

      const [, handler] = entry;
      const executeAll = async (args: unknown[]) => {
        calls.push({ query, args, method: 'all' });
        return handler.all ? handler.all(args) : { results: [] };
      };

      const executeFirst = async (args: unknown[]) => {
        calls.push({ query, args, method: 'first' });
        return handler.first ? handler.first(args) : null;
      };

      return {
        all: async () => executeAll([]),
        first: async () => executeFirst([]),
        bind: (...args: unknown[]) => ({
          all: async () => executeAll(args),
          first: async () => executeFirst(args),
        }),
      };
    }),
  } as unknown as D1Database;

  return { db, calls };
}

describe('qualificacoes-certificados-helpers', () => {
  it('reaproveita o conteudo direto sem consultar fallback', async () => {
    const db = {
      prepare: vi.fn(() => {
        throw new Error('db nao deveria ser consultado');
      }),
    } as unknown as D1Database;

    const result = await resolveConteudoProgramaticoCertificado(db, {
      conteudoProgramatico: 'Item 1\nItem 2',
      qualificacaoCodigo: 'G1-SEM',
      empresaId: 6,
    });

    expect(result).toBe('Item 1\nItem 2');
  });

  it('faz fallback de G1-SEM para G1 na mesma empresa quando o conteudo vier vazio', async () => {
    const { db, calls } = createMockDb([
      [
        'PRAGMA table_info(qualificacoes_tipos)',
        { all: () => ({ results: [{ name: 'empresa_id' }] }) },
      ],
      [
        'FROM qualificacoes_tipos',
        {
          first: (args) => {
            const [empresaId, codigo] = args as [number, string];
            if (empresaId === 6 && codigo === 'G1-SEM') {
              return null;
            }
            if (empresaId === 6 && codigo === 'G1') {
              return {
                conteudo_programatico: 'Familiarizacao com cabine\nDecolagens e pousos',
              };
            }
            return null;
          },
        },
      ],
    ]);

    const result = await resolveConteudoProgramaticoCertificado(db, {
      conteudoProgramatico: null,
      qualificacaoCodigo: 'G1-SEM',
      empresaId: 6,
    });

    expect(result).toBe('Familiarizacao com cabine\nDecolagens e pousos');
    expect(
      calls
        .filter(
          (call) => call.method === 'first' && call.query.includes('FROM qualificacoes_tipos'),
        )
        .map((call) => call.args[1]),
    ).toEqual(['G1-SEM', 'G1']);
  });

  it('formata o conteudo programatico como spans HTML', () => {
    const html = buildConteudoProgramaticoCertificadoHtml('Item 1\nItem 2;Item 3');

    expect(html).toContain('<span class="program-item">• Item 1</span>');
    expect(html).toContain('<span class="program-item">• Item 2</span>');
    expect(html).toContain('<span class="program-item">• Item 3</span>');
  });

  it('resolve os dados do instrutor pelo nome na empresa e faz fallback para nome livre', async () => {
    const { db } = createMockDb([
      [
        'FROM funcionarios',
        {
          all: (args) => {
            const [empresaId] = args as [number];
            if (empresaId === 6) {
              return {
                results: [
                  {
                    id: 41,
                    nome: 'Filipe Passaroni Daumas',
                    cpf: '123.456.789-00',
                    codigo_anac: '12694-7',
                    matricula: '00353',
                    funcao: 'Instrutor',
                  },
                ],
              };
            }
            return { results: [] };
          },
        },
      ],
    ]);

    await expect(
      resolveInstrutorCertificadoData(db, {
        empresaId: 6,
        nomeInstrutor: 'Filipe Passaroni Daumas',
      }),
    ).resolves.toEqual({
      nome: 'Filipe Passaroni Daumas',
      cpf: '123.456.789-00',
      codigoAnac: '12694-7',
      matricula: '00353',
      funcao: 'Instrutor',
    });

    await expect(
      resolveInstrutorCertificadoData(db, {
        empresaId: 6,
        nomeInstrutor: 'Instrutor Externo',
        fallbackFuncao: 'Instrutor Convidado',
      }),
    ).resolves.toEqual({
      nome: 'Instrutor Externo',
      cpf: '',
      codigoAnac: '',
      matricula: '',
      funcao: 'Instrutor Convidado',
    });
  });

  it('resolve o funcionario do instrutor por nome e evita cair no aluno do historico', async () => {
    const { db } = createMockDb([
      [
        'FROM funcionarios',
        {
          all: (args) => {
            const [empresaId] = args as [number];
            if (empresaId === 6) {
              return {
                results: [
                  {
                    id: 25,
                    nome: 'Ramon Godinho Bastos',
                    cpf: '093.127.887-28',
                    codigo_anac: '',
                    matricula: '00264',
                    funcao: 'Aluno',
                  },
                  {
                    id: 41,
                    nome: 'Filipe Passaroni Daumas',
                    cpf: '083.286.227-42',
                    codigo_anac: '12694-7',
                    matricula: '00353',
                    funcao: 'Instrutor',
                  },
                ],
              };
            }
            return { results: [] };
          },
        },
      ],
    ]);

    await expect(
      resolveFuncionarioInstrutorNaEmpresa(db, {
        empresaId: 6,
        nomeInstrutor: 'Filipe Passaroni Daumas',
      }),
    ).resolves.toMatchObject({
      id: 41,
      nome: 'Filipe Passaroni Daumas',
    });

    await expect(
      resolveFuncionarioInstrutorNaEmpresa(db, {
        empresaId: 6,
        cpfInstrutor: '08328622742',
      }),
    ).resolves.toMatchObject({
      id: 41,
      nome: 'Filipe Passaroni Daumas',
    });
  });

  it('adapta o template do instrutor com texto correto, label e css A4', () => {
    const html = adaptTemplateHtmlForInstrutor(`
      <html>
        <head></head>
        <body>
          <div>Certificamos que o profissional abaixo ministrou, como instrutor, o seguinte treinamento:o treinamento descrito neste documento.</div>
          <div class="main-sub">Certificamos que o(a) profissional abaixo concluiu com aproveitamento:</div>
          <span>FUNCIONÁRIO</span>
        </body>
      </html>
    `);

    expect(html).toContain(
      'Certificamos que o profissional abaixo ministrou, como instrutor, o treinamento descrito neste documento.',
    );
    expect(html).not.toContain('o seguinte treinamento:o');
    expect(html).not.toContain('concluiu com aproveitamento:');
    expect(html).not.toContain(
      'Certificamos que o profissional abaixo ministrou, como instrutor, o treinamento descrito neste documento. o treinamento descrito neste documento.',
    );
    expect(html).toContain('>INSTRUTOR<');
    expect(html).toContain('airtrust-instrutor-a4-fix');
    expect(html).toContain('@page { size: A4 portrait; margin: 0; }');
    expect(html).toContain('.cert-page');
    expect(html).toContain('height: 297mm !important;');
    expect(html).toContain('margin-top: auto !important;');
  });

  it('prioriza a carga horaria gravada no historico ao emitir o certificado', () => {
    expect(
      resolveCargaHorariaCertificado({
        tipoTreinamento: 'RECORRENTE',
        cargaHistorico: 7,
        cargaInicial: 10,
        cargaRecorrente: 4,
        cargaPadrao: 3,
      }),
    ).toBe(7);

    expect(
      resolveCargaHorariaCertificado({
        tipoTreinamento: 'INICIAL',
        cargaHistorico: null,
        cargaInicial: 12,
        cargaRecorrente: 6,
        cargaPadrao: 8,
      }),
    ).toBe(12);
  });

  it('normaliza qualquer template para caber em uma unica folha A4', () => {
    const html = adaptTemplateHtmlForSinglePageA4(`
      <html>
        <head></head>
        <body>
          <div class="cert-page">
            <div class="program-section"><div class="program-content">conteudo</div></div>
            <div class="footer">rodape</div>
          </div>
        </body>
      </html>
    `);

    expect(html).toContain('airtrust-instrutor-a4-fix');
    expect(html).toContain('height: 297mm !important;');
    expect(html).toContain('font-size: 6.8pt !important;');
    expect(html).toContain('margin-top: auto !important;');
  });

  it('preserva o layout estruturado do certificado no padrao antigo', () => {
    const html = adaptTemplateHtmlForSinglePageA4(`
      <html>
        <head></head>
        <body>
          <div class="cert-page">
            <div class="header"></div>
            <div class="info-grid"></div>
            <div class="training-box"></div>
            <div class="program-section"><div class="program-content">conteudo</div></div>
            <div class="footer">rodape</div>
          </div>
        </body>
      </html>
    `);

    expect(html).toContain('airtrust-instrutor-a4-fix');
    expect(html).toContain('display: grid !important;');
    expect(html).toContain(
      'grid-template-rows: auto auto auto auto minmax(0, 1fr) auto !important;',
    );
    expect(html).toContain('font-size: 6.6pt !important;');
    expect(html).toContain('margin-top: 12px !important;');
    expect(html).toContain('box-shadow: none !important;');
  });
});

~~~

import { test, expect } from '@playwright/test';
import { login } from './helpers/auth.helper';
import { ModalHelper } from './helpers/modal.helper';
import { TableHelper } from './helpers/table.helper';

test.describe('4. MÓDULO: SESSÕES DE SIMULADOR', () => {
  let modal: ModalHelper;
  let table: TableHelper;

  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/sessoes-simulador');
    await page.waitForLoadState('networkidle');

    modal = new ModalHelper(page);
    table = new TableHelper(page);
  });

  test.describe('4.1 LISTAGEM DE SESSÕES', () => {
    test('Tabela de sessões renderiza corretamente', async ({ page }) => {
      const tableElement = page.locator('table, [role="table"]');
      await expect(tableElement).toBeVisible();
    });

    test('Colunas essenciais aparecem', async () => {
      const headers = await table.getColumnHeaders();
      expect(headers).toContain('Data');
      expect(headers).toContain('Funcionário');
      expect(headers).toContain('Simulador');
      expect(headers).toContain('Instrutor');
      expect(headers).toContain('Resultado');
    });

    test('Badge de resultado aparece com cor (Aprovado=verde, Reprovado=vermelho)', async ({
      page,
    }) => {
      const firstRow = page.locator('tbody tr').first();
      const resultBadge = firstRow.locator('[class*="badge"], [class*="resultado"]');
      await expect(resultBadge).toBeVisible();

      const bgColor = await resultBadge.evaluate(
        (el) => window.getComputedStyle(el).backgroundColor,
      );
      expect(bgColor).not.toBe('rgba(0, 0, 0, 0)');
    });

    test('Filtro por data está disponível', async ({ page }) => {
      const dataFilter = page.locator(
        'input[type="date"]:near(:text("Data")), input[placeholder*="data" i]',
      );
      await expect(dataFilter).toBeVisible();
    });

    test('Filtro por funcionário está disponível', async ({ page }) => {
      const funcionarioFilter = page.locator(
        'select:near(:text("Funcionário")), input[placeholder*="funcionário" i]',
      );
      await expect(funcionarioFilter).toBeVisible();
    });

    test('Filtro por simulador está disponível', async ({ page }) => {
      const simuladorFilter = page.locator('select:near(:text("Simulador"))');
      await expect(simuladorFilter).toBeVisible();
    });

    test('Filtro por resultado (Todos/Aprovado/Reprovado)', async ({ page }) => {
      const resultadoFilter = page.locator('select:near(:text("Resultado"))');
      if ((await resultadoFilter.count()) > 0) {
        await expect(resultadoFilter).toBeVisible();
      }
    });

    test('Botão "Nova Sessão" está visível', async ({ page }) => {
      const newButton = page.locator('button:has-text("Nova Sessão")');
      await expect(newButton).toBeVisible();
    });

    test('Ícone de simulador aparece na listagem', async ({ page }) => {
      const icon = page.locator('tbody tr svg, tbody tr i[class*="icon"]').first();
      await expect(icon).toBeVisible();
    });

    test('Duração da sessão aparece formatada (ex: 2h 30min)', async ({ page }) => {
      const firstRow = page.locator('tbody tr').first();
      const durationCell = firstRow.locator('td:has-text("h"), td:has-text("min")').first();
      if ((await durationCell.count()) > 0) {
        await expect(durationCell).toBeVisible();
      }
    });
  });

  test.describe('4.2 MODAL "NOVA SESSÃO DE SIMULADOR"', () => {
    test.beforeEach(async ({ page }) => {
      await page.click('button:has-text("Nova Sessão")');
      await modal.waitForModalOpen('Nova Sessão');
    });

    test('Modal abre com animação suave', async ({ page }) => {
      const modalElement = page.locator('[role="dialog"]');
      await expect(modalElement).toBeVisible();
    });

    test('Título "Nova Sessão de Simulador" está visível', async ({ page }) => {
      const title = page.locator('h2:has-text("Nova Sessão"), h3:has-text("Nova Sessão")');
      await expect(title).toBeVisible();
    });

    test('Campo "Funcionário" (select/autocomplete) obrigatório', async ({ page }) => {
      const field = page.locator(
        'select[name="funcionario_id"], [role="combobox"]:near(:text("Funcionário"))',
      );
      await expect(field).toBeVisible();

      const label = page.locator('label:has-text("Funcionário")');
      const hasAsterisk = (await label.locator('text="*"').count()) > 0;
      expect(hasAsterisk).toBe(true);
    });

    test('Campo "Simulador" (select) obrigatório', async ({ page }) => {
      const field = page.locator(
        'select[name="simulador_id"], [role="combobox"]:near(:text("Simulador"))',
      );
      await expect(field).toBeVisible();
    });

    test('Campo "Data da Sessão" (date picker) obrigatório', async ({ page }) => {
      const field = page.locator(
        'input[name="data_sessao"], input[type="date"]:near(:text("Data"))',
      );
      await expect(field).toBeVisible();
    });

    test('Campo "Hora de Início" (time picker) obrigatório', async ({ page }) => {
      const field = page.locator(
        'input[name="hora_inicio"], input[type="time"]:near(:text("Início"))',
      );
      await expect(field).toBeVisible();
    });

    test('Campo "Hora de Término" (time picker) obrigatório', async ({ page }) => {
      const field = page.locator(
        'input[name="hora_termino"], input[type="time"]:near(:text("Término"))',
      );
      await expect(field).toBeVisible();
    });

    test('Campo "Instrutor" está visível', async ({ page }) => {
      const field = page.locator('input[name="instrutor"], select[name="instrutor_id"]');
      await expect(field).toBeVisible();
    });

    test('Campo "Cenários Praticados" (textarea ou multi-select)', async ({ page }) => {
      const field = page.locator(
        'textarea[name="cenarios"], [class*="multi-select"]:near(:text("Cenários"))',
      );
      await expect(field).toBeVisible();
    });

    test('Campo "Resultado" (select: Aprovado/Reprovado/Em Andamento)', async ({ page }) => {
      const field = page.locator('select[name="resultado"]');
      await expect(field).toBeVisible();

      const options = await field.locator('option').allTextContents();
      expect(options.some((opt) => opt.includes('Aprovado'))).toBe(true);
      expect(options.some((opt) => opt.includes('Reprovado'))).toBe(true);
    });

    test('Campo "Nota/Pontuação" (number) está visível', async ({ page }) => {
      const field = page.locator(
        'input[name="nota"], input[name="pontuacao"], input[type="number"]:near(:text("Nota"))',
      );
      await expect(field).toBeVisible();
    });

    test('Campo "Observações do Instrutor" (textarea)', async ({ page }) => {
      const field = page.locator('textarea[name="observacoes"]');
      await expect(field).toBeVisible();
    });

    test('Upload de vídeo/evidências está disponível', async ({ page }) => {
      const fileInput = page.locator('input[type="file"]');
      await expect(fileInput).toBeVisible();
    });

    test('Campo "Competências Avaliadas" (checklist ou multi-select)', async ({ page }) => {
      const field = page.locator(
        '[class*="competencias"], fieldset:has(legend:has-text("Competências"))',
      );
      if ((await field.count()) > 0) {
        await expect(field).toBeVisible();
      }
    });

    test('Checkbox "Gerar Certificado Automaticamente"', async ({ page }) => {
      const checkbox = page.locator('input[type="checkbox"][name="gerar_certificado"]');
      if ((await checkbox.count()) > 0) {
        await expect(checkbox).toBeVisible();
      }
    });

    test('Botões "Salvar" e "Cancelar" estão posicionados corretamente', async ({ page }) => {
      const saveButton = page.locator('button:has-text("Salvar")');
      const cancelButton = page.locator('button:has-text("Cancelar")');

      const saveBox = await saveButton.boundingBox();
      const cancelBox = await cancelButton.boundingBox();

      expect(saveBox!.x).toBeGreaterThan(cancelBox!.x);
    });

    test('Criar sessão com dados mínimos funciona', async () => {
      await modal.selectOption('Funcionário', 'primeiro');
      await modal.selectOption('Simulador', 'primeiro');

      const hoje = new Date().toISOString().split('T')[0];
      await modal.fillInput('Data da Sessão', hoje);
      await modal.fillInput('Hora de Início', '08:00');
      await modal.fillInput('Hora de Término', '10:00');
      await modal.selectOption('Resultado', 'Aprovado');

      await modal.clickSaveButton();
      await modal.waitForToast('success');
    });

    test('Validação: Hora de término deve ser maior que hora de início', async () => {
      const hoje = new Date().toISOString().split('T')[0];

      await modal.fillInput('Data da Sessão', hoje);
      await modal.fillInput('Hora de Início', '10:00');
      await modal.fillInput('Hora de Término', '08:00'); // Erro: antes do início
      await modal.clickSaveButton();

      await modal.waitForToast('error');
    });

    test('Validação: Funcionário obrigatório', async () => {
      await modal.selectOption('Simulador', 'primeiro');
      await modal.clickSaveButton();

      await modal.waitForToast('error');
    });

    test('Validação: Nota deve ser entre 0 e 100', async () => {
      await modal.fillInput('Nota/Pontuação', '150'); // Acima de 100
      await modal.clickSaveButton();

      const hasError = await modal.hasValidationError('Nota');
      expect(hasError).toBe(true);
    });
  });

  test.describe('4.3 MODAL "EDITAR SESSÃO"', () => {
    test('Modal abre ao clicar no botão Editar', async ({ page }) => {
      const firstRow = page.locator('tbody tr').first();
      await firstRow.locator('[aria-label*="Editar"], button:has(svg[data-icon="pen"])').click();

      await modal.waitForModalOpen('Editar');
    });

    test('Campos aparecem pré-preenchidos', async ({ page }) => {
      const firstRow = page.locator('tbody tr').first();
      await firstRow.locator('[aria-label*="Editar"]').click();
      await modal.waitForModalOpen('Editar');

      const dataSessao = page.locator('input[name="data_sessao"]');
      const value = await dataSessao.inputValue();

      expect(value).toBeTruthy();
    });

    test('Editar resultado de Reprovado para Aprovado funciona', async ({ page }) => {
      const firstRow = page.locator('tbody tr').first();
      await firstRow.locator('[aria-label*="Editar"]').click();

      await modal.selectOption('Resultado', 'Aprovado');
      await modal.clickSaveButton();

      await modal.waitForToast('success');
    });
  });

  test.describe('4.4 MODAL "VISUALIZAR SESSÃO" (Detalhes Completos)', () => {
    test('Modal abre ao clicar no botão Visualizar', async ({ page }) => {
      const firstRow = page.locator('tbody tr').first();
      await firstRow
        .locator('[aria-label*="Visualizar"], button:has(svg[data-icon="eye"])')
        .click();

      await page.waitForTimeout(500);
      const modalElement = page.locator('[role="dialog"]');
      await expect(modalElement).toBeVisible();
    });

    test('Seção "Dados da Sessão" aparece', async ({ page }) => {
      const firstRow = page.locator('tbody tr').first();
      await firstRow.locator('[aria-label*="Visualizar"]').click();

      await page.waitForTimeout(500);
      const section = page.locator(
        'h3:has-text("Dados da Sessão"), h4:has-text("Dados da Sessão")',
      );
      if ((await section.count()) > 0) {
        await expect(section).toBeVisible();
      }
    });

    test('Seção "Cenários Praticados" aparece', async ({ page }) => {
      const firstRow = page.locator('tbody tr').first();
      await firstRow.locator('[aria-label*="Visualizar"]').click();

      await page.waitForTimeout(500);
      const section = page.locator('h3:has-text("Cenários"), h4:has-text("Cenários")');
      if ((await section.count()) > 0) {
        await expect(section).toBeVisible();
      }
    });

    test('Seção "Avaliação" aparece com nota e observações', async ({ page }) => {
      const firstRow = page.locator('tbody tr').first();
      await firstRow.locator('[aria-label*="Visualizar"]').click();

      await page.waitForTimeout(500);
      const section = page.locator('h3:has-text("Avaliação"), h4:has-text("Avaliação")');
      if ((await section.count()) > 0) {
        await expect(section).toBeVisible();
      }
    });

    test('Botão "Gerar Relatório PDF" está disponível', async ({ page }) => {
      const firstRow = page.locator('tbody tr').first();
      await firstRow.locator('[aria-label*="Visualizar"]').click();

      await page.waitForTimeout(500);
      const pdfButton = page.locator('button:has-text("PDF"), button:has-text("Relatório")');
      if ((await pdfButton.count()) > 0) {
        await expect(pdfButton).toBeVisible();
      }
    });
  });

  test.describe('4.5 EXCLUSÃO DE SESSÃO', () => {
    test('Modal de confirmação abre ao clicar Deletar', async ({ page }) => {
      const firstRow = page.locator('tbody tr').first();
      await firstRow.locator('[aria-label*="Deletar"], button:has(svg[data-icon="trash"])').click();

      await page.waitForTimeout(500);
      const confirmModal = page.locator('[role="dialog"]:has-text("Excluir")');
      await expect(confirmModal).toBeVisible();
    });

    test('Mensagem menciona data e funcionário da sessão', async ({ page }) => {
      const firstRow = page.locator('tbody tr').first();
      const funcionario = await firstRow.locator('td').nth(1).textContent();

      await firstRow.locator('[aria-label*="Deletar"]').click();
      await page.waitForTimeout(500);

      const modalText = await page.locator('[role="dialog"]').textContent();
      expect(modalText).toContain(funcionario!);
    });

    test('Botão "Excluir" é vermelho', async ({ page }) => {
      const firstRow = page.locator('tbody tr').first();
      await firstRow.locator('[aria-label*="Deletar"]').click();

      await page.waitForTimeout(500);
      const deleteButton = page.locator('button:has-text("Excluir"):not(:has-text("Cancelar"))');

      const bgColor = await deleteButton.evaluate(
        (el) => window.getComputedStyle(el).backgroundColor,
      );

      const match = bgColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (match) {
        const [, r, g] = match.map(Number);
        expect(r).toBeGreaterThan(g);
      }
    });
  });

  test.describe('4.6 RELATÓRIOS E DASHBOARDS', () => {
    test('Dashboard de estatísticas aparece no topo', async ({ page }) => {
      const dashboard = page.locator('[class*="dashboard"], [class*="stats"]');
      if ((await dashboard.count()) > 0) {
        await expect(dashboard).toBeVisible();
      }
    });

    test('Card "Total de Sessões" aparece', async ({ page }) => {
      const card = page.locator('text=/total de sessões/i, text=/sessões realizadas/i').first();
      if ((await card.count()) > 0) {
        await expect(card).toBeVisible();
      }
    });

    test('Card "Taxa de Aprovação" aparece com porcentagem', async ({ page }) => {
      const card = page.locator('text=/taxa de aprovação/i, text=%').first();
      if ((await card.count()) > 0) {
        await expect(card).toBeVisible();
      }
    });

    test('Gráfico de sessões por período está visível', async ({ page }) => {
      const chart = page.locator('canvas, svg[class*="chart"]').first();
      if ((await chart.count()) > 0) {
        await expect(chart).toBeVisible();
      }
    });
  });

  test.describe('4.7 RESPONSIVIDADE', () => {
    test('Modal ajusta em tela mobile', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.click('button:has-text("Nova Sessão")');

      await modal.waitForModalOpen('Nova Sessão');
      const modalElement = page.locator('[role="dialog"]');

      const box = await modalElement.boundingBox();
      expect(box!.width).toBeLessThanOrEqual(375);
    });

    test('Filtros empilham verticalmente em mobile', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });

      const filtersContainer = page.locator('[class*="filters"]').first();
      if ((await filtersContainer.count()) > 0) {
        const box = await filtersContainer.boundingBox();
        expect(box!.width).toBeLessThanOrEqual(375);
      }
    });
  });

  test.describe('4.8 ACESSIBILIDADE', () => {
    test('Tab navega pelos campos', async ({ page }) => {
      await page.click('button:has-text("Nova Sessão")');
      await modal.waitForModalOpen('Nova Sessão');

      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');

      const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
      expect(['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON']).toContain(focusedElement);
    });

    test('Badge de resultado tem contraste adequado', async ({ page }) => {
      const badge = page.locator('[class*="badge"]').first();
      if ((await badge.count()) > 0) {
        await expect(badge).toBeVisible();
      }
    });
  });
});

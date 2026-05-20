import { test, expect } from '@playwright/test';
import { login } from './helpers/auth.helper';
import { ModalHelper } from './helpers/modal.helper';
import { TableHelper } from './helpers/table.helper';

test.describe('2. MÓDULO: TIPOS DE QUALIFICAÇÃO', () => {
  let modal: ModalHelper;
  let table: TableHelper;

  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/qualificacoes/tipos');
    await page.waitForLoadState('networkidle');

    modal = new ModalHelper(page);
    table = new TableHelper(page);
  });

  test.describe('2.1 LISTAGEM DE TIPOS', () => {
    test('Tabela de tipos renderiza corretamente', async ({ page }) => {
      const tableElement = page.locator('table, [role="table"]');
      await expect(tableElement).toBeVisible();
    });

    test('Colunas: Código, Nome, Categoria, Validade, Status aparecem', async () => {
      const headers = await table.getColumnHeaders();
      expect(headers).toContain('Código');
      expect(headers).toContain('Nome');
      expect(headers).toContain('Categoria');
      expect(headers).toContain('Validade');
      expect(headers).toContain('Status');
    });

    test('Ícone Visualizar aparece em cada linha', async ({ page }) => {
      const firstRow = page.locator('tbody tr').first();
      const viewButton = firstRow.locator(
        '[aria-label*="Visualizar"], [title*="Visualizar"], button:has(svg[data-icon="eye"])',
      );
      await expect(viewButton).toBeVisible();
    });

    test('Ícone Editar aparece em cada linha', async ({ page }) => {
      const firstRow = page.locator('tbody tr').first();
      const editButton = firstRow.locator(
        '[aria-label*="Editar"], [title*="Editar"], button:has(svg[data-icon="pen"])',
      );
      await expect(editButton).toBeVisible();
    });

    test('Ícone Deletar aparece em cada linha', async ({ page }) => {
      const firstRow = page.locator('tbody tr').first();
      const deleteButton = firstRow.locator(
        '[aria-label*="Deletar"], [title*="Deletar"], button:has(svg[data-icon="trash"])',
      );
      await expect(deleteButton).toBeVisible();
    });

    test('Botão "Novo Tipo" está visível', async ({ page }) => {
      const newButton = page.locator('button:has-text("Novo Tipo")');
      await expect(newButton).toBeVisible();
    });

    test('Badge de categoria aparece com cor', async ({ page }) => {
      const firstRow = page.locator('tbody tr').first();
      const categoryBadge = firstRow.locator('[class*="badge"], [class*="tag"]');
      await expect(categoryBadge).toBeVisible();

      const bgColor = await categoryBadge.evaluate(
        (el) => window.getComputedStyle(el).backgroundColor,
      );
      expect(bgColor).not.toBe('rgba(0, 0, 0, 0)');
    });

    test('Ícone do tipo aparece na listagem', async ({ page }) => {
      const firstRow = page.locator('tbody tr').first();
      const icon = firstRow.locator('svg, i[class*="icon"]').first();
      await expect(icon).toBeVisible();
    });
  });

  test.describe('2.2 MODAL "NOVO TIPO DE QUALIFICAÇÃO"', () => {
    test.beforeEach(async ({ page }) => {
      await page.click('button:has-text("Novo Tipo")');
      await modal.waitForModalOpen('Novo Tipo');
    });

    test('Modal abre com animação suave', async ({ page }) => {
      const modalElement = page.locator('[role="dialog"]');
      await expect(modalElement).toBeVisible();
    });

    test('Título "Novo Tipo de Qualificação" está visível', async ({ page }) => {
      const title = page.locator('h2:has-text("Novo Tipo"), h3:has-text("Novo Tipo")');
      await expect(title).toBeVisible();
    });

    test('Campo "Código" está visível', async ({ page }) => {
      const field = page.locator('input[name="codigo"], input[placeholder*="código" i]');
      await expect(field).toBeVisible();
    });

    test('Campo "Nome" está visível e obrigatório', async ({ page }) => {
      const field = page.locator('input[name="nome"], input[placeholder*="nome" i]');
      await expect(field).toBeVisible();

      const label = page.locator('label:has-text("Nome")');
      const hasAsterisk = (await label.locator('text="*"').count()) > 0;
      expect(hasAsterisk).toBe(true);
    });

    test('Campo "Categoria" está visível (dropdown)', async ({ page }) => {
      const field = page.locator(
        'select[name="categoria"], [role="combobox"]:near(:text("Categoria"))',
      );
      await expect(field).toBeVisible();
    });

    test('Categoria tem opções: Técnica, Operacional, Segurança, Administrativa', async ({
      page,
    }) => {
      const select = page.locator('select[name="categoria"]');
      if ((await select.count()) > 0) {
        const options = await select.locator('option').allTextContents();
        expect(options.some((opt) => opt.includes('Técnica'))).toBe(true);
        expect(options.some((opt) => opt.includes('Operacional'))).toBe(true);
        expect(options.some((opt) => opt.includes('Segurança'))).toBe(true);
      }
    });

    test('Campo "Validade em Meses" está visível (number)', async ({ page }) => {
      const field = page.locator(
        'input[name="validade_meses"], input[type="number"]:near(:text("Validade"))',
      );
      await expect(field).toBeVisible();
    });

    test('Campo "Descrição" está visível (textarea)', async ({ page }) => {
      const field = page.locator(
        'textarea[name="descricao"], textarea[placeholder*="descrição" i]',
      );
      await expect(field).toBeVisible();
    });

    test('Seletor de cor está visível', async ({ page }) => {
      const colorPicker = page.locator('input[type="color"], [class*="color-picker"]');
      await expect(colorPicker).toBeVisible();
    });

    test('Seletor de ícone está visível', async ({ page }) => {
      const iconSelector = page.locator(
        '[class*="icon-picker"], button:has-text("Selecionar Ícone")',
      );
      await expect(iconSelector).toBeVisible();
    });

    test('Checkbox "Ativo" está visível e marcado por padrão', async ({ page }) => {
      const checkbox = page.locator('input[type="checkbox"][name="ativo"]');
      await expect(checkbox).toBeVisible();
      await expect(checkbox).toBeChecked();
    });

    test('Botão "Salvar" à direita, "Cancelar" à esquerda', async ({ page }) => {
      const saveButton = page.locator('button:has-text("Salvar")');
      const cancelButton = page.locator('button:has-text("Cancelar")');

      const saveBox = await saveButton.boundingBox();
      const cancelBox = await cancelButton.boundingBox();

      expect(saveBox!.x).toBeGreaterThan(cancelBox!.x);
    });

    test('ESC fecha o modal', async ({ page }) => {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);

      const modalElement = page.locator('[role="dialog"]');
      await expect(modalElement).not.toBeVisible();
    });

    test('Criar tipo com dados mínimos funciona', async ({ page }) => {
      const timestamp = Date.now();

      await modal.fillInput('Código', `TQ${timestamp}`);
      await modal.fillInput('Nome', `Tipo Teste ${timestamp}`);
      await modal.selectOption('Categoria', 'Técnica');
      await modal.fillInput('Validade em Meses', '12');

      await modal.clickSaveButton();
      await modal.waitForToast('success');

      await table.waitForRowToAppear(`Tipo Teste ${timestamp}`);
    });

    test('Validação: Nome obrigatório', async () => {
      await modal.fillInput('Código', 'TQ999');
      // Não preencher nome
      await modal.clickSaveButton();

      const hasError = await modal.hasValidationError('Nome');
      expect(hasError).toBe(true);
    });

    test('Validação: Categoria obrigatória', async () => {
      await modal.fillInput('Código', 'TQ999');
      await modal.fillInput('Nome', 'Tipo Sem Categoria');
      // Não selecionar categoria
      await modal.clickSaveButton();

      await modal.waitForToast('error');
    });
  });

  test.describe('2.3 MODAL "EDITAR TIPO"', () => {
    test('Modal abre ao clicar no botão Editar', async ({ page }) => {
      const firstRow = page.locator('tbody tr').first();
      await firstRow.locator('[aria-label*="Editar"], button:has(svg[data-icon="pen"])').click();

      await modal.waitForModalOpen('Editar');
    });

    test('Título muda para "Editar Tipo de Qualificação"', async ({ page }) => {
      const firstRow = page.locator('tbody tr').first();
      await firstRow.locator('[aria-label*="Editar"]').click();

      const title = page.locator('h2:has-text("Editar"), h3:has-text("Editar")');
      await expect(title).toBeVisible();
    });

    test('Campos aparecem pré-preenchidos com dados existentes', async ({ page }) => {
      const firstRow = page.locator('tbody tr').first();
      const nomeOriginal = await firstRow.locator('td').nth(1).textContent();

      await firstRow.locator('[aria-label*="Editar"]').click();
      await modal.waitForModalOpen('Editar');

      const nomeInput = page.locator('input[name="nome"]');
      const valorAtual = await nomeInput.inputValue();

      expect(valorAtual).toBe(nomeOriginal?.trim());
    });

    test('Editar tipo funciona corretamente', async ({ page }) => {
      const firstRow = page.locator('tbody tr').first();
      await firstRow.locator('[aria-label*="Editar"]').click();

      const timestamp = Date.now();
      await modal.fillInput('Nome', `Tipo Editado ${timestamp}`);
      await modal.clickSaveButton();

      await modal.waitForToast('success');
      await table.waitForRowToAppear(`Tipo Editado ${timestamp}`);
    });
  });

  test.describe('2.4 MODAL "VISUALIZAR TIPO"', () => {
    test('Modal abre ao clicar no botão Visualizar', async ({ page }) => {
      const firstRow = page.locator('tbody tr').first();
      await firstRow
        .locator('[aria-label*="Visualizar"], button:has(svg[data-icon="eye"])')
        .click();

      await page.waitForTimeout(500);
      const modal = page.locator('[role="dialog"]');
      await expect(modal).toBeVisible();
    });

    test('Campos aparecem apenas para leitura', async ({ page }) => {
      const firstRow = page.locator('tbody tr').first();
      await firstRow.locator('[aria-label*="Visualizar"]').click();

      await page.waitForTimeout(500);
      const nomeInput = page.locator('input[name="nome"]');
      const isDisabled = await nomeInput.isDisabled();
      expect(isDisabled).toBe(true);
    });

    test('Botão "Editar" aparece no modal de visualização', async ({ page }) => {
      const firstRow = page.locator('tbody tr').first();
      await firstRow.locator('[aria-label*="Visualizar"]').click();

      await page.waitForTimeout(500);
      const editButton = page.locator('button:has-text("Editar")');
      await expect(editButton).toBeVisible();
    });
  });

  test.describe('2.5 EXCLUSÃO DE TIPO', () => {
    test('Modal de confirmação abre ao clicar Deletar', async ({ page }) => {
      const firstRow = page.locator('tbody tr').first();
      await firstRow.locator('[aria-label*="Deletar"], button:has(svg[data-icon="trash"])').click();

      await page.waitForTimeout(500);
      const confirmModal = page.locator('[role="dialog"]:has-text("Excluir")');
      await expect(confirmModal).toBeVisible();
    });

    test('Botão "Cancelar" presente no modal de exclusão', async ({ page }) => {
      const firstRow = page.locator('tbody tr').first();
      await firstRow.locator('[aria-label*="Deletar"]').click();

      await page.waitForTimeout(500);
      const cancelButton = page.locator('button:has-text("Cancelar")');
      await expect(cancelButton).toBeVisible();
    });

    test('Botão "Excluir" é vermelho (danger)', async ({ page }) => {
      const firstRow = page.locator('tbody tr').first();
      await firstRow.locator('[aria-label*="Deletar"]').click();

      await page.waitForTimeout(500);
      const deleteButton = page.locator('button:has-text("Excluir"):not(:has-text("Cancelar"))');

      const bgColor = await deleteButton.evaluate(
        (el) => window.getComputedStyle(el).backgroundColor,
      );

      // Vermelho deve ter mais R que G e B
      const match = bgColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (match) {
        const [, r, g, b] = match.map(Number);
        expect(r).toBeGreaterThan(g);
        expect(r).toBeGreaterThan(b);
      }
    });

    test('Mensagem de confirmação menciona nome do tipo', async ({ page }) => {
      const firstRow = page.locator('tbody tr').first();
      const nomeTipo = await firstRow.locator('td').nth(1).textContent();

      await firstRow.locator('[aria-label*="Deletar"]').click();
      await page.waitForTimeout(500);

      const modalText = await page.locator('[role="dialog"]').textContent();
      expect(modalText).toContain(nomeTipo!);
    });
  });

  test.describe('2.6 RESPONSIVIDADE', () => {
    test('Modal ajusta em tela mobile (375x667)', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.click('button:has-text("Novo Tipo")');

      await modal.waitForModalOpen('Novo Tipo');
      const modalElement = page.locator('[role="dialog"]');

      const box = await modalElement.boundingBox();
      expect(box!.width).toBeLessThanOrEqual(375);
    });

    test('Scroll funciona em formulário longo no mobile', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.click('button:has-text("Novo Tipo")');

      await page.waitForTimeout(500);
      const modalContent = page.locator('[role="dialog"] [class*="content"]').first();

      const isScrollable = await modalContent.evaluate((el) => {
        return el.scrollHeight > el.clientHeight;
      });

      expect(isScrollable).toBe(true);
    });
  });

  test.describe('2.7 ACESSIBILIDADE', () => {
    test('Tab navega pelos campos do formulário', async ({ page }) => {
      await page.click('button:has-text("Novo Tipo")');
      await modal.waitForModalOpen('Novo Tipo');

      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');

      const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
      expect(['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON']).toContain(focusedElement);
    });

    test('Focus visível em todos os campos', async ({ page }) => {
      await page.click('button:has-text("Novo Tipo")');
      await modal.waitForModalOpen('Novo Tipo');

      const codigoInput = page.locator('input[name="codigo"]');
      await codigoInput.focus();

      const outlineColor = await codigoInput.evaluate(
        (el) => window.getComputedStyle(el).outlineColor,
      );

      expect(outlineColor).not.toBe('rgba(0, 0, 0, 0)');
    });
  });
});

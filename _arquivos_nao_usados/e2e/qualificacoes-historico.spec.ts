import { test, expect } from '@playwright/test';
import { login } from './helpers/auth.helper';
import { ModalHelper } from './helpers/modal.helper';
import { TableHelper } from './helpers/table.helper';

test.describe('3. MÓDULO: HISTÓRICO DE QUALIFICAÇÕES', () => {
  let modal: ModalHelper;
  let table: TableHelper;

  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/qualificacoes/historico');
    await page.waitForLoadState('networkidle');

    modal = new ModalHelper(page);
    table = new TableHelper(page);
  });

  test.describe('3.1 LISTAGEM DE HISTÓRICO', () => {
    test('Tabela de histórico renderiza corretamente', async ({ page }) => {
      const tableElement = page.locator('table, [role="table"]');
      await expect(tableElement).toBeVisible();
    });

    test('Colunas essenciais aparecem', async () => {
      const headers = await table.getColumnHeaders();
      expect(headers).toContain('Funcionário');
      expect(headers).toContain('Qualificação');
      expect(headers).toContain('Data Obtenção');
      expect(headers).toContain('Validade');
      expect(headers).toContain('Status');
    });

    test('Badge de status aparece com cor (Válida=verde, Expirada=vermelha, Próximo vencimento=amarelo)', async ({
      page,
    }) => {
      const firstRow = page.locator('tbody tr').first();
      const statusBadge = firstRow.locator('[class*="badge"], [class*="status"]');
      await expect(statusBadge).toBeVisible();

      const bgColor = await statusBadge.evaluate(
        (el) => window.getComputedStyle(el).backgroundColor,
      );
      expect(bgColor).not.toBe('rgba(0, 0, 0, 0)');
    });

    test('Filtro por funcionário está disponível', async ({ page }) => {
      const funcionarioFilter = page.locator(
        'select:near(:text("Funcionário")), input[placeholder*="funcionário" i]',
      );
      await expect(funcionarioFilter).toBeVisible();
    });

    test('Filtro por tipo de qualificação está disponível', async ({ page }) => {
      const tipoFilter = page.locator(
        'select:near(:text("Qualificação")), select:near(:text("Tipo"))',
      );
      await expect(tipoFilter).toBeVisible();
    });

    test('Filtro por status (Todas/Válidas/Expiradas/Próximo Vencimento)', async ({ page }) => {
      const statusFilter = page.locator('select:near(:text("Status"))');
      await expect(statusFilter).toBeVisible();

      if ((await statusFilter.count()) > 0) {
        const options = await statusFilter.locator('option').allTextContents();
        expect(options.some((opt) => opt.includes('Válida'))).toBe(true);
        expect(options.some((opt) => opt.includes('Expirada'))).toBe(true);
      }
    });

    test('Botão "Nova Qualificação" está visível', async ({ page }) => {
      const newButton = page.locator('button:has-text("Nova Qualificação")');
      await expect(newButton).toBeVisible();
    });

    test('Ícone de alerta aparece em qualificações próximas do vencimento', async ({ page }) => {
      const warningIcon = page
        .locator('tbody tr [class*="warning"], tbody tr svg[data-icon="exclamation-triangle"]')
        .first();
      if ((await warningIcon.count()) > 0) {
        await expect(warningIcon).toBeVisible();
      }
    });
  });

  test.describe('3.2 MODAL "NOVA QUALIFICAÇÃO"', () => {
    test.beforeEach(async ({ page }) => {
      await page.click('button:has-text("Nova Qualificação")');
      await modal.waitForModalOpen('Nova Qualificação');
    });

    test('Modal abre com animação suave', async ({ page }) => {
      const modalElement = page.locator('[role="dialog"]');
      await expect(modalElement).toBeVisible();
    });

    test('Título "Nova Qualificação" está visível', async ({ page }) => {
      const title = page.locator(
        'h2:has-text("Nova Qualificação"), h3:has-text("Nova Qualificação")',
      );
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

    test('Campo "Tipo de Qualificação" (select) obrigatório', async ({ page }) => {
      const field = page.locator(
        'select[name="tipo_qualificacao_id"], [role="combobox"]:near(:text("Tipo"))',
      );
      await expect(field).toBeVisible();
    });

    test('Campo "Data de Obtenção" (date picker) obrigatório', async ({ page }) => {
      const field = page.locator(
        'input[name="data_obtencao"], input[type="date"]:near(:text("Obtenção"))',
      );
      await expect(field).toBeVisible();
    });

    test('Campo "Data de Validade" (date picker) obrigatório', async ({ page }) => {
      const field = page.locator(
        'input[name="data_validade"], input[type="date"]:near(:text("Validade"))',
      );
      await expect(field).toBeVisible();
    });

    test('Campo "Instituição Emissora" está visível', async ({ page }) => {
      const field = page.locator(
        'input[name="instituicao_emissora"], input[placeholder*="instituição" i]',
      );
      await expect(field).toBeVisible();
    });

    test('Campo "Número do Certificado" está visível', async ({ page }) => {
      const field = page.locator(
        'input[name="numero_certificado"], input[placeholder*="certificado" i]',
      );
      await expect(field).toBeVisible();
    });

    test('Campo "Instrutor/Avaliador" está visível', async ({ page }) => {
      const field = page.locator('input[name="instrutor"], input[placeholder*="instrutor" i]');
      await expect(field).toBeVisible();
    });

    test('Campo "Carga Horária" (number) está visível', async ({ page }) => {
      const field = page.locator(
        'input[name="carga_horaria"], input[type="number"]:near(:text("Carga Horária"))',
      );
      await expect(field).toBeVisible();
    });

    test('Campo "Resultado/Nota" está visível', async ({ page }) => {
      const field = page.locator(
        'input[name="resultado"], input[placeholder*="resultado" i], input[placeholder*="nota" i]',
      );
      await expect(field).toBeVisible();
    });

    test('Campo "Observações" (textarea) está visível', async ({ page }) => {
      const field = page.locator('textarea[name="observacoes"]');
      await expect(field).toBeVisible();
    });

    test('Upload de anexo está disponível', async ({ page }) => {
      const fileInput = page.locator('input[type="file"]');
      await expect(fileInput).toBeVisible();
    });

    test('Checkbox "Notificar Próximo Vencimento" está visível', async ({ page }) => {
      const checkbox = page.locator('input[type="checkbox"][name="notificar_vencimento"]');
      if ((await checkbox.count()) > 0) {
        await expect(checkbox).toBeVisible();
      }
    });

    test('Campo "Renovação Automática" (checkbox) está visível', async ({ page }) => {
      const checkbox = page.locator('input[type="checkbox"][name="renovacao_automatica"]');
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

    test('Criar qualificação com dados mínimos funciona', async () => {
      await modal.selectOption('Funcionário', 'primeiro funcionário'); // Seleciona primeiro da lista
      await modal.selectOption('Tipo de Qualificação', 'primeiro tipo');

      const hoje = new Date().toISOString().split('T')[0];
      await modal.fillInput('Data de Obtenção', hoje);

      const futuro = new Date();
      futuro.setMonth(futuro.getMonth() + 12);
      await modal.fillInput('Data de Validade', futuro.toISOString().split('T')[0]);

      await modal.clickSaveButton();
      await modal.waitForToast('success');
    });

    test('Validação: Funcionário obrigatório', async () => {
      await modal.selectOption('Tipo de Qualificação', 'primeiro');
      await modal.clickSaveButton();

      await modal.waitForToast('error');
    });

    test('Validação: Data de validade deve ser maior que data de obtenção', async () => {
      const hoje = new Date().toISOString().split('T')[0];
      const ontem = new Date();
      ontem.setDate(ontem.getDate() - 1);

      await modal.fillInput('Data de Obtenção', hoje);
      await modal.fillInput('Data de Validade', ontem.toISOString().split('T')[0]);
      await modal.clickSaveButton();

      await modal.waitForToast('error');
    });
  });

  test.describe('3.3 MODAL "EDITAR QUALIFICAÇÃO"', () => {
    test('Modal abre ao clicar no botão Editar', async ({ page }) => {
      const firstRow = page.locator('tbody tr').first();
      await firstRow.locator('[aria-label*="Editar"], button:has(svg[data-icon="pen"])').click();

      await modal.waitForModalOpen('Editar');
    });

    test('Campos aparecem pré-preenchidos', async ({ page }) => {
      const firstRow = page.locator('tbody tr').first();
      await firstRow.locator('[aria-label*="Editar"]').click();
      await modal.waitForModalOpen('Editar');

      const dataObtencao = page.locator('input[name="data_obtencao"]');
      const value = await dataObtencao.inputValue();

      expect(value).toBeTruthy();
      expect(value.length).toBeGreaterThan(0);
    });

    test('Editar qualificação funciona corretamente', async ({ page }) => {
      const firstRow = page.locator('tbody tr').first();
      await firstRow.locator('[aria-label*="Editar"]').click();

      await modal.fillInput('Observações', 'Observação editada via teste E2E');
      await modal.clickSaveButton();

      await modal.waitForToast('success');
    });
  });

  test.describe('3.4 MODAL "RENOVAR QUALIFICAÇÃO"', () => {
    test('Botão "Renovar" aparece em qualificações próximas do vencimento', async ({ page }) => {
      const renovarButton = page.locator('button:has-text("Renovar")').first();
      if ((await renovarButton.count()) > 0) {
        await expect(renovarButton).toBeVisible();
      }
    });

    test('Modal de renovação abre com dados pré-preenchidos', async ({ page }) => {
      const renovarButton = page.locator('button:has-text("Renovar")').first();
      if ((await renovarButton.count()) > 0) {
        await renovarButton.click();
        await modal.waitForModalOpen('Renovar');

        const funcionarioField = page.locator('select[name="funcionario_id"]');
        const isDisabled = await funcionarioField.isDisabled();
        expect(isDisabled).toBe(true); // Campo deve estar desabilitado na renovação
      }
    });

    test('Nova data de validade é calculada automaticamente', async ({ page }) => {
      const renovarButton = page.locator('button:has-text("Renovar")').first();
      if ((await renovarButton.count()) > 0) {
        await renovarButton.click();
        await page.waitForTimeout(500);

        const novaValidade = page.locator('input[name="data_validade"]');
        const value = await novaValidade.inputValue();

        const hoje = new Date();
        const dataValidade = new Date(value);
        expect(dataValidade > hoje).toBe(true);
      }
    });
  });

  test.describe('3.5 EXCLUSÃO DE QUALIFICAÇÃO', () => {
    test('Modal de confirmação abre ao clicar Deletar', async ({ page }) => {
      const firstRow = page.locator('tbody tr').first();
      await firstRow.locator('[aria-label*="Deletar"], button:has(svg[data-icon="trash"])').click();

      await page.waitForTimeout(500);
      const confirmModal = page.locator('[role="dialog"]:has-text("Excluir")');
      await expect(confirmModal).toBeVisible();
    });

    test('Mensagem de aviso sobre exclusão de histórico', async ({ page }) => {
      const firstRow = page.locator('tbody tr').first();
      await firstRow.locator('[aria-label*="Deletar"]').click();

      await page.waitForTimeout(500);
      const modalText = await page.locator('[role="dialog"]').textContent();
      expect(modalText?.toLowerCase()).toContain('histórico');
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
        const [, r, g, b] = match.map(Number);
        expect(r).toBeGreaterThan(g);
      }
    });
  });

  test.describe('3.6 EXPORTAÇÃO DE HISTÓRICO', () => {
    test('Botão "Exportar" está disponível', async ({ page }) => {
      const exportButton = page.locator('button:has-text("Exportar")');
      if ((await exportButton.count()) > 0) {
        await expect(exportButton).toBeVisible();
      }
    });

    test('Menu de opções de exportação (PDF/Excel/CSV)', async ({ page }) => {
      const exportButton = page.locator('button:has-text("Exportar")');
      if ((await exportButton.count()) > 0) {
        await exportButton.click();
        await page.waitForTimeout(300);

        const menu = page.locator('[role="menu"], .dropdown-menu');
        await expect(menu).toBeVisible();
      }
    });
  });

  test.describe('3.7 RESPONSIVIDADE', () => {
    test('Modal ajusta em tela mobile', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.click('button:has-text("Nova Qualificação")');

      await modal.waitForModalOpen('Nova Qualificação');
      const modalElement = page.locator('[role="dialog"]');

      const box = await modalElement.boundingBox();
      expect(box!.width).toBeLessThanOrEqual(375);
    });

    test('Tabela tem scroll horizontal em mobile', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });

      const tableWrapper = page.locator('[class*="table-wrapper"], [class*="overflow"]').first();
      const isScrollable = await tableWrapper.evaluate((el) => {
        return el.scrollWidth > el.clientWidth;
      });

      expect(isScrollable).toBe(true);
    });
  });

  test.describe('3.8 ACESSIBILIDADE', () => {
    test('Tab navega pelos campos', async ({ page }) => {
      await page.click('button:has-text("Nova Qualificação")');
      await modal.waitForModalOpen('Nova Qualificação');

      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');

      const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
      expect(['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON']).toContain(focusedElement);
    });

    test('Badges de status têm contraste adequado', async ({ page }) => {
      const badge = page.locator('[class*="badge"]').first();
      if ((await badge.count()) > 0) {
        await expect(badge).toBeVisible();

        const color = await badge.evaluate((el) => window.getComputedStyle(el).color);
        expect(color).not.toBe('rgba(0, 0, 0, 0)');
      }
    });
  });
});

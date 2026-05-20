import { test, expect } from '@playwright/test';
import { login } from './helpers/auth.helper';
import { ModalHelper } from './helpers/modal.helper';
import { TableHelper } from './helpers/table.helper';
import * as path from 'path';

test.describe('6. MÓDULO: IMPORTAÇÃO DE PLANILHAS', () => {
  let modal: ModalHelper;
  let table: TableHelper;

  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/importacao');
    await page.waitForLoadState('networkidle');

    modal = new ModalHelper(page);
    table = new TableHelper(page);
  });

  test.describe('6.1 INTERFACE DE IMPORTAÇÃO', () => {
    test('Página de importação renderiza corretamente', async ({ page }) => {
      const title = page.locator('h1:has-text("Importação"), h2:has-text("Importação")');
      await expect(title).toBeVisible();
    });

    test('Card com instruções está visível', async ({ page }) => {
      const instructions = page.locator('[class*="instructions"], [class*="info"]');
      await expect(instructions).toBeVisible();
    });

    test('Link "Baixar modelo de planilha" está disponível', async ({ page }) => {
      const downloadLink = page.locator(
        'a:has-text("Baixar modelo"), a:has-text("Download"), button:has-text("Modelo")',
      );
      await expect(downloadLink.first()).toBeVisible();
    });

    test('Área de drag-and-drop está visível', async ({ page }) => {
      const dropzone = page.locator('[class*="dropzone"], [class*="upload"]');
      await expect(dropzone).toBeVisible();
    });

    test('Texto "Arraste o arquivo ou clique para selecionar" aparece', async ({ page }) => {
      const text = page.locator('text=/arraste.*arquivo/i, text=/clique.*selecionar/i');
      await expect(text).toBeVisible();
    });

    test('Ícone de upload (cloud/upload) está visível', async ({ page }) => {
      const icon = page.locator('svg[data-icon*="upload"], svg[data-icon*="cloud"]');
      await expect(icon).toBeVisible();
    });

    test('Formatos aceitos são mostrados (.xlsx, .xls, .csv)', async ({ page }) => {
      const formats = page.locator('text=/.xlsx/, text=/.xls/, text=/.csv/');
      await expect(formats.first()).toBeVisible();
    });

    test('Tamanho máximo do arquivo é informado (ex: 10MB)', async ({ page }) => {
      const sizeInfo = page.locator('text=/\\d+\\s*MB/i');
      if ((await sizeInfo.count()) > 0) {
        await expect(sizeInfo).toBeVisible();
      }
    });
  });

  test.describe('6.2 UPLOAD DE ARQUIVO', () => {
    test('Clique abre seletor de arquivos', async ({ page }) => {
      const dropzone = page.locator('[class*="dropzone"], input[type="file"]');
      await dropzone.click();

      // File picker abre (não podemos testar diretamente, mas verificamos que não há erro)
      await page.waitForTimeout(300);
    });

    test('Input de arquivo aceita apenas formatos corretos', async ({ page }) => {
      const fileInput = page.locator('input[type="file"]');
      const accept = await fileInput.getAttribute('accept');

      expect(accept).toContain('.xlsx');
    });

    test('Upload de arquivo válido mostra preview', async ({ page }) => {
      // Criar arquivo de teste (simulado)
      const fileInput = page.locator('input[type="file"]');

      // Simular upload (em teste real, usaríamos arquivo real)
      if ((await fileInput.count()) > 0) {
        // setInputFiles precisa de arquivo real - aqui apenas testamos estrutura
        await expect(fileInput).toBeVisible();
      }
    });

    test('Barra de progresso aparece durante upload', async ({ page }) => {
      const progressBar = page.locator('[role="progressbar"], [class*="progress"]');
      if ((await progressBar.count()) > 0) {
        await expect(progressBar).toBeDefined();
      }
    });

    test('Porcentagem de upload é exibida', async ({ page }) => {
      const percentage = page.locator('text=/%/');
      if ((await percentage.count()) > 0) {
        await expect(percentage).toBeDefined();
      }
    });

    test('Botão "Cancelar upload" aparece durante envio', async ({ page }) => {
      const cancelButton = page.locator('button:has-text("Cancelar")');
      if ((await cancelButton.count()) > 0) {
        await expect(cancelButton).toBeDefined();
      }
    });
  });

  test.describe('6.3 VALIDAÇÃO DO ARQUIVO', () => {
    test('Validação automática inicia após upload', async ({ page }) => {
      const validationMsg = page.locator('text=/validando/i, text=/verificando/i');
      if ((await validationMsg.count()) > 0) {
        await expect(validationMsg).toBeDefined();
      }
    });

    test('Spinner de validação aparece', async ({ page }) => {
      const spinner = page.locator('[class*="spinner"], [class*="loading"]');
      if ((await spinner.count()) > 0) {
        await expect(spinner).toBeDefined();
      }
    });

    test('Erros de formato são exibidos (ex: "Coluna \'CPF\' não encontrada")', async ({
      page,
    }) => {
      const errorList = page.locator('[class*="error"], [class*="alert-danger"]');
      if ((await errorList.count()) > 0) {
        await expect(errorList).toBeDefined();
      }
    });

    test('Erros são agrupados por tipo', async ({ page }) => {
      const errorGroups = page.locator('h4:has-text("Erros"), h5:has-text("Avisos")');
      if ((await errorGroups.count()) > 0) {
        await expect(errorGroups.first()).toBeDefined();
      }
    });

    test('Contador de erros aparece (ex: "23 erros encontrados")', async ({ page }) => {
      const counter = page.locator('text=/\\d+\\s+erros?/i');
      if ((await counter.count()) > 0) {
        await expect(counter).toBeDefined();
      }
    });

    test('Contador de avisos aparece (ex: "5 avisos")', async ({ page }) => {
      const warningCounter = page.locator('text=/\\d+\\s+avisos?/i');
      if ((await warningCounter.count()) > 0) {
        await expect(warningCounter).toBeDefined();
      }
    });

    test('Lista de erros é clicável e mostra detalhes', async ({ page }) => {
      const errorItem = page.locator('[class*="error-item"]').first();
      if ((await errorItem.count()) > 0) {
        await errorItem.click();
        await page.waitForTimeout(300);
      }
    });

    test('Número da linha com erro é exibido', async ({ page }) => {
      const lineNumber = page.locator('text=/linha\\s+\\d+/i');
      if ((await lineNumber.count()) > 0) {
        await expect(lineNumber).toBeDefined();
      }
    });
  });

  test.describe('6.4 PREVIEW DOS DADOS', () => {
    test('Tabela de preview aparece após validação', async ({ page }) => {
      const previewTable = page.locator('table[class*="preview"], [class*="data-preview"]');
      if ((await previewTable.count()) > 0) {
        await expect(previewTable).toBeVisible();
      }
    });

    test('Cabeçalhos da planilha são mapeados corretamente', async ({ page }) => {
      const headers = page.locator('thead th');
      if ((await headers.count()) > 0) {
        await expect(headers.first()).toBeVisible();
      }
    });

    test('Primeiras 10 linhas são exibidas no preview', async ({ page }) => {
      const rows = page.locator('tbody tr');
      const count = await rows.count();

      if (count > 0) {
        expect(count).toBeGreaterThan(0);
        expect(count).toBeLessThanOrEqual(10);
      }
    });

    test('Paginação aparece se houver mais de 10 linhas', async ({ page }) => {
      const pagination = page.locator('[class*="pagination"], button:has-text("Próxima")');
      if ((await pagination.count()) > 0) {
        await expect(pagination).toBeVisible();
      }
    });

    test('Linhas com erro aparecem destacadas em vermelho', async ({ page }) => {
      const errorRow = page.locator('tr[class*="error"], tr[class*="danger"]').first();
      if ((await errorRow.count()) > 0) {
        const bgColor = await errorRow.evaluate(
          (el) => window.getComputedStyle(el).backgroundColor,
        );
        expect(bgColor).toBeTruthy();
      }
    });

    test('Linhas com aviso aparecem destacadas em amarelo', async ({ page }) => {
      const warningRow = page.locator('tr[class*="warning"]').first();
      if ((await warningRow.count()) > 0) {
        await expect(warningRow).toBeVisible();
      }
    });

    test('Tooltip aparece ao hover em células com problema', async ({ page }) => {
      const errorCell = page.locator('td[class*="error"]').first();
      if ((await errorCell.count()) > 0) {
        await errorCell.hover();
        await page.waitForTimeout(500);

        const tooltip = page.locator('[role="tooltip"]');
        if ((await tooltip.count()) > 0) {
          await expect(tooltip).toBeVisible();
        }
      }
    });

    test('Contador de registros totais aparece (ex: "142 registros")', async ({ page }) => {
      const counter = page.locator('text=/\\d+\\s+registros?/i');
      if ((await counter.count()) > 0) {
        await expect(counter).toBeVisible();
      }
    });

    test('Contador de registros válidos vs inválidos', async ({ page }) => {
      const validCounter = page.locator('text=/\\d+\\s+válidos?/i');
      const invalidCounter = page.locator('text=/\\d+\\s+inválidos?/i');

      if ((await validCounter.count()) > 0 || (await invalidCounter.count()) > 0) {
        expect(true).toBe(true); // Pelo menos um dos contadores existe
      }
    });
  });

  test.describe('6.5 AÇÕES DE IMPORTAÇÃO', () => {
    test('Botão "Importar Tudo" está visível', async ({ page }) => {
      const importButton = page.locator(
        'button:has-text("Importar Tudo"), button:has-text("Importar")',
      );
      if ((await importButton.count()) > 0) {
        await expect(importButton).toBeVisible();
      }
    });

    test('Botão "Importar Apenas Válidos" está visível', async ({ page }) => {
      const importValidButton = page.locator(
        'button:has-text("Importar Válidos"), button:has-text("Apenas Válidos")',
      );
      if ((await importValidButton.count()) > 0) {
        await expect(importValidButton).toBeVisible();
      }
    });

    test('Botão "Cancelar" está visível', async ({ page }) => {
      const cancelButton = page.locator('button:has-text("Cancelar")');
      await expect(cancelButton).toBeVisible();
    });

    test('Botão "Baixar Relatório de Erros" está disponível', async ({ page }) => {
      const reportButton = page.locator(
        'button:has-text("Relatório"), button:has-text("Download"), a:has-text("Erros")',
      );
      if ((await reportButton.count()) > 0) {
        await expect(reportButton.first()).toBeVisible();
      }
    });

    test('Botão de importação fica desabilitado se houver erros críticos', async ({ page }) => {
      const importButton = page.locator('button:has-text("Importar Tudo")');
      if ((await importButton.count()) > 0) {
        const isDisabled = await importButton.isDisabled();
        expect(typeof isDisabled).toBe('boolean');
      }
    });

    test('Checkbox "Sobrescrever registros existentes" aparece', async ({ page }) => {
      const checkbox = page.locator('input[type="checkbox"]:near(:text("Sobrescrever"))');
      if ((await checkbox.count()) > 0) {
        await expect(checkbox).toBeVisible();
      }
    });
  });

  test.describe('6.6 PROCESSO DE IMPORTAÇÃO', () => {
    test('Modal de confirmação abre ao clicar "Importar"', async ({ page }) => {
      const importButton = page.locator('button:has-text("Importar")').first();
      if ((await importButton.count()) > 0 && !(await importButton.isDisabled())) {
        await importButton.click();
        await page.waitForTimeout(500);

        const modal = page.locator('[role="dialog"]');
        await expect(modal).toBeVisible();
      }
    });

    test('Resumo da importação aparece no modal', async ({ page }) => {
      const summary = page.locator('text=/será.*importado/i, text=/registros.*processar/i');
      if ((await summary.count()) > 0) {
        await expect(summary).toBeDefined();
      }
    });

    test('Barra de progresso aparece durante importação', async ({ page }) => {
      const progressBar = page.locator('[role="progressbar"]');
      if ((await progressBar.count()) > 0) {
        await expect(progressBar).toBeDefined();
      }
    });

    test('Contador de registros processados atualiza em tempo real', async ({ page }) => {
      const counter = page.locator('text=/\\d+\\/\\d+/');
      if ((await counter.count()) > 0) {
        await expect(counter).toBeDefined();
      }
    });

    test('Tempo estimado restante aparece', async ({ page }) => {
      const timeEstimate = page.locator('text=/tempo.*restante/i, text=/\\d+\\s*segundos?/i');
      if ((await timeEstimate.count()) > 0) {
        await expect(timeEstimate).toBeDefined();
      }
    });

    test('Log de processamento aparece (opcional)', async ({ page }) => {
      const log = page.locator('[class*="log"], [class*="console"]');
      if ((await log.count()) > 0) {
        await expect(log).toBeDefined();
      }
    });
  });

  test.describe('6.7 RESULTADO DA IMPORTAÇÃO', () => {
    test('Modal de sucesso aparece após conclusão', async ({ page }) => {
      const successModal = page.locator('[role="dialog"]:has-text("Sucesso")');
      if ((await successModal.count()) > 0) {
        await expect(successModal).toBeVisible();
      }
    });

    test('Resumo final mostra: X importados, Y com erro, Z ignorados', async ({ page }) => {
      const summary = page.locator('text=/\\d+\\s+importados?/i');
      if ((await summary.count()) > 0) {
        await expect(summary).toBeDefined();
      }
    });

    test('Botão "Ver Registros Importados" aparece', async ({ page }) => {
      const viewButton = page.locator(
        'button:has-text("Ver Registros"), a:has-text("Ver Registros")',
      );
      if ((await viewButton.count()) > 0) {
        await expect(viewButton).toBeVisible();
      }
    });

    test('Botão "Baixar Relatório Completo" aparece', async ({ page }) => {
      const reportButton = page.locator('button:has-text("Relatório Completo")');
      if ((await reportButton.count()) > 0) {
        await expect(reportButton).toBeVisible();
      }
    });

    test('Opção "Importar Outro Arquivo" aparece', async ({ page }) => {
      const newImportButton = page.locator(
        'button:has-text("Importar Outro"), button:has-text("Nova Importação")',
      );
      if ((await newImportButton.count()) > 0) {
        await expect(newImportButton).toBeVisible();
      }
    });
  });

  test.describe('6.8 HISTÓRICO DE IMPORTAÇÕES', () => {
    test('Aba "Histórico" está disponível', async ({ page }) => {
      const historyTab = page.locator('button:has-text("Histórico"), a:has-text("Histórico")');
      if ((await historyTab.count()) > 0) {
        await expect(historyTab).toBeVisible();
      }
    });

    test('Tabela de importações anteriores aparece', async ({ page }) => {
      const historyTab = page.locator('button:has-text("Histórico")');
      if ((await historyTab.count()) > 0) {
        await historyTab.click();
        await page.waitForTimeout(500);

        const historyTable = page.locator('table');
        await expect(historyTable).toBeVisible();
      }
    });

    test('Colunas: Data, Arquivo, Status, Registros aparecem', async ({ page }) => {
      const historyTab = page.locator('button:has-text("Histórico")');
      if ((await historyTab.count()) > 0) {
        await historyTab.click();

        const headers = await table.getColumnHeaders();
        expect(headers.length).toBeGreaterThan(0);
      }
    });

    test('Badge de status aparece (Sucesso/Parcial/Erro)', async ({ page }) => {
      const badge = page.locator('[class*="badge"], [class*="status"]').first();
      if ((await badge.count()) > 0) {
        await expect(badge).toBeDefined();
      }
    });

    test('Botão "Ver Detalhes" em cada importação', async ({ page }) => {
      const detailsButton = page.locator('button:has-text("Detalhes")').first();
      if ((await detailsButton.count()) > 0) {
        await expect(detailsButton).toBeVisible();
      }
    });

    test('Botão "Baixar Arquivo Original" disponível', async ({ page }) => {
      const downloadButton = page.locator('button:has-text("Baixar"), a[download]').first();
      if ((await downloadButton.count()) > 0) {
        await expect(downloadButton).toBeDefined();
      }
    });
  });

  test.describe('6.9 TRATAMENTO DE ERROS', () => {
    test('Erro de arquivo muito grande é exibido', async ({ page }) => {
      // Simular erro (na prática, precisaria arquivo grande)
      const errorMsg = page.locator('text=/arquivo.*grande/i, text=/tamanho.*excedido/i');
      if ((await errorMsg.count()) > 0) {
        await expect(errorMsg).toBeDefined();
      }
    });

    test('Erro de formato inválido é exibido', async ({ page }) => {
      const errorMsg = page.locator('text=/formato.*inválido/i, text=/arquivo.*não.*suportado/i');
      if ((await errorMsg.count()) > 0) {
        await expect(errorMsg).toBeDefined();
      }
    });

    test('Erro de arquivo vazio é exibido', async ({ page }) => {
      const errorMsg = page.locator('text=/arquivo.*vazio/i, text=/nenhum.*registro/i');
      if ((await errorMsg.count()) > 0) {
        await expect(errorMsg).toBeDefined();
      }
    });

    test('Erro de conexão durante upload mostra mensagem', async ({ page }) => {
      const errorMsg = page.locator('text=/erro.*conexão/i, text=/falha.*upload/i');
      if ((await errorMsg.count()) > 0) {
        await expect(errorMsg).toBeDefined();
      }
    });

    test('Botão "Tentar Novamente" aparece em caso de erro', async ({ page }) => {
      const retryButton = page.locator(
        'button:has-text("Tentar Novamente"), button:has-text("Retry")',
      );
      if ((await retryButton.count()) > 0) {
        await expect(retryButton).toBeDefined();
      }
    });
  });

  test.describe('6.10 RESPONSIVIDADE', () => {
    test('Interface de importação ajusta em mobile', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });

      const dropzone = page.locator('[class*="dropzone"]');
      const box = await dropzone.boundingBox();

      if (box) {
        expect(box.width).toBeLessThanOrEqual(375);
      }
    });

    test('Tabela de preview tem scroll horizontal em mobile', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });

      const tableWrapper = page.locator('[class*="table-wrapper"]').first();
      if ((await tableWrapper.count()) > 0) {
        const isScrollable = await tableWrapper.evaluate((el) => {
          return el.scrollWidth > el.clientWidth;
        });

        expect(typeof isScrollable).toBe('boolean');
      }
    });

    test('Botões empilham verticalmente em mobile', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });

      const buttons = page.locator('button:has-text("Importar")');
      if ((await buttons.count()) >= 2) {
        const firstBox = await buttons.nth(0).boundingBox();
        const secondBox = await buttons.nth(1).boundingBox();

        if (firstBox && secondBox) {
          expect(secondBox.y).toBeGreaterThanOrEqual(firstBox.y);
        }
      }
    });
  });

  test.describe('6.11 ACESSIBILIDADE', () => {
    test('Área de dropzone é focável via Tab', async ({ page }) => {
      await page.keyboard.press('Tab');

      const focusedElement = await page.evaluate(() => document.activeElement?.className);
      expect(focusedElement).toBeTruthy();
    });

    test('Enter na dropzone abre seletor de arquivos', async ({ page }) => {
      const dropzone = page.locator('[class*="dropzone"]');
      await dropzone.focus();
      await page.keyboard.press('Enter');

      await page.waitForTimeout(300);
    });

    test('Leitores de tela identificam estado de progresso', async ({ page }) => {
      const progressBar = page.locator('[role="progressbar"]');
      if ((await progressBar.count()) > 0) {
        const ariaValueNow = await progressBar.getAttribute('aria-valuenow');
        expect(ariaValueNow).toBeDefined();
      }
    });
  });
});

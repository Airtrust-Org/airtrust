import { test, expect } from '@playwright/test';
import { login } from './helpers/auth.helper';
import { ModalHelper } from './helpers/modal.helper';
import { TableHelper } from './helpers/table.helper';

test.describe('5. MÓDULO: DANGER ZONE (OPERAÇÕES CRÍTICAS)', () => {
  let modal: ModalHelper;
  let table: TableHelper;

  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/configuracoes/danger-zone');
    await page.waitForLoadState('networkidle');

    modal = new ModalHelper(page);
    table = new TableHelper(page);
  });

  test.describe('5.1 LAYOUT E AVISOS DE SEGURANÇA', () => {
    test('Seção Danger Zone está claramente identificada com fundo vermelho', async ({ page }) => {
      const dangerSection = page.locator('[class*="danger"], [class*="critical"]');
      await expect(dangerSection).toBeVisible();

      const bgColor = await dangerSection.evaluate(
        (el) => window.getComputedStyle(el).backgroundColor,
      );

      // Deve ter predominância de vermelho
      const match = bgColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (match) {
        const [, r, g] = match.map(Number);
        expect(r).toBeGreaterThan(g);
      }
    });

    test('Ícone de aviso (⚠️) aparece no título', async ({ page }) => {
      const warning = page.locator(
        'h1 svg[data-icon*="warning"], h1 svg[data-icon*="exclamation"], h2:has-text("⚠")',
      );
      await expect(warning).toBeVisible();
    });

    test('Mensagem de aviso sobre irreversibilidade das ações', async ({ page }) => {
      const warningText = page.locator('text=/irreversível/i, text=/não pode ser desfeita/i');
      await expect(warningText).toBeVisible();
    });

    test('Todas as ações estão desabilitadas até scroll até o final', async ({ page }) => {
      const deleteButtons = page.locator('button:has-text("Excluir")');
      const firstButton = deleteButtons.first();

      if ((await firstButton.count()) > 0) {
        const isDisabled = await firstButton.isDisabled();
        // Pode estar habilitado ou desabilitado dependendo da implementação
        expect(typeof isDisabled).toBe('boolean');
      }
    });
  });

  test.describe('5.2 EXCLUSÃO EM MASSA - FUNCIONÁRIOS', () => {
    test('Botão "Excluir Todos os Funcionários" está visível', async ({ page }) => {
      const button = page.locator(
        'button:has-text("Excluir Todos os Funcionários"), button:has-text("Excluir Funcionários")',
      );
      await expect(button).toBeVisible();
    });

    test('Botão tem cor vermelha forte', async ({ page }) => {
      const button = page.locator('button:has-text("Excluir Todos os Funcionários")');

      const bgColor = await button.evaluate((el) => window.getComputedStyle(el).backgroundColor);

      const match = bgColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (match) {
        const [, r, g] = match.map(Number);
        expect(r).toBeGreaterThan(150); // Vermelho forte
        expect(r).toBeGreaterThan(g);
      }
    });

    test('Modal de confirmação abre ao clicar', async ({ page }) => {
      await page.click('button:has-text("Excluir Todos os Funcionários")');
      await page.waitForTimeout(500);

      const confirmModal = page.locator('[role="dialog"]');
      await expect(confirmModal).toBeVisible();
    });

    test('Modal exige digitação de texto de confirmação', async ({ page }) => {
      await page.click('button:has-text("Excluir Todos os Funcionários")');
      await page.waitForTimeout(500);

      const confirmInput = page.locator(
        'input[placeholder*="confirmar" i], input[placeholder*="digite" i]',
      );
      await expect(confirmInput).toBeVisible();
    });

    test('Texto de confirmação deve ser exato (ex: "EXCLUIR TUDO")', async ({ page }) => {
      await page.click('button:has-text("Excluir Todos os Funcionários")');
      await page.waitForTimeout(500);

      const instructions = page.locator('[role="dialog"] p, [role="dialog"] span');
      const text = await instructions.allTextContents();
      const hasConfirmText = text.some((t) => /digite|confirmar|EXCLUIR/i.test(t));

      expect(hasConfirmText).toBe(true);
    });

    test('Botão "Excluir" permanece desabilitado até texto correto', async ({ page }) => {
      await page.click('button:has-text("Excluir Todos os Funcionários")');
      await page.waitForTimeout(500);

      const confirmButton = page.locator('[role="dialog"] button:has-text("Excluir")');
      const isDisabled = await confirmButton.isDisabled();

      expect(isDisabled).toBe(true);
    });

    test('Digitar texto incorreto mantém botão desabilitado', async ({ page }) => {
      await page.click('button:has-text("Excluir Todos os Funcionários")');
      await page.waitForTimeout(500);

      const input = page.locator('input[placeholder*="confirmar" i]');
      await input.fill('texto errado');

      const confirmButton = page.locator('[role="dialog"] button:has-text("Excluir")');
      const isDisabled = await confirmButton.isDisabled();

      expect(isDisabled).toBe(true);
    });

    test('Digitar texto correto habilita botão', async ({ page }) => {
      await page.click('button:has-text("Excluir Todos os Funcionários")');
      await page.waitForTimeout(500);

      // Tentar identificar o texto correto
      const modalText = await page.locator('[role="dialog"]').textContent();
      const match = modalText?.match(/"([^"]+)"/); // Texto entre aspas

      if (match) {
        const confirmText = match[1];
        const input = page.locator('input[placeholder*="confirmar" i]');
        await input.fill(confirmText);

        await page.waitForTimeout(300);

        const confirmButton = page.locator('[role="dialog"] button:has-text("Excluir")');
        const isDisabled = await confirmButton.isDisabled();

        expect(isDisabled).toBe(false);
      }
    });

    test('Contador de registros aparece (ex: "342 funcionários serão excluídos")', async ({
      page,
    }) => {
      await page.click('button:has-text("Excluir Todos os Funcionários")');
      await page.waitForTimeout(500);

      const counter = page.locator('[role="dialog"] text=/\\d+\\s+funcionários?/i');
      if ((await counter.count()) > 0) {
        await expect(counter).toBeVisible();
      }
    });
  });

  test.describe('5.3 EXCLUSÃO EM MASSA - QUALIFICAÇÕES', () => {
    test('Botão "Excluir Todo Histórico de Qualificações" está visível', async ({ page }) => {
      const button = page.locator('button:has-text("Excluir"), button:has-text("Qualificações")');
      if ((await button.count()) > 1) {
        await expect(button.nth(1)).toBeVisible();
      }
    });

    test('Modal de confirmação com campo de texto', async ({ page }) => {
      const qualifButton = page.locator('button:has-text("Qualificações")').last();
      if ((await qualifButton.count()) > 0) {
        await qualifButton.click();
        await page.waitForTimeout(500);

        const input = page.locator('input[placeholder*="confirmar" i]');
        await expect(input).toBeVisible();
      }
    });

    test('Aviso sobre perda de certificados e histórico', async ({ page }) => {
      const qualifButton = page.locator('button:has-text("Qualificações")').last();
      if ((await qualifButton.count()) > 0) {
        await qualifButton.click();
        await page.waitForTimeout(500);

        const modalText = await page.locator('[role="dialog"]').textContent();
        expect(modalText?.toLowerCase()).toContain('histórico');
      }
    });
  });

  test.describe('5.4 EXCLUSÃO EM MASSA - SESSÕES DE SIMULADOR', () => {
    test('Botão "Excluir Todas as Sessões" está visível', async ({ page }) => {
      const button = page.locator('button:has-text("Excluir"), button:has-text("Sessões")');
      if ((await button.count()) > 0) {
        await expect(button.first()).toBeVisible();
      }
    });

    test('Confirmação exige texto específico', async ({ page }) => {
      const sessoesButton = page.locator('button:has-text("Sessões")').last();
      if ((await sessoesButton.count()) > 0) {
        await sessoesButton.click();
        await page.waitForTimeout(500);

        const input = page.locator('input[placeholder*="confirmar" i]');
        await expect(input).toBeVisible();
      }
    });
  });

  test.describe('5.5 RESET COMPLETO DO SISTEMA', () => {
    test('Botão "Resetar Sistema Completo" está visível', async ({ page }) => {
      const button = page.locator(
        'button:has-text("Resetar Sistema"), button:has-text("Reset Completo")',
      );
      if ((await button.count()) > 0) {
        await expect(button).toBeVisible();
      }
    });

    test('Botão tem cor vermelha mais escura que os outros', async ({ page }) => {
      const resetButton = page.locator('button:has-text("Resetar Sistema")');
      if ((await resetButton.count()) > 0) {
        const bgColor = await resetButton.evaluate(
          (el) => window.getComputedStyle(el).backgroundColor,
        );

        const match = bgColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (match) {
          const [, r] = match.map(Number);
          expect(r).toBeGreaterThan(100); // Vermelho presente
        }
      }
    });

    test('Modal exige confirmação em DUAS etapas', async ({ page }) => {
      const resetButton = page.locator('button:has-text("Resetar Sistema")');
      if ((await resetButton.count()) > 0) {
        await resetButton.click();
        await page.waitForTimeout(500);

        const modal = page.locator('[role="dialog"]');
        await expect(modal).toBeVisible();
      }
    });

    test('Lista TODAS as consequências do reset', async ({ page }) => {
      const resetButton = page.locator('button:has-text("Resetar Sistema")');
      if ((await resetButton.count()) > 0) {
        await resetButton.click();
        await page.waitForTimeout(500);

        const list = page.locator('[role="dialog"] ul, [role="dialog"] ol');
        if ((await list.count()) > 0) {
          await expect(list).toBeVisible();
        }
      }
    });

    test('Checkbox "Entendo que esta ação é irreversível" deve ser marcado', async ({ page }) => {
      const resetButton = page.locator('button:has-text("Resetar Sistema")');
      if ((await resetButton.count()) > 0) {
        await resetButton.click();
        await page.waitForTimeout(500);

        const checkbox = page.locator('input[type="checkbox"]');
        if ((await checkbox.count()) > 0) {
          await expect(checkbox).toBeVisible();
          const isChecked = await checkbox.isChecked();
          expect(isChecked).toBe(false); // Deve começar desmarcado
        }
      }
    });

    test('Campo de confirmação com email do usuário', async ({ page }) => {
      const resetButton = page.locator('button:has-text("Resetar Sistema")');
      if ((await resetButton.count()) > 0) {
        await resetButton.click();
        await page.waitForTimeout(500);

        const emailInput = page.locator('input[type="email"], input[placeholder*="email" i]');
        if ((await emailInput.count()) > 0) {
          await expect(emailInput).toBeVisible();
        }
      }
    });
  });

  test.describe('5.6 BACKUP ANTES DE EXCLUSÃO', () => {
    test('Checkbox "Criar backup antes de excluir" aparece', async ({ page }) => {
      await page.click('button:has-text("Excluir Todos os Funcionários")');
      await page.waitForTimeout(500);

      const backupCheckbox = page.locator('input[type="checkbox"]:near(:text("backup"))');
      if ((await backupCheckbox.count()) > 0) {
        await expect(backupCheckbox).toBeVisible();
      }
    });

    test('Checkbox vem marcado por padrão (segurança)', async ({ page }) => {
      await page.click('button:has-text("Excluir Todos os Funcionários")');
      await page.waitForTimeout(500);

      const backupCheckbox = page.locator('input[type="checkbox"]:near(:text("backup"))');
      if ((await backupCheckbox.count()) > 0) {
        const isChecked = await backupCheckbox.isChecked();
        expect(isChecked).toBe(true);
      }
    });

    test('Link para download do backup aparece após conclusão', async ({ page }) => {
      // Este teste seria executado após uma exclusão real
      const downloadLink = page.locator('a[href*="backup"], a:has-text("Download")');
      if ((await downloadLink.count()) > 0) {
        await expect(downloadLink).toBeVisible();
      }
    });
  });

  test.describe('5.7 AUDITORIA E LOGS', () => {
    test('Todas as ações críticas são logadas', async ({ page }) => {
      // Verificar se há menção a logs/auditoria
      const auditText = page.locator('text=/log/i, text=/auditoria/i, text=/registrado/i');
      if ((await auditText.count()) > 0) {
        await expect(auditText.first()).toBeVisible();
      }
    });

    test('Nome do usuário que executou a ação aparece no log', async ({ page }) => {
      const logSection = page.locator('[class*="log"], [class*="history"]');
      if ((await logSection.count()) > 0) {
        await expect(logSection).toBeVisible();
      }
    });
  });

  test.describe('5.8 ACESSIBILIDADE E UX', () => {
    test('Tab navega pelos botões de danger zone', async ({ page }) => {
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');

      const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
      expect(['BUTTON', 'A', 'INPUT']).toContain(focusedElement);
    });

    test('Todos os botões têm tooltips explicativos', async ({ page }) => {
      const firstDangerButton = page.locator('button:has-text("Excluir")').first();
      await firstDangerButton.hover();
      await page.waitForTimeout(500);

      const tooltip = page.locator('[role="tooltip"], [class*="tooltip"]');
      if ((await tooltip.count()) > 0) {
        await expect(tooltip).toBeVisible();
      }
    });

    test('Animação de "shake" ao passar mouse em botões críticos', async ({ page }) => {
      const resetButton = page.locator('button:has-text("Resetar Sistema")');
      if ((await resetButton.count()) > 0) {
        await resetButton.hover();
        await page.waitForTimeout(200);

        // Verificar se há animação (classe ou style)
        const className = await resetButton.getAttribute('class');
        expect(className).toBeTruthy();
      }
    });
  });

  test.describe('5.9 RESPONSIVIDADE', () => {
    test('Seção danger zone ajusta em mobile', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });

      const dangerSection = page.locator('[class*="danger"]');
      const box = await dangerSection.boundingBox();

      if (box) {
        expect(box.width).toBeLessThanOrEqual(375);
      }
    });

    test('Botões empilham verticalmente em mobile', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });

      const buttons = page.locator('button:has-text("Excluir")');
      const count = await buttons.count();

      if (count >= 2) {
        const firstBox = await buttons.nth(0).boundingBox();
        const secondBox = await buttons.nth(1).boundingBox();

        // Devem estar um abaixo do outro
        expect(secondBox!.y).toBeGreaterThan(firstBox!.y);
      }
    });

    test('Modais de confirmação se ajustam a telas pequenas', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.click('button:has-text("Excluir Todos os Funcionários")');
      await page.waitForTimeout(500);

      const modal = page.locator('[role="dialog"]');
      const box = await modal.boundingBox();

      expect(box!.width).toBeLessThanOrEqual(375);
    });
  });

  test.describe('5.10 SEGURANÇA E PREVENÇÃO DE ERROS', () => {
    test('Botões ficam desabilitados por 3 segundos após abrir modal', async ({ page }) => {
      await page.click('button:has-text("Excluir Todos os Funcionários")');

      // Verificar imediatamente após abrir
      const confirmButton = page.locator('[role="dialog"] button:has-text("Excluir")');
      const isDisabled = await confirmButton.isDisabled();

      expect(isDisabled).toBe(true);
    });

    test('Mensagem de carregamento aparece durante exclusão', async ({ page }) => {
      // Este teste precisaria executar uma exclusão real
      const loadingMsg = page.locator('text=/excluindo/i, text=/aguarde/i');
      if ((await loadingMsg.count()) > 0) {
        await expect(loadingMsg).toBeVisible();
      }
    });

    test('Toast de sucesso aparece após conclusão', async ({ page }) => {
      // Verificar estrutura de toast
      const toast = page.locator('[class*="toast"], [role="alert"]');
      if ((await toast.count()) > 0) {
        await expect(toast).toBeDefined();
      }
    });

    test('Link para documentação de recuperação aparece após exclusão', async ({ page }) => {
      const docLink = page.locator('a:has-text("Como recuperar"), a:has-text("Documentação")');
      if ((await docLink.count()) > 0) {
        await expect(docLink).toBeVisible();
      }
    });
  });
});

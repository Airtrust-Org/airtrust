import { Page, expect } from '@playwright/test';

/**
 * Helper de Modais
 * Operações comuns em modais: abrir, fechar, preencher, validar
 */
export class ModalHelper {
  constructor(private page: Page) {}

  async waitForModalOpen(title: string) {
    await this.page.waitForSelector('[role="dialog"]', { state: 'visible', timeout: 5000 });
    await expect(this.page.locator(`[role="dialog"] >> text=${title}`)).toBeVisible();
  }

  async closeModalByEscape() {
    await this.page.keyboard.press('Escape');
    await this.page.waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 5000 });
  }

  async closeModalByX() {
    await this.page.click('[role="dialog"] button[aria-label="Fechar"]');
    await this.page.waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 5000 });
  }

  async closeModalByClickOutside() {
    // Click no overlay (área fora do modal)
    const modal = this.page.locator('[role="dialog"]');
    const box = await modal.boundingBox();

    if (box) {
      // Click acima do modal
      await this.page.mouse.click(box.x - 10, box.y - 10);
    }

    await this.page.waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 5000 });
  }

  async clickSaveButton() {
    await this.page.click('[role="dialog"] button:has-text("Salvar")');
  }

  async clickCancelButton() {
    await this.page.click('[role="dialog"] button:has-text("Cancelar")');
  }

  async waitForLoadingToFinish() {
    // Aguardar spinner desaparecer
    try {
      await this.page.waitForSelector(
        '[role="dialog"] .spinner, [role="dialog"] [aria-busy="true"]',
        {
          state: 'hidden',
          timeout: 10000,
        },
      );
    } catch {
      // Se não houver spinner, continuar
    }
  }

  async waitForToast(type: 'success' | 'error', message?: string) {
    const selector = `.toast.${type}, [data-sonner-toast][data-type="${type}"]`;
    await this.page.waitForSelector(selector, { state: 'visible', timeout: 5000 });

    if (message) {
      await expect(this.page.locator(selector)).toContainText(message);
    }
  }

  async fillInput(label: string, value: string) {
    // Tentar diferentes seletores
    const selectors = [
      `[role="dialog"] label:has-text("${label}") + input`,
      `[role="dialog"] input[name="${label.toLowerCase().replace(/\s+/g, '_')}"]`,
      `[role="dialog"] input[placeholder*="${label}"]`,
    ];

    for (const selector of selectors) {
      const input = this.page.locator(selector).first();
      if ((await input.count()) > 0) {
        await input.fill(value);
        return;
      }
    }

    throw new Error(`Input com label "${label}" não encontrado`);
  }

  async selectOption(label: string, option: string) {
    const selector = `[role="dialog"] label:has-text("${label}") + select`;
    await this.page.click(selector);
    await this.page.click(`option:has-text("${option}")`);
  }

  async uploadFile(label: string, filePath: string) {
    const selector = `[role="dialog"] label:has-text("${label}") + input[type="file"]`;
    await this.page.setInputFiles(selector, filePath);
  }

  async checkCheckbox(label: string) {
    const selector = `[role="dialog"] label:has-text("${label}") input[type="checkbox"]`;
    await this.page.check(selector);
  }

  async uncheckCheckbox(label: string) {
    const selector = `[role="dialog"] label:has-text("${label}") input[type="checkbox"]`;
    await this.page.uncheck(selector);
  }

  async isModalOpen(): Promise<boolean> {
    const modal = this.page.locator('[role="dialog"]');
    return await modal.isVisible();
  }

  async getFieldValue(label: string): Promise<string> {
    const input = this.page.locator(`[role="dialog"] label:has-text("${label}") + input`).first();
    return await input.inputValue();
  }

  async hasValidationError(label: string): Promise<boolean> {
    const errorSelectors = [
      `[role="dialog"] label:has-text("${label}") ~ .error-message`,
      `[role="dialog"] label:has-text("${label}") + input.border-red`,
      `[role="dialog"] label:has-text("${label}") ~ span.text-red`,
    ];

    for (const selector of errorSelectors) {
      const error = this.page.locator(selector);
      if ((await error.count()) > 0 && (await error.isVisible())) {
        return true;
      }
    }

    return false;
  }
}

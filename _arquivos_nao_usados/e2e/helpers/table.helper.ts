import { Page, Locator } from '@playwright/test';

/**
 * Helper de Tabelas
 * Operações comuns em tabelas: buscar linhas, clicar ações, contar registros
 */
export class TableHelper {
  constructor(private page: Page) {}

  async getRowCount(): Promise<number> {
    const rows = await this.page.locator('table tbody tr:not(.empty-state)').count();
    return rows;
  }

  async getRowByText(text: string): Promise<Locator> {
    return this.page.locator(`table tbody tr:has-text("${text}")`).first();
  }

  async clickEditButton(rowText: string) {
    const row = await this.getRowByText(rowText);
    await row.locator('button[aria-label="Editar"], button:has-text("Editar")').click();
  }

  async clickDeleteButton(rowText: string) {
    const row = await this.getRowByText(rowText);
    await row.locator('button[aria-label="Deletar"], button:has-text("Deletar")').click();
  }

  async clickViewButton(rowText: string) {
    const row = await this.getRowByText(rowText);
    await row.locator('button[aria-label="Visualizar"], button:has-text("Visualizar")').click();
  }

  async getCellValue(rowText: string, columnHeader: string): Promise<string> {
    const columnIndex = await this.getColumnIndex(columnHeader);
    const row = await this.getRowByText(rowText);
    const cell = row.locator(`td:nth-child(${columnIndex + 1})`);
    return await cell.innerText();
  }

  private async getColumnIndex(header: string): Promise<number> {
    const headers = await this.page.locator('table thead th').allInnerTexts();
    const index = headers.findIndex((h) => h.toLowerCase().includes(header.toLowerCase()));

    if (index === -1) {
      throw new Error(
        `Coluna "${header}" não encontrada. Colunas disponíveis: ${headers.join(', ')}`,
      );
    }

    return index;
  }

  async waitForRowToAppear(text: string, timeout = 5000) {
    await this.page.waitForSelector(`table tbody tr:has-text("${text}")`, { timeout });
  }

  async waitForRowToDisappear(text: string, timeout = 5000) {
    await this.page.waitForSelector(`table tbody tr:has-text("${text}")`, {
      state: 'hidden',
      timeout,
    });
  }

  async hasRow(text: string): Promise<boolean> {
    const row = await this.getRowByText(text);
    return (await row.count()) > 0;
  }

  async getColumnHeaders(): Promise<string[]> {
    return await this.page.locator('table thead th').allInnerTexts();
  }

  async clickColumn(columnHeader: string) {
    const headers = await this.page.locator('table thead th').all();

    for (const header of headers) {
      const text = await header.innerText();
      if (text.toLowerCase().includes(columnHeader.toLowerCase())) {
        await header.click();
        return;
      }
    }

    throw new Error(`Coluna "${columnHeader}" não encontrada`);
  }

  async hasActionButton(
    rowText: string,
    action: 'Editar' | 'Deletar' | 'Visualizar',
  ): Promise<boolean> {
    const row = await this.getRowByText(rowText);
    const button = row.locator(`button[aria-label="${action}"], button:has-text("${action}")`);
    return (await button.count()) > 0 && (await button.isVisible());
  }

  async isEmpty(): Promise<boolean> {
    const emptyState = this.page.locator(
      '.empty-state, table tbody tr td:has-text("Nenhum registro")',
    );
    return await emptyState.isVisible();
  }
}

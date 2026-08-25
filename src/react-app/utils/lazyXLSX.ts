/**
 * Spreadsheet export helper.
 *
 * Uses the same ExcelJS browser implementation as the import parser so the
 * frontend does not need the legacy `xlsx` dependency. The module remains lazy
 * to keep spreadsheet generation out of the initial bundle.
 */

import type { Workbook, Worksheet } from 'exceljs';
import { importWithRetry } from '@/react-app/utils/lazyWithRetry';

let excelModule: typeof import('exceljs/dist/es5/exceljs.browser.js') | null = null;

async function loadExcelJS() {
  if (!excelModule) {
    excelModule = await importWithRetry(
      () => import('exceljs/dist/es5/exceljs.browser.js'),
      'exceljs-module',
      { reloadOnChunkError: false, maxAttempts: 2 },
    );
  }
  return excelModule.default;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function safeWorksheetName(value: string, fallback: string): string {
  const normalized = String(value || fallback)
    .replace(/[\\/?*\[\]:]/g, '-')
    .trim()
    .slice(0, 31);
  return normalized || fallback;
}

async function downloadWorkbook(workbook: Workbook, fileName: string) {
  const buffer = await workbook.xlsx.writeBuffer();
  const bytes = Uint8Array.from(buffer as unknown as ArrayLike<number>);
  downloadBlob(
    new Blob([bytes], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    `${fileName}.xlsx`,
  );
}

function appendObjectRows<T extends Record<string, unknown>>(worksheet: Worksheet, data: T[]) {
  const headers = Object.keys(data[0]);
  worksheet.addRow(headers);
  for (const row of data) {
    worksheet.addRow(headers.map((header) => row[header] as never));
  }
}

export async function exportToExcel<T extends Record<string, unknown>>(
  data: T[],
  fileName: string,
  sheetName: string = 'Dados',
): Promise<void> {
  if (!data || data.length === 0) throw new Error('Nenhum dado para exportar');

  try {
    const ExcelJS = await loadExcelJS();
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(safeWorksheetName(sheetName, 'Dados'));
    appendObjectRows(worksheet, data);
    await downloadWorkbook(workbook, fileName);
  } catch (err) {
    console.error('❌ Erro ao exportar Excel:', err);
    throw new Error('Falha ao exportar arquivo Excel');
  }
}

export async function exportMultipleSheets<T extends Record<string, unknown>>(
  sheets: Array<{ name: string; data: T[] }>,
  fileName: string,
): Promise<void> {
  if (!sheets || sheets.length === 0) throw new Error('Nenhuma planilha para exportar');

  try {
    const ExcelJS = await loadExcelJS();
    const workbook = new ExcelJS.Workbook();
    let appended = 0;

    for (const sheet of sheets) {
      if (!sheet.data || sheet.data.length === 0) continue;
      const worksheet = workbook.addWorksheet(
        safeWorksheetName(sheet.name, `Dados-${appended + 1}`),
      );
      appendObjectRows(worksheet, sheet.data);
      appended += 1;
    }

    if (appended === 0) throw new Error('Nenhuma planilha com dados para exportar');
    await downloadWorkbook(workbook, fileName);
  } catch (err) {
    console.error('❌ Erro ao exportar múltiplas planilhas:', err);
    throw new Error('Falha ao exportar arquivo Excel');
  }
}

export async function exportToCSV<T extends Record<string, unknown>>(
  data: T[],
  fileName: string,
): Promise<void> {
  if (!data || data.length === 0) throw new Error('Nenhum dado para exportar');

  try {
    const headers = Object.keys(data[0]);
    const escape = (val: unknown) => {
      if (val == null) return '';
      const s = String(val);
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    };
    const lines = [headers.map(escape).join(',')];
    data.forEach((row) => lines.push(headers.map((h) => escape(row[h])).join(',')));
    downloadBlob(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' }), `${fileName}.csv`);
  } catch (err) {
    console.error('❌ Erro ao exportar CSV:', err);
    throw new Error('Falha ao exportar arquivo CSV');
  }
}

export function formatForExport<T extends Record<string, unknown>>(
  data: T[],
  options?: {
    exclude?: string[];
    dateFields?: string[];
    formatters?: Record<string, (value: unknown) => string>;
  },
): Record<string, unknown>[] {
  return data.map((row) => {
    const formatted: Record<string, unknown> = {};

    Object.entries(row).forEach(([key, value]) => {
      if (options?.exclude?.includes(key)) return;
      if (options?.formatters?.[key]) {
        formatted[key] = options.formatters[key](value);
        return;
      }
      if (options?.dateFields?.includes(key) && value) {
        try {
          formatted[key] = new Date(value as string).toLocaleDateString('pt-BR');
        } catch {
          formatted[key] = value;
        }
        return;
      }
      formatted[key] = value;
    });

    return formatted;
  });
}

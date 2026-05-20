/**
 * 🚀 LAZY XLSX - Helper para lazy loading de exportação Excel
 *
 * Usa XLSX no frontend com lazy loading para manter o bundle inicial enxuto.
 * Carrega sob demanda, reduzindo o bundle inicial.
 */

import { importWithRetry } from '@/react-app/utils/lazyWithRetry';

let excelModule: typeof import('xlsx') | null = null;

async function loadXLSX() {
  if (!excelModule) {
    excelModule = await importWithRetry(() => import('xlsx'), 'xlsx-module', {
      reloadOnChunkError: false,
      maxAttempts: 2,
    });
  }
  return excelModule;
}

/** Cria download de blob no browser */
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

/**
 * Exporta dados para arquivo Excel (.xlsx)
 *
 * @param data - Array de objetos a serem exportados
 * @param fileName - Nome do arquivo (sem extensão)
 * @param sheetName - Nome da planilha (default: "Dados")
 *
 * @example
 * await exportToExcel(funcionarios, "funcionarios-2025", "Lista");
 */
export async function exportToExcel<T extends Record<string, unknown>>(
  data: T[],
  fileName: string,
  sheetName: string = 'Dados',
): Promise<void> {
  if (!data || data.length === 0) {
    throw new Error('Nenhum dado para exportar');
  }

  try {
    const XLSX = await loadXLSX();
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    XLSX.writeFile(workbook, `${fileName}.xlsx`);
  } catch (err) {
    console.error('❌ Erro ao exportar Excel:', err);
    throw new Error('Falha ao exportar arquivo Excel');
  }
}

/**
 * Exporta múltiplas planilhas em um único arquivo Excel
 *
 * @param sheets - Array de objetos { name, data }
 * @param fileName - Nome do arquivo (sem extensão)
 *
 * @example
 * await exportMultipleSheets([
 *   { name: "Funcionários", data: funcionarios },
 *   { name: "Habilitações", data: habilitacoes }
 * ], "relatorio-completo");
 */
export async function exportMultipleSheets<T extends Record<string, unknown>>(
  sheets: Array<{ name: string; data: T[] }>,
  fileName: string,
): Promise<void> {
  if (!sheets || sheets.length === 0) {
    throw new Error('Nenhuma planilha para exportar');
  }

  try {
    const XLSX = await loadXLSX();
    const workbook = XLSX.utils.book_new();

    for (const sheet of sheets) {
      if (sheet.data && sheet.data.length > 0) {
        const worksheet = XLSX.utils.json_to_sheet(sheet.data);
        XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name);
      }
    }

    XLSX.writeFile(workbook, `${fileName}.xlsx`);
  } catch (err) {
    console.error('❌ Erro ao exportar múltiplas planilhas:', err);
    throw new Error('Falha ao exportar arquivo Excel');
  }
}

/**
 * Converte dados para CSV (mais leve que XLSX)
 *
 * @param data - Array de objetos a serem exportados
 * @param fileName - Nome do arquivo (sem extensão)
 *
 * @example
 * await exportToCSV(funcionarios, "funcionarios-2025");
 */
export async function exportToCSV<T extends Record<string, unknown>>(
  data: T[],
  fileName: string,
): Promise<void> {
  if (!data || data.length === 0) {
    throw new Error('Nenhum dado para exportar');
  }

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
    const csv = lines.join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    downloadBlob(blob, `${fileName}.csv`);
  } catch (err) {
    console.error('❌ Erro ao exportar CSV:', err);
    throw new Error('Falha ao exportar arquivo CSV');
  }
}

/**
 * Formata dados antes da exportação (opcional)
 * Remove campos desnecessários, formata datas, etc.
 *
 * @example
 * const formatted = formatForExport(funcionarios, {
 *   exclude: ['id', 'deleted_at'],
 *   dateFields: ['created_at', 'updated_at']
 * });
 */
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

      if (options?.formatters && options.formatters[key]) {
        formatted[key] = options.formatters[key](value);
        return;
      }

      if (options?.dateFields?.includes(key) && value) {
        try {
          const date = new Date(value as string);
          formatted[key] = date.toLocaleDateString('pt-BR');
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

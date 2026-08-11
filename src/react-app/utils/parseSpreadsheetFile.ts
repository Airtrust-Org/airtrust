import ExcelJS from 'exceljs/dist/es5/exceljs.browser.js';

export const MAX_SPREADSHEET_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_SPREADSHEET_ROWS = 20_000;
export const MAX_SPREADSHEET_COLUMNS = 256;

const FORBIDDEN_HEADERS = new Set(['__proto__', 'prototype', 'constructor']);

export type SpreadsheetRow = Record<string, unknown>;

export interface SpreadsheetParseResult {
  rows: SpreadsheetRow[];
  headers: string[];
}

function normalizeCellValue(value: unknown): unknown {
  if (value === null || value === undefined || value === '') return null;

  if (value instanceof Date) {
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, '0');
    const day = String(value.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  }

  if (typeof value !== 'object') return value;

  const record = value as Record<string, unknown>;

  if ('result' in record) {
    return normalizeCellValue(record.result);
  }

  if (Array.isArray(record.richText)) {
    const text = record.richText
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return '';
        return String((entry as Record<string, unknown>).text ?? '');
      })
      .join('')
      .trim();
    return text === '' ? null : text;
  }

  if (typeof record.text === 'string') {
    const text = record.text.trim();
    return text === '' ? null : text;
  }

  if (typeof record.error === 'string') {
    return record.error;
  }

  return null;
}

function validateHeaders(headers: string[]): void {
  const seen = new Set<string>();

  for (const header of headers) {
    if (!header) continue;

    const normalized = header.toLowerCase();
    if (FORBIDDEN_HEADERS.has(normalized)) {
      throw new Error(`Cabeçalho não permitido: "${header}"`);
    }

    if (seen.has(normalized)) {
      throw new Error(`Coluna duplicada detectada: "${header}"`);
    }
    seen.add(normalized);
  }

  if (seen.size === 0) {
    throw new Error('Planilha sem cabeçalho');
  }
}

function assertSupportedFile(file: File): void {
  const extension = file.name.toLowerCase().split('.').pop();

  if (extension !== 'xlsx') {
    throw new Error('Formato não suportado. Converta o arquivo para .xlsx antes de importar.');
  }

  if (file.size <= 0) {
    throw new Error('Arquivo XLSX vazio');
  }

  if (file.size > MAX_SPREADSHEET_FILE_BYTES) {
    throw new Error('Arquivo XLSX excede o limite de 10 MB');
  }
}

export async function parseSpreadsheetFile(file: File): Promise<SpreadsheetParseResult> {
  assertSupportedFile(file);

  const workbook = new ExcelJS.Workbook();
  const buffer = await file.arrayBuffer();

  try {
    await workbook.xlsx.load(buffer);
  } catch {
    throw new Error('Arquivo XLSX inválido ou corrompido');
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error('Planilha vazia ou sem abas');
  }

  const rowCount = worksheet.actualRowCount;
  const columnCount = Math.max(worksheet.actualColumnCount, worksheet.getRow(1).cellCount);

  if (rowCount > MAX_SPREADSHEET_ROWS) {
    throw new Error(`Planilha excede o limite de ${MAX_SPREADSHEET_ROWS} linhas`);
  }

  if (columnCount > MAX_SPREADSHEET_COLUMNS) {
    throw new Error(`Planilha excede o limite de ${MAX_SPREADSHEET_COLUMNS} colunas`);
  }

  const headerRow = worksheet.getRow(1);
  const headers: string[] = [];

  for (let column = 1; column <= columnCount; column += 1) {
    const value = normalizeCellValue(headerRow.getCell(column).value);
    headers.push(value === null ? '' : String(value).trim());
  }

  validateHeaders(headers);

  const rows: SpreadsheetRow[] = [];
  for (let rowNumber = 2; rowNumber <= rowCount; rowNumber += 1) {
    const sourceRow = worksheet.getRow(rowNumber);
    const parsedRow: SpreadsheetRow = {};

    for (let column = 1; column <= columnCount; column += 1) {
      const header = headers[column - 1];
      if (!header) continue;
      parsedRow[header] = normalizeCellValue(sourceRow.getCell(column).value);
    }

    if (Object.values(parsedRow).some((value) => value !== null)) {
      rows.push(parsedRow);
    }
  }

  if (rows.length === 0) {
    throw new Error('Planilha sem dados');
  }

  return { rows, headers: headers.filter(Boolean) };
}

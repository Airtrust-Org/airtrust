/**
 * PARSE IMPORT FILE - Universal Parser
 *
 * Parser universal que suporta CSV e XLSX.
 * Detecta formato automaticamente e normaliza output.
 *
 * Uso:
 * ```typescript
 * const rows = await parseImportFile(fileBuffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
 * // → [{Nome: 'João', CPF: '12345678900', ...}, ...]
 * ```
 */

import { unzipSync, strFromU8 } from 'fflate';
import Papa from 'papaparse';

export interface ParsedRow {
  [key: string]: string | number | null;
}

export interface ParseResult {
  rows: ParsedRow[];
  headers: string[];
  originalHeaders: string[];
}

/**
 * Parse universal: detecta CSV ou XLSX
 */
export async function parseImportFile(
  file: ArrayBuffer | string,
  mimeType: string,
): Promise<ParseResult> {
  // CSV
  if (mimeType === 'text/csv' || mimeType === 'application/csv' || mimeType.includes('csv')) {
    return parseCSV(file);
  }

  // XLSX
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mimeType === 'application/vnd.ms-excel' ||
    mimeType.includes('excel') ||
    mimeType.includes('spreadsheet')
  ) {
    const buffer = typeof file === 'string' ? new TextEncoder().encode(file).buffer : file;
    return parseXLSX(buffer as ArrayBuffer);
  }

  throw new Error(`Formato não suportado: ${mimeType}. ` + `Use arquivos .csv ou .xlsx`);
}

/**
 * Parse CSV com Papa Parse
 */
function parseCSV(file: ArrayBuffer | string): Promise<ParseResult> {
  const byteLength = typeof file === 'string' ? new TextEncoder().encode(file).byteLength : (file as ArrayBuffer).byteLength;
  if (byteLength > IMPORT_FILE_LIMITS.maxCompressedBytes) {
    return Promise.reject(new Error(`Arquivo CSV excede o tamanho máximo de ${IMPORT_FILE_LIMITS.maxCompressedBytes / (1024 * 1024)} MB`));
  }

  return new Promise((resolve, reject) => {
    const fileString =
      typeof file === 'string' ? file : new TextDecoder('utf-8').decode(file as ArrayBuffer);

    Papa.parse(fileString, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim(),
      transform: (value) => value.trim(),
      complete: (results) => {
        const rows = results.data as ParsedRow[];
        const headers = results.meta.fields || [];

        resolve({
          rows: rows.filter((row) => Object.values(row).some((v) => v !== null && v !== '')),
          headers: headers.map((h) => normalizeHeader(h)),
          originalHeaders: headers,
        });
      },
      error: (err: Error) => reject(new Error(`Erro ao parsear CSV: ${err.message}`)),
    });
  });
}

/**
 * Converte letras de coluna Excel (A, B, ..., Z, AA, AB) em índice 0-based
 */
function colLetterToIndex(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) {
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n - 1;
}

/**
 * Decodifica entidades XML básicas
 */
function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/**
 * Limites de segurança para importação de arquivos (P00-03: mitigação de Zip Bomb e buffer overflow)
 */
export const IMPORT_FILE_LIMITS = {
  maxCompressedBytes: 10 * 1024 * 1024,      // 10 MB máximo de arquivo de entrada
  maxUncompressedBytes: 30 * 1024 * 1024,    // 30 MB máximo total descompactado acumulado
  maxEntryBytes: 20 * 1024 * 1024,           // 20 MB máximo por entrada individual
};

/**
 * Parse XLSX usando fflate (Workers-compatible) — sem dependência externa xlsx
 */
function parseXLSX(file: ArrayBuffer): ParseResult {
  if (file.byteLength > IMPORT_FILE_LIMITS.maxCompressedBytes) {
    throw new Error(`Arquivo XLSX excede o tamanho máximo de ${IMPORT_FILE_LIMITS.maxCompressedBytes / (1024 * 1024)} MB`);
  }

  let zipEntries: Record<string, Uint8Array>;
  let totalUncompressed = 0;
  try {
    zipEntries = unzipSync(new Uint8Array(file), {
      filter(fileInfo) {
        const name = fileInfo.name.toLowerCase();
        // Filtrar estritamente as entradas necessárias para ler a planilha XLSX
        const isNeeded =
          name === 'xl/sharedstrings.xml' ||
          name === 'xl/worksheets/sheet1.xml' ||
          name === 'xl/workbook.xml';

        if (!isNeeded) {
          return false;
        }

        totalUncompressed += fileInfo.size;
        if (totalUncompressed > IMPORT_FILE_LIMITS.maxUncompressedBytes) {
          throw new Error('Limite de descompressão excedido (possível Zip Bomb)');
        }
        if (fileInfo.size > IMPORT_FILE_LIMITS.maxEntryBytes) {
          throw new Error('Entrada da planilha excede o limite máximo permitido');
        }
        return true;
      },
    });
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes('Limite de descompressão') || msg.includes('Entrada da planilha')) {
      throw err;
    }
    throw new Error('Arquivo XLSX inválido ou corrompido');
  }

  // Ler tabela de strings compartilhadas
  const sharedStrings: string[] = [];
  const ssEntry = zipEntries['xl/sharedStrings.xml'];
  if (ssEntry) {
    const ssXml = strFromU8(ssEntry);
    const siRegex = /<si>([\s\S]*?)<\/si>/g;
    let siMatch;
    while ((siMatch = siRegex.exec(ssXml)) !== null) {
      const tRegex = /<t(?:\s[^>]*)?>([^<]*)<\/t>/g;
      let tMatch;
      let text = '';
      while ((tMatch = tRegex.exec(siMatch[1])) !== null) {
        text += decodeXmlEntities(tMatch[1]);
      }
      sharedStrings.push(text);
    }
  }

  // Encontrar primeira planilha
  const sheetEntry =
    zipEntries['xl/worksheets/sheet1.xml'] || zipEntries['xl/worksheets/Sheet1.xml'];
  if (!sheetEntry) {
    throw new Error('Planilha vazia ou sem abas');
  }

  const sheetXml = strFromU8(sheetEntry);

  // Parsear linhas em grid esparso: rowIdx -> colIdx -> valor
  const grid = new Map<number, Map<number, string | number | null>>();
  let maxRow = 0;
  let maxCol = 0;

  const rowRegex = /<row[^>]+r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
  let rowMatch;
  while ((rowMatch = rowRegex.exec(sheetXml)) !== null) {
    const rowNum = parseInt(rowMatch[1]) - 1; // 0-indexed
    maxRow = Math.max(maxRow, rowNum);
    const cols = new Map<number, string | number | null>();
    grid.set(rowNum, cols);

    const cellRegex = /<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cellMatch;
    while ((cellMatch = cellRegex.exec(rowMatch[2])) !== null) {
      const colIdx = colLetterToIndex(cellMatch[1]);
      const cellAttrs = cellMatch[2];
      const cellContent = cellMatch[3] ?? '';
      maxCol = Math.max(maxCol, colIdx);

      const typeMatch = cellAttrs.match(/\bt="([^"]+)"/);
      const cellType = typeMatch ? typeMatch[1] : 'n';

      const vMatch = cellContent.match(/<v>([^<]*)<\/v>/);
      const rawValue = vMatch ? vMatch[1] : null;

      let cellValue: string | number | null = null;
      if (rawValue !== null) {
        if (cellType === 's') {
          cellValue = sharedStrings[parseInt(rawValue)] ?? '';
        } else if (cellType === 'b') {
          cellValue = rawValue === '1' ? 'TRUE' : 'FALSE';
        } else if (cellType === 'inlineStr' || cellType === 'str') {
          const tMatch = cellContent.match(/<t>([^<]*)<\/t>/);
          cellValue = tMatch ? decodeXmlEntities(tMatch[1]) : '';
        } else {
          const n = parseFloat(rawValue);
          cellValue = isNaN(n) ? rawValue : n;
        }
      }
      cols.set(colIdx, cellValue);
    }
  }

  if (grid.size === 0) {
    throw new Error('Planilha vazia ou sem abas');
  }

  // Linha 0 = cabeçalhos
  const headerRow = grid.get(0);
  if (!headerRow) {
    throw new Error('Planilha sem cabeçalho');
  }

  const originalHeaders: string[] = [];
  for (let c = 0; c <= maxCol; c++) {
    const h = headerRow.get(c);
    originalHeaders.push(h != null ? String(h).trim() : '');
  }
  const headers = originalHeaders.map(normalizeHeader);

  // Linhas 1..maxRow = dados
  const rawRows: ParsedRow[] = [];
  for (let r = 1; r <= maxRow; r++) {
    const cols = grid.get(r);
    if (!cols) continue;
    const row: ParsedRow = {};
    for (let c = 0; c <= maxCol; c++) {
      const key = headers[c];
      if (!key) continue;
      row[key] = normalizeValue(cols.get(c) ?? null);
    }
    rawRows.push(row);
  }

  if (rawRows.length === 0) {
    throw new Error('Planilha sem dados');
  }

  return {
    rows: rawRows.filter((row) => Object.values(row).some((v) => v !== null && v !== '')),
    headers,
    originalHeaders,
  };
}

/**
 * Normaliza header: remove acentos, trim, preserva case
 */
function normalizeHeader(header: string): string {
  return header.trim().replace(/\s+/g, '_'); // espaços → underscore
}

/**
 * Normaliza valores: trim strings, converte datas Excel
 */
function normalizeValue(value: unknown): string | number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  // Número
  if (typeof value === 'number') {
    return value;
  }

  // String
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  }

  // Data (objeto Date do Excel)
  if (value instanceof Date) {
    return value.toISOString().split('T')[0]; // → YYYY-MM-DD
  }

  return String(value).trim() || null;
}

/**
 * Valida se arquivo é suportado
 */
export function isSupportedMimeType(mimeType: string): boolean {
  const supported = [
    'text/csv',
    'application/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
  ];

  return supported.some((type) => mimeType.includes(type));
}

/**
 * Extrai extensão do filename
 */
export function getFileExtension(filename: string): string {
  const parts = filename.toLowerCase().split('.');
  return parts.length > 1 ? parts[parts.length - 1] : '';
}

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MAX_SPREADSHEET_FILE_BYTES, parseSpreadsheetFile } from '../parseSpreadsheetFile';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// jsdom's Blob omits arrayBuffer(), so the fixture supplies the browser File contract explicitly.
class TestFile extends Blob implements File {
  readonly lastModified = Date.now();
  readonly name: string;
  readonly webkitRelativePath = '';
  private readonly content: ArrayBuffer;
  private readonly declaredSize?: number;

  constructor(
    content: ArrayBuffer,
    name: string,
    options?: FilePropertyBag,
    declaredSize?: number,
  ) {
    super([content], options);
    this.content = content.slice(0);
    this.name = name;
    this.declaredSize = declaredSize;
  }

  override get size(): number {
    return this.declaredSize ?? super.size;
  }

  override async arrayBuffer(): Promise<ArrayBuffer> {
    return this.content.slice(0);
  }
}

function copyToArrayBuffer(value: unknown): ArrayBuffer {
  if (value instanceof ArrayBuffer) return value;

  if (ArrayBuffer.isView(value)) {
    const copy = new Uint8Array(value.byteLength);
    copy.set(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
    return copy.buffer;
  }

  throw new Error('ExcelJS retornou um buffer inválido no teste');
}

async function createSpreadsheetFile(
  headers: string[],
  rows: unknown[][],
  filename = 'dados.xlsx',
): Promise<File> {
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Dados');
  worksheet.addRow(headers);
  rows.forEach((row) => worksheet.addRow(row));

  const written: unknown = await workbook.xlsx.writeBuffer();
  const arrayBuffer = copyToArrayBuffer(written);

  return new TestFile(arrayBuffer, filename, { type: XLSX_MIME });
}

function sourcePath(relativePath: string): string {
  return decodeURIComponent(new URL(relativePath, import.meta.url).pathname);
}

describe('parseSpreadsheetFile', () => {
  it('preserves XLSX date-only values in the Brazil timezone', async () => {
    const previousTz = process.env.TZ;
    process.env.TZ = 'America/Sao_Paulo';

    try {
      const file = await createSpreadsheetFile(
        ['nome', 'horas', 'data_conclusao'],
        [['Ana', 12, new Date('2026-08-02T00:00:00.000Z')]],
      );

      const result = await parseSpreadsheetFile(file);

      expect(result.headers).toEqual(['nome', 'horas', 'data_conclusao']);
      expect(result.rows).toEqual([{ nome: 'Ana', horas: 12, data_conclusao: '2026-08-02' }]);
    } finally {
      if (previousTz === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = previousTz;
      }
    }
  });

  it('rejects duplicate and prototype-sensitive headers', async () => {
    const duplicate = await createSpreadsheetFile(['Nome', 'nome'], [['Ana', 'Silva']]);
    await expect(parseSpreadsheetFile(duplicate)).rejects.toThrow('Coluna duplicada');

    const dangerous = await createSpreadsheetFile(['__proto__'], [['polluted']]);
    await expect(parseSpreadsheetFile(dangerous)).rejects.toThrow('Cabeçalho não permitido');
  });

  it('rejects legacy XLS and oversized files before parsing', async () => {
    const legacy = await createSpreadsheetFile(['nome'], [['Ana']], 'dados.xls');
    await expect(parseSpreadsheetFile(legacy)).rejects.toThrow('Converta o arquivo para .xlsx');

    const oversized = new TestFile(
      new ArrayBuffer(0),
      'grande.xlsx',
      { type: XLSX_MIME },
      MAX_SPREADSHEET_FILE_BYTES + 1,
    );
    await expect(parseSpreadsheetFile(oversized)).rejects.toThrow('limite de 10 MB');
  });

  it('keeps untrusted spreadsheet reads out of the SheetJS surface', () => {
    const importReaders = [
      '../../hooks/useImportacao.ts',
      '../../components/common/ImportacaoPadrao.tsx',
      '../../pages/qualificacoes/ImportarQualificacoes.tsx',
      '../../pages/simuladores/components/ImportarRelacoes.tsx',
    ];

    for (const relativePath of importReaders) {
      const source = readFileSync(sourcePath(relativePath), 'utf8');
      expect(source).not.toContain('XLSX.read(');
      expect(source).not.toContain('sheet_to_json');
    }
  });
});

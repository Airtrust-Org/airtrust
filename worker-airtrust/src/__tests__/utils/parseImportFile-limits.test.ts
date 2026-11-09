import { describe, it, expect } from 'vitest';
import { parseImportFile, IMPORT_FILE_LIMITS } from '../../utils/parseImportFile';
import { zipSync, strToU8 } from 'fflate';

describe('P00-03: parseImportFile safety limits (Zip Bomb & Size Guard)', () => {
  it('rejeita arquivo CSV maior que o limite máximo comprimido', async () => {
    const largeBuffer = new Uint8Array(IMPORT_FILE_LIMITS.maxCompressedBytes + 1024);
    await expect(parseImportFile(largeBuffer.buffer, 'text/csv')).rejects.toThrow(
      /excede o tamanho máximo/i,
    );
  });

  it('rejeita arquivo XLSX maior que o limite máximo comprimido', async () => {
    const largeBuffer = new Uint8Array(IMPORT_FILE_LIMITS.maxCompressedBytes + 1024);
    await expect(
      parseImportFile(
        largeBuffer.buffer,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ),
    ).rejects.toThrow(/excede o tamanho máximo/i);
  });

  it('rejeita entrada individual altamente compressível que excede 20 MB descompactados (Zip Bomb P1)', async () => {
    // 21 MB de dados repetitivos (comprime para menos de 30 KB)
    const highlyCompressible = new Uint8Array(21 * 1024 * 1024);
    const bombZip = zipSync({
      'xl/sharedStrings.xml': highlyCompressible,
      'xl/worksheets/sheet1.xml': strToU8('<row r="1"><c r="A1"><v>0</v></c></row>'),
    });

    // O arquivo compactado é minúsculo (< 50 KB), mas descompactado excede o limite de entrada
    expect(bombZip.byteLength).toBeLessThan(100 * 1024);
    await expect(
      parseImportFile(
        bombZip.buffer,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ),
    ).rejects.toThrow(/Entrada da planilha excede o limite máximo permitido/i);
  });

  it('rejeita pacote onde o total descompactado acumulado excede 30 MB (Zip Bomb P1)', async () => {
    // Duas entradas de 16 MB cada (total 32 MB > 30 MB limite acumulado)
    const entry1 = new Uint8Array(16 * 1024 * 1024);
    const entry2 = new Uint8Array(16 * 1024 * 1024);
    const multiEntryBomb = zipSync({
      'xl/sharedStrings.xml': entry1,
      'xl/worksheets/sheet1.xml': entry2,
    });

    expect(multiEntryBomb.byteLength).toBeLessThan(100 * 1024);
    await expect(
      parseImportFile(
        multiEntryBomb.buffer,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ),
    ).rejects.toThrow(/Limite de descompressão excedido \(possível Zip Bomb\)/i);
  });

  it('ignora entradas não essenciais do XLSX protegendo contra inflação de arquivos', async () => {
    const extraData = new Uint8Array(100 * 1024); // 100 KB
    const zipWithExtra = zipSync({
      'xl/sharedStrings.xml': strToU8('<si><t>Hello</t></si>'),
      'xl/worksheets/sheet1.xml': strToU8(
        '<row r="1"><c r="A1" t="s"><v>0</v></c></row><row r="2"><c r="A2"><v>123</v></c></row>',
      ),
      'xl/media/image1.png': extraData, // deve ser ignorado pelo filter
    });

    const result = await parseImportFile(
      zipWithExtra.buffer,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(result.rows.length).toBe(1);
    expect(result.originalHeaders).toEqual(['Hello']);
  });
});

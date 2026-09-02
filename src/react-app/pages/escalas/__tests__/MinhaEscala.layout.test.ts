import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('Minha Escala layout shell', () => {
  it('keeps the operational calendar full-width instead of reintroducing a narrow centered cap', () => {
    const sourcePath = fileURLToPath(new URL('../MinhaEscalaPage.tsx', import.meta.url));
    const source = readFileSync(sourcePath, 'utf8');

    expect(source).toContain('<div className="w-full px-4 py-4 space-y-4">');
    expect(source).not.toContain('max-w-5xl mx-auto px-4 py-4 space-y-4');
  });
});

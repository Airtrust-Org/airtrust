import { describe, expect, it } from 'vitest';
import minhaEscalaSource from '../MinhaEscalaPage.tsx?raw';

describe('Minha Escala layout shell', () => {
  it('keeps the operational calendar full-width instead of reintroducing a narrow centered cap', () => {
    expect(minhaEscalaSource).toContain('className="w-full px-4 py-4 space-y-4"');
    expect(minhaEscalaSource).not.toContain('max-w-5xl mx-auto px-4 py-4 space-y-4');
  });
});

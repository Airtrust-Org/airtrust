import { describe, expect, it, vi } from 'vitest';
import { getCatalogTranslation } from './runtimeTranslator';
import { translations } from './translations';

describe('P01-05 offline catalog translation without PII disclosure', () => {
  it('translates known developer-maintained static phrases', () => {
    const phrase = translations['pt-BR']['auth.login.title'];
    const expected = translations['en-US']['auth.login.title'];
    if (phrase !== expected) expect(getCatalogTranslation(phrase)).toBe(expected);
  });
  it('never translates unknown personal or operational data', () => {
    const patient = 'Funcionário João CPF 000.000.000-00 — setor de operações';
    expect(getCatalogTranslation(patient)).toBe(patient);
  });
  it('cannot dispatch requests for arbitrary UI text', () => {
    const request = vi.fn();
    vi.stubGlobal('fetch', request);
    expect(getCatalogTranslation('Uma frase privada que não existe no catálogo')).toBe('Uma frase privada que não existe no catálogo');
    expect(request).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

import { describe, expect, it } from 'vitest';

import {
  resolveClassificationTagAppearance,
  resolveClassificationTagColor,
} from '../qualificacoes/classificacaoColors';

describe('classificacaoColors', () => {
  it('usa cor de fallback por formato quando a cor persistida é cinza', () => {
    expect(
      resolveClassificationTagColor({
        variant: 'format',
        code: 'EAD',
        color: '#6B7280',
      }),
    ).toBe('#2563EB');
  });

  it('categoria EAD sem categoria_cor nunca cai no fallback amarelo antigo (#EAB308)', () => {
    const resolved = resolveClassificationTagColor({
      variant: 'category',
      label: 'EAD',
      code: 'EAD',
      color: null,
    });

    expect(resolved).not.toBe('#EAB308');
  });

  it('categoria EAD usa categoria_cor do backend quando presente (não inventa cor local)', () => {
    // Cor canônica azul persistida em qualificacoes_categorias (empresa 6).
    expect(
      resolveClassificationTagColor({
        variant: 'category',
        label: 'EAD',
        code: 'EAD',
        color: '#2563EB',
      }),
    ).toBe('#2563EB');
  });

  it('mantém categoria canônica distinguível do formato', () => {
    const categoria = resolveClassificationTagAppearance({
      variant: 'category',
      label: 'Treinamento Teórico',
      color: '#3B82F6',
    });
    const formato = resolveClassificationTagAppearance({
      variant: 'format',
      label: 'EAD',
      code: 'EAD',
      color: '#6B7280',
    });

    expect(categoria.className).toContain('rounded-full');
    expect(formato.className).toContain('rounded-md');
    expect(formato.style.color).toBe('#2563EB');
    expect(formato.style.backgroundColor).not.toBe(categoria.style.backgroundColor);
  });
});

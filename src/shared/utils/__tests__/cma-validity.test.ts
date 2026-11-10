import { describe, expect, it } from 'vitest';
import { completedAgeYears, resolveCmaValidity } from '../cma-validity';

// Mesma regra consumida pelo Worker (worker-airtrust/src/utils/__tests__/cma-validity.test.ts cobre os caminhos de calculo).
describe('cma-validity (compartilhado com o frontend)', () => {
  it('menos de 60 anos => 12 meses', () => {
    expect(resolveCmaValidity({ dataRealizacao: '2026-03-09', dataNascimento: '1966-03-10' })).toMatchObject({
      months: 12,
      basis: 'UNDER_60',
      warning: null,
    });
  });

  it('exatamente 60 anos no dia da realizacao => 6 meses', () => {
    expect(resolveCmaValidity({ dataRealizacao: '2026-03-10', dataNascimento: '1966-03-10' })).toMatchObject({
      months: 6,
      basis: 'AGE_60_PLUS',
      ageYears: 60,
    });
  });

  it('sem data de nascimento => 12 meses com sinalizacao', () => {
    const v = resolveCmaValidity({ dataRealizacao: '2026-03-10', dataNascimento: null });
    expect(v).toMatchObject({ months: 12, basis: 'BIRTH_DATE_MISSING', birthDateMissing: true });
    expect(v.warning).toMatch(/nascimento/i);
  });

  it('idade por componentes civis', () => {
    expect(completedAgeYears('1964-02-29', '2025-02-28')).toBe(60);
    expect(completedAgeYears('1990-02-30', '2026-01-01')).toBeNull();
  });
});

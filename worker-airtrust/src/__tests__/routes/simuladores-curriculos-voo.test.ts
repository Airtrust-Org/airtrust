import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeCurriculumModelIds } from '../../routes/simuladores-curriculos-voo';

describe('flight training curriculum model list', () => {
  it('preserves the explicit S1..SN order supplied by the administrator', () => {
    expect(normalizeCurriculumModelIds([41, 12, 77, 8])).toEqual({
      ok: true,
      ids: [41, 12, 77, 8],
    });
  });

  it('accepts an empty curriculum so a non-generating training can be reset explicitly', () => {
    expect(normalizeCurriculumModelIds([])).toEqual({ ok: true, ids: [] });
  });

  it('rejects duplicate session models', () => {
    expect(normalizeCurriculumModelIds([10, 11, 10])).toEqual({
      ok: false,
      error: 'A mesma sessão não pode aparecer duas vezes no currículo',
    });
  });

  it.each([null, {}, '1,2,3', [0], [-1], [1.5], ['abc']])(
    'rejects malformed curriculum payload %j',
    (value) => {
      expect(normalizeCurriculumModelIds(value).ok).toBe(false);
    },
  );

  it('rejects an unbounded curriculum payload', () => {
    expect(normalizeCurriculumModelIds(Array.from({ length: 51 }, (_, index) => index + 1))).toEqual({
      ok: false,
      error: 'Um currículo pode conter no máximo 50 sessões',
    });
  });
});


describe('flight training curriculum persistence semantics', () => {
  it('treats only ordered qualification links as curriculum membership', () => {
    const route = readFileSync(
      join(__dirname, '../../routes/simuladores-curriculos-voo.ts'),
      'utf8',
    );
    const orderedMembershipPredicates = route.match(/ordem_no_treinamento IS NOT NULL/g) || [];
    expect(orderedMembershipPredicates.length).toBeGreaterThanOrEqual(3);
    expect(route).toContain('AND ms.ordem_no_treinamento IS NOT NULL');
    expect(route).toContain('AND ordem_no_treinamento IS NOT NULL');
  });
});

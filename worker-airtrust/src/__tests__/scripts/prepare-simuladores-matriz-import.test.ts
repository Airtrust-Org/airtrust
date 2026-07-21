import { describe, expect, it } from 'vitest';
// @ts-ignore JavaScript CLI module is executed by Node; its runtime contract is tested here.
import { createDeterministicPlan, sha256, validateModelItems } from '../../../scripts/lib/matriz-import-plan.mjs';

const items = Array.from({ length: 18 }, (_, index) => ({ modelo: 'A139-I-01/12', ordem: index + 1, codigo: `A-${index + 1}`, nome: `M ${index + 1}`, execucao_pf: 'A' }));
const matrix = { models: [{ codigo: 'A139-I-01/12' }], items };

describe('matriz import planner', () => {
  it('produces a stable hash without volatile timestamps', () => {
    const input = { empresaId: 7, sourceHashes: { matrix: 'a'.repeat(64) }, aw139: matrix, sk76: { models: [], items: [] }, loft: 0 };
    expect(createDeterministicPlan(input).plan_sha256).toBe(createDeterministicPlan(input).plan_sha256);
    expect(sha256({ b: 1, a: 2 })).toBe(sha256({ a: 2, b: 1 }));
    expect(sha256(Buffer.from('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('rejects invalid tenant, position count and repeated order while allowing a code in both LOFT legs', () => {
    expect(() => createDeterministicPlan({ empresaId: 0, sourceHashes: {}, aw139: matrix, sk76: { models: [], items: [] }, loft: 0 })).toThrow('empresa_id');
    expect(() => validateModelItems(matrix.models, items.slice(0, 17))).toThrow('18 posições');
    expect(() => validateModelItems(matrix.models, [...items.slice(0, 17), { ...items[17], ordem: 17 }])).toThrow('ordens');
    expect(() => validateModelItems(matrix.models, [...items.slice(0, 17), { ...items[17], codigo: 'A-1' }])).not.toThrow();
  });
});

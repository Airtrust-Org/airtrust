import { describe, expect, it } from 'vitest';

import { loadSimuladoresMatrizV6Data } from '../../scripts/maintenance/lib/simuladores-matriz-v6-data.mjs';

describe('simuladores matriz v6 data', () => {
  it('gera 39 modelos-alvo com 18 técnicas distintas cada', () => {
    const data = loadSimuladoresMatrizV6Data();

    expect(data.issues).toEqual([]);
    expect(data.models).toHaveLength(39);

    for (const model of data.models) {
      expect(model.rows).toHaveLength(18);
      expect(new Set(model.rows.map((row) => row.codigo)).size).toBe(18);
    }
  });

  it('preserva os checks/LOFT distintos via caráter avaliativo', () => {
    const data = loadSimuladoresMatrizV6Data();
    const checks = data.models.filter((model) => model.modelCode.includes('12/12') || model.modelCode.includes('CHECK'));

    expect(checks.length).toBeGreaterThan(0);
    for (const model of checks) {
      expect(new Set(model.rows.map((row) => row.carater))).toEqual(new Set(['avaliativo']));
    }
  });

  it('mantém os quatro modelos de preview exigidos', () => {
    const data = loadSimuladoresMatrizV6Data();
    const codes = new Set(data.models.map((model) => model.modelCode));

    expect(codes.has('SK76-I-01/12')).toBe(true);
    expect(codes.has('SK76-I-12/12')).toBe(true);
    expect(codes.has('A139-I-01/12')).toBe(true);
    expect(codes.has('A139-I-12/12')).toBe(true);
  });
});


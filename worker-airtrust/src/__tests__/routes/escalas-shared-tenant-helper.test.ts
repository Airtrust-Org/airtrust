import { describe, expect, it } from 'vitest';
import { getEmpresaIdSafe } from '../../routes/escalas-shared';

function createContext(values: Record<string, unknown>) {
  return {
    get(key: string) {
      return values[key];
    },
  };
}

describe('getEmpresaIdSafe', () => {
  it('uses tenantContext empresaId when available', () => {
    const ctx = createContext({
      tenantContext: {
        empresaId: 7,
      },
    });

    expect(getEmpresaIdSafe(ctx as never)).toBe(7);
  });

  it('accepts explicit empresaId only when it is valid', () => {
    const ctx = createContext({ empresaId: '8' });

    expect(getEmpresaIdSafe(ctx as never)).toBe(8);
  });

  it('fails closed instead of returning empresa_id 0', () => {
    const ctx = createContext({});

    expect(() => getEmpresaIdSafe(ctx as never)).toThrow(/Empresa não identificada/);
  });
});

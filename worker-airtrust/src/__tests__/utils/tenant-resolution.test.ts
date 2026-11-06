import { describe, expect, it } from 'vitest';
import { getEmpresaIdOptional, getEmpresaIdSafe } from '../../utils/tenant-resolution';
import * as escalasShared from '../../routes/escalas-shared';

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

describe('getEmpresaIdOptional', () => {
  it('returns undefined instead of throwing when the tenant is missing', () => {
    expect(getEmpresaIdOptional(createContext({}) as never)).toBeUndefined();
  });

  it('parses a valid explicit empresaId', () => {
    expect(getEmpresaIdOptional(createContext({ empresaId: '9' }) as never)).toBe(9);
  });
});

describe('escalas-shared compatibility re-export', () => {
  it('exposes the very same tenant helpers', () => {
    expect(escalasShared.getEmpresaIdSafe).toBe(getEmpresaIdSafe);
    expect(escalasShared.getEmpresaIdOptional).toBe(getEmpresaIdOptional);
  });
});

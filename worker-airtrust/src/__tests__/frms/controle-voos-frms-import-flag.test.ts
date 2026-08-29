import { describe, expect, it } from 'vitest';
import { isControleVoosFrmsImportEnabledForEmpresa } from '../../lib/frms/controle-voos-frms-import-flag';

describe('CONTROLE_VOOS_FRMS_IMPORT_TENANTS flag', () => {
  it('is disabled by default (undefined / empty)', () => {
    expect(isControleVoosFrmsImportEnabledForEmpresa(6, {})).toBe(false);
    expect(isControleVoosFrmsImportEnabledForEmpresa(6, { CONTROLE_VOOS_FRMS_IMPORT_TENANTS: '' })).toBe(
      false,
    );
    expect(
      isControleVoosFrmsImportEnabledForEmpresa(6, { CONTROLE_VOOS_FRMS_IMPORT_TENANTS: '   ' }),
    ).toBe(false);
  });

  it('enables only the listed tenant ids', () => {
    const env = { CONTROLE_VOOS_FRMS_IMPORT_TENANTS: '6, 12 ,47' };
    expect(isControleVoosFrmsImportEnabledForEmpresa(6, env)).toBe(true);
    expect(isControleVoosFrmsImportEnabledForEmpresa(12, env)).toBe(true);
    expect(isControleVoosFrmsImportEnabledForEmpresa(47, env)).toBe(true);
    expect(isControleVoosFrmsImportEnabledForEmpresa(7, env)).toBe(false);
  });

  it('accepts "all" only as an explicit opt-in', () => {
    expect(isControleVoosFrmsImportEnabledForEmpresa(999, { CONTROLE_VOOS_FRMS_IMPORT_TENANTS: 'all' })).toBe(
      true,
    );
    expect(isControleVoosFrmsImportEnabledForEmpresa(999, { CONTROLE_VOOS_FRMS_IMPORT_TENANTS: 'ALL' })).toBe(
      true,
    );
  });

  it('fails closed on any malformed token', () => {
    for (const raw of ['6,abc', '6;12', '-6', '0', 'all,6', '6.0', 'six']) {
      expect(
        isControleVoosFrmsImportEnabledForEmpresa(6, { CONTROLE_VOOS_FRMS_IMPORT_TENANTS: raw }),
      ).toBe(false);
    }
  });

  it('rejects non-positive-integer empresa ids', () => {
    const env = { CONTROLE_VOOS_FRMS_IMPORT_TENANTS: '6' };
    expect(isControleVoosFrmsImportEnabledForEmpresa(0, env)).toBe(false);
    expect(isControleVoosFrmsImportEnabledForEmpresa(-6, env)).toBe(false);
    expect(isControleVoosFrmsImportEnabledForEmpresa(6.5, env)).toBe(false);
  });
});

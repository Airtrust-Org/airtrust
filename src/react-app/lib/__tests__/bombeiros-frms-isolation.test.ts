import { describe, expect, it } from 'vitest';
import { resolveBombeirosLegacyFrmsRedirect } from '../bombeiros-frms-isolation';

describe('BOA FRMS navigation boundary', () => {
  it.each(['/frms', '/frms/', '/frms/relatorios', '/frms/checkin', '/frms/tripulante/42'])(
    'redirects BOA legacy path %s to dedicated portal', path => {
      expect(resolveBombeirosLegacyFrmsRedirect('bombeiros', path)).toBe('/bombeiros/frms');
    },
  );

  it.each(['costadosol', 'airtrust', undefined, null])(
    'preserves the entire offshore FRMS interface for %s', code => {
      expect(resolveBombeirosLegacyFrmsRedirect(code, '/frms/checkin')).toBeNull();
      expect(resolveBombeirosLegacyFrmsRedirect(code, '/frms/relatorios')).toBeNull();
    },
  );

  it('preserves canonical employee registration and BOA portal paths', () => {
    expect(resolveBombeirosLegacyFrmsRedirect('bombeiros', '/funcionarios')).toBeNull();
    expect(resolveBombeirosLegacyFrmsRedirect('bombeiros', '/bombeiros/frms')).toBeNull();
    expect(resolveBombeirosLegacyFrmsRedirect('bombeiros', '/frmsx')).toBeNull();
  });
});

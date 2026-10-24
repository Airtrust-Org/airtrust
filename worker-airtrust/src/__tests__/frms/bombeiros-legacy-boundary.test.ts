import { describe, expect, it } from 'vitest';
import { isBombeirosLegacyFrmsBlocked } from '../../lib/frms/bombeiros-legacy-boundary';

describe('BOA legacy FRMS API separation', () => {
  it.each(['/api/frms', '/api/frms/checkin', '/api/frms/relatorios/compliance', '/api/frms/readiness'])(
    'blocks Bombeiros from all generic FRMS entrypoints: %s', path => {
      expect(isBombeirosLegacyFrmsBlocked('bombeiros', path)).toBe(true);
    },
  );

  it.each(['costadosol', 'airtrust', undefined, null])(
    'does not change generic FRMS access policy for tenant %s', code => {
      expect(isBombeirosLegacyFrmsBlocked(code, '/api/frms/checkin')).toBe(false);
      expect(isBombeirosLegacyFrmsBlocked(code, '/api/frms/relatorios/compliance')).toBe(false);
    },
  );

  it.each(['/api/bombeiros/frms', '/api/bombeiros/frms/equipe', '/api/funcionarios', '/api/frms-fake'])(
    'preserves BOA API and canonical employee registry at %s', path => {
      expect(isBombeirosLegacyFrmsBlocked('bombeiros', path)).toBe(false);
    },
  );
});

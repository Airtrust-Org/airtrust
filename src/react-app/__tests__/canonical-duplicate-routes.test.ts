import { describe, expect, it } from 'vitest';
import {
  CANONICAL_DUPLICATE_ROUTE_TARGETS,
  canonicalDuplicateRouteTarget,
} from '../lib/canonical-duplicate-routes';

describe('canonical duplicate routes', () => {
  it('converges duplicate user administration onto Settings users', () => {
    expect(canonicalDuplicateRouteTarget('/admin/usuarios')).toBe('/configuracoes?tab=usuarios');
  });

  it('converges duplicate operational surfaces onto one canonical route', () => {
    expect(CANONICAL_DUPLICATE_ROUTE_TARGETS).toMatchObject({
      '/home': '/',
      '/dashboard': '/',
      '/configuracoes/cadastros': '/configuracoes?tab=cadastros',
      '/configuracoes/integracoes/edapp': '/configuracoes/integracoes/sigvoos',
      '/importacao': '/configuracoes?tab=importacao',
      '/mro/dashboard': '/mro',
      '/controle-voos/dashboard': '/controle-voos',
      '/escalas/evd': '/escalas/diaria',
    });
  });

  it('never maps an alias back to itself', () => {
    for (const [alias, canonical] of Object.entries(CANONICAL_DUPLICATE_ROUTE_TARGETS)) {
      expect(canonical).not.toBe(alias);
    }
  });
});

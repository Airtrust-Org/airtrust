import { describe, expect, it } from 'vitest';
import { canSeeDevelopmentModules, isPrimaryAdmin } from '../development-module-nav';

describe('development module administrator access', () => {
  it.each(['ADMIN', 'ADMINISTRADOR'])('allows %s to restricted development modules', (role) => {
    expect(canSeeDevelopmentModules({ email: 'admin@example.test', role })).toBe(true);
  });

  it.each(['GESTOR', 'MANAGER', 'INSTRUTOR', 'ALUNO'])('keeps %s outside administrator development access', (role) => {
    expect(canSeeDevelopmentModules({ email: 'user@example.test', role })).toBe(false);
  });

  it('does not redefine the separate primary-admin identity contract', () => {
    expect(isPrimaryAdmin({ email: 'admin@example.test', role: 'ADMINISTRADOR' })).toBe(false);
  });
});

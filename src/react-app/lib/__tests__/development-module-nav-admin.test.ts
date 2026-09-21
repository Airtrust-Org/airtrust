import { describe, expect, it } from 'vitest';
import {
  canSeeAdministrativeDashboard,
  canSeeControleVoosDevelopmentModule,
  canSeeDevelopmentModules,
  canSeeOperationalDashboard,
  isPrimaryAdmin,
} from '../development-module-nav';

describe('development module administrator access', () => {
  it.each(['ADMIN', 'ADMINISTRADOR'])('allows %s to Controle de Voos without widening other development modules', (role) => {
    const user = { email: 'admin@example.test', role };
    expect(canSeeControleVoosDevelopmentModule(user)).toBe(true);
    expect(canSeeDevelopmentModules(user)).toBe(false);
  });

  it.each(['GESTOR', 'MANAGER'])('allows %s to the full Controle de Voos operational surface', (role) => {
    expect(canSeeControleVoosDevelopmentModule({ email: 'coordenacao@example.test', role })).toBe(true);
  });

  it.each(['INSTRUTOR', 'ALUNO'])('keeps %s outside the full Controle de Voos operational surface', (role) => {
    expect(canSeeControleVoosDevelopmentModule({ email: 'user@example.test', role })).toBe(false);
  });

  it('does not redefine the separate primary-admin identity contract', () => {
    expect(isPrimaryAdmin({ email: 'admin@example.test', role: 'ADMINISTRADOR' })).toBe(false);
  });

  it('keeps operational dashboard access aligned with manager roles', () => {
    expect(canSeeOperationalDashboard(null)).toBe(false);
    expect(canSeeOperationalDashboard({ role: 'GESTOR' })).toBe(true);
    expect(canSeeOperationalDashboard({ role: 'ALUNO' })).toBe(false);
    expect(canSeeAdministrativeDashboard({ role: 'MANAGER' })).toBe(true);
  });
});

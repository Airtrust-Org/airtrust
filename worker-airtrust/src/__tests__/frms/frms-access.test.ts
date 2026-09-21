import { describe, expect, it } from 'vitest';
import { canSeeFrmsTeamScope, canSeeFrmsTeamScopeForContext } from '../../lib/frms/access';



function configuredContext(tipo: 'GRANT' | 'DENY') {
  const db = {
    prepare: () => ({
      bind: () => ({
        first: async () => ({ tipo }),
      }),
    }),
  } as unknown as D1Database;
  return {
    env: { DB: db },
    get: (key: string) => ({ userId: 91, empresaId: 63, userRole: 'USUARIO' })[key],
  } as any;
}

describe('FRMS team scope access', () => {
  it('accepts canonical admin and manager roles after auth normalization', () => {
    expect(canSeeFrmsTeamScope('ADMINISTRADOR')).toBe(true);
    expect(canSeeFrmsTeamScope('ADMIN')).toBe(true);
    expect(canSeeFrmsTeamScope('GESTOR')).toBe(true);
    expect(canSeeFrmsTeamScope('MANAGER')).toBe(true);
  });

  it('does not grant team scope to individual crew roles', () => {
    expect(canSeeFrmsTeamScope('USUARIO')).toBe(false);
    expect(canSeeFrmsTeamScope('ALUNO')).toBe(false);
    expect(canSeeFrmsTeamScope('INSTRUTOR')).toBe(false);
  });


  it('allows a low-privilege user when frms.team.view is explicitly granted', async () => {
    await expect(canSeeFrmsTeamScopeForContext(configuredContext('GRANT'))).resolves.toBe(true);
  });

  it('lets an explicit deny remove team scope even from an otherwise eligible role', async () => {
    const context = configuredContext('DENY');
    context.get = (key: string) => ({ userId: 92, empresaId: 63, userRole: 'GESTOR' })[key];
    await expect(canSeeFrmsTeamScopeForContext(context)).resolves.toBe(false);
  });
});

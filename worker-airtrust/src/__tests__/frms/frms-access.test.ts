import { describe, expect, it } from 'vitest';
import { canSeeFrmsTeamScope } from '../../lib/frms/access';

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
});

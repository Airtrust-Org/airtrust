import { describe, expect, it } from 'vitest';
import { sessionEntryOptions } from '../session-entry-options';

describe('login — entradas operacionais por grupo', () => {
  it('reúne ALUNO e INSTRUTOR em apenas uma entrada com autorização de instrutor', () => {
    expect(sessionEntryOptions(['INSTRUTOR', 'ALUNO'])).toEqual([
      expect.objectContaining({ id: 'learning', role: 'INSTRUTOR', label: 'Aluno / Instrutor' }),
    ]);
  });

  it('um aluno comum não recebe papel de instrutor', () => {
    expect(sessionEntryOptions(['ALUNO'])).toEqual([
      expect.objectContaining({ id: 'learning', role: 'ALUNO' }),
    ]);
  });

  it('GESTOR pode escolher entre gestão e modo Aluno / Instrutor', () => {
    expect(sessionEntryOptions(['GESTOR', 'INSTRUTOR', 'ALUNO']).map(({ id, role, label }) =>
      ({ id, role, label }))).toEqual([
      { id: 'manager', role: 'GESTOR', label: 'Gestor' },
      { id: 'learning', role: 'INSTRUTOR', label: 'Aluno / Instrutor' },
    ]);
  });

  it('GESTOR sem papel de instrutor mantém o modo Aluno sem elevação', () => {
    expect(sessionEntryOptions(['GESTOR', 'ALUNO']).map(({ role }) => role)).toEqual([
      'GESTOR', 'ALUNO',
    ]);
  });

  it('ADMINISTRADOR não vê Aluno nem Instrutor mesmo com perfis legados adicionais', () => {
    expect(sessionEntryOptions(['ADMINISTRADOR', 'GESTOR', 'INSTRUTOR', 'ALUNO'])).toEqual([
      expect.objectContaining({ id: 'admin', role: 'ADMINISTRADOR' }),
    ]);
  });
});

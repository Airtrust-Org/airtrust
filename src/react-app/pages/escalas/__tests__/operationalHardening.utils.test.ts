import { describe, expect, it } from 'vitest';
import { canManageEscalaOperations } from '../utils/operationalPermissions';
import { isValidQuinzenaRange } from '../utils/quinzenaValidation';

describe('canManageEscalaOperations', () => {
  it('permite operacoes para admin e gestor', () => {
    expect(canManageEscalaOperations('ADMINISTRADOR')).toBe(true);
    expect(canManageEscalaOperations('admin')).toBe(true);
    expect(canManageEscalaOperations('GESTOR')).toBe(true);
    expect(canManageEscalaOperations('manager')).toBe(true);
  });

  it('nega operacoes para instrutor, aluno e perfis ausentes', () => {
    expect(canManageEscalaOperations('INSTRUTOR')).toBe(false);
    expect(canManageEscalaOperations('instructor')).toBe(false);
    expect(canManageEscalaOperations('ALUNO')).toBe(false);
    expect(canManageEscalaOperations(undefined)).toBe(false);
  });
});

describe('isValidQuinzenaRange', () => {
  it('aceita apenas data_fim posterior a data_inicio', () => {
    expect(isValidQuinzenaRange('2026-06-01', '2026-06-15')).toBe(true);
    expect(isValidQuinzenaRange('2026-06-01', '2026-06-01')).toBe(false);
    expect(isValidQuinzenaRange('2026-06-15', '2026-06-01')).toBe(false);
  });
});

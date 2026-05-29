import { describe, expect, it } from 'vitest';
import { isAdminRole, normalizeAirtrustRole } from '../../utils/role-resolution';

describe('role-resolution', () => {
  it('normalizes instructor aliases to INSTRUTOR', () => {
    expect(normalizeAirtrustRole('INSTRUCTOR')).toBe('INSTRUTOR');
    expect(normalizeAirtrustRole('instrutor')).toBe('INSTRUTOR');
  });

  it('normalizes student aliases to ALUNO', () => {
    expect(normalizeAirtrustRole('student')).toBe('ALUNO');
    expect(normalizeAirtrustRole('MEMBER')).toBe('ALUNO');
    expect(normalizeAirtrustRole('aluno')).toBe('ALUNO');
  });

  it('normalizes manager/admin aliases', () => {
    expect(normalizeAirtrustRole('manager')).toBe('GESTOR');
    expect(normalizeAirtrustRole('administrador')).toBe('ADMINISTRADOR');
    expect(normalizeAirtrustRole('admin')).toBe('ADMINISTRADOR');
  });

  it('normalizes viewer/user aliases to USUARIO', () => {
    expect(normalizeAirtrustRole('viewer')).toBe('USUARIO');
    expect(normalizeAirtrustRole('user')).toBe('USUARIO');
    expect(normalizeAirtrustRole('usuario')).toBe('USUARIO');
  });

  it('detects admin role after normalization', () => {
    expect(isAdminRole('admin')).toBe(true);
    expect(isAdminRole('ADMINISTRADOR')).toBe(true);
    expect(isAdminRole('gestor')).toBe(false);
  });
});

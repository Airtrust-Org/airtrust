import { describe, expect, it } from 'vitest';
import { normalizeFichaRole, resolveFichaScope } from '../../utils/ficha-role-scope';

describe('ficha-role-scope', () => {
  it('maps instructor aliases to instructor scope', () => {
    expect(normalizeFichaRole('instructor')).toBe('INSTRUTOR');
    expect(resolveFichaScope('INSTRUTOR')).toBe('INSTRUTOR_OR_ALUNO');
  });

  it('maps student/viewer aliases to student scope', () => {
    expect(normalizeFichaRole('student')).toBe('ALUNO');
    expect(normalizeFichaRole('viewer')).toBe('USUARIO');
    expect(resolveFichaScope('ALUNO')).toBe('ALUNO_PENDING_SIGNATURE');
    expect(resolveFichaScope('USUARIO')).toBe('ALUNO_PENDING_SIGNATURE');
  });

  it('keeps manager/admin as full access', () => {
    expect(resolveFichaScope('manager')).toBe('FULL_ACCESS');
    expect(resolveFichaScope('gestor')).toBe('FULL_ACCESS');
    expect(resolveFichaScope('admin')).toBe('FULL_ACCESS');
  });

  it('denies unknown roles', () => {
    expect(resolveFichaScope('OPERADOR_X')).toBe('NO_ACCESS');
    expect(resolveFichaScope('')).toBe('NO_ACCESS');
  });
});

import { describe, expect, it } from 'vitest';

type UserRole = 'admin' | 'manager' | 'instructor' | 'student' | 'viewer' | 'editor';

function normalizeRole(raw: string | undefined): UserRole | undefined {
  if (!raw) return undefined;
  const role = raw.toLowerCase().trim();

  if (role === 'admin' || role === 'administrador') return 'admin';
  if (role === 'manager' || role === 'gestor' || role === 'compliance') return 'manager';
  if (role === 'instructor' || role === 'instrutor') return 'instructor';
  if (role === 'student' || role === 'aluno' || role === 'usuario' || role === 'member')
    return 'student';
  if (role === 'editor') return 'editor';
  return 'viewer';
}

function canAccess(userRole: string, requiredRoles: Array<'admin' | 'manager'>): boolean {
  const normalized = normalizeRole(userRole);
  if (!normalized) return false;
  return requiredRoles.includes(normalized as 'admin' | 'manager');
}

describe('normalizeRole', () => {
  it('mantém admin como admin', () => {
    expect(normalizeRole('ADMINISTRADOR')).toBe('admin');
  });

  it('mantém gestor como manager', () => {
    expect(normalizeRole('GESTOR')).toBe('manager');
  });

  it('mapeia instrutor para instructor sem elevar para manager', () => {
    expect(normalizeRole('instrutor')).toBe('instructor');
    expect(normalizeRole('INSTRUCTOR')).toBe('instructor');
  });

  it('mapeia aluno/usuario para student', () => {
    expect(normalizeRole('aluno')).toBe('student');
    expect(normalizeRole('usuario')).toBe('student');
  });
});

describe('RBAC regression guard', () => {
  it('instrutor não acessa rotas de admin|manager', () => {
    expect(canAccess('instrutor', ['admin', 'manager'])).toBe(false);
  });

  it('gestor continua acessando rotas de manager', () => {
    expect(canAccess('gestor', ['manager'])).toBe(true);
  });

  it('admin continua acessando rotas de admin|manager', () => {
    expect(canAccess('admin', ['admin', 'manager'])).toBe(true);
  });
});

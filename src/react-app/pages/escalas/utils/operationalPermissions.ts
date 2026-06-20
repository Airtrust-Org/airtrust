function normalizeOperationalRole(role?: string | null): string {
  const normalized = String(role || '')
    .trim()
    .toUpperCase();

  switch (normalized) {
    case 'ADMIN':
      return 'ADMINISTRADOR';
    case 'MANAGER':
      return 'GESTOR';
    case 'INSTRUCTOR':
      return 'INSTRUTOR';
    case 'STUDENT':
      return 'ALUNO';
    default:
      return normalized;
  }
}

export function canManageEscalaOperations(role?: string | null): boolean {
  const normalizedRole = normalizeOperationalRole(role);
  return normalizedRole === 'ADMINISTRADOR' || normalizedRole === 'GESTOR';
}

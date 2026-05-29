export function normalizeAirtrustRole(value: unknown): string {
  const normalized = String(value || '')
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
    case 'MEMBER':
      return 'ALUNO';
    case 'VIEWER':
    case 'USER':
      return 'USUARIO';
    default:
      return normalized;
  }
}

export function isAdminRole(value: unknown): boolean {
  const normalized = normalizeAirtrustRole(value);
  return normalized === 'ADMINISTRADOR' || normalized === 'ADMIN';
}

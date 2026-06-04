export function resolveFadigaPostSavePath(role?: string | null): string {
  const normalized = String(role || '')
    .trim()
    .toUpperCase();

  if (
    normalized === 'ALUNO' ||
    normalized === 'STUDENT' ||
    normalized === 'INSTRUTOR' ||
    normalized === 'INSTRUCTOR' ||
    normalized === 'USUARIO' ||
    normalized === 'TRIPULANTE' ||
    normalized === 'PILOTO'
  ) {
    return '/home';
  }

  return '/';
}

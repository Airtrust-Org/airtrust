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
    // Sai da rota do formulário para garantir que o check-in concluído não permaneça aberto.
    // O toast de sucesso é emitido antes desta navegação e permanece visível no shell da aplicação.
    return '/frms';
  }

  return '/frms/controle-operacional';
}

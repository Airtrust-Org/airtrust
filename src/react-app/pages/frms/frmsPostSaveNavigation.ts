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
    return '/frms/checkin?tab=historico';
  }

  // Perfis de coordenação permanecem no contexto FRMS após registrar o check-in.
  // A operação diária é o próximo passo natural para revisão humana do caso.
  return '/frms/controle-operacional';
}

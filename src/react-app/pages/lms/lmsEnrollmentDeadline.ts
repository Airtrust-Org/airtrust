/**
 * O prazo de conclusão de uma matrícula LMS não é a validade da qualificação.
 * Depois de concluída (ou encerrada), uma matrícula pode ter prazo histórico
 * anterior sem que o treinamento profissional esteja vencido.
 */
export function shouldShowLmsEnrollmentDeadline(
  status: string | null | undefined,
  dataExpiracao: string | null | undefined,
): boolean {
  return Boolean(dataExpiracao) && (status === 'NAO_INICIADO' || status === 'EM_ANDAMENTO');
}

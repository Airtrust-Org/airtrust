export type OperationalRbacUiOperation = 'load' | 'classify' | 'activation';

export function safeOperationalRbacErrorMessage(
  operation: OperationalRbacUiOperation,
  _technicalDetail?: unknown,
): string {
  switch (operation) {
    case 'classify':
      return 'Não foi possível classificar o domínio. Tente novamente.';
    case 'activation':
      return 'Não foi possível alterar a ativação do RBAC operacional.';
    default:
      return 'Não foi possível carregar a configuração do RBAC operacional.';
  }
}

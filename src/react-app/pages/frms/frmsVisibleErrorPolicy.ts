export type FrmsVisibleOperation =
  | 'config-save'
  | 'config-reprocess'
  | 'notification-save'
  | 'team-checkins-load'
  | 'daily-checkin-submit';

export function safeFrmsVisibleErrorMessage(
  operation: FrmsVisibleOperation,
  _technicalDetail?: unknown,
): string {
  switch (operation) {
    case 'config-save':
      return 'Não foi possível salvar as configurações FRMS. Tente novamente.';
    case 'config-reprocess':
      return 'Não foi possível reprocessar os dados derivados do FRMS.';
    case 'notification-save':
      return 'Não foi possível salvar as configurações de notificação.';
    case 'team-checkins-load':
      return 'Não foi possível carregar os check-ins da equipe.';
    case 'daily-checkin-submit':
      return 'Não foi possível registrar o check-in de fadiga. Tente novamente.';
  }
}

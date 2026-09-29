import type { Env } from '../types';

/**
 * Caminho legado mantido apenas por compatibilidade de imports/guards.
 * Lembretes automáticos de treinamento foram consolidados na régua canônica
 * de qualificações e este processador não produz mais notificações.
 */
export async function processLmsCompletionReminders(
  _env: Env,
): Promise<{ avaliados: number; criados: number }> {
  return { avaliados: 0, criados: 0 };
}

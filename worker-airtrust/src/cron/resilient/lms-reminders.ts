import { getModuleAlertSettings, renderAlertTemplate } from '../../services/module-alert-settings';
import type { CronJobLogger } from './job-runner';

export const LMS_REMINDER_DISCOVERY_BATCH = 100;
export const LMS_REMINDER_PROCESS_BATCH = 100;

type ReminderPayload = {
  titulo: string;
  data_expiracao: string;
  dias_restantes: number;
};

export function isLmsReminderDue(
  settings: Awaited<ReturnType<typeof getModuleAlertSettings>>['lms_completion'],
  daysRemaining: number,
): boolean {
  return settings.enabled && settings.thresholds.includes(daysRemaining);
}

export function buildLmsReminderContent(
  settings: Awaited<ReturnType<typeof getModuleAlertSettings>>['lms_completion'],
  payload: ReminderPayload,
): { title: string; message: string } {
  const formattedExpiration = new Date(`${payload.data_expiracao}T12:00:00Z`).toLocaleDateString(
    'pt-BR',
    { timeZone: 'UTC' },
  );
  const statusPrazo =
    payload.dias_restantes === 0
      ? 'Vence hoje'
      : payload.dias_restantes === 1
        ? 'Vence em 1 dia'
        : `Vence em ${payload.dias_restantes} dias`;
  const variables = {
    treinamento: payload.titulo,
    data_limite: formattedExpiration,
    dias: payload.dias_restantes,
    status_prazo: statusPrazo,
  };
  return {
    title: renderAlertTemplate(settings.title_template, variables),
    message: renderAlertTemplate(settings.message_template, variables),
  };
}

export function buildLmsReminderDiscoveryQuery(): string {
  return `SELECT
            m.id,
            m.funcionario_id,
            m.empresa_id,
            c.titulo,
            m.data_expiracao,
            CAST(julianday(date(m.data_expiracao)) - julianday(date('now')) AS INTEGER) AS dias_restantes
          FROM lms_matriculas m
          JOIN lms_cursos c
            ON c.id = m.curso_id
           AND c.empresa_id = m.empresa_id
           AND c.deleted_at IS NULL
          JOIN funcionarios f
            ON f.id = m.funcionario_id
           AND f.empresa_id = m.empresa_id
           AND f.deleted_at IS NULL
           AND COALESCE(f.ativo, 1) = 1
           AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
         WHERE m.deleted_at IS NULL
           AND m.status IN ('NAO_INICIADO', 'EM_ANDAMENTO')
           AND m.data_expiracao IS NOT NULL
           AND COALESCE(m.observacoes, '') NOT LIKE 'Matrícula automática: renovação de qualificação EAD%'
           AND CAST(julianday(date(m.data_expiracao)) - julianday(date('now')) AS INTEGER) BETWEEN 0 AND 365
           AND m.id > ?
         ORDER BY m.id ASC
         LIMIT ?`;
}

/**
 * Compatibilidade para o job resiliente antigo. Não cria mais notificações.
 * A única comunicação automática de treinamento é a régua canônica diária.
 */
export async function runLmsReminderJob(
  _db: D1Database,
  _logger: CronJobLogger,
  _now = new Date(),
): Promise<{ disabled: true }> {
  return { disabled: true };
}

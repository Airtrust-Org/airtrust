import type { Env } from '../../types';
import { frmsDailyCheck } from '../frms-daily-check';
import { runFrmsIntegrityAudit } from '../../lib/frms/integrity-audit';
import { frmsCaseOverdueEscalation } from '../frms-case-overdue';
import { frmsFadigaReminder } from '../frms-fadiga-reminder';
import type { CronJobLogger } from './job-runner';


export async function runDailyFrmsOperations(
  event: ScheduledEvent,
  env: Env,
  logger: CronJobLogger,
): Promise<void> {
  try {
    const audit = await runFrmsIntegrityAudit(env.DB);
    const totalAnomalias =
      audit.jornadasSemFatorizacao +
      audit.jornadasLancadasForaQuinzena +
      audit.rollingSemJornadaRecente;

    if (totalAnomalias > 0) {
      await env.DB.prepare(
        `INSERT INTO notificacoes_sistema (
           tipo, prioridade, titulo, mensagem, grupo, dados, empresa_id, created_at, updated_at
         ) VALUES (
           'ALERTA_DADOS', 'ALTA', 'Auditoria diária FRMS: inconsistências detectadas',
           ?, 'auditoria', ?, NULL, datetime('now'), datetime('now')
         )`,
      )
        .bind(
          `FRMS detectou inconsistências: ${audit.jornadasSemFatorizacao} jornada(s) sem fatorização, ${audit.jornadasLancadasForaQuinzena} jornada(s) lançada(s) fora da quinzena (tolerância ±2 dias), ${audit.rollingSemJornadaRecente} linha(s) de rolling sem jornada nos últimos 120 dias.`,
          JSON.stringify(audit),
        )
        .run();
      logger.warn('[CRON] Auditoria diária FRMS detectou anomalias', audit);
    } else {
      logger.log('[CRON] Auditoria diária FRMS sem inconsistências');
    }
  } catch (error) {
    logger.error('[CRON] Erro na auditoria diária FRMS', error);
  }

  try {
    const result = await frmsDailyCheck(env);
    logger.log('[CRON] FRMS daily check concluído', {
      tripulantes_encontrados: result.tripulantesEncontrados,
      tripulantes_processados: result.tripulantesProcessados,
      sem_watermark_sigvoos: result.semWatermarkSigvoos,
      jornadas_ausentes: result.jornadasAusentes,
      jornadas_invalidas: result.jornadasInvalidas,
      alertas_gerados: result.alertasGerados,
    });
  } catch (error) {
    logger.error('[CRON] Erro no FRMS daily check', error);
  }

  try {
    const result = await frmsFadigaReminder(env);
    logger.log('[CRON] Reminder FRMS check-in concluído', {
      notificacoes: result.notificacoes,
      trigger: event.cron,
    });
  } catch (error) {
    logger.error('[CRON] Erro no reminder de check-in de fadiga', error);
  }

  try {
    const result = await frmsCaseOverdueEscalation(env);
    logger.log('[CRON] Escalonamento de casos FRMS vencidos concluído', {
      empresas: result.empresas,
      casos_vencidos: result.casosVencidos,
      notificacoes: result.notificacoes,
      registros: result.registros,
      falhas: result.falhas,
      truncadas: result.truncadas,
    });
    if (result.falhas > 0) {
      logger.warn('[CRON] Escalonamento de casos FRMS falhou para alguma empresa', { falhas: result.falhas });
    }
  } catch (error) {
    logger.error('[CRON] Erro no escalonamento de casos FRMS vencidos', error);
  }
}

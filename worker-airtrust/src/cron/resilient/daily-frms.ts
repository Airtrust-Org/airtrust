import type { Env } from '../../types';
import { frmsDailyCheck } from '../frms-daily-check';
import { frmsFadigaReminder } from '../frms-fadiga-reminder';
import type { CronJobLogger } from './job-runner';

async function runFrmsIntegrityAudit(db: D1Database): Promise<{
  jornadasSemFatorizacao: number;
  jornadasLancadasForaQuinzena: number;
  rollingSemJornadaRecente: number;
}> {
  const jornadasSemFatorizacao = await db
    .prepare(
      `SELECT COUNT(*) AS total
         FROM frms_jornada j
         LEFT JOIN frms_fatorizacao_jornada fj
           ON fj.jornada_id = j.id
          AND fj.deleted_at IS NULL
        WHERE j.deleted_at IS NULL
          AND fj.id IS NULL`,
    )
    .first<{ total: number }>();

  const jornadasLancadasForaQuinzena = await db
    .prepare(
      `WITH jornadas_lancadas AS (
         SELECT j.id, j.tripulante_id, j.data
           FROM frms_jornada j
          WHERE j.deleted_at IS NULL
            AND (
              j.hora_apresentacao IS NOT NULL
              OR j.hora_termino IS NOT NULL
              OR COALESCE(j.horas_voo_minutos, 0) > 0
              OR COALESCE(j.duracao_jornada_minutos, 0) > 0
            )
       ),
       jornadas_fora_faixa AS (
         SELECT jl.id
           FROM jornadas_lancadas jl
          WHERE NOT EXISTS (
            SELECT 1
              FROM escala_alocacoes ea
             WHERE CAST(ea.funcionario_id AS TEXT) = CAST(jl.tripulante_id AS TEXT)
               AND ea.deleted_at IS NULL
               AND ea.status != 'cancelado'
               AND (
                 ea.aeronave_id IS NOT NULL
                 OR ea.quinzena_id IS NOT NULL
                 OR (ea.situacao_tipo IS NOT NULL AND UPPER(ea.situacao_tipo) != 'FOLGA')
               )
               AND jl.data BETWEEN date(ea.data_inicio, '-2 day') AND date(ea.data_fim, '+2 day')
          )
       )
       SELECT COUNT(*) AS total FROM jornadas_fora_faixa`,
    )
    .first<{ total: number }>();

  const rollingSemJornadaRecente = await db
    .prepare(
      `SELECT COUNT(*) AS total
         FROM frms_acumulo_rolling ar
         LEFT JOIN frms_jornada j
           ON j.tripulante_id = ar.tripulante_id
          AND j.data = ar.data_referencia
          AND j.deleted_at IS NULL
        WHERE ar.deleted_at IS NULL
          AND j.id IS NULL
          AND ar.data_referencia >= date('now', '-120 days')`,
    )
    .first<{ total: number }>();

  return {
    jornadasSemFatorizacao: Number(jornadasSemFatorizacao?.total || 0),
    jornadasLancadasForaQuinzena: Number(jornadasLancadasForaQuinzena?.total || 0),
    rollingSemJornadaRecente: Number(rollingSemJornadaRecente?.total || 0),
  };
}

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
}

import {
  enqueueCronJobItem,
  listRunnableCronJobItems,
  markCronJobItemFailed,
  markCronJobItemProcessing,
  markCronJobItemSucceeded,
  recoverStaleCronJobItems,
} from '../job-state';
import { runCronJobWithLease, type CronJobLogger } from './job-runner';

const JOB_NAME = 'lms-reminders';
const SCOPE_KEY = 'global';
export const LMS_REMINDER_DISCOVERY_BATCH = 100;
export const LMS_REMINDER_PROCESS_BATCH = 100;

interface ReminderRow {
  id: number;
  funcionario_id: number;
  empresa_id: number;
  titulo: string;
  data_expiracao: string;
  dias_restantes: number;
}

interface ReminderPayload extends ReminderRow {
  operational_date: string;
}

function parseMetadata(value: string | null | undefined): {
  operationalDate?: string;
  discoveryComplete?: boolean;
} {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return {
      operationalDate:
        typeof parsed.operationalDate === 'string' ? parsed.operationalDate : undefined,
      discoveryComplete: parsed.discoveryComplete === true,
    };
  } catch {
    return {};
  }
}

function parsePayload(value: string | null): ReminderPayload | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const id = Number(parsed.id);
    const funcionarioId = Number(parsed.funcionario_id);
    const empresaId = Number(parsed.empresa_id);
    const diasRestantes = Number(parsed.dias_restantes);
    if (
      !Number.isInteger(id) ||
      id <= 0 ||
      !Number.isInteger(funcionarioId) ||
      funcionarioId <= 0 ||
      !Number.isInteger(empresaId) ||
      empresaId <= 0 ||
      ![1, 7].includes(diasRestantes) ||
      typeof parsed.titulo !== 'string' ||
      typeof parsed.data_expiracao !== 'string' ||
      typeof parsed.operational_date !== 'string'
    ) {
      return null;
    }
    return {
      id,
      funcionario_id: funcionarioId,
      empresa_id: empresaId,
      dias_restantes: diasRestantes,
      titulo: parsed.titulo,
      data_expiracao: parsed.data_expiracao,
      operational_date: parsed.operational_date,
    };
  } catch {
    return null;
  }
}

function notificationId(payload: ReminderPayload): string {
  const type =
    payload.dias_restantes === 1 ? 'lms_prazo_conclusao_1_dia' : 'lms_prazo_conclusao_7_dias';
  return [
    'lms',
    type,
    payload.empresa_id,
    payload.funcionario_id,
    'lms_matricula',
    payload.id,
    payload.operational_date,
  ].join(':');
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
           AND CAST(julianday(date(m.data_expiracao)) - julianday(date('now')) AS INTEGER) IN (1, 7)
           AND m.id > ?
         ORDER BY m.id ASC
         LIMIT ?`;
}

export async function runLmsReminderJob(db: D1Database, logger: CronJobLogger, now = new Date()) {
  const operationalDate = now.toISOString().slice(0, 10);

  return runCronJobWithLease({
    db,
    jobName: JOB_NAME,
    scopeKey: SCOPE_KEY,
    logger,
    ttlSeconds: 180,
    budgetMs: 20_000,
    metadata: { operational_date: operationalDate },
    execute: async (context) => {
      await recoverStaleCronJobItems(db, {
        jobName: JOB_NAME,
        scopeKey: SCOPE_KEY,
        staleMinutes: 20,
      });

      const previousMetadata = parseMetadata(context.state?.metadata_json);
      const sameDay = previousMetadata.operationalDate === operationalDate;
      let discoveryComplete = sameDay && previousMetadata.discoveryComplete === true;
      let cursor = sameDay ? Number(context.state?.cursor_value ?? 0) : 0;
      if (!Number.isFinite(cursor) || cursor < 0) cursor = 0;

      if (!discoveryComplete && context.hasBudget(3000)) {
        const discovered = await db
          .prepare(buildLmsReminderDiscoveryQuery())
          .bind(cursor, LMS_REMINDER_DISCOVERY_BATCH)
          .all<ReminderRow>();
        const rows = discovered.results || [];

        for (const row of rows) {
          await enqueueCronJobItem(db, {
            jobName: JOB_NAME,
            scopeKey: SCOPE_KEY,
            itemKey: `${operationalDate}:${row.id}:${row.dias_restantes}`,
            stage: 'NOTIFICATION_PENDING',
            payload: { ...row, operational_date: operationalDate },
          });
        }

        discoveryComplete = rows.length < LMS_REMINDER_DISCOVERY_BATCH;
        cursor = discoveryComplete ? 0 : Number(rows.at(-1)?.id ?? cursor);
        await context.checkpoint({
          cursorValue: String(cursor),
          metadata: { operationalDate, discoveryComplete },
        });
        await context.heartbeat();
      }

      const items = await listRunnableCronJobItems(db, {
        jobName: JOB_NAME,
        scopeKey: SCOPE_KEY,
        limit: LMS_REMINDER_PROCESS_BATCH,
      });

      let processed = 0;
      let failed = 0;
      for (const item of items) {
        if (!context.hasBudget(1500)) break;
        const claimed = await markCronJobItemProcessing(db, {
          jobName: JOB_NAME,
          scopeKey: SCOPE_KEY,
          itemKey: item.item_key,
          stage: 'NOTIFICATION_INSERT',
        });
        if (!claimed) continue;

        const payload = parsePayload(item.payload_json);
        if (!payload) {
          failed++;
          await markCronJobItemFailed(db, {
            jobName: JOB_NAME,
            scopeKey: SCOPE_KEY,
            itemKey: item.item_key,
            stage: 'INVALID_PAYLOAD',
            errorCode: 'LMS_REMINDER_INVALID_PAYLOAD',
            errorMessage: 'Payload operacional inválido.',
            retryDelaySeconds: 86400,
          });
          continue;
        }

        try {
          const type =
            payload.dias_restantes === 1
              ? 'lms_prazo_conclusao_1_dia'
              : 'lms_prazo_conclusao_7_dias';
          const title =
            payload.dias_restantes === 1
              ? 'Prazo do treinamento vence amanhã'
              : 'Prazo do treinamento vence em 7 dias';
          const formattedExpiration = new Date(
            `${payload.data_expiracao}T12:00:00Z`,
          ).toLocaleDateString('pt-BR', { timeZone: 'UTC' });

          await db
            .prepare(
              `INSERT OR IGNORE INTO notificacoes_inapp (
                 id, funcionario_id, empresa_id, tipo, titulo, mensagem,
                 referencia_id, referencia_tipo, created_at
               ) VALUES (?, ?, ?, ?, ?, ?, ?, 'lms_matricula', ?)`,
            )
            .bind(
              notificationId(payload),
              String(payload.funcionario_id),
              payload.empresa_id,
              type,
              title,
              `Conclua o treinamento ${payload.titulo} até ${formattedExpiration}.`,
              String(payload.id),
              new Date().toISOString(),
            )
            .run();

          await markCronJobItemSucceeded(db, {
            jobName: JOB_NAME,
            scopeKey: SCOPE_KEY,
            itemKey: item.item_key,
            stage: 'NOTIFICATION_CREATED',
          });
          processed++;
        } catch (error) {
          failed++;
          await markCronJobItemFailed(db, {
            jobName: JOB_NAME,
            scopeKey: SCOPE_KEY,
            itemKey: item.item_key,
            stage: 'NOTIFICATION_INSERT_FAILED',
            errorCode: 'LMS_REMINDER_INSERT_FAILED',
            errorMessage: error instanceof Error ? error.message : String(error),
            retryDelaySeconds: Math.min(3600, 60 * 2 ** Math.min(item.attempts, 5)),
          });
        }
      }

      const remaining = await db
        .prepare(
          `SELECT COUNT(*) AS total
             FROM cron_job_items
            WHERE job_name = ?
              AND scope_key = ?
              AND status != 'SUCCEEDED'`,
        )
        .bind(JOB_NAME, SCOPE_KEY)
        .first<{ total: number }>();
      const pending = Number(remaining?.total || 0);
      const succeeded = discoveryComplete && pending === 0 && failed === 0;

      return {
        outcome: succeeded ? ('SUCCEEDED' as const) : ('PARTIAL' as const),
        processedCount: processed,
        failedCount: failed,
        cursorAfter: String(cursor),
        metadata: {
          operationalDate,
          discoveryComplete,
          pending_count: pending,
        },
        markStateSuccess: succeeded,
      };
    },
  });
}

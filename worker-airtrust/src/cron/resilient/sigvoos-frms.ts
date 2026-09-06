import type { Env } from '../../types';
import { enviarEmailAlert } from '../notificacoes';
import { LIMITES_DEFAULT } from '../../lib/frms/types';
import { reprocessarTripulanteCompleto } from '../../lib/frms/db-service';
import { fetchControleVoosOperationalRecords } from '../../lib/frms/controle-voos-source';
import {
  compareControleVoosWithLegacyJornada,
  type FrmsJornadaLegacyRow,
} from '../../lib/frms/controle-voos-shadow-comparator';
import { isControleVoosShadowModeEnabledForEmpresa } from '../../lib/frms/controle-voos-shadow-flag';
import { getSigvoosConfig, syncSigvoosForFrms } from '../../services/sigvoos-frms';
import {
  buildCronScopeKey,
  enqueueCronJobItem,
  getCronJobState,
  listRunnableCronJobItems,
  markCronJobItemFailed,
  markCronJobItemProcessing,
  markCronJobItemSucceeded,
  recoverStaleCronJobItems,
} from '../job-state';
import { runCronJobWithLease, type CronJobLogger } from './job-runner';

const DISPATCH_JOB = 'sigvoos-dispatch';
const INGEST_JOB = 'sigvoos-ingest';
const FRMS_JOB = 'frms-reprocess';
const GLOBAL_SCOPE = 'global';
export const SIGVOOS_TENANT_BATCH = 25;
export const SIGVOOS_TRIPULANTE_ENQUEUE_BATCH = 100;
export const FRMS_REPROCESS_BATCH = 25;

interface SigvoosConfigCursorRow {
  empresa_id: number | null;
  sort_id: number;
}

interface FrmsItemPayload {
  empresa_id: number | null;
  tripulante_id: number;
  period_from: string;
  period_to: string;
}

interface IngestMetadata {
  stage?: 'FRMS_ENQUEUE' | 'COMPLETE';
  periodFrom?: string;
  periodTo?: string;
  totalRaw?: number;
  totalImportacoes?: number;
}

function parseMetadata(value: string | null | undefined): IngestMetadata {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const stage =
      parsed.stage === 'FRMS_ENQUEUE' || parsed.stage === 'COMPLETE' ? parsed.stage : undefined;
    return {
      stage,
      periodFrom: typeof parsed.periodFrom === 'string' ? parsed.periodFrom : undefined,
      periodTo: typeof parsed.periodTo === 'string' ? parsed.periodTo : undefined,
      totalRaw: Number.isFinite(Number(parsed.totalRaw)) ? Number(parsed.totalRaw) : undefined,
      totalImportacoes: Number.isFinite(Number(parsed.totalImportacoes))
        ? Number(parsed.totalImportacoes)
        : undefined,
    };
  } catch {
    return {};
  }
}

function parseFrmsPayload(value: string | null): FrmsItemPayload | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const empresaId = parsed.empresa_id == null ? null : Number(parsed.empresa_id);
    const tripulanteId = Number(parsed.tripulante_id);
    if (
      (empresaId !== null && (!Number.isInteger(empresaId) || empresaId <= 0)) ||
      !Number.isInteger(tripulanteId) ||
      tripulanteId <= 0 ||
      typeof parsed.period_from !== 'string' ||
      typeof parsed.period_to !== 'string'
    ) {
      return null;
    }
    return {
      empresa_id: empresaId,
      tripulante_id: tripulanteId,
      period_from: parsed.period_from,
      period_to: parsed.period_to,
    };
  } catch {
    return null;
  }
}

function formatSaoPauloDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function addIsoDay(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function resolveNextSigvoosDay(
  durableLastTo: string | null | undefined,
  legacyLastTo: string | null | undefined,
  operationalDate: string,
): string | null {
  const lastTo = durableLastTo || legacyLastTo || null;
  if (!lastTo) return operationalDate;
  const candidate = addIsoDay(lastTo, 1);
  if (candidate > operationalDate) return null;
  // The job already processes a single operational day per invocation. Never
  // jump the watermark forward to enforce a catch-up horizon: doing so silently
  // discards every missed day before that horizon. Resume from the exact next
  // durable/legacy day and let subsequent scheduled invocations catch up.
  return candidate;
}

export function shouldRunSigvoosAtCurrentHour(
  configuredHour: string | null | undefined,
  now: Date,
): boolean {
  const parsed = Number.parseInt(configuredHour ?? '19', 10);
  const targetHour = Number.isFinite(parsed) ? Math.max(0, Math.min(23, parsed)) : 19;
  return now.getUTCHours() === targetHour;
}

async function registerFailureEvent(
  db: D1Database,
  empresaId: number | null,
  operationalDate: string,
  errorCode: string,
): Promise<boolean> {
  const scope = buildCronScopeKey(empresaId).replace(/[^a-zA-Z0-9:_-]/g, '_');
  const id = `cron_sigvoos_failure:${scope}:${operationalDate}`;
  const timestamp = new Date().toISOString();
  const result = await db
    .prepare(
      `INSERT OR IGNORE INTO integracoes_sigvoos_eventos (
         id, empresa_id, tipo_evento, status, payload_json, erro_ultima, created_at, updated_at
       ) VALUES (?, ?, 'CRON_FALHA', 'FALHA', ?, ?, ?, ?)`,
    )
    .bind(
      id,
      empresaId,
      JSON.stringify({ operational_date: operationalDate, error_code: errorCode }),
      errorCode.slice(0, 120),
      timestamp,
      timestamp,
    )
    .run();
  return Number(result.meta.changes || 0) === 1;
}

async function notifyFailureOnce(
  db: D1Database,
  empresaId: number | null,
  env: Env,
  operationalDate: string,
  errorCode: string,
  logger: CronJobLogger,
): Promise<void> {
  try {
    const inserted = await registerFailureEvent(db, empresaId, operationalDate, errorCode);
    if (!inserted || !env.BREVO_API_KEY) return;
    const config = await getSigvoosConfig(db, empresaId, undefined, env);
    if (!config.notificar_falha_email) return;
    await enviarEmailAlert(
      env,
      [config.notificar_falha_email],
      `[AirTrust] Falha na sincronização FRMS automática - ${operationalDate}`,
      `A sincronização automática SIGVOOS falhou. Código operacional: ${errorCode}. Empresa: ${empresaId ?? 'Global'}.`,
    );
  } catch (error) {
    logger.warn('[SIGVOOS_CRON] Falha ao registrar alerta deduplicado', {
      scope_key: buildCronScopeKey(empresaId),
      error_code: error instanceof Error ? error.message : String(error),
    });
  }
}

async function runShadowComparison(
  db: D1Database,
  empresaId: number,
  periodFrom: string,
  periodTo: string,
  env: Env,
  logger: CronJobLogger,
): Promise<void> {
  if (!isControleVoosShadowModeEnabledForEmpresa(empresaId, env)) return;
  try {
    const [records, legacy] = await Promise.all([
      fetchControleVoosOperationalRecords(db, empresaId, periodFrom, periodTo),
      db
        .prepare(
          `SELECT tripulante_id, data, empresa_id
             FROM frms_jornada
            WHERE empresa_id = ? AND data BETWEEN ? AND ?`,
        )
        .bind(empresaId, periodFrom, periodTo)
        .all<FrmsJornadaLegacyRow>()
        .then((result) => result.results || []),
    ]);
    const summary = compareControleVoosWithLegacyJornada(records, legacy, {
      from: periodFrom,
      to: periodTo,
    });
    logger.log('[SIGVOOS_CRON] Shadow Controle de Voos concluído', {
      scope_key: buildCronScopeKey(empresaId),
      legacy_count: summary.totalRegistrosLegado,
      controle_voos_count: summary.totalRegistrosControleVoos,
      divergence_count: summary.totalDivergencias,
    });
  } catch (error) {
    logger.warn('[SIGVOOS_CRON] Shadow Controle de Voos falhou sem afetar ingestão', {
      scope_key: buildCronScopeKey(empresaId),
      error_code: error instanceof Error ? error.message : String(error),
    });
  }
}

async function runTenantIngestion(
  db: D1Database,
  empresaId: number | null,
  env: Env,
  logger: CronJobLogger,
  now: Date,
) {
  const scopeKey = buildCronScopeKey(empresaId);
  const operationalDate = formatSaoPauloDate(now);
  const result = await runCronJobWithLease({
    db,
    jobName: INGEST_JOB,
    scopeKey,
    logger,
    ttlSeconds: 900,
    budgetMs: 8 * 60_000,
    metadata: { operational_date: operationalDate },
    execute: async (context) => {
      const config = await getSigvoosConfig(db, empresaId, undefined, env);
      if (config.auto_sync_enabled === 'false' || !config.username || !config.password) {
        return {
          outcome: 'SUCCEEDED' as const,
          processedCount: 0,
          cursorAfter: context.state?.cursor_value ?? null,
          watermarkFrom: context.state?.watermark_from ?? null,
          watermarkTo: context.state?.watermark_to ?? null,
          metadata: { stage: 'COMPLETE', skipped: 'CONFIG_DISABLED_OR_INCOMPLETE' },
        };
      }
      if (!shouldRunSigvoosAtCurrentHour(config.auto_sync_hora_utc, now)) {
        return {
          outcome: 'SUCCEEDED' as const,
          processedCount: 0,
          cursorAfter: context.state?.cursor_value ?? null,
          watermarkFrom: context.state?.watermark_from ?? null,
          watermarkTo: context.state?.watermark_to ?? null,
          metadata: { stage: 'COMPLETE', skipped: 'OUTSIDE_CONFIGURED_HOUR' },
          markStateSuccess: false,
        };
      }

      const prior = parseMetadata(context.state?.metadata_json);
      let periodFrom = prior.stage === 'FRMS_ENQUEUE' ? prior.periodFrom : undefined;
      let periodTo = prior.stage === 'FRMS_ENQUEUE' ? prior.periodTo : undefined;
      let totalRaw = prior.totalRaw ?? 0;
      let totalImportacoes = prior.totalImportacoes ?? 0;
      let enqueueCursor =
        prior.stage === 'FRMS_ENQUEUE' ? Number(context.state?.cursor_value ?? 0) : 0;
      if (!Number.isFinite(enqueueCursor) || enqueueCursor < 0) enqueueCursor = 0;

      if (!periodFrom || !periodTo) {
        const nextDay = resolveNextSigvoosDay(
          context.state?.watermark_to,
          config.last_sync_to,
          operationalDate,
        );
        if (!nextDay) {
          return {
            outcome: 'SUCCEEDED' as const,
            processedCount: 0,
            cursorAfter: null,
            watermarkFrom: context.state?.watermark_from ?? null,
            watermarkTo: context.state?.watermark_to ?? operationalDate,
            metadata: { stage: 'COMPLETE', operationalDate },
          };
        }

        periodFrom = nextDay;
        periodTo = nextDay;
        const sync = await syncSigvoosForFrms(
          db,
          empresaId,
          'cron',
          {
            from: periodFrom,
            to: periodTo,
            pageSize: 100,
            maxPages: 1,
            clearExisting: false,
          },
          env,
        );
        totalRaw = Number(sync.totalRegistrosBrutos || 0);
        totalImportacoes = Number(sync.totalImportacoes || 0);
        await context.checkpoint({
          cursorValue: '0',
          watermarkFrom: periodFrom,
          watermarkTo: periodTo,
          metadata: {
            stage: 'FRMS_ENQUEUE',
            periodFrom,
            periodTo,
            totalRaw,
            totalImportacoes,
          },
        });
        await context.heartbeat();
        if (empresaId !== null) {
          await runShadowComparison(db, empresaId, periodFrom, periodTo, env, logger);
        }
      }

      let enqueued = 0;
      let enqueueComplete = false;
      while (context.hasBudget(5000)) {
        const statement =
          empresaId === null
            ? db
                .prepare(
                  `SELECT DISTINCT CAST(tripulante_id AS INTEGER) AS tripulante_id
                 FROM frms_jornada
                WHERE data BETWEEN ? AND ?
                  AND deleted_at IS NULL
                  AND CAST(tripulante_id AS INTEGER) > ?
                ORDER BY CAST(tripulante_id AS INTEGER) ASC
                LIMIT ?`,
                )
                .bind(periodFrom, periodTo, enqueueCursor, SIGVOOS_TRIPULANTE_ENQUEUE_BATCH)
            : db
                .prepare(
                  `SELECT DISTINCT CAST(tripulante_id AS INTEGER) AS tripulante_id
                 FROM frms_jornada
                WHERE data BETWEEN ? AND ?
                  AND empresa_id = ?
                  AND deleted_at IS NULL
                  AND CAST(tripulante_id AS INTEGER) > ?
                ORDER BY CAST(tripulante_id AS INTEGER) ASC
                LIMIT ?`,
                )
                .bind(
                  periodFrom,
                  periodTo,
                  empresaId,
                  enqueueCursor,
                  SIGVOOS_TRIPULANTE_ENQUEUE_BATCH,
                );
        const rows = await statement.all<{ tripulante_id: number }>();
        const tripulantes = rows.results || [];

        for (const row of tripulantes) {
          const tripulanteId = Number(row.tripulante_id);
          if (!Number.isInteger(tripulanteId) || tripulanteId <= 0) continue;
          await enqueueCronJobItem(db, {
            jobName: FRMS_JOB,
            scopeKey,
            itemKey: `${periodFrom}:${periodTo}:${tripulanteId}`,
            stage: 'FRMS_REPROCESS_PENDING',
            payload: {
              empresa_id: empresaId,
              tripulante_id: tripulanteId,
              period_from: periodFrom,
              period_to: periodTo,
            },
          });
          enqueued++;
        }

        if (tripulantes.length < SIGVOOS_TRIPULANTE_ENQUEUE_BATCH) {
          enqueueComplete = true;
          enqueueCursor = 0;
          break;
        }
        enqueueCursor = Number(tripulantes.at(-1)?.tripulante_id ?? enqueueCursor);
        await context.checkpoint({
          cursorValue: String(enqueueCursor),
          watermarkFrom: periodFrom,
          watermarkTo: periodTo,
          metadata: {
            stage: 'FRMS_ENQUEUE',
            periodFrom,
            periodTo,
            totalRaw,
            totalImportacoes,
          },
        });
        await context.heartbeat();
      }

      if (!enqueueComplete) {
        return {
          outcome: 'PARTIAL' as const,
          processedCount: enqueued,
          cursorAfter: String(enqueueCursor),
          watermarkFrom: periodFrom,
          watermarkTo: periodTo,
          metadata: {
            stage: 'FRMS_ENQUEUE',
            periodFrom,
            periodTo,
            totalRaw,
            totalImportacoes,
          },
          markStateSuccess: false,
        };
      }

      return {
        outcome: 'SUCCEEDED' as const,
        processedCount: enqueued,
        cursorAfter: null,
        watermarkFrom: periodFrom,
        watermarkTo: periodTo,
        metadata: {
          stage: 'COMPLETE',
          periodFrom,
          periodTo,
          totalRaw,
          totalImportacoes,
          frms_items_enqueued: enqueued,
        },
      };
    },
  });

  if (result.outcome === 'FAILED') {
    await notifyFailureOnce(
      db,
      empresaId,
      env,
      operationalDate,
      result.errorCode || 'SIGVOOS_CRON_FAILED',
      logger,
    );
  }
  return result;
}

async function dispatchSigvoosTenants(db: D1Database, env: Env, logger: CronJobLogger, now: Date) {
  return runCronJobWithLease({
    db,
    jobName: DISPATCH_JOB,
    scopeKey: GLOBAL_SCOPE,
    logger,
    ttlSeconds: 900,
    budgetMs: 9 * 60_000,
    execute: async (context) => {
      let cursor = Number(context.state?.cursor_value ?? -1);
      if (!Number.isFinite(cursor) || cursor < -1) cursor = -1;
      const configured = await db
        .prepare(
          `SELECT empresa_id, COALESCE(empresa_id, 0) AS sort_id
             FROM integracoes_sigvoos_config
            WHERE chave = 'username'
              AND valor IS NOT NULL
              AND valor != ''
              AND deleted_at IS NULL
              AND COALESCE(empresa_id, 0) > ?
            GROUP BY empresa_id
            ORDER BY COALESCE(empresa_id, 0) ASC
            LIMIT ?`,
        )
        .bind(cursor, SIGVOOS_TENANT_BATCH)
        .all<SigvoosConfigCursorRow>();
      const rows = configured.results || [];
      let processed = 0;
      let failed = 0;

      for (const row of rows) {
        if (!context.hasBudget(15_000)) break;
        const tenant = await runTenantIngestion(db, row.empresa_id, env, logger, now);
        processed += tenant.processedCount;
        failed += tenant.failedCount;
        cursor = Number(row.sort_id);
        await context.checkpoint({ cursorValue: String(cursor) });
        await context.heartbeat();
      }

      const complete = rows.length < SIGVOOS_TENANT_BATCH;
      if (complete) cursor = -1;
      return {
        outcome: failed > 0 || !complete ? ('PARTIAL' as const) : ('SUCCEEDED' as const),
        processedCount: processed,
        failedCount: failed,
        cursorAfter: String(cursor),
        metadata: { tenant_batch_count: rows.length, discovery_complete: complete },
        markStateSuccess: complete && failed === 0,
      };
    },
  });
}

function scopeToEmpresaId(scopeKey: string): number | null | undefined {
  if (scopeKey === GLOBAL_SCOPE) return null;
  const match = /^empresa:(\d+)$/.exec(scopeKey);
  if (!match) return undefined;
  const value = Number(match[1]);
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

async function validateTripulanteTenant(
  db: D1Database,
  tripulanteId: number,
  empresaId: number | null,
): Promise<boolean> {
  if (empresaId === null) return true;
  const row = await db
    .prepare(
      `SELECT id
         FROM funcionarios
        WHERE id = ?
          AND empresa_id = ?
          AND deleted_at IS NULL
        LIMIT 1`,
    )
    .bind(tripulanteId, empresaId)
    .first<{ id: number }>();
  return Boolean(row?.id);
}

async function runFrmsQueueScope(
  db: D1Database,
  env: Env,
  scopeKey: string,
  logger: CronJobLogger,
) {
  const empresaId = scopeToEmpresaId(scopeKey);
  if (empresaId === undefined) return;

  await runCronJobWithLease({
    db,
    jobName: FRMS_JOB,
    scopeKey,
    logger,
    ttlSeconds: 600,
    budgetMs: 90_000,
    execute: async (context) => {
      await recoverStaleCronJobItems(db, {
        jobName: FRMS_JOB,
        scopeKey,
        staleMinutes: 30,
      });
      const items = await listRunnableCronJobItems(db, {
        jobName: FRMS_JOB,
        scopeKey,
        limit: FRMS_REPROCESS_BATCH,
      });
      // reprocessarTripulanteCompleto's limites parameter is inert (recalcularPipeline self-resolves).
      let processed = 0;
      let failed = 0;

      for (const item of items) {
        if (!context.hasBudget(2500)) break;
        const claimed = await markCronJobItemProcessing(db, {
          jobName: FRMS_JOB,
          scopeKey,
          itemKey: item.item_key,
          stage: 'FRMS_REPROCESSING',
        });
        if (!claimed) continue;
        const payload = parseFrmsPayload(item.payload_json);
        if (!payload || payload.empresa_id !== empresaId) {
          failed++;
          await markCronJobItemFailed(db, {
            jobName: FRMS_JOB,
            scopeKey,
            itemKey: item.item_key,
            stage: 'INVALID_PAYLOAD',
            errorCode: 'FRMS_QUEUE_INVALID_PAYLOAD',
            errorMessage: 'Payload ou escopo de tenant inválido.',
            retryDelaySeconds: 86400,
          });
          continue;
        }

        try {
          const tenantValid = await validateTripulanteTenant(
            db,
            payload.tripulante_id,
            payload.empresa_id,
          );
          if (!tenantValid) throw new Error('FRMS_TRIPULANTE_TENANT_MISMATCH');
          await reprocessarTripulanteCompleto(db, payload.tripulante_id, LIMITES_DEFAULT, {
            env,
            empresaId: payload.empresa_id,
          });
          await markCronJobItemSucceeded(db, {
            jobName: FRMS_JOB,
            scopeKey,
            itemKey: item.item_key,
            stage: 'FRMS_REPROCESSED',
          });
          processed++;
        } catch (error) {
          failed++;
          const exhausted = item.attempts >= 7;
          await markCronJobItemFailed(db, {
            jobName: FRMS_JOB,
            scopeKey,
            itemKey: item.item_key,
            stage: exhausted ? 'RETRY_EXHAUSTED' : 'FRMS_REPROCESS_FAILED',
            errorCode: exhausted ? 'FRMS_RETRY_EXHAUSTED' : 'FRMS_REPROCESS_FAILED',
            errorMessage: error instanceof Error ? error.message : String(error),
            retryDelaySeconds: exhausted
              ? 86400
              : Math.min(3600, 60 * 2 ** Math.min(item.attempts, 5)),
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
        .bind(FRMS_JOB, scopeKey)
        .first<{ total: number }>();
      const pending = Number(remaining?.total || 0);
      const succeeded = pending === 0 && failed === 0;
      return {
        outcome: succeeded ? ('SUCCEEDED' as const) : ('PARTIAL' as const),
        processedCount: processed,
        failedCount: failed,
        cursorAfter: null,
        metadata: { pending_count: pending, empresa_id: empresaId },
        markStateSuccess: succeeded,
      };
    },
  });
}

async function dispatchFrmsQueues(db: D1Database, env: Env, logger: CronJobLogger): Promise<void> {
  const scopes = await db
    .prepare(
      `SELECT DISTINCT scope_key
         FROM cron_job_items
        WHERE job_name = ?
          AND status != 'SUCCEEDED'
        ORDER BY scope_key ASC
        LIMIT 50`,
    )
    .bind(FRMS_JOB)
    .all<{ scope_key: string }>();

  for (const row of scopes.results || []) {
    await runFrmsQueueScope(db, env, row.scope_key, logger);
  }
}

export async function runSigvoosFrmsJobs(
  db: D1Database,
  env: Env,
  logger: CronJobLogger,
  now = new Date(),
): Promise<void> {
  await dispatchSigvoosTenants(db, env, logger, now);
  await dispatchFrmsQueues(db, env, logger);
}

export async function countPendingFrmsItems(db: D1Database, scopeKey: string): Promise<number> {
  const state = await getCronJobState(db, FRMS_JOB, scopeKey);
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS total
         FROM cron_job_items
        WHERE job_name = ?
          AND scope_key = ?
          AND status != 'SUCCEEDED'`,
    )
    .bind(FRMS_JOB, scopeKey)
    .first<{ total: number }>();
  return Math.max(Number(row?.total || 0), state?.consecutive_failures ? 1 : 0);
}

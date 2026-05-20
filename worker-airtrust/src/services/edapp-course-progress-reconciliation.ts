import type { Env } from '../types';
import { createModuleLogger, toError } from '../utils/logger';
import {
  callEdAppAPI,
  createEdAppQualificacaoNotification,
  createQualificacao,
  findFuncionarioByEdappUser,
  findQualificacaoByCourse,
  getEdAppConfigValue,
  upsertEdAppConfig,
} from '../routes/integracoes-edapp-helpers';

export const EDAPP_ANALYTICS_WATERMARK_KEY = 'analytics_courseprogress_last_completed_at';
export const EDAPP_ANALYTICS_LAST_RUN_KEY = 'analytics_courseprogress_last_run_at';
export const EDAPP_ANALYTICS_LAST_RESULT_KEY = 'analytics_courseprogress_last_result_json';

const DEFAULT_LOOKBACK_HOURS = 72;
const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_MAX_PAGES = 10;
const DEFAULT_OVERLAP_MINUTES = 15;
const INITIAL_BOOTSTRAP_MODIFIED_SINCE = '2025-01-01T00:00:00.000Z';
const INITIAL_BOOTSTRAP_PAGE_SIZE = 200;
const INITIAL_BOOTSTRAP_MAX_PAGES = 100;
const ANALYTICS_EVENT_TYPE = 'analytics.courseprogress.completed';

type EdAppAnalyticsCourseProgressItem = {
  completed?: boolean;
  completedDateTime?: string | null;
  courseId?: string | null;
  courseExternalId?: string | null;
  courseTitle?: string | null;
  percentageCompleted?: number | null;
  score?: number | null;
  userId?: string | null;
  userExternalId?: string | null;
};

type EdAppAnalyticsCourseProgressResponse = {
  items?: EdAppAnalyticsCourseProgressItem[];
  totalCount?: number;
};

type AnalyticsEventState = {
  id: number;
  processado: number;
  qualificacao_historico_id: number | null;
};

export type ReconcileEdAppCourseProgressOptions = {
  env: Env;
  db: D1Database;
  trigger: 'manual' | 'cron';
  empresaId?: number | null;
  modifiedSince?: string | null;
  lookbackHours?: number;
  overlapMinutes?: number;
  pageSize?: number;
  maxPages?: number;
  updateWatermark?: boolean;
  createNotifications?: boolean;
  userId?: string | null;
  userExternalId?: string | null;
  courseId?: string | null;
  courseExternalId?: string | null;
};

export type ReconcileEdAppCourseProgressResult = {
  trigger: 'manual' | 'cron';
  modifiedSinceUsed: string;
  pagesFetched: number;
  itemsScanned: number;
  completionsFound: number;
  eventsCreated: number;
  processed: number;
  created: number;
  duplicates: number;
  unmappedUsers: number;
  unmappedCourses: number;
  errors: string[];
  latestCompletedAt: string | null;
  pageLimitHit: boolean;
  watermarkUpdated: boolean;
};

function toIsoTimestamp(value?: string | null): string | null {
  const normalized = String(value || '').trim();
  if (!normalized) return null;

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return null;

  return parsed.toISOString();
}

function subtractMinutes(isoValue: string, minutes: number): string {
  const parsed = new Date(isoValue);
  parsed.setMinutes(parsed.getMinutes() - minutes);
  return parsed.toISOString();
}

function resolveModifiedSince(
  explicitModifiedSince: string | null | undefined,
  storedWatermark: string | null,
  lookbackHours: number,
  overlapMinutes: number,
): string {
  const explicit = toIsoTimestamp(explicitModifiedSince);
  if (explicit) {
    return explicit;
  }

  const watermark = toIsoTimestamp(storedWatermark);
  if (watermark) {
    return subtractMinutes(watermark, overlapMinutes);
  }

  return INITIAL_BOOTSTRAP_MODIFIED_SINCE;
}

function buildCourseProgressEndpoint(
  modifiedSince: string,
  page: number,
  pageSize: number,
  filters: Pick<
    ReconcileEdAppCourseProgressOptions,
    'userId' | 'userExternalId' | 'courseId' | 'courseExternalId'
  >,
): string {
  const params = new URLSearchParams({
    ModifiedSinceDateTime: modifiedSince,
    Page: String(page),
    PageSize: String(pageSize),
  });

  if (filters.userId) {
    params.set('UserId', filters.userId);
  }
  if (filters.userExternalId) {
    params.set('UserExternalId', filters.userExternalId);
  }
  if (filters.courseId) {
    params.set('CourseId', filters.courseId);
  }
  if (filters.courseExternalId) {
    params.set('CourseExternalId', filters.courseExternalId);
  }

  return `/v2/analytics/courseprogress?${params.toString()}`;
}

async function createAnalyticsEvent(
  db: D1Database,
  item: EdAppAnalyticsCourseProgressItem,
  trigger: 'manual' | 'cron',
  empresaId?: number | null,
): Promise<{
  eventId: number;
  created: boolean;
  processed: boolean;
  qualificacaoHistoricoId: number | null;
}> {
  const completedAt = item.completedDateTime || null;
  const existing = await db
    .prepare(
      `
      SELECT id, processado, qualificacao_historico_id
      FROM integracoes_edapp_eventos
      WHERE deleted_at IS NULL
        AND (? IS NULL OR empresa_id = ?)
        AND tipo_evento = ?
        AND COALESCE(edapp_user_id, '') = ?
        AND COALESCE(edapp_course_id, '') = ?
        AND COALESCE(json_extract(payload_json, '$.data.completedAt'), '') = ?
      ORDER BY id DESC
      LIMIT 1
    `,
    )
    .bind(
      empresaId ?? null,
      empresaId ?? null,
      ANALYTICS_EVENT_TYPE,
      item.userId || item.userExternalId || '',
      item.courseId || item.courseExternalId || '',
      completedAt || '',
    )
    .first<AnalyticsEventState>();

  if (existing?.id) {
    return {
      eventId: existing.id,
      created: false,
      processed: existing.processado === 1,
      qualificacaoHistoricoId: existing.qualificacao_historico_id,
    };
  }

  const payload = {
    event: ANALYTICS_EVENT_TYPE,
    data: {
      userId: item.userId || null,
      userExternalId: item.userExternalId || null,
      courseId: item.courseId || null,
      courseExternalId: item.courseExternalId || null,
      courseTitle: item.courseTitle || null,
      completedAt: item.completedDateTime || null,
      completed: item.completed === true,
      percentageCompleted: item.percentageCompleted ?? null,
      score: item.score ?? null,
      source: trigger,
      syncedAt: new Date().toISOString(),
    },
  };

  const result = await db
    .prepare(
      `
      INSERT INTO integracoes_edapp_eventos (tipo_evento, edapp_user_id, edapp_course_id, payload_json, empresa_id)
      VALUES (?, ?, ?, ?, ?)
    `,
    )
    .bind(
      ANALYTICS_EVENT_TYPE,
      item.userId || item.userExternalId || null,
      item.courseId || item.courseExternalId || null,
      JSON.stringify(payload),
      empresaId ?? null,
    )
    .run();

  return {
    eventId: Number(result.meta.last_row_id || 0),
    created: true,
    processed: false,
    qualificacaoHistoricoId: null,
  };
}

async function markEventErrored(
  db: D1Database,
  eventId: number,
  errorMessage: string,
): Promise<void> {
  await db
    .prepare(
      `
      UPDATE integracoes_edapp_eventos
      SET erro_ultima = ?,
          tentativas = tentativas + 1,
          updated_at = datetime('now')
      WHERE id = ?
    `,
    )
    .bind(errorMessage, eventId)
    .run();
}

async function markEventProcessed(
  db: D1Database,
  eventId: number,
  funcionarioId: number,
  qualificacaoHistoricoId: number,
): Promise<void> {
  await db
    .prepare(
      `
      UPDATE integracoes_edapp_eventos
      SET processado = 1,
          funcionario_id = ?,
          qualificacao_historico_id = ?,
          erro_ultima = NULL,
          updated_at = datetime('now')
      WHERE id = ?
    `,
    )
    .bind(funcionarioId, qualificacaoHistoricoId, eventId)
    .run();
}

export async function reconcileEdAppCourseProgress(
  options: ReconcileEdAppCourseProgressOptions,
): Promise<ReconcileEdAppCourseProgressResult> {
  const logger = createModuleLogger('EdAppReconciliation', options.env.ENVIRONMENT);
  const lookbackHours = options.lookbackHours ?? DEFAULT_LOOKBACK_HOURS;
  const overlapMinutes = options.overlapMinutes ?? DEFAULT_OVERLAP_MINUTES;
  const updateWatermark = options.updateWatermark !== false;
  const createNotifications = options.createNotifications !== false;

  const storedWatermark = await getEdAppConfigValue(
    options.db,
    EDAPP_ANALYTICS_WATERMARK_KEY,
    options.empresaId,
  );
  const explicitModifiedSince = toIsoTimestamp(options.modifiedSince);
  const storedWatermarkIso = toIsoTimestamp(storedWatermark?.valor || null);
  const isInitialBootstrap = !explicitModifiedSince && !storedWatermarkIso;
  const pageSize =
    options.pageSize ?? (isInitialBootstrap ? INITIAL_BOOTSTRAP_PAGE_SIZE : DEFAULT_PAGE_SIZE);
  const maxPages =
    options.maxPages ?? (isInitialBootstrap ? INITIAL_BOOTSTRAP_MAX_PAGES : DEFAULT_MAX_PAGES);
  const modifiedSinceUsed = resolveModifiedSince(
    options.modifiedSince,
    storedWatermark?.valor || null,
    lookbackHours,
    overlapMinutes,
  );

  const result: ReconcileEdAppCourseProgressResult = {
    trigger: options.trigger,
    modifiedSinceUsed,
    pagesFetched: 0,
    itemsScanned: 0,
    completionsFound: 0,
    eventsCreated: 0,
    processed: 0,
    created: 0,
    duplicates: 0,
    unmappedUsers: 0,
    unmappedCourses: 0,
    errors: [],
    latestCompletedAt: null,
    pageLimitHit: false,
    watermarkUpdated: false,
  };

  let shouldContinue = true;
  let page = 1;

  while (shouldContinue && page <= maxPages) {
    const endpoint = buildCourseProgressEndpoint(modifiedSinceUsed, page, pageSize, {
      userId: options.userId || null,
      userExternalId: options.userExternalId || null,
      courseId: options.courseId || null,
      courseExternalId: options.courseExternalId || null,
    });

    const response = (await callEdAppAPI(
      options.env,
      'GET',
      endpoint,
    )) as EdAppAnalyticsCourseProgressResponse;
    const items = Array.isArray(response.items) ? response.items : [];

    result.pagesFetched += 1;
    result.itemsScanned += items.length;

    if (items.length === 0) {
      break;
    }

    for (const item of items) {
      const completedAt = toIsoTimestamp(item.completedDateTime);
      if (item.completed !== true) {
        continue;
      }

      result.completionsFound += 1;
      if (completedAt && (!result.latestCompletedAt || completedAt > result.latestCompletedAt)) {
        result.latestCompletedAt = completedAt;
      }

      const eventState = await createAnalyticsEvent(
        options.db,
        item,
        options.trigger,
        options.empresaId,
      );
      const eventId = eventState.eventId;
      if (eventState.created) {
        result.eventsCreated += 1;
      }

      if (!eventState.created && eventState.processed && eventState.qualificacaoHistoricoId) {
        result.processed += 1;
        result.duplicates += 1;
        continue;
      }

      try {
        const funcionario =
          options.empresaId == null
            ? await findFuncionarioByEdappUser(options.db, {
                edappUserId: item.userId,
                userExternalId: item.userExternalId,
              })
            : await findFuncionarioByEdappUser(
                options.db,
                {
                  edappUserId: item.userId,
                  userExternalId: item.userExternalId,
                },
                options.empresaId,
              );

        if (!funcionario?.funcionario_id) {
          result.unmappedUsers += 1;
          await markEventErrored(
            options.db,
            eventId,
            `Usuário não mapeado (${item.userId || item.userExternalId || 'desconhecido'})`,
          );
          continue;
        }

        const qualificacao =
          options.empresaId == null
            ? await findQualificacaoByCourse(options.db, {
                courseId: item.courseId,
                courseExternalId: item.courseExternalId,
                courseTitle: item.courseTitle,
              })
            : await findQualificacaoByCourse(
                options.db,
                {
                  courseId: item.courseId,
                  courseExternalId: item.courseExternalId,
                  courseTitle: item.courseTitle,
                },
                options.empresaId,
              );

        if (!qualificacao?.qualificacao_codigo) {
          result.unmappedCourses += 1;
          await markEventErrored(
            options.db,
            eventId,
            `Curso não mapeado (${item.courseId || item.courseExternalId || item.courseTitle || 'desconhecido'})`,
          );
          continue;
        }

        const qualificacaoCriada =
          options.empresaId == null
            ? await createQualificacao(
                options.db,
                funcionario.funcionario_id,
                qualificacao.qualificacao_codigo,
                `analytics:${options.trigger}:${item.courseId || item.courseExternalId || qualificacao.qualificacao_codigo}`,
                completedAt || item.completedDateTime || undefined,
              )
            : await createQualificacao(
                options.db,
                funcionario.funcionario_id,
                qualificacao.qualificacao_codigo,
                `analytics:${options.trigger}:${item.courseId || item.courseExternalId || qualificacao.qualificacao_codigo}`,
                completedAt || item.completedDateTime || undefined,
                options.empresaId,
              );

        if (!qualificacaoCriada.success || !qualificacaoCriada.qualificacao_id) {
          const errorMessage =
            qualificacaoCriada.message || 'Erro ao criar qualificação via analytics';
          result.errors.push(errorMessage);
          await markEventErrored(options.db, eventId, errorMessage);
          continue;
        }

        await markEventProcessed(
          options.db,
          eventId,
          funcionario.funcionario_id,
          qualificacaoCriada.qualificacao_id,
        );

        result.processed += 1;
        if (qualificacaoCriada.created === false) {
          result.duplicates += 1;
        } else {
          result.created += 1;
          if (createNotifications) {
            await createEdAppQualificacaoNotification(options.db, {
              funcionarioId: funcionario.funcionario_id,
              funcionarioNome: funcionario.funcionario_nome,
              qualificacaoCodigo: qualificacao.qualificacao_codigo,
              cursoNome: qualificacao.edapp_course_name,
              qualificacaoHistoricoId: qualificacaoCriada.qualificacao_id,
              dataConclusao: completedAt,
              score: typeof item.score === 'number' ? item.score : undefined,
              courseId: item.courseId || item.courseExternalId || null,
              renovacao: qualificacaoCriada.renovacao,
              origem: 'analytics',
            });
          }
        }
      } catch (error) {
        const message = toError(error).message;
        result.errors.push(message);
        await markEventErrored(options.db, eventId, message);
        logger.error('Erro ao reconciliar conclusão EdApp via analytics', toError(error), {
          eventId: String(eventId),
          userId: item.userId || item.userExternalId || 'desconhecido',
          courseId: item.courseId || item.courseExternalId || 'desconhecido',
        });
      }
    }

    const totalCount =
      typeof response.totalCount === 'number' && response.totalCount >= 0
        ? response.totalCount
        : null;
    const hasMore = totalCount !== null ? page * pageSize < totalCount : items.length === pageSize;

    if (!hasMore) {
      shouldContinue = false;
      break;
    }

    page += 1;
  }

  if (shouldContinue && page > maxPages) {
    result.pageLimitHit = true;
    logger.warn('Reconciliação EdApp atingiu o limite de páginas sem concluir a varredura', {
      maxPages,
      modifiedSinceUsed,
    });
  }

  const nowIso = new Date().toISOString();
  await upsertEdAppConfig(options.db, EDAPP_ANALYTICS_LAST_RUN_KEY, nowIso, options.empresaId);
  await upsertEdAppConfig(
    options.db,
    EDAPP_ANALYTICS_LAST_RESULT_KEY,
    JSON.stringify(result),
    options.empresaId,
  );

  const hasScopedFilters = Boolean(
    options.userId || options.userExternalId || options.courseId || options.courseExternalId,
  );
  if (updateWatermark && !hasScopedFilters && !result.pageLimitHit && result.latestCompletedAt) {
    await upsertEdAppConfig(
      options.db,
      EDAPP_ANALYTICS_WATERMARK_KEY,
      result.latestCompletedAt,
      options.empresaId,
    );
    result.watermarkUpdated = true;
  }

  logger.info('Reconciliação EdApp finalizada', {
    trigger: options.trigger,
    modifiedSinceUsed,
    itemsScanned: result.itemsScanned,
    completionsFound: result.completionsFound,
    created: result.created,
    duplicates: result.duplicates,
    unmappedUsers: result.unmappedUsers,
    unmappedCourses: result.unmappedCourses,
    pageLimitHit: result.pageLimitHit,
  });

  return result;
}

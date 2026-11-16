import type { Hono } from 'hono';
import type { Env } from '../types';
import { runResilientScheduledJobs } from '../cron/resilient/scheduled-router';
import { createD1RequestStats, instrumentD1 } from '../observability/d1-instrumentation';
import { emitHttpMetric } from '../observability/operational-metrics';
import { runCorrelatedJob, type JobExecutionContext } from './job-correlation';

export interface WorkerEntrypointOptions {
  onApiRequestBootstrap?: (env: Env) => Promise<void>;
  onScheduled: (
    event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext,
    jobContext: JobExecutionContext,
  ) => Promise<void>;
}

export function assertSafeRuntimeConfig(env: Env): void {
  if (env.ENVIRONMENT !== 'development' && env.ENABLE_DEV_AUTH_BYPASS === 'true') {
    throw new Error('ENABLE_DEV_AUTH_BYPASS nao pode ser usado fora de development');
  }

  if ((env.ENVIRONMENT === 'production' || env.ENVIRONMENT === 'staging') && !env.JWT_SECRET) {
    throw new Error('JWT_SECRET deve estar configurado fora de development');
  }
}

export function createWorkerEntrypoint(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app: Hono<any>,
  options: WorkerEntrypointOptions,
) {
  return {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
      assertSafeRuntimeConfig(env);
      const startedAt = performance.now();
      const pathname = new URL(request.url).pathname;
      // Observabilidade de round-trips D1 por requisição; D1_METRICS_DISABLED=true desliga.
      const d1Stats = createD1RequestStats();
      const flags = env as unknown as Record<string, unknown>;
      const requestEnv: Env =
        flags.D1_METRICS_DISABLED !== 'true' && env.DB && typeof env.DB === 'object'
          ? { ...env, DB: instrumentD1(env.DB, d1Stats) }
          : env;

      try {
        if (options.onApiRequestBootstrap && request.url.includes('/api/')) {
          await options.onApiRequestBootstrap(requestEnv);
        }

        const response = await app.fetch(request, requestEnv, ctx);
        emitHttpMetric({
          pathname,
          method: request.method,
          status: response.status,
          latencyMs: performance.now() - startedAt,
          d1: d1Stats,
        });
        return response;
      } catch (error) {
        emitHttpMetric({
          pathname,
          method: request.method,
          status: 500,
          latencyMs: performance.now() - startedAt,
          d1: d1Stats,
        });
        throw error;
      }
    },

    async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
      assertSafeRuntimeConfig(env);
      await runCorrelatedJob({ jobName: 'scheduled_handler' }, (jobContext) =>
        runResilientScheduledJobs(event, env, ctx, (legacyEvent, legacyEnv, legacyCtx) =>
          options.onScheduled(legacyEvent, legacyEnv, legacyCtx, jobContext),
        ),
      );
    },
  };
}

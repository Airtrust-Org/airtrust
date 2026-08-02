import type { Hono } from 'hono';
import type { Env } from '../types';
import { runResilientScheduledJobs } from '../cron/resilient/scheduled-router';
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

      if (options.onApiRequestBootstrap && request.url.includes('/api/')) {
        await options.onApiRequestBootstrap(env);
      }

      return app.fetch(request, env, ctx);
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

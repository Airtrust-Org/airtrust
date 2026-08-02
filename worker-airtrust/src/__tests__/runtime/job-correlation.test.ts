import { describe, expect, it, vi } from 'vitest';

import {
  getJobErrorCorrelationId,
  runCorrelatedJob,
  type JobExecutionEnvelope,
} from '../../runtime/job-correlation';
import {
  createWorkerEntrypoint,
  type WorkerEntrypointOptions,
} from '../../runtime/worker-entrypoint';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function timeSequence(...values: number[]) {
  const queue = [...values];
  return () => queue.shift() ?? values.at(-1) ?? 0;
}

describe('runCorrelatedJob', () => {
  it('generates a UUID and emits one terminal envelope', async () => {
    const emitted: JobExecutionEnvelope[] = [];

    await expect(
      runCorrelatedJob(
        {
          jobName: 'scheduled_handler',
          emit: (envelope) => emitted.push(envelope),
          now: timeSequence(1_000, 1_025),
        },
        async ({ correlationId }) => {
          expect(correlationId).toMatch(UUID_PATTERN);
          return 'ok';
        },
      ),
    ).resolves.toBe('ok');

    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({
      correlation_id: expect.stringMatching(UUID_PATTERN),
      job_name: 'scheduled_handler',
      attempt: 1,
      started_at: new Date(1_000).toISOString(),
      duration_ms: 25,
      outcome: 'success',
    });
  });

  it('preserves a valid HTTP request ID and retry attempt', async () => {
    const emitted: JobExecutionEnvelope[] = [];

    await runCorrelatedJob(
      {
        jobName: 'email_dispatch',
        correlationId: 'frontend.session-123:retry_2',
        attempt: 2,
        emit: (envelope) => emitted.push(envelope),
      },
      async (context) => {
        expect(context.correlationId).toBe('frontend.session-123:retry_2');
        expect(context.attempt).toBe(2);
      },
    );

    expect(emitted[0]?.correlation_id).toBe('frontend.session-123:retry_2');
    expect(emitted[0]?.attempt).toBe(2);
  });

  it('replaces an invalid external correlation ID', async () => {
    const emitted: JobExecutionEnvelope[] = [];

    await runCorrelatedJob(
      {
        jobName: 'safe_job',
        correlationId: 'unsafe\r\nAuthorization: Bearer secret',
        emit: (envelope) => emitted.push(envelope),
      },
      async ({ correlationId }) => expect(correlationId).toMatch(UUID_PATTERN),
    );

    expect(emitted[0]?.correlation_id).toMatch(UUID_PATTERN);
    expect(JSON.stringify(emitted[0])).not.toContain('Bearer secret');
  });

  it('preserves the same correlation ID in errors without logging error content', async () => {
    const emitted: JobExecutionEnvelope[] = [];
    const failure = Object.assign(new Error('token=secret payload={private}'), {
      code: 'UPSTREAM_TIMEOUT',
      token: 'secret',
      payload: { private: true },
    });

    let caught: unknown;
    try {
      await runCorrelatedJob(
        {
          jobName: 'scheduled_handler',
          correlationId: 'job.error-123',
          emit: (envelope) => emitted.push(envelope),
        },
        async () => {
          throw failure;
        },
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBe(failure);
    expect(getJobErrorCorrelationId(caught)).toBe('job.error-123');
    expect(emitted).toEqual([
      expect.objectContaining({
        correlation_id: 'job.error-123',
        outcome: 'error',
        error_code: 'UPSTREAM_TIMEOUT',
      }),
    ]);
    const serialized = JSON.stringify(emitted);
    expect(serialized).not.toContain('secret');
    expect(serialized).not.toContain('payload');
    expect(serialized).not.toContain('token');
  });

  it('falls back to a fixed safe error code', async () => {
    const emitted: JobExecutionEnvelope[] = [];

    await expect(
      runCorrelatedJob(
        {
          jobName: 'scheduled_handler',
          emit: (envelope) => emitted.push(envelope),
        },
        async () => {
          throw Object.assign(new Error('private details'), { code: 'unsafe code/private' });
        },
      ),
    ).rejects.toThrow('private details');

    expect(emitted[0]?.error_code).toBe('JOB_EXECUTION_FAILED');
  });

  it('records only validated aggregate counters', async () => {
    const emitted: JobExecutionEnvelope[] = [];

    await runCorrelatedJob(
      {
        jobName: 'batch_worker',
        emit: (envelope) => emitted.push(envelope),
      },
      async (context) => {
        context.setCounter('items_scanned', 4);
        context.incrementCounter('items_processed');
        context.incrementCounter('items_processed', 2);
      },
    );

    expect(emitted[0]?.counters).toEqual({ items_scanned: 4, items_processed: 3 });

    await expect(
      runCorrelatedJob({ jobName: 'batch_worker', emit: vi.fn() }, async (context) => {
        context.setCounter('payload_bytes', 10);
      }),
    ).rejects.toThrow('counter name is not allowed');
  });

  it('keeps concurrent executions isolated', async () => {
    const emitted: JobExecutionEnvelope[] = [];
    let releaseA!: () => void;
    let releaseB!: () => void;
    const gateA = new Promise<void>((resolve) => {
      releaseA = resolve;
    });
    const gateB = new Promise<void>((resolve) => {
      releaseB = resolve;
    });

    const jobA = runCorrelatedJob(
      {
        jobName: 'job_a',
        correlationId: 'correlation-A',
        emit: (envelope) => emitted.push(envelope),
      },
      async (context) => {
        await gateA;
        context.incrementCounter('items_processed');
        return context.correlationId;
      },
    );
    const jobB = runCorrelatedJob(
      {
        jobName: 'job_b',
        correlationId: 'correlation-B',
        emit: (envelope) => emitted.push(envelope),
      },
      async (context) => {
        await gateB;
        context.incrementCounter('items_processed', 2);
        return context.correlationId;
      },
    );

    releaseB();
    releaseA();

    await expect(Promise.all([jobA, jobB])).resolves.toEqual(['correlation-A', 'correlation-B']);
    expect(emitted).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          correlation_id: 'correlation-A',
          job_name: 'job_a',
          counters: { items_processed: 1 },
        }),
        expect.objectContaining({
          correlation_id: 'correlation-B',
          job_name: 'job_b',
          counters: { items_processed: 2 },
        }),
      ]),
    );
  });
});

describe('scheduled Worker entrypoint', () => {
  it('passes one correlation context to the scheduled consumer', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    let seenCorrelationId: string | undefined;
    const scheduledConsumer: WorkerEntrypointOptions['onScheduled'] = async (
      _event,
      _env,
      _ctx,
      jobContext,
    ) => {
      seenCorrelationId = jobContext.correlationId;
      expect(jobContext.correlationId).toMatch(UUID_PATTERN);
      expect(jobContext.jobName).toBe('scheduled_handler');
    };
    const onScheduled = vi.fn(scheduledConsumer);
    const entrypoint = createWorkerEntrypoint({} as never, { onScheduled });

    await entrypoint.scheduled(
      { cron: '0 8 * * *' } as ScheduledEvent,
      { ENVIRONMENT: 'development' } as never,
      {} as ExecutionContext,
    );

    expect(onScheduled).toHaveBeenCalledTimes(1);
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const envelope = JSON.parse(String(consoleSpy.mock.calls[0]?.[0])) as JobExecutionEnvelope;
    expect(envelope.correlation_id).toBe(seenCorrelationId);
    expect(envelope.outcome).toBe('success');
    consoleSpy.mockRestore();
  });
});

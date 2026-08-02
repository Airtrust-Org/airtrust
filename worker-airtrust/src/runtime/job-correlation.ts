import { normalizeRequestId } from '../middleware/requestId';

const JOB_NAME_PATTERN = /^[A-Za-z0-9._:-]{1,80}$/;
const ERROR_CODE_PATTERN = /^[A-Z0-9._:-]{1,80}$/;
const COUNTER_NAME_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
const FORBIDDEN_COUNTER_NAME_PATTERN =
  /(?:^|_)(?:token|cookie|authorization|email|cpf|payload|secret|signed_url|scorm_content|certificate_content)(?:_|$)/i;
const DEFAULT_ERROR_CODE = 'JOB_EXECUTION_FAILED';
const JOB_ERROR_CORRELATION = Symbol('airtrust.jobCorrelationId');

export type JobOutcome = 'success' | 'error';

export interface JobExecutionEnvelope {
  correlation_id: string;
  job_name: string;
  attempt: number;
  started_at: string;
  duration_ms: number;
  outcome: JobOutcome;
  error_code?: string;
  counters?: Record<string, number>;
}

export interface JobExecutionContext {
  readonly correlationId: string;
  readonly jobName: string;
  readonly attempt: number;
  readonly startedAt: string;
  setCounter(name: string, value: number): void;
  incrementCounter(name: string, amount?: number): void;
}

export interface RunCorrelatedJobOptions {
  jobName: string;
  correlationId?: string;
  attempt?: number;
  emit?: (envelope: JobExecutionEnvelope) => void;
  now?: () => number;
}

function assertJobName(value: string): void {
  if (!JOB_NAME_PATTERN.test(value)) {
    throw new TypeError('job_name must contain only safe operational characters');
  }
}

function normalizeAttempt(value: number | undefined): number {
  const attempt = value ?? 1;
  if (!Number.isSafeInteger(attempt) || attempt < 1 || attempt > 1000) {
    throw new TypeError('attempt must be an integer between 1 and 1000');
  }
  return attempt;
}

function assertCounter(name: string, value: number): void {
  if (!COUNTER_NAME_PATTERN.test(name) || FORBIDDEN_COUNTER_NAME_PATTERN.test(name)) {
    throw new TypeError('counter name is not allowed');
  }
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError('counter value must be a non-negative integer');
  }
}

function safeErrorCode(error: unknown): string {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return DEFAULT_ERROR_CODE;
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && ERROR_CODE_PATTERN.test(code) ? code : DEFAULT_ERROR_CODE;
}

function correlateError(error: unknown, correlationId: string): Error {
  const candidate = error instanceof Error ? error : new Error('Job execution failed');

  try {
    Object.defineProperty(candidate, JOB_ERROR_CORRELATION, {
      value: correlationId,
      enumerable: false,
      configurable: false,
      writable: false,
    });
    return candidate;
  } catch {
    const wrapped = new Error(candidate.message);
    Object.defineProperty(wrapped, JOB_ERROR_CORRELATION, {
      value: correlationId,
      enumerable: false,
      configurable: false,
      writable: false,
    });
    return wrapped;
  }
}

export function getJobErrorCorrelationId(error: unknown): string | undefined {
  return error instanceof Error
    ? (error as Error & { [JOB_ERROR_CORRELATION]?: string })[JOB_ERROR_CORRELATION]
    : undefined;
}

function defaultEnvelopeEmitter(envelope: JobExecutionEnvelope): void {
  console.log(JSON.stringify(envelope));
}

function emitSafely(
  emit: (envelope: JobExecutionEnvelope) => void,
  envelope: JobExecutionEnvelope,
): void {
  try {
    emit(envelope);
  } catch {
    // Observability must never change the job outcome.
  }
}

export async function runCorrelatedJob<T>(
  options: RunCorrelatedJobOptions,
  operation: (context: JobExecutionContext) => Promise<T>,
): Promise<T> {
  assertJobName(options.jobName);
  const attempt = normalizeAttempt(options.attempt);
  const correlationId = normalizeRequestId(options.correlationId);
  const now = options.now ?? Date.now;
  const emit = options.emit ?? defaultEnvelopeEmitter;
  const startedAtMs = now();

  if (!Number.isFinite(startedAtMs)) {
    throw new TypeError('now() must return a finite timestamp');
  }

  const startedAt = new Date(startedAtMs).toISOString();
  const counters: Record<string, number> = {};
  const context: JobExecutionContext = {
    correlationId,
    jobName: options.jobName,
    attempt,
    startedAt,
    setCounter(name, value) {
      assertCounter(name, value);
      counters[name] = value;
    },
    incrementCounter(name, amount = 1) {
      assertCounter(name, amount);
      const nextValue = (counters[name] ?? 0) + amount;
      assertCounter(name, nextValue);
      counters[name] = nextValue;
    },
  };

  const buildEnvelope = (outcome: JobOutcome, errorCode?: string): JobExecutionEnvelope => {
    const finishedAtMs = now();
    const durationMs = Number.isFinite(finishedAtMs)
      ? Math.max(0, Math.trunc(finishedAtMs - startedAtMs))
      : 0;
    const envelope: JobExecutionEnvelope = {
      correlation_id: correlationId,
      job_name: options.jobName,
      attempt,
      started_at: startedAt,
      duration_ms: durationMs,
      outcome,
    };

    if (errorCode) envelope.error_code = errorCode;
    if (Object.keys(counters).length > 0) envelope.counters = { ...counters };
    return envelope;
  };

  try {
    const result = await operation(context);
    emitSafely(emit, buildEnvelope('success'));
    return result;
  } catch (error) {
    emitSafely(emit, buildEnvelope('error', safeErrorCode(error)));
    throw correlateError(error, correlationId);
  }
}

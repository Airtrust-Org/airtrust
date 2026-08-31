import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';

const { authState, persistReadinessAssessmentMock, countReadinessBaselineSessionsMock } = vi.hoisted(() => ({
  authState: { role: 'tripulante' },
  persistReadinessAssessmentMock: vi.fn(),
  countReadinessBaselineSessionsMock: vi.fn(),
}));

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('userId', 9);
    c.set('userRole', authState.role);
    c.set('empresaId', 7);
    c.set('funcionarioId', 70);
    await next();
  },
}));

vi.mock('../../middleware/tenant', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../middleware/tenant')>();
  return {
    ...actual,
    getEmpresaId: (c: any) => Number(c.get('empresaId') || 0),
  };
});

vi.mock('../../lib/frms/readiness-persistence', () => ({
  countReadinessBaselineSessions: (...args: unknown[]) => countReadinessBaselineSessionsMock(...args),
  persistReadinessAssessment: (...args: unknown[]) => persistReadinessAssessmentMock(...args),
}));

const { default: frmsReadinessRoutes } = await import('../../routes/frms-readiness');

type MockStatement = {
  bind: (...args: unknown[]) => MockStatement;
  first: <T = unknown>() => Promise<T | null>;
  all: <T = unknown>() => Promise<{ results: T[] }>;
};

function createDb(
  checkin: { id: string; kss_score: number; horas_sono: number } | null = null,
  readinessRows: Array<Record<string, unknown>> = [],
) {
  const statements: Array<{ sql: string; binds: unknown[] }> = [];
  const db = {
    prepare: vi.fn((sql: string): MockStatement => {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      let binds: unknown[] = [];
      const record = () => statements.push({ sql: normalized, binds });
      const stmt: MockStatement = {
        bind: (...args: unknown[]) => {
          binds = args;
          return stmt;
        },
        first: async <T = unknown>() => {
          record();
          if (normalized.includes('FROM funcionarios') && normalized.includes('WHERE id = ?')) {
            return { id: 70 } as T;
          }
          if (normalized.includes('FROM frms_fadiga_checkin')) return checkin as T | null;
          if (normalized.includes('FROM frms_readiness_assessment')) return readinessRows[0] as T | null;
          throw new Error(`Unexpected read query: ${normalized}`);
        },
        all: async <T = unknown>() => {
          record();
          if (normalized.includes('FROM frms_readiness_assessment')) {
            return { results: readinessRows as T[] };
          }
          throw new Error(`Unexpected list query: ${normalized}`);
        },
      };
      return stmt;
    }),
  } as unknown as D1Database;
  return { db, statements };
}

const validTrial = {
  sequence: 1,
  scheduledAtMs: 1000,
  stimulusAtMs: 1100,
  responseAtMs: 1380,
  reactionTimeMs: 280,
  outcome: 'response',
};

const validTrials = Array.from({ length: 10 }, (_, index) => {
  const sequence = index + 1;
  const scheduledAtMs = sequence * 5_000;
  const stimulusAtMs = scheduledAtMs + 100;
  return {
    ...validTrial,
    sequence,
    scheduledAtMs,
    stimulusAtMs,
    responseAtMs: stimulusAtMs + 280,
  };
});

const readinessRow = {
  funcionario_id: 70,
  reference_date: '2026-08-27',
  classification: 'operational_review',
  baseline_sessions: 5,
  baseline_ready: 1,
  median_rt_delta_pct: 18,
  lapse_rate_delta: 0.1,
  warning_signals_json: '[]',
  critical_signals_json: '["sleep_critical"]',
  created_at: '2026-08-27 10:00:00',
};

describe('FRMS readiness route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.role = 'tripulante';
    countReadinessBaselineSessionsMock.mockResolvedValue(0);
    persistReadinessAssessmentMock.mockResolvedValue({
      assessmentId: 'assessment-1',
      classification: 'baseline_building',
      baselineSessions: 0,
      baselineReady: false,
      baselineMedianRtMs: null,
      baselineLapseRate: null,
      medianRtDeltaPct: null,
      lapseRateDelta: null,
      warningSignals: [],
      criticalSignals: [],
    });
  });

  it('requires the tenant-scoped daily check-in before persisting objective trials', async () => {
    const { db, statements } = createDb(null);
    const response = await frmsReadinessRoutes.fetch(
      new Request('http://localhost/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference_date: '2026-08-27', duration_ms: 60000, trials: validTrials }),
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ success: false, error: 'daily_checkin_required' });
    expect(persistReadinessAssessmentMock).not.toHaveBeenCalled();
    const checkinQuery = statements.find((item) => item.sql.includes('FROM frms_fadiga_checkin'));
    expect(checkinQuery?.binds).toEqual([7, 70, '2026-08-27']);
  });

  it('uses KSS and sleep from the saved check-in instead of accepting client subjective values', async () => {
    const { db } = createDb({ id: 'checkin-7-70', kss_score: 8, horas_sono: 4.5 });
    const response = await frmsReadinessRoutes.fetch(
      new Request('http://localhost/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reference_date: '2026-08-27',
          duration_ms: 60000,
          trials: validTrials,
          kss_score: 1,
          sleep_hours: 12,
        }),
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(201);
    expect(persistReadinessAssessmentMock).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        empresaId: 7,
        funcionarioId: 70,
        checkinId: 'checkin-7-70',
        kssScore: 8,
        sleepHours: 4.5,
        referenceDate: '2026-08-27',
      }),
    );
  });

  it('rejects malformed trial payloads before any readiness persistence', async () => {
    const { db, statements } = createDb({ id: 'checkin-7-70', kss_score: 3, horas_sono: 8 });
    const response = await frmsReadinessRoutes.fetch(
      new Request('http://localhost/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reference_date: '2026-08-27',
          duration_ms: 60000,
          trials: [{ ...validTrial, sequence: 0 }],
        }),
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(400);
    expect(persistReadinessAssessmentMock).not.toHaveBeenCalled();
    expect(statements.some((item) => item.sql.includes('FROM frms_fadiga_checkin'))).toBe(false);
  });

  it('returns the tenant-scoped readiness list to FRMS team roles', async () => {
    authState.role = 'manager';
    const { db, statements } = createDb(null, [readinessRow]);
    const response = await frmsReadinessRoutes.fetch(
      new Request('http://localhost/team?date=2026-08-27'),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: [readinessRow],
      meta: { scope: 'team' },
    });
    const readinessQuery = statements.find((item) => item.sql.includes('FROM frms_readiness_assessment'));
    expect(readinessQuery?.binds).toEqual([7, '2026-08-27']);
    expect(readinessQuery?.sql).toContain('WHERE empresa_id = ?');
  });

  it('forces non-team roles to their own readiness assessment', async () => {
    const { db, statements } = createDb(null, [readinessRow]);
    const response = await frmsReadinessRoutes.fetch(
      new Request('http://localhost/team?date=2026-08-27'),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: [readinessRow],
      meta: { scope: 'self', forced_funcionario_id: 70 },
    });
    const readinessQuery = statements.find((item) => item.sql.includes('FROM frms_readiness_assessment'));
    expect(readinessQuery?.binds).toEqual([7, '2026-08-27', 70]);
    expect(readinessQuery?.sql).toContain('AND funcionario_id = ?');
  });

  it('rejects invalid team readiness dates before touching D1', async () => {
    authState.role = 'manager';
    const { db } = createDb(null, [readinessRow]);
    const response = await frmsReadinessRoutes.fetch(
      new Request('http://localhost/team?date=28-08-2026'),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(400);
    expect((db.prepare as unknown as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });
});

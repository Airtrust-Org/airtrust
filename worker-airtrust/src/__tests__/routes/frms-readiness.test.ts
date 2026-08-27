import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';

const persistReadinessAssessmentMock = vi.fn();
const countReadinessBaselineSessionsMock = vi.fn();

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('userId', 9);
    c.set('userRole', 'tripulante');
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

import frmsReadinessRoutes from '../../routes/frms-readiness';

type MockStatement = {
  bind: (...args: unknown[]) => MockStatement;
  first: <T = unknown>() => Promise<T | null>;
};

function createDb(checkin: { id: string; kss_score: number; horas_sono: number } | null = null) {
  const statements: Array<{ sql: string; binds: unknown[] }> = [];
  const db = {
    prepare: vi.fn((sql: string): MockStatement => {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      let binds: unknown[] = [];
      const stmt: MockStatement = {
        bind: (...args: unknown[]) => {
          binds = args;
          return stmt;
        },
        first: async <T = unknown>() => {
          statements.push({ sql: normalized, binds });
          if (normalized.includes('FROM funcionarios') && normalized.includes('WHERE id = ?')) {
            return { id: 70 } as T;
          }
          if (normalized.includes('FROM frms_fadiga_checkin')) return checkin as T | null;
          throw new Error(`Unexpected read query: ${normalized}`);
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

describe('FRMS readiness route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    persistReadinessAssessmentMock.mockResolvedValue({
      assessmentId: 'assessment-1',
      classification: 'baseline_building',
      baselineSessions: 0,
      baselineReady: false,
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
        body: JSON.stringify({ reference_date: '2026-08-27', duration_ms: 180000, trials: [validTrial] }),
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
          duration_ms: 180000,
          trials: [validTrial],
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
          duration_ms: 180000,
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
});

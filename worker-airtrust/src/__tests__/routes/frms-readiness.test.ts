import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import type { Env } from '../../types';

const { authState, persistReadinessAssessmentMock, countReadinessBaselineSessionsMock, sectorAccessMock } = vi.hoisted(() => ({
  authState: { role: 'tripulante' },
  persistReadinessAssessmentMock: vi.fn(),
  countReadinessBaselineSessionsMock: vi.fn(),
  sectorAccessMock: vi.fn(),
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

vi.mock('../../lib/frms/operational-date', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/frms/operational-date')>()),
  frmsOperationalTodayIso: () => '2026-08-27',
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

vi.mock('../../middleware/employee-sector-access', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../middleware/employee-sector-access')>()),
  getEmployeeSectorAccess: (...args: unknown[]) => sectorAccessMock(...args),
}));

const { default: frmsReadinessRoutes } = await import('../../routes/frms-readiness');

type MockStatement = {
  bind: (...args: unknown[]) => MockStatement;
  first: <T = unknown>() => Promise<T | null>;
  all: <T = unknown>() => Promise<{ results: T[] }>;
};

function createDb(
  checkin: { id: string; kss_score: number; kss_provenance?: string | null; horas_sono: number | null; jornada_inicio_prevista?: string | null } | null = null,
  readinessRows: Array<Record<string, unknown>> = [],
  recoveryReadError?: Error,
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
          if (normalized.includes('FROM usuario_permissoes')) return null;
          if (normalized.includes('FROM funcionarios') && normalized.includes('WHERE id = ?')) {
            return { id: 70 } as T;
          }
          if (normalized.includes('FROM frms_fadiga_checkin')) return checkin ? { jornada_inicio_prevista: '23:59', ...checkin } as T : null;
          // No prior recovery activity is normal. Do not simulate an unexpected
          // SQL failure just because the readiness route rechecks that date.
          if (normalized.includes('FROM frms_recovery_activity_day')) {
            if (recoveryReadError) throw recoveryReadError;
            return null;
          }
          if (normalized.includes('FROM frms_readiness_assessment')) return readinessRows[0] as T | null;
          throw new Error(`Unexpected read query: ${normalized}`);
        },
        all: async <T = unknown>() => {
          record();
          if (
            normalized.includes('FROM frms_readiness_assessment') ||
            normalized.includes('FROM frms_fadiga_checkin ch')
          ) {
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
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-27T12:00:00Z'));
    vi.clearAllMocks();
    authState.role = 'tripulante';
    countReadinessBaselineSessionsMock.mockResolvedValue(0);
    sectorAccessMock.mockResolvedValue({ mode: 'restricted', setorIds: [3], funcionarioId: null });
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

  afterEach(() => vi.useRealTimers());

  it('never exposes an unverified historical baseline as ready, regardless of count', async () => {
    countReadinessBaselineSessionsMock.mockResolvedValue(30);
    const { db } = createDb(null);
    const response = await frmsReadinessRoutes.fetch(
      new Request('http://localhost/baseline?date=2026-08-27&protocol=airtrust-pvtb-v2'),
      { DB: db } as Env,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: { sessions: 30, minimum_sessions: 10, ready: false, protocol_version: 'airtrust-pvtb-v2' },
    });
  });


  it('rejects historical objective readiness even if a historical check-in exists', async () => {
    const { db, statements } = createDb({
      id: 'prior-checkin', kss_provenance: 'CREW_REPORTED', kss_score: 3, horas_sono: 8,
    });
    const response = await frmsReadinessRoutes.fetch(
      new Request('http://localhost/', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference_date: '2026-08-26', duration_ms: 60000, trials: validTrials }),
      }), { DB: db } as Env, {} as ExecutionContext,
    );
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: 'retrospective_readiness_not_allowed' });
    expect(statements.some((query) => query.sql.includes('FROM frms_fadiga_checkin'))).toBe(false);
    expect(persistReadinessAssessmentMock).not.toHaveBeenCalled();
  });


  it('rejects a standalone objective test after the crew presentation without persistence', async () => {
    const { db } = createDb({
      id: 'checkin-7-70', kss_provenance: 'CREW_REPORTED', kss_score: 3, horas_sono: 8,
      jornada_inicio_prevista: '08:00',
    });
    const response = await frmsReadinessRoutes.fetch(
      new Request('http://localhost/', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference_date: '2026-08-27', duration_ms: 60000, trials: validTrials }),
      }),
      { DB: db } as Env, {} as ExecutionContext,
    );
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: 'post_presentation_readiness_not_allowed' });
    expect(persistReadinessAssessmentMock).not.toHaveBeenCalled();
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

  it('rejeita KSS legado sem proveniência verificada antes de persistir testes', async () => {
    const { db } = createDb({
      id: 'checkin-legacy', kss_score: 5, kss_provenance: null, horas_sono: 8,
    });
    const response = await frmsReadinessRoutes.fetch(
      new Request('http://localhost/', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference_date: '2026-08-27', duration_ms: 60000, trials: validTrials }),
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: 'KSS_PROVENANCE_UNVERIFIED' });
    expect(persistReadinessAssessmentMock).not.toHaveBeenCalled();
  });

  it('does not convert missing reported sleep to zero before readiness persistence', async () => {
    const { db } = createDb({
      id: 'checkin-no-sleep', kss_provenance: 'CREW_REPORTED', kss_score: 4, horas_sono: null,
    });
    const response = await frmsReadinessRoutes.fetch(
      new Request('http://localhost/', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference_date: '2026-08-27', duration_ms: 60000, trials: validTrials }),
      }),
      { DB: db } as Env, {} as ExecutionContext,
    );
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: 'SLEEP_EVIDENCE_MISSING' });
    expect(persistReadinessAssessmentMock).not.toHaveBeenCalled();
  });

  it('uses KSS and sleep from the saved check-in instead of accepting client subjective values', async () => {
    const { db } = createDb({ id: 'checkin-7-70', kss_provenance: 'CREW_REPORTED', kss_score: 8, horas_sono: 4.5 });
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

  it('fails closed on a real recovery database error after readiness persistence', async () => {
    const { db } = createDb(
      { id: 'checkin-7-70', kss_provenance: 'CREW_REPORTED', kss_score: 8, horas_sono: 4.5 },
      [],
      new Error('D1_ERROR: database is locked'),
    );
    const response = await frmsReadinessRoutes.fetch(
      new Request('http://localhost/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference_date: '2026-08-27', duration_ms: 60000, trials: validTrials }),
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ success: false, error: 'readiness_persistence_failed' });
    expect(persistReadinessAssessmentMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    { reference_date: '2026-08-27', duration_ms: 60_000, trials: validTrials, protocol_version: 'airtrust-pvtb-v2' },
    { reference_date: '2099-01-01', duration_ms: 60_000, trials: validTrials, protocol_version: 'airtrust-brief-v1' },
    { reference_date: '2026-02-30', duration_ms: 60_000, trials: validTrials },
  ])('blocks legacy protocol or invalid date before reading check-in', async (payload) => {
    const { db, statements } = createDb({ id: 'checkin', kss_provenance: 'CREW_REPORTED', kss_score: 3, horas_sono: 7 });
    const response = await frmsReadinessRoutes.fetch(
      new Request('http://localhost/', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(400);
    expect(persistReadinessAssessmentMock).not.toHaveBeenCalled();
    expect(statements.some((q) => q.sql.includes('FROM frms_fadiga_checkin'))).toBe(false);
  });

  it('rejects malformed trial payloads before any readiness persistence', async () => {
    const { db, statements } = createDb({ id: 'checkin-7-70', kss_provenance: 'CREW_REPORTED', kss_score: 3, horas_sono: 8 });
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
    const readinessQuery = statements.find((item) => item.sql.includes('FROM frms_fadiga_checkin ch'));
    expect(readinessQuery?.binds).toEqual([7, '2026-08-27', 3]);
    expect(readinessQuery?.sql).toContain('WHERE ch.empresa_id = ?');
    expect(readinessQuery?.sql).toContain('f.empresa_id = ch.empresa_id');
    expect(readinessQuery?.sql).toContain('f.setor_id IN (?)');
    expect(readinessQuery?.sql).toContain("'baseline_building'");
    expect(readinessQuery?.sql).toContain('assessment_missing');
  });

  it('fails closed for manager without active sector assignment', async () => {
    authState.role = 'manager';
    sectorAccessMock.mockResolvedValue({ mode: 'restricted', setorIds: [], funcionarioId: null });
    const { db, statements } = createDb(null, []);
    const response = await frmsReadinessRoutes.fetch(
      new Request('http://localhost/team?date=2026-08-27'),
      { DB: db } as Env, {} as ExecutionContext,
    );
    expect(response.status).toBe(200);
    const query = statements.find((item) => item.sql.includes('FROM frms_fadiga_checkin ch'));
    expect(query?.sql).toContain('AND 1 = 0');
    expect(query?.binds).toEqual([7, '2026-08-27']);
  });

  it('allows an admin to see only the active company without sector filtering', async () => {
    authState.role = 'admin';
    sectorAccessMock.mockResolvedValue({ mode: 'all', setorIds: [], funcionarioId: null });
    const { db, statements } = createDb(null, [readinessRow]);
    const response = await frmsReadinessRoutes.fetch(
      new Request('http://localhost/team?date=2026-08-27'),
      { DB: db } as Env, {} as ExecutionContext,
    );
    expect(response.status).toBe(200);
    const query = statements.find((item) => item.sql.includes('FROM frms_fadiga_checkin ch'));
    expect(query?.sql).toContain('f.empresa_id = ch.empresa_id');
    expect(query?.sql).not.toContain('f.setor_id IN');
    expect(query?.binds).toEqual([7, '2026-08-27']);
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
    const readinessQuery = statements.find((item) => item.sql.includes('FROM frms_fadiga_checkin ch'));
    expect(readinessQuery?.binds).toEqual([
      7,
      '2026-08-27',
      70,
    ]);
    expect(readinessQuery?.sql).toContain('AND ch.funcionario_id = ?');
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

  it('executes the real team SQL without exposing another sector or company', async () => {
    authState.role = 'manager';
    sectorAccessMock.mockResolvedValue({ mode: 'restricted', setorIds: [3], funcionarioId: null });
    const { db, statements } = createDb(null);
    const response = await frmsReadinessRoutes.fetch(
      new Request('http://localhost/team?date=2026-08-27'),
      { DB: db } as Env, {} as ExecutionContext,
    );
    expect(response.status).toBe(200);
    const query = statements.find((item) => item.sql.includes('FROM frms_fadiga_checkin ch'));
    expect(query).toBeDefined();

    // Vite cannot statically resolve node:sqlite; use the existing test-suite pattern.
    const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
    const sqlite = new DatabaseSync(':memory:');
    try {
      sqlite.exec(`
        CREATE TABLE funcionarios (
          id INTEGER, empresa_id INTEGER, setor_id INTEGER, deleted_at TEXT
        );
        CREATE TABLE frms_fadiga_checkin (
          funcionario_id INTEGER, empresa_id INTEGER, data_checkin TEXT,
          deleted_at TEXT, created_at TEXT
        );
        CREATE TABLE frms_readiness_assessment (
          id TEXT, funcionario_id INTEGER, empresa_id INTEGER, reference_date TEXT,
          deleted_at TEXT, classification TEXT, baseline_sessions INTEGER,
          baseline_ready INTEGER, median_rt_delta_pct REAL, lapse_rate_delta REAL,
          warning_signals_json TEXT, critical_signals_json TEXT, created_at TEXT
        );
        INSERT INTO funcionarios VALUES
          (70, 7, 3, NULL), (71, 7, 4, NULL), (80, 8, 3, NULL);
        INSERT INTO frms_fadiga_checkin VALUES
          (70, 7, '2026-08-27', NULL, '2026-08-27 09:00:00'),
          (71, 7, '2026-08-27', NULL, '2026-08-27 09:00:00'),
          (80, 8, '2026-08-27', NULL, '2026-08-27 09:00:00'),
          (80, 7, '2026-08-27', NULL, '2026-08-27 09:00:00');
      `);
      const rows = sqlite.prepare(query!.sql).all(...query!.binds);
      expect(rows.map((row: { funcionario_id: number }) => row.funcionario_id)).toEqual([70]);
    } finally {
      sqlite.close();
    }
  });
});

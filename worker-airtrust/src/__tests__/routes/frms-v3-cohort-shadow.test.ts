import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';
import type { ImaCohortSourceRow } from '../../lib/frms/ima-v3-cohort-evidence';

const reader = vi.fn();
const listSnapshot = vi.fn();

vi.mock('../../middleware/auth', () => ({
  auth: () => async (ctx: unknown, next: () => Promise<void>) => {
    const c = ctx as {
      set: (key: string, value: unknown) => void;
      req: { header: (key: string) => string | undefined };
    };
    c.set('userId', 1);
    c.set('userRole', c.req.header('x-role') || 'viewer');
    await next();
  },
}));
vi.mock('../../middleware/tenant', () => ({
  getEmpresaId: (ctx: unknown) =>
    Number((ctx as { req: { header: (key: string) => string | undefined } })
      .req.header('x-empresa-id') || 0),
}));
vi.mock('../../lib/frms/access', () => ({
  canSeeFrmsTeamScopeForContext: async (ctx: unknown) =>
    (ctx as { req: { header: (key: string) => string | undefined } })
      .req.header('x-role') === 'manager',
}));
vi.mock('../../lib/frms/operational-snapshot', () => ({
  listFrmsOperationalSnapshot: (...args: unknown[]) => listSnapshot(...args),
}));
vi.mock('../../lib/frms/ima-v3-cohort-reader', () => ({
  lastClosedMonthWindow: (_now: Date, days: number) => ({
    startDate: days === 30 ? '2026-09-01' : days === 60 ? '2026-08-02' : '2026-07-03',
    endDate: '2026-09-30',
    windowDays: days,
  }),
  loadImaCohortEvidenceRows: (...args: unknown[]) => reader(...args),
}));
import routes from '../../routes/frms-operational-snapshot';

const endpoint = '/frms/ima-v3/cohort-readiness-shadow?window_days=30';
const makeRow = (id: number): ImaCohortSourceRow => ({
  empresa_id: 6, funcionario_id: id, data_operacional: '2026-09-01',
  checkin_status: 'RECEBIDO', horas_sono: 7.5,
  sleep_data_source: 'REAL', wake_data_source: 'REAL',
  kss_score: 4, teve_jornada: true, jornada_data_source: 'MANUAL',
  operational_data_source: 'AUSENTE',
});

function app() {
  const a = new Hono<{ Bindings: Env }>();
  a.route('/frms', routes);
  return a;
}
function env(overrides: Record<string, unknown> = {}): Env {
  return {
    DB: {} as D1Database,
    ENVIRONMENT: 'staging',
    FRMS_V3_SHADOW_PREVIEW_TENANTS: '',
    FRMS_V3_COHORT_STUDY_TENANTS: '6',
    ...overrides,
  } as unknown as Env;
}
function request(path = endpoint, role = 'manager', tenant = '6') {
  return new Request('https://local.test' + path, {
    headers: { 'x-role': role, 'x-empresa-id': tenant },
  });
}

describe('GET /frms/ima-v3/cohort-readiness-shadow', () => {
  beforeEach(() => { reader.mockReset(); listSnapshot.mockReset(); });

  it('is impossible to query in production, even with an explicit allowlist', async () => {
    const response = await app().fetch(request(), env({ ENVIRONMENT: 'production' }), {} as ExecutionContext);
    expect(response.status).toBe(404);
    expect(reader).not.toHaveBeenCalled();
  });

  it('rejects absent/wildcard/different-tenant allowlists without a read', async () => {
    for (const setting of ['', undefined, 'all', '9']) {
      const response = await app().fetch(request(), env({ FRMS_V3_COHORT_STUDY_TENANTS: setting }), {} as ExecutionContext);
      expect(response.status).toBe(404);
    }
    expect(reader).not.toHaveBeenCalled();
  });

  it('denies a user with no FRMS team scope, before opening the data reader', async () => {
    const response = await app().fetch(request(endpoint, 'viewer'), env(), {} as ExecutionContext);
    expect(response.status).toBe(403);
    expect(reader).not.toHaveBeenCalled();
  });

  it('cannot be sliced by dates, employee ID, role, base or custom windows', async () => {
    const variants = [
      endpoint + '&funcionario_id=42',
      endpoint + '&base=Macae',
      endpoint.replace('window_days=30', 'window_days=15'),
      endpoint.replace('window_days=30', 'window_days='),
      '/frms/ima-v3/cohort-readiness-shadow',
    ];
    for (const path of variants) {
      const response = await app().fetch(request(path), env(), {} as ExecutionContext);
      expect(response.status).toBe(400);
    }
    expect(reader).not.toHaveBeenCalled();
  });

  it('suppresses all metrics for a nine-person cohort', async () => {
    reader.mockResolvedValueOnce(Array.from({ length: 9 }, (_, i) => makeRow(100 + i)));
    const response = await app().fetch(request(), env(), {} as ExecutionContext);
    expect(response.status).toBe(200);
    const body = await response.json() as Record<string, unknown>;
    expect(body.data).toMatchObject({
      state: 'PRIVACY_SUPPRESSED', approximateCrew: null,
      checkinReceivedPctApprox: null, realSleepDurationPctApprox: null,
      physiologicalImaScore: null,
    });
    expect(reader).toHaveBeenCalledWith(expect.anything(), 6, '2026-09-01', '2026-09-30');
    expect(JSON.stringify(body)).not.toContain('"funcionario_id"');
    expect(listSnapshot).not.toHaveBeenCalled();
  });

  it('returns coarsened metrics without personal IDs for a cohort of ten', async () => {
    reader.mockResolvedValueOnce(Array.from({ length: 10 }, (_, i) => makeRow(100 + i)));
    const response = await app().fetch(request(), env(), {} as ExecutionContext);
    expect(response.status).toBe(200);
    const body = await response.json() as Record<string, unknown>;
    expect(body).toMatchObject({
      success: true,
      meta: {
        mode: 'EXPERIMENTAL_COHORT_SHADOW_ONLY',
        writes: 0, clinicalValidation: false,
        source: 'CHECKIN_OR_JOURNEY_DAYS_ONLY',
      },
      data: {
        state: 'AGGREGATED_RESEARCH_COVERAGE',
        approximateCrew: 10, approximateCrewDays: 10,
        verifiedSleepEpisodePct: null,
        reconstructedDutyBoundaryPctApprox: null,
        methodologyStatus: 'NOT_VALIDATED',
        physiologicalImaScore: null, operationalFitness: 'NOT_ASSESSED',
      },
    });
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('"funcionario_id"');
    expect(serialized).not.toContain('2026-09-01');
    expect(serialized).not.toContain('"empresa_id"');
  });

  it('fails closed on cross-tenant contamination without leaking PII', async () => {
    reader.mockResolvedValueOnce([
      ...Array.from({ length: 10 }, (_, i) => makeRow(100 + i)),
      { ...makeRow(500), empresa_id: 7 },
    ]);
    const response = await app().fetch(request(), env(), {} as ExecutionContext);
    expect(response.status).toBe(409);
    const body = await response.text();
    expect(body).toContain('IMA_COHORT_EVIDENCE_RECONCILIATION_REQUIRED');
    expect(body).not.toContain('funcionario_id');
  });
});

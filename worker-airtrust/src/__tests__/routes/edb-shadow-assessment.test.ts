import { Hono, type Context } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../middleware/error-handler';
import type { Env, Variables } from '../../types';

type TestContext = Context<{ Bindings: Env; Variables: Variables }>;

const { loadAssessmentMock } = vi.hoisted(() => ({
  loadAssessmentMock: vi.fn(),
}));

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: TestContext, next: () => Promise<void>) => {
    if (!c.req.header('Authorization')) {
      return c.json({ success: false, error: 'Token de autenticacao nao fornecido' }, 401);
    }

    const tenantId = Number(c.req.header('x-test-empresa-id') || 7);
    const role = String(c.req.header('x-test-role') || 'manager').toLowerCase();
    c.set('userId', 10);
    c.set('empresaId', tenantId);
    c.set('userRole', role);
    c.set('tenantContext', {
      empresaId: tenantId,
      empresaCodigo: `empresa-${tenantId}`,
      empresaNome: `Empresa ${tenantId}`,
      role,
      plano: 'pro',
      permissions: ['read'],
    });
    await next();
  },
}));

vi.mock('../../middleware/tenant', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../middleware/tenant')>();
  const hierarchy: Record<string, number> = {
    admin: 100,
    manager: 80,
    instructor: 60,
    editor: 50,
    student: 20,
    viewer: 10,
  };
  return {
    ...actual,
    getEmpresaId: (c: TestContext) => Number(c.get('tenantContext')?.empresaId || 0),
    checkPermission: (c: TestContext, minimumRole: string) => {
      const role = String(c.get('tenantContext')?.role || 'viewer');
      return (hierarchy[role] || 0) >= (hierarchy[minimumRole] || 0);
    },
  };
});

vi.mock('../../services/edb/control-flight-shadow-assessment', () => ({
  loadEdbShadowPreliminaryAssessment: loadAssessmentMock,
}));

import edbShadowPreviewRoutes from '../../routes/edb-shadow-preview';
import { EdbShadowPreviewError } from '../../services/edb/control-flight-shadow-preview';

function createApp() {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();
  app.onError(errorHandler);
  app.route('/api/edb', edbShadowPreviewRoutes);
  return app;
}

function requestHeaders(role = 'manager', tenantId = 7) {
  return {
    Authorization: 'Bearer synthetic-token',
    'x-test-role': role,
    'x-test-empresa-id': String(tenantId),
    'X-Request-ID': 'edb-shadow-assessment-test',
  };
}

function assessment() {
  return {
    schemaVersion: 'edb.shadow-assessment.v1',
    classification: 'NON_OFFICIAL_PRELIMINARY_SHADOW_ASSESSMENT',
    officialReferenceCompared: false,
    paperReferenceRequired: true,
    comparisonBasis: 'SELF_BASELINE_WITH_SANITIZED_PROJECTION_FINDINGS',
    notices: {
      officialLogbook: false,
      replacesPaper: false,
      containsSignature: false,
      persistsRegulatedRecord: false,
      authorizesReturnToService: false,
    },
    divergence: {
      recommendation: 'review',
      maxSeverity: 'HIGH',
      findings: [],
      metrics: {
        comparisonFieldCount: 20,
        matchingFieldCount: 20,
        divergenceCount: 1,
        completenessFindingCount: 1,
        projectionFindingCount: 0,
        unknownFieldCount: 0,
      },
      readiness: {
        score: 59,
        status: 'not_ready',
        fieldAgreementPercent: 100,
        completenessPercent: 95,
      },
      evidence: { fingerprint: 'fnv1a32:1234abcd' },
    },
    technicalStatus: {
      targetSchemaVersion: 'edb.technical-status.shadow.v1',
      officialEffect: 'NONE',
      sourceAvailable: false,
      detailedContractLoaded: false,
      discrepancyDetailsAvailable: false,
      status: 'source_unavailable',
      findingCodes: ['TECHNICAL_STATUS_SOURCE_UNAVAILABLE'],
    },
  };
}

beforeEach(() => {
  loadAssessmentMock.mockReset();
  loadAssessmentMock.mockResolvedValue(assessment());
});

describe('GET /api/edb/shadow-assessment/:flightId', () => {
  it('requires authentication', async () => {
    const response = await createApp().request('/api/edb/shadow-assessment/42', {}, {} as Env);
    expect(response.status).toBe(401);
    expect(loadAssessmentMock).not.toHaveBeenCalled();
  });

  it('preserves the existing manager protection', async () => {
    const response = await createApp().request(
      '/api/edb/shadow-assessment/42',
      { headers: requestHeaders('viewer') },
      {} as Env,
    );
    expect(response.status).toBe(403);
    expect(loadAssessmentMock).not.toHaveBeenCalled();
  });

  it('uses only the authenticated tenant and returns a non-official assessment', async () => {
    const response = await createApp().request(
      '/api/edb/shadow-assessment/42',
      { headers: requestHeaders('manager', 7) },
      { DB: {} as D1Database } as Env,
    );

    expect(response.status).toBe(200);
    expect(loadAssessmentMock).toHaveBeenCalledWith(expect.anything(), 7, 42);
    expect(await response.json()).toMatchObject({
      success: true,
      data: {
        classification: 'NON_OFFICIAL_PRELIMINARY_SHADOW_ASSESSMENT',
        officialReferenceCompared: false,
        paperReferenceRequired: true,
        notices: {
          officialLogbook: false,
          replacesPaper: false,
          authorizesReturnToService: false,
        },
        technicalStatus: {
          officialEffect: 'NONE',
          discrepancyDetailsAvailable: false,
        },
      },
    });
  });

  it('rejects an invalid flight id before loading data', async () => {
    const response = await createApp().request(
      '/api/edb/shadow-assessment/not-a-flight',
      { headers: requestHeaders() },
      { DB: {} as D1Database } as Env,
    );
    expect(response.status).toBe(400);
    expect(loadAssessmentMock).not.toHaveBeenCalled();
  });

  it('keeps missing and cross-tenant flights indistinguishable', async () => {
    loadAssessmentMock.mockRejectedValue(new EdbShadowPreviewError('FLIGHT_NOT_FOUND', 404));
    const response = await createApp().request(
      '/api/edb/shadow-assessment/42',
      { headers: requestHeaders() },
      { DB: {} as D1Database } as Env,
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      success: false,
      code: 'EDB_SHADOW_PREVIEW_FLIGHT_NOT_FOUND',
    });
  });

  it('sanitizes unexpected failures', async () => {
    loadAssessmentMock.mockRejectedValue(
      Object.assign(new Error('SQL secret payload'), {
        empresa_id: 7,
        token: 'secret-token',
      }),
    );

    const response = await createApp().request(
      '/api/edb/shadow-assessment/42',
      { headers: requestHeaders() },
      { DB: {} as D1Database } as Env,
    );
    const body = await response.text();

    expect(response.status).toBe(500);
    expect(body).toContain('EDB_SHADOW_ASSESSMENT_FAILED');
    expect(body).not.toContain('SQL secret');
    expect(body).not.toContain('empresa_id');
    expect(body).not.toContain('secret-token');
  });
});

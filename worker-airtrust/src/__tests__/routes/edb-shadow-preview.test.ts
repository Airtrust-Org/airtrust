import { Hono, type Context } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env, Variables } from '../../types';
import { errorHandler } from '../../middleware/error-handler';

type TestContext = Context<{ Bindings: Env; Variables: Variables }>;

const { loadEdbShadowPreviewMock } = vi.hoisted(() => ({
  loadEdbShadowPreviewMock: vi.fn(),
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

vi.mock('../../services/edb/control-flight-shadow-preview', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../services/edb/control-flight-shadow-preview')>();
  return {
    ...actual,
    loadEdbShadowPreview: loadEdbShadowPreviewMock,
  };
});

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
    'X-Request-ID': 'edb-shadow-preview-test',
  };
}

beforeEach(() => {
  loadEdbShadowPreviewMock.mockReset();
  loadEdbShadowPreviewMock.mockResolvedValue({
    draft: {
      schemaVersion: 'edb.draft.v1',
      draftId: '00000000-0000-4000-8000-000000000042',
      tenantId: 7,
      status: 'shadow_draft',
      createdAt: '2026-08-02T14:30:00-03:00',
      sourceFlightReference: 'cv_voos:42',
      operator: {
        legalName: 'Operador Sintetico',
        legalIdentifier: '00000000000000',
        operatingCertificate: null,
      },
      owner: { legalName: null, legalIdentifier: null },
      aircraft: {
        manufacturer: null,
        model: 'AW139',
        serialNumber: null,
        registration: 'PR-TST',
      },
      volumeNumber: null,
      legs: [],
      technicalStatus: {
        lastMaintenanceIntervention: null,
        nextMaintenanceIntervention: null,
        airframeHoursRemaining: null,
        returnToServiceReference: null,
        openDiscrepancyCount: null,
        source: { kind: 'UNKNOWN' },
      },
    },
    findings: [],
    fieldSources: [],
  });
});

describe('GET /api/edb/shadow-preview/:flightId', () => {
  it('requires authentication', async () => {
    const response = await createApp().request('/api/edb/shadow-preview/42', {}, {} as Env);
    expect(response.status).toBe(401);
    expect(loadEdbShadowPreviewMock).not.toHaveBeenCalled();
  });

  it('uses the existing manager protection for the internal preview', async () => {
    const response = await createApp().request(
      '/api/edb/shadow-preview/42',
      { headers: requestHeaders('viewer') },
      {} as Env,
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      success: false,
      code: 'EDB_SHADOW_PREVIEW_RBAC_FORBIDDEN',
    });
    expect(loadEdbShadowPreviewMock).not.toHaveBeenCalled();
  });

  it('uses only the authenticated tenant and returns explicit non-official notices', async () => {
    const response = await createApp().request(
      '/api/edb/shadow-preview/42',
      { headers: requestHeaders('manager', 7) },
      { DB: {} as D1Database } as Env,
    );

    expect(response.status).toBe(200);
    expect(loadEdbShadowPreviewMock).toHaveBeenCalledWith(expect.anything(), 7, 42);
    expect(await response.json()).toMatchObject({
      success: true,
      data: {
        status: 'shadow_draft',
        classification: 'NON_OFFICIAL_SHADOW_PREVIEW',
        notices: {
          officialLogbook: false,
          replacesPaper: false,
          containsSignature: false,
          persistsRegulatedRecord: false,
        },
        draft: {
          schemaVersion: 'edb.draft.v1',
          status: 'shadow_draft',
          tenantId: 7,
        },
        fieldSources: [],
      },
    });
  });

  it('rejects an invalid flight id before reading the database', async () => {
    const response = await createApp().request(
      '/api/edb/shadow-preview/not-a-flight',
      { headers: requestHeaders() },
      { DB: {} as D1Database } as Env,
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: 'EDB_SHADOW_PREVIEW_INVALID_FLIGHT_ID',
    });
    expect(loadEdbShadowPreviewMock).not.toHaveBeenCalled();
  });

  it('returns the same not-found response for a missing or cross-tenant flight', async () => {
    loadEdbShadowPreviewMock.mockRejectedValue(new EdbShadowPreviewError('FLIGHT_NOT_FOUND', 404));

    const response = await createApp().request(
      '/api/edb/shadow-preview/42',
      { headers: requestHeaders('manager', 7) },
      { DB: {} as D1Database } as Env,
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      success: false,
      error: 'Voo nao encontrado',
      code: 'EDB_SHADOW_PREVIEW_FLIGHT_NOT_FOUND',
    });
  });

  it('does not include names, CANAC or payloads in error responses or logs', async () => {
    loadEdbShadowPreviewMock.mockRejectedValue(
      new EdbShadowPreviewError('CONFLICT_SCOPE_MISMATCH', 409),
    );
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      const response = await createApp().request(
        '/api/edb/shadow-preview/42',
        { headers: requestHeaders() },
        { DB: {} as D1Database } as Env,
      );
      const body = await response.text();
      const logged = JSON.stringify(consoleError.mock.calls);

      expect(response.status).toBe(409);
      expect(body).not.toContain('Tripulante');
      expect(body).not.toContain('CANAC');
      expect(body).not.toContain('payload');
      expect(logged).not.toContain('Tripulante');
      expect(logged).not.toContain('CANAC');
      expect(logged).not.toContain('payload');
    } finally {
      consoleError.mockRestore();
    }
  });
});

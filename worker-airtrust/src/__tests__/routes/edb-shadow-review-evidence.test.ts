import { Hono, type Context } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../middleware/error-handler';
import type { Env, Variables } from '../../types';

type TestContext = Context<{ Bindings: Env; Variables: Variables }>;

const { createEvidenceMock } = vi.hoisted(() => ({
  createEvidenceMock: vi.fn(),
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

vi.mock('../../services/edb/shadow-review-evidence', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/edb/shadow-review-evidence')>();
  return { ...actual, createEdbShadowReviewEvidence: createEvidenceMock };
});

import edbShadowPreviewRoutes from '../../routes/edb-shadow-preview';

function createApp() {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();
  app.onError(errorHandler);
  app.route('/api/edb', edbShadowPreviewRoutes);
  return app;
}

function headers(role = 'manager', tenantId = 7) {
  return {
    Authorization: 'Bearer synthetic-token',
    'Content-Type': 'application/json',
    'x-test-role': role,
    'x-test-empresa-id': String(tenantId),
  };
}

function body() {
  return {
    outcome: 'needs_correction',
    paperComparison: 'compared_divergence_found',
    usability: 'minor_friction',
    reviewDurationSeconds: 180,
    selectedFindingCodes: ['SOURCE_MISSING'],
    acknowledgments: {
      paperRemainsOfficial: true,
      notASignature: true,
      noReturnToService: true,
      exportToAuthorizedRepository: true,
    },
  };
}

beforeEach(() => {
  createEvidenceMock.mockReset();
  createEvidenceMock.mockResolvedValue({
    schemaVersion: 'edb.shadow-review-evidence.v1',
    classification: 'NON_OFFICIAL_SHADOW_REVIEW_EVIDENCE',
    notices: {
      officialLogbook: false,
      containsSignature: false,
      persistsInAirTrust: false,
      authorizesReturnToService: false,
      exportRequired: true,
    },
  });
});

describe('POST /api/edb/shadow-review/:flightId/evidence', () => {
  it('requires authentication and manager access', async () => {
    const unauthenticated = await createApp().request(
      '/api/edb/shadow-review/42/evidence',
      { method: 'POST', body: JSON.stringify(body()) },
      {} as Env,
    );
    expect(unauthenticated.status).toBe(401);

    const forbidden = await createApp().request(
      '/api/edb/shadow-review/42/evidence',
      { method: 'POST', headers: headers('viewer'), body: JSON.stringify(body()) },
      {} as Env,
    );
    expect(forbidden.status).toBe(403);
    expect(createEvidenceMock).not.toHaveBeenCalled();
  });

  it('uses authenticated tenant and user and returns non-persistent evidence', async () => {
    const response = await createApp().request(
      '/api/edb/shadow-review/42/evidence',
      { method: 'POST', headers: headers('manager', 7), body: JSON.stringify(body()) },
      { DB: {} as D1Database } as Env,
    );

    expect(response.status).toBe(200);
    expect(createEvidenceMock).toHaveBeenCalledWith({
      db: expect.anything(),
      tenantId: 7,
      userId: 10,
      flightId: 42,
      review: body(),
    });
    expect(await response.json()).toMatchObject({
      success: true,
      data: {
        classification: 'NON_OFFICIAL_SHADOW_REVIEW_EVIDENCE',
        notices: {
          officialLogbook: false,
          containsSignature: false,
          persistsInAirTrust: false,
          authorizesReturnToService: false,
          exportRequired: true,
        },
      },
    });
  });

  it('rejects invalid acknowledgments before generating evidence', async () => {
    const invalid = body();
    invalid.acknowledgments.notASignature = false;
    const response = await createApp().request(
      '/api/edb/shadow-review/42/evidence',
      { method: 'POST', headers: headers(), body: JSON.stringify(invalid) },
      { DB: {} as D1Database } as Env,
    );

    expect(response.status).toBe(400);
    expect(createEvidenceMock).not.toHaveBeenCalled();
  });

  it('sanitizes unexpected failures without leaking payload or tenant data', async () => {
    createEvidenceMock.mockRejectedValue(
      Object.assign(new Error('SQL secret payload'), {
        empresa_id: 7,
        token: 'secret-token',
      }),
    );

    const response = await createApp().request(
      '/api/edb/shadow-review/42/evidence',
      { method: 'POST', headers: headers(), body: JSON.stringify(body()) },
      { DB: {} as D1Database } as Env,
    );
    const responseBody = await response.text();

    expect(response.status).toBe(500);
    expect(responseBody).toContain('EDB_SHADOW_REVIEW_EVIDENCE_FAILED');
    expect(responseBody).not.toContain('SQL secret');
    expect(responseBody).not.toContain('empresa_id');
    expect(responseBody).not.toContain('secret-token');
  });
});

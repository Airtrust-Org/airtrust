import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';

const runSigvoosShadowIngestionMock = vi.fn();
const syncSigvoosForFrmsMock = vi.fn();

vi.mock('../../services/sigvoos-shadow-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/sigvoos-shadow-service')>();
  return {
    ...actual,
    runSigvoosShadowIngestion: (...args: unknown[]) => runSigvoosShadowIngestionMock(...args),
  };
});

vi.mock('../../services/sigvoos-frms', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/sigvoos-frms')>();
  return {
    ...actual,
    syncSigvoosForFrms: (...args: unknown[]) => syncSigvoosForFrmsMock(...args),
  };
});

vi.mock('../../middleware/tenant', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../middleware/tenant')>();
  return {
    ...actual,
    tenantMiddleware: () => async (c: any, next: () => Promise<void>) => {
      c.set('empresaId', 10);
      await next();
    },
  };
});

import { app } from '../../index';

const SHADOW_PATH = '/api/integracoes/sigvoos/shadow/sincronizar';

function createDb(overrides: { tenantRole?: string; permissionOverride?: string | null } = {}) {
  const tenantRole = overrides.tenantRole ?? 'admin';
  const permissionOverride = overrides.permissionOverride ?? null;
  return {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn().mockReturnThis(),
      first: vi.fn(async () => {
        if (sql.includes('usuario_permissoes')) {
          return permissionOverride ? { tipo: permissionOverride } : null;
        }
        if (sql.includes('usuarios_empresas')) {
          return { role: tenantRole };
        }
        if (sql.includes('sigvoos_shadow_runs')) {
          return null;
        }
        return null;
      }),
      all: vi.fn(async () => ({ results: [] })),
      run: vi.fn(async () => ({ success: true, meta: {} })),
    })),
  } as unknown as D1Database;
}

function createEnv(overrides: Partial<Env> = {}, dbOverrides?: Parameters<typeof createDb>[0]): Env {
  return {
    DB: createDb(dbOverrides),
    ENVIRONMENT: 'staging',
    APP_VERSION: 'test-shadow-route',
    ...overrides,
  } as unknown as Env;
}

function authHeaders() {
  return { authorization: 'Bearer synthetic', 'content-type': 'application/json' };
}

beforeEach(() => {
  runSigvoosShadowIngestionMock.mockReset();
  syncSigvoosForFrmsMock.mockReset();
});

vi.mock('../../middleware/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../middleware/auth')>();
  return {
    ...actual,
    auth: () => async (c: any, next: () => Promise<void>) => {
      if (!c.req.header('authorization')) {
        return c.json({ success: false, error: 'Token de autenticação não fornecido', code: 'MISSING_TOKEN' }, 401);
      }
      c.set('userId', 101);
      c.set('userEmail', 'admin@tenant.local');
      c.set('userRole', 'admin');
      c.set('empresaId', 10);
      await next();
    },
  };
});

describe('POST /shadow/sincronizar (SIGVOOS real shadow — Fase 0 governed route)', () => {
  it('rejeita chamada sem autenticação', async () => {
    const response = await app.request(
      `http://example.test${SHADOW_PATH}`,
      { method: 'POST', body: JSON.stringify({ from: '2026-08-22', to: '2026-08-22' }) },
      createEnv(),
    );
    expect(response.status).toBe(401);
    expect(runSigvoosShadowIngestionMock).not.toHaveBeenCalled();
  });

  it('rejeita tenant role não-admin (manager) mesmo autenticado', async () => {
    const env = createEnv({}, { tenantRole: 'manager' });
    const response = await app.request(
      `http://example.test${SHADOW_PATH}`,
      { method: 'POST', headers: authHeaders(), body: JSON.stringify({ from: '2026-08-22', to: '2026-08-22' }) },
      env,
    );
    expect(response.status).toBe(403);
    expect(runSigvoosShadowIngestionMock).not.toHaveBeenCalled();
  });

  it('rejeita payload inválido', async () => {
    const response = await app.request(
      `http://example.test${SHADOW_PATH}`,
      { method: 'POST', headers: authHeaders(), body: JSON.stringify({ from: 'not-a-date' }) },
      createEnv(),
    );
    expect(response.status).toBe(400);
    expect(runSigvoosShadowIngestionMock).not.toHaveBeenCalled();
  });

  it('resolve empresaId do contexto autenticado, chama somente o shadow service (nunca o path operacional) e nunca retorna secret', async () => {
    runSigvoosShadowIngestionMock.mockResolvedValue({
      runId: 'run-1',
      empresaId: 10,
      status: 'COMPLETE',
      from: '2026-08-22',
      to: '2026-08-22',
      attempted: 3,
      processed: 3,
      failed: 0,
      unmapped: 0,
      classifications: { MATCH: 3 },
    });

    const response = await app.request(
      `http://example.test${SHADOW_PATH}`,
      { method: 'POST', headers: authHeaders(), body: JSON.stringify({ from: '2026-08-22', to: '2026-08-22', pageSize: 50, maxPages: 2 }) },
      createEnv(),
    );

    expect(response.status).toBe(200);
    const json = (await response.json()) as { success: boolean; data: { runId: string } };
    expect(json.success).toBe(true);
    expect(json.data.runId).toBe('run-1');
    expect(JSON.stringify(json)).not.toMatch(/password|token/i);

    expect(runSigvoosShadowIngestionMock).toHaveBeenCalledTimes(1);
    const [db, empresaId, input] = runSigvoosShadowIngestionMock.mock.calls[0];
    expect(empresaId).toBe(10);
    expect(input).toMatchObject({ from: '2026-08-22', to: '2026-08-22', pageSize: 50, maxPages: 2 });
    expect(db).toBeDefined();

    expect(syncSigvoosForFrmsMock).not.toHaveBeenCalled();
  });

  it('propaga 409 quando o shadow service reporta execução concorrente, sem vazar detalhes internos', async () => {
    runSigvoosShadowIngestionMock.mockRejectedValue(new Error('SIGVOOS_SHADOW_CONCURRENT_RUN'));

    const response = await app.request(
      `http://example.test${SHADOW_PATH}`,
      { method: 'POST', headers: authHeaders(), body: JSON.stringify({ from: '2026-08-22', to: '2026-08-22' }) },
      createEnv(),
    );

    expect(response.status).toBe(409);
    expect(syncSigvoosForFrmsMock).not.toHaveBeenCalled();
  });
});

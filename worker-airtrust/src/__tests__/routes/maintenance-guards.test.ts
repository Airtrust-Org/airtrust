import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';

vi.mock('../../lib/frms/fortnight-coverage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/frms/fortnight-coverage')>();
  return {
    ...actual,
    getFrmsFortnightCoverage: vi.fn().mockResolvedValue({ total: 0, items: [] }),
  };
});

import * as coverage from '../../lib/frms/fortnight-coverage';
import { app } from '../../index';
import frmsRoutes from '../../routes/frms';
import { sigvoosRouter } from '../../routes/integracoes_sigvoos';

const secret = 'synthetic-maintenance-secret';

function createDb() {
  return {
    prepare: vi.fn(() => ({
      bind: vi.fn().mockReturnThis(),
      first: vi.fn(),
      all: vi.fn(),
      run: vi.fn(),
    })),
  } as unknown as D1Database;
}

export function createLocalMaintenanceEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: createDb(),
    ENVIRONMENT: 'development',
    ENABLE_LOCAL_MAINTENANCE: 'true',
    LOCAL_MAINTENANCE_RUNTIME: 'true',
    MAINTENANCE_SECRET: secret,
    ...overrides,
  } as unknown as Env;
}

export function createProductionMaintenanceEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: createDb(),
    ENVIRONMENT: 'production',
    ...overrides,
  } as unknown as Env;
}

export function createStagingMaintenanceEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: createDb(),
    ENVIRONMENT: 'staging',
    ...overrides,
  } as unknown as Env;
}

const coveragePath = '/maintenance/fortnight-coverage?empresa_id=6&data_inicio=2026-06-01&data_fim=2026-06-07';
const appCoveragePath = `/api/frms${coveragePath}`;
const validHeaders = { 'x-maintenance-secret': secret };

beforeEach(() => {
  vi.mocked(coverage.getFrmsFortnightCoverage).mockClear();
});

describe('local-only maintenance policy', () => {
  it.each([
    ['production', createProductionMaintenanceEnv()],
    ['staging', createStagingMaintenanceEnv()],
    ['production with every local flag', createProductionMaintenanceEnv({ ENABLE_LOCAL_MAINTENANCE: 'true', LOCAL_MAINTENANCE_RUNTIME: 'true', MAINTENANCE_SECRET: secret })],
    ['development missing enable flag', createLocalMaintenanceEnv({ ENABLE_LOCAL_MAINTENANCE: undefined })],
    ['development missing runtime marker', createLocalMaintenanceEnv({ LOCAL_MAINTENANCE_RUNTIME: undefined })],
    ['development missing environment', createLocalMaintenanceEnv({ ENVIRONMENT: undefined })],
  ])('%s is absent through the direct router before services or D1', async (_name, env) => {
    const response = await frmsRoutes.request(`http://example.test${coveragePath}`, { headers: validHeaders }, env);
    expect(response.status).toBe(404);
    expect(coverage.getFrmsFortnightCoverage).not.toHaveBeenCalled();
    expect((env.DB as unknown as { prepare: ReturnType<typeof vi.fn> }).prepare).not.toHaveBeenCalled();
  });

  it('does not trust Host, forwarded host, Origin, or ENABLE_DEV_AUTH_BYPASS', async () => {
    const env = createProductionMaintenanceEnv({ ENABLE_DEV_AUTH_BYPASS: 'true', MAINTENANCE_SECRET: secret });
    const response = await frmsRoutes.request(`http://localhost${coveragePath}`, {
      headers: { ...validHeaders, Host: 'localhost', 'X-Forwarded-Host': 'localhost', Origin: 'http://localhost' },
    }, env);
    expect(response.status).toBe(404);
  });

  it('requires the synthetic secret only after the complete local runtime contract', async () => {
    const missing = await frmsRoutes.request(`http://example.test${coveragePath}`, {}, createLocalMaintenanceEnv({ MAINTENANCE_SECRET: undefined }));
    const wrong = await frmsRoutes.request(`http://example.test${coveragePath}`, { headers: { 'x-maintenance-secret': 'wrong' } }, createLocalMaintenanceEnv());
    const allowed = await frmsRoutes.request(`http://example.test${coveragePath}`, { headers: validHeaders }, createLocalMaintenanceEnv());
    expect(missing.status).toBe(404);
    expect(wrong.status).toBe(404);
    expect(allowed.status).toBe(200);
  });

  it('enforces the same policy through the full app before body, rate limiting, DB, or services', async () => {
    const env = createProductionMaintenanceEnv({ MAINTENANCE_SECRET: secret });
    const response = await app.request(`http://remote.example${appCoveragePath}`, {
      method: 'POST',
      headers: { ...validHeaders, 'content-type': 'application/json' },
      body: '{not-json',
    }, env);
    expect(response.status).toBe(404);
    expect((env.DB as unknown as { prepare: ReturnType<typeof vi.fn> }).prepare).not.toHaveBeenCalled();
    expect(coverage.getFrmsFortnightCoverage).not.toHaveBeenCalled();
  });

  it('keeps mutation endpoints unavailable over HTTP, including SIGVOOS', async () => {
    const env = createLocalMaintenanceEnv();
    const [apply, reprocess, sync] = await Promise.all([
      frmsRoutes.request('http://example.test/maintenance/fortnight-materialization-apply', { method: 'POST', headers: validHeaders, body: '{not-json' }, env),
      frmsRoutes.request('http://example.test/maintenance/reprocessar-lote', { method: 'POST', headers: validHeaders, body: '{not-json' }, env),
      sigvoosRouter.request('http://example.test/maintenance/sincronizar-frms', { method: 'POST', headers: validHeaders, body: '{not-json' }, env),
    ]);
    expect([apply.status, reprocess.status, sync.status]).toEqual([404, 404, 404]);
  });
});

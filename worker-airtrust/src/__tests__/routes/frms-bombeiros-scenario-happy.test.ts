import { describe, expect, it, vi } from 'vitest';
import { Hono, type ExecutionContext } from 'hono';
import frmsBombeiros from '../../routes/frms-bombeiros';

const regulatoryEvidence = vi.fn();
const governedConfig = vi.fn();
vi.mock('../../lib/frms/parameter-governance', async importOriginal => ({
  ...(await importOriginal<typeof import('../../lib/frms/parameter-governance')>()),
  resolveFrmsRegulatoryProfileEvidence: (...args: unknown[]) => regulatoryEvidence(...args),
}));
vi.mock('../../lib/frms/db-service', async importOriginal => ({
  ...(await importOriginal<typeof import('../../lib/frms/db-service')>()),
  loadEffectiveFrmsConfiguration: (...args: unknown[]) => governedConfig(...args),
}));

const scenario = {
  mode: 'SYNTHETIC',
  mission_type: 'RESGATE',
  duty_period: 'NOTURNO',
  standby_activation: true,
  critical_mission: true,
  sleep_hours_24h: 4,
  sleep_fragmented: true,
  kss_reported: 8,
  pvt_60s_completed: false,
  self_declared_unfit: true,
};
const ctx = {
  waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {},
} as ExecutionContext;
function getApp(empresaId = 130) {
  const dbReads: string[] = [];
  const db = {
    prepare(sql: string) {
      dbReads.push(sql);
      throw new Error('Synthetic method must not access clinical data or write D1');
    },
  } as unknown as D1Database;
  const app = new Hono<{ Bindings: any; Variables: any }>();
  app.use('*', async (c, next) => {
    c.env = { DB: db, ENVIRONMENT: 'staging' };
    c.set('userId', 19);
    c.set('userRole', 'admin');
    c.set('empresaId', empresaId);
    c.set('tenantContext', {
      empresaId, empresaCodigo: 'bombeiros', empresaNome: 'Bombeiros QA',
      role: 'admin', permissions: [], plano: 'test',
    });
    await next();
  });
  app.onError(error => new Response(JSON.stringify({ code: (error as { code?: string }).code ?? 'ERROR' }), {
    status: (error as { statusCode?: number }).statusCode ?? 500,
    headers: { 'Content-Type': 'application/json' },
  }));
  app.route('/', frmsBombeiros);
  return {
    dbReads,
    submit: () => app.fetch(
      new Request('http://localhost/simulacao/metodologia', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scenario),
      }), {}, ctx),
  };
}

describe('BOA methodology walkthrough authorized success path', () => {
  it('produces a non-persistent audited-versioned evidence explanation with no clinical DB read', async () => {
    regulatoryEvidence.mockReset();
    governedConfig.mockReset();
    regulatoryEvidence.mockResolvedValue({
      empresaId: 130, profileCode: 'FIREFIGHTER_AVIATION', regulatoryProfileId: 'boa-profile-130',
    });
    governedConfig.mockResolvedValue({
      empresaId: 130, profileCode: 'FIREFIGHTER_AVIATION',
      regulatoryProfileId: 'boa-profile-130', revision: { id: 'boa-r1', policy_version: 'BOA-QA' },
    });
    const { submit, dbReads } = getApp();
    const response = await submit();
    expect(response.status).toBe(200);
    const body = await response.json() as {
      success: boolean;
      data: { dispatch_permission: string; status: string; evidence: unknown[]; persisted: boolean };
      meta: { tenant_id: number; profile_code: string; stored: boolean; revision_id: string };
    };
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({
      dispatch_permission: 'NOT_GRANTED', status: 'INCOMPLETE_EVIDENCE', persisted: false,
    });
    expect(body.data.evidence).toHaveLength(9);
    expect(body.meta).toMatchObject({
      tenant_id: 130, profile_code: 'FIREFIGHTER_AVIATION', revision_id: 'boa-r1', stored: false,
    });
    expect(dbReads).toHaveLength(0);
    expect(regulatoryEvidence).toHaveBeenCalled();
    expect(governedConfig).toHaveBeenCalled();
  });

  it('refuses an offshore regulatory profile regardless of tenant code', async () => {
    regulatoryEvidence.mockReset();
    governedConfig.mockReset();
    regulatoryEvidence.mockResolvedValue({
      empresaId: 130, profileCode: 'HELICOPTER_OFFSHORE', regulatoryProfileId: 'offshore',
    });
    governedConfig.mockResolvedValue({
      empresaId: 130, profileCode: 'HELICOPTER_OFFSHORE',
      regulatoryProfileId: 'offshore', revision: { id: 'offshore-r1' },
    });
    const { submit, dbReads } = getApp();
    const response = await submit();
    expect(response.status).toBe(503);
    expect(dbReads).toHaveLength(0);
  });
});

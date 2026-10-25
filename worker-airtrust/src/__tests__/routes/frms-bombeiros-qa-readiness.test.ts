import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono, type ExecutionContext } from 'hono';
import frmsBombeiros from '../../routes/frms-bombeiros';

const profile = vi.fn();
const policy = vi.fn();
vi.mock('../../lib/frms/parameter-governance', async original => ({
  ...(await original<typeof import('../../lib/frms/parameter-governance')>()),
  resolveFrmsRegulatoryProfileEvidence: (...args: unknown[]) => profile(...args),
}));
vi.mock('../../lib/frms/db-service', async original => ({
  ...(await original<typeof import('../../lib/frms/db-service')>()),
  loadEffectiveFrmsConfiguration: (...args: unknown[]) => policy(...args),
}));
const ctx = { waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {} } as ExecutionContext;
function appFor(options?: {
  tenant?: number; code?: string; role?: string;
  env?: string; gate?: string; counts?: object | null;
  failQuery?: boolean;
}) {
  const tenant = options?.tenant ?? 130;
  const db = {
    prepare: vi.fn().mockImplementation(() => {
      if (options?.failQuery) throw new Error('SQL unavailable: private details');
      return { bind: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(options?.counts === undefined
          ? { member_accounts: 0, crew_links: 0, manager_roles: 0, admin_roles: 0 }
          : options.counts),
      }) };
    }),
  };
  const app = new Hono<{ Bindings: any; Variables: any }>();
  app.use('*', async (c, next) => {
    c.env = { DB: db, ENVIRONMENT: options?.env ?? 'staging',
      BOA_FRMS_QA_SENSITIVE_WRITES_TENANT_ID: options?.gate ?? '',
      BOA_FRMS_QA_REVIEWED_DOCUMENT_SHA256: 'a'.repeat(64),
      BOA_FRMS_QA_REVIEWED_REVISION_ID: 'qa-only',
      BOA_FRMS_QA_REVIEWED_EXPIRES_AT: new Date(Date.now() + 3600000).toISOString() };
    c.set('userId', 200);
    c.set('userRole', options?.role ?? 'admin');
    c.set('tenantContext', {
      empresaId: tenant, empresaCodigo: options?.code ?? 'bombeiros',
      role: options?.role ?? 'admin', empresaNome: 'QA',
      plano: 'qa', permissions: [],
    });
    await next();
  });
  app.onError((error) => new Response(JSON.stringify({success:false,code:'DENIED'}), {
    status: (error as { statusCode?: number }).statusCode ?? 500,
  }));
  app.route('/', frmsBombeiros);
  return { db, get: () => app.fetch(
    new Request('http://localhost/qa/prontidao'), {}, ctx),
  };
}
describe('BOA read-only staging readiness, no clinical data or approval', () => {
  beforeEach(() => {
    profile.mockReset().mockResolvedValue({
      empresaId: 130, profileCode: 'FIREFIGHTER_AVIATION',
      regulatoryProfileId: 'qa-unapproved-profile',
      serviceCategory: 'QA_FIREFIGHTER_TEST',
      approvalReference: 'QA-SYNTHETIC-REVIEW-ONLY',
      policyVersion: 'QA_NOT_APPROVED',
      sourceDocumentHash: 'a'.repeat(64),
    });
    policy.mockReset().mockResolvedValue({
      empresaId: 130, profileCode: 'FIREFIGHTER_AVIATION',
      regulatoryProfileId: 'qa-unapproved-profile',
      revision: { id: 'qa-only', policy_version: 'QA_NOT_APPROVED',
        empresa_id: 130, profile_code: 'FIREFIGHTER_AVIATION',
        regulatory_profile_id: 'qa-unapproved-profile',
        status: 'ACTIVE', source_type: 'APPROVED_OPERATIONAL_POLICY',
        source_reference: 'QA-SYNTHETIC-SOURCE-ONLY',
      },
    });
  });

  it('shows absent roster and disabled gate without creating identities or revealing private data', async () => {
    const { db, get } = appFor();
    const response = await get();
    expect(response.status).toBe(200);
    const body = await response.json() as { data: Record<string, unknown>; meta: Record<string, unknown> };
    expect(body.data).toMatchObject({
      status: 'QA_PRECONDITIONS_INCOMPLETE',
      accounts: { member_accounts: 0, crew_links: 0, manager_roles: 0, admin_roles: 0 },
      cohort_130_structurally_present: false,
      firefighter_profile_configuration_resolves: true,
      documentary_review_binding_matches: true,
      synthetic_tenant_write_gate_matches: false,
      scientific_validation: 'NOT_ATTESTED',
      privacy_authorization: 'NOT_ATTESTED',
      operational_poc_accepted: false,
    });
    expect(body.meta.write_performed).toBe(false);
    expect(JSON.stringify(body)).not.toMatch(/funcionario_id|sleep_hours_24h|kss_reported|token|secret/i);
    expect(db.prepare).toHaveBeenCalledOnce();
    expect(db.prepare.mock.calls[0][0]).toContain('WHERE ue.empresa_id = ?');
  });

  it('even with 130 accounts, write gate and profile configuration, never grants scientific approval', async () => {
    const response = await appFor({
      counts: { member_accounts: 130, crew_links: 125, manager_roles: 4, admin_roles: 1 },
      gate: '130',
    }).get();
    expect(response.status).toBe(200);
    const body = await response.json() as { data: Record<string, unknown>; meta: Record<string, unknown> };
    expect(body.data).toMatchObject({
      status: 'CONFIGURATION_CHECKS_PASSED_NOT_AUTHORIZED',
      cohort_130_structurally_present: true,
      documentary_review_binding_matches: true,
      synthetic_tenant_write_gate_matches: true,
      official_boa_source: 'NOT_VERIFIED',
      scientific_validation: 'NOT_ATTESTED',
      privacy_authorization: 'NOT_ATTESTED',
      real_d1_checkin: 'NOT_TESTED',
      operational_poc_accepted: false,
    });
  });

  it('never labels the cohort configured if independent review bindings are missing', async () => {
    const { get } = appFor({
      counts: { member_accounts: 130, crew_links: 125, manager_roles: 4, admin_roles: 1 },
      gate: '130',
    });
    profile.mockResolvedValueOnce({
      empresaId: 130, profileCode: 'FIREFIGHTER_AVIATION',
      regulatoryProfileId: 'qa-unapproved-profile',
      serviceCategory: 'QA_FIREFIGHTER_TEST',
      approvalReference: null, policyVersion: 'QA_NOT_APPROVED',
      sourceDocumentHash: null,
    });
    const response = await get();
    expect(response.status).toBe(200);
    const body = await response.json() as { data: Record<string, unknown> };
    expect(body.data.documentary_review_binding_matches).toBe(false);
    expect(body.data.status).toBe('QA_PRECONDITIONS_INCOMPLETE');
    expect(body.data.operational_poc_accepted).toBe(false);
  });

  it('rejects other tenant, unsupported role and production before any SQL', async () => {
    for (const args of [
      { tenant: 6, code: 'costadosol' },
      { tenant: 6 },
      { role: 'manager' },
      { env: 'production' },
    ]) {
      const {db, get} = appFor(args);
      const res = await get();
      expect([403,404]).toContain(res.status);
      expect(db.prepare).not.toHaveBeenCalled();
    }
    expect(profile).not.toHaveBeenCalled();
  });

  it('fails safely on query error, corrupted counts and unresolved policy', async () => {
    const {get: errorGet} = appFor({failQuery: true});
    const error = await errorGet();
    expect(error.status).toBe(503);
    expect((await error.json() as {code:string}).code).toBe('BOA_QA_ROSTER_READ_UNAVAILABLE');
    const {get: brokenGet} = appFor({
      counts: {member_accounts: 1,crew_links: 2,manager_roles: 0,admin_roles: 0},
    });
    expect((await brokenGet()).status).toBe(503);
    profile.mockRejectedValueOnce(new Error('not approved'));
    const result = await appFor().get();
    expect(result.status).toBe(200);
    const body = await result.json() as { data: Record<string, unknown> };
    expect(body.data.firefighter_profile_configuration_resolves).toBe(false);
    expect(body.data.status).toBe('QA_PRECONDITIONS_INCOMPLETE');
  });
});

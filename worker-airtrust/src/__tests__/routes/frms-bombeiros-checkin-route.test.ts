import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono, type ExecutionContext } from 'hono';
import frmsBombeiros from '../../routes/frms-bombeiros';

const profileEvidence = vi.fn();
const policyConfig = vi.fn();
const crewIdentity = vi.fn();
const registerCheckin = vi.fn();
vi.mock('../../lib/frms/parameter-governance', async original => ({
  ...(await original<typeof import('../../lib/frms/parameter-governance')>()),
  resolveFrmsRegulatoryProfileEvidence: (...args: unknown[]) => profileEvidence(...args),
}));
vi.mock('../../lib/frms/db-service', async original => ({
  ...(await original<typeof import('../../lib/frms/db-service')>()),
  loadEffectiveFrmsConfiguration: (...args: unknown[]) => policyConfig(...args),
}));
vi.mock('../../lib/frms/bombeiros-operational-events', async original => ({
  ...(await original<typeof import('../../lib/frms/bombeiros-operational-events')>()),
  resolveBoaCrewIdentity: (...args: unknown[]) => crewIdentity(...args),
  registerBoaCheckin: (...args: unknown[]) => registerCheckin(...args),
}));
const ctx = { waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {} } as ExecutionContext;
const input = {
  mission_type: 'RESGATE', duty_period: 'NOTURNO',
  standby_activation: true, critical_mission: false,
  sleep_hours_24h: 5, sleep_fragmented: true,
  kss_reported: 7, pvt_60s_completed: null,
  self_declared_unfit: false, acknowledge_confidentiality: true,
};
function makeApp({
  id = 130, codigo = 'bombeiros', role = 'student', env = 'staging',
}: { id?: number; codigo?: string; role?: string; env?: string } = {}) {
  const app = new Hono<{ Bindings: any; Variables: any }>();
  const db = { prepare: vi.fn() };
  app.use('*', async (c, next) => {
    c.env = { ENVIRONMENT: env, DB: db };
    c.set('userId', 101);
    c.set('userRole', role);
    c.set('empresaId', id);
    c.set('tenantContext', {
      empresaId: id, empresaCodigo: codigo, empresaNome: codigo,
      role, plano: 'qa', permissions: [],
    });
    await next();
  });
  app.onError(e => new Response(JSON.stringify({ message: String(e) }), {
    status: (e as { statusCode?: number }).statusCode ?? 500,
  }));
  app.route('/', frmsBombeiros);
  return {
    db,
    post: (body: unknown) => app.fetch(new Request('http://localhost/checkin', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }), {}, ctx),
  };
}
describe('BOA crew check-in API — real employee link, independent tenant and policy', () => {
  beforeEach(() => {
    profileEvidence.mockReset().mockResolvedValue({
      empresaId: 130, profileCode: 'FIREFIGHTER_AVIATION', regulatoryProfileId: 'boa-policy',
    });
    policyConfig.mockReset().mockResolvedValue({
      empresaId: 130, profileCode: 'FIREFIGHTER_AVIATION',
      regulatoryProfileId: 'boa-policy',
      revision: { id: 'boa-r1', policy_version: 'BOA-QA-P1' },
    });
    crewIdentity.mockReset().mockResolvedValue(21);
    registerCheckin.mockReset().mockResolvedValue({
      accepted: true, checkin_id: 'boa-checkin-1', case_id: 'boa-case-1',
      status: 'HUMAN_REVIEW_REQUIRED', dispatch_permission: 'NOT_GRANTED',
      method_version: 'BOA_EVIDENCE_INTAKE_V1',
    });
  });
  it('does not query data when a Costa do Sol crew member attempts BOA check-in', async () => {
    const { post, db } = makeApp({ id: 6, codigo: 'costadosol' });
    expect((await post(input)).status).toBe(403);
    expect(db.prepare).not.toHaveBeenCalled();
    expect(crewIdentity).not.toHaveBeenCalled();
    expect(registerCheckin).not.toHaveBeenCalled();
  });
  it('does not accept real health data on production until governance release', async () => {
    const { post, db } = makeApp({ env: 'production' });
    expect((await post(input)).status).toBe(404);
    expect(db.prepare).not.toHaveBeenCalled();
    expect(registerCheckin).not.toHaveBeenCalled();
  });
  it('rejects forged company/employee IDs and unacknowledged privacy terms before any DB access', async () => {
    const { post, db } = makeApp();
    expect((await post({ ...input, empresa_id: 6, funcionario_id: 22 })).status).toBe(400);
    expect((await post({ ...input, acknowledge_confidentiality: false })).status).toBe(400);
    expect(db.prepare).not.toHaveBeenCalled();
    expect(crewIdentity).not.toHaveBeenCalled();
  });
  it('returns a review case, not a flight-release status, for authorized crew', async () => {
    const { post } = makeApp();
    const response = await post(input);
    expect(response.status).toBe(201);
    const body = await response.json() as {
      success: boolean;
      data: { dispatch_permission: string; case_id: string };
      meta: { profile_code: string; revision_id: string; clinical_validation: string };
    };
    expect(body).toMatchObject({
      success: true, data: { dispatch_permission: 'NOT_GRANTED', case_id: 'boa-case-1' },
      meta: { profile_code: 'FIREFIGHTER_AVIATION', revision_id: 'boa-r1',
        clinical_validation: 'NOT_ESTABLISHED' },
    });
    expect(crewIdentity).toHaveBeenCalledWith(expect.anything(), 130, 101);
    expect(registerCheckin).toHaveBeenCalledWith(
      expect.anything(), 130, 21, 101, expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      input, { profile_code: 'FIREFIGHTER_AVIATION', revision_id: 'boa-r1',
        policy_version: 'BOA-QA-P1' },
    );
  });
  it('rejects employee identity unlinked from BOA even if its user has valid login', async () => {
    crewIdentity.mockResolvedValue(null);
    const { post } = makeApp();
    expect((await post(input)).status).toBe(403);
    expect(registerCheckin).not.toHaveBeenCalled();
  });
  it('never falls back to the offshore regulatory revision', async () => {
    profileEvidence.mockResolvedValue({
      empresaId: 130, profileCode: 'HELICOPTER_OFFSHORE', regulatoryProfileId: 'offshore',
    });
    const { post } = makeApp();
    expect((await post(input)).status).toBe(503);
    expect(crewIdentity).not.toHaveBeenCalled();
  });
});

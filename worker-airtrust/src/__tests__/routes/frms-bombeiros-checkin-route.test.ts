import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono, type ExecutionContext } from 'hono';
import frmsBombeiros from '../../routes/frms-bombeiros';

const profileEvidence = vi.fn();
const policyConfig = vi.fn();
const crewIdentity = vi.fn();
const registerCheckin = vi.fn();
const readCheckinStatus = vi.fn();
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
  loadBoaCrewCheckinStatus: (...args: unknown[]) => readCheckinStatus(...args),
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
  id = 130, codigo = 'bombeiros', role = 'student', env = 'staging', approved = '130',
}: { id?: number; codigo?: string; role?: string; env?: string; approved?: string } = {}) {
  const app = new Hono<{ Bindings: any; Variables: any }>();
  const db = { prepare: vi.fn() };
  app.use('*', async (c, next) => {
    c.env = { ENVIRONMENT: env, DB: db,
      BOA_FRMS_QA_SENSITIVE_WRITES_TENANT_ID: approved,
      BOA_FRMS_QA_REVIEWED_DOCUMENT_SHA256: 'a'.repeat(64),
      BOA_FRMS_QA_REVIEWED_REVISION_ID: 'boa-r1' };
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
    getStatus: () => app.fetch(new Request('http://localhost/checkin/status'), {}, ctx),
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
      serviceCategory: 'QA_FIREFIGHTER_TEST',
      approvalReference: 'QA-SYNTHETIC-REVIEW-ONLY',
      policyVersion: 'BOA-QA-P1',
      sourceDocumentHash: 'a'.repeat(64),
    });
    policyConfig.mockReset().mockResolvedValue({
      empresaId: 130, profileCode: 'FIREFIGHTER_AVIATION',
      regulatoryProfileId: 'boa-policy',
      revision: { id: 'boa-r1', policy_version: 'BOA-QA-P1',
        empresa_id: 130, profile_code: 'FIREFIGHTER_AVIATION',
        regulatory_profile_id: 'boa-policy',
        source_type: 'APPROVED_OPERATIONAL_POLICY',
        source_reference: 'QA-SYNTHETIC-REVIEW-ONLY',
      },
    });
    crewIdentity.mockReset().mockResolvedValue(21);
    readCheckinStatus.mockReset().mockResolvedValue({
      reference_date: '2026-10-20', received: true,
      checkin_id: 'boa-checkin-1', case_id: 'boa-case-1',
      human_review_required: true, dispatch_permission: 'NOT_GRANTED',
      source: 'BOA_APPEND_ONLY_RECEIPT',
    });
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
  it('rejects sensitive staging writes by default without exact tenant authorization', async () => {
    const missing = makeApp({ approved: '' });
    expect((await missing.post(input)).status).toBe(503);
    expect(registerCheckin).not.toHaveBeenCalled();

    const other = makeApp({ approved: '6' });
    expect((await other.post(input)).status).toBe(503);
    expect(registerCheckin).not.toHaveBeenCalled();

    const wildcard = makeApp({ approved: 'all' });
    expect((await wildcard.post(input)).status).toBe(503);
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
  it('returns 403 if BOA crew membership is revoked at the actual DB write', async () => {
    registerCheckin.mockResolvedValueOnce({
      accepted: false, status: 'RECHECK_DENIED',
      checkin_id: null, case_id: null,
      dispatch_permission: 'NOT_GRANTED',
      method_version: 'BOA_EVIDENCE_INTAKE_V1',
    });
    const { post } = makeApp();
    const result = await post(input);
    expect(result.status).toBe(403);
    expect(await result.json()).toMatchObject({
      code: 'BOMBEIROS_CREW_NOT_AUTHORIZED',
      dispatch_permission: 'NOT_GRANTED',
    });
  });

  it('keeps daily idempotency conflict distinct from a revoked account', async () => {
    registerCheckin.mockResolvedValueOnce({
      accepted: false, status: 'ALREADY_RECEIVED',
      checkin_id: null, case_id: null,
      dispatch_permission: 'NOT_GRANTED',
      method_version: 'BOA_EVIDENCE_INTAKE_V1',
    });
    const result = await makeApp().post(input);
    expect(result.status).toBe(409);
    expect(await result.json()).toMatchObject({
      code: 'BOMBEIROS_CHECKIN_ALREADY_RECEIVED',
      dispatch_permission: 'NOT_GRANTED',
    });
  });

  it('rejects employee identity unlinked from BOA even if its user has valid login', async () => {
    crewIdentity.mockResolvedValue(null);
    const { post } = makeApp();
    expect((await post(input)).status).toBe(403);
    expect(registerCheckin).not.toHaveBeenCalled();
  });
  it('returns only authenticated crew receipt status without health payload or client employee ID', async () => {
    const { getStatus } = makeApp();
    const response = await getStatus();
    expect(response.status).toBe(200);
    const body = await response.json() as { data: Record<string, unknown> };
    expect(body.data).toMatchObject({
      received: true, case_id: 'boa-case-1',
      human_review_required: true, dispatch_permission: 'NOT_GRANTED',
    });
    expect(JSON.stringify(body)).not.toMatch(/kss_reported|sleep_hours_24h|funcionario_id/);
    expect(crewIdentity).toHaveBeenCalledWith(expect.anything(), 130, 101);
    expect(readCheckinStatus).toHaveBeenCalledWith(
      expect.anything(), 130, 21, 101, expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    );
    expect(registerCheckin).not.toHaveBeenCalled();
  });

  it('blocks cross-tenant, missing crew link and offshore policy for status reads', async () => {
    const denied = makeApp({ id: 6, codigo: 'costadosol' });
    expect((await denied.getStatus()).status).toBe(403);
    expect(readCheckinStatus).not.toHaveBeenCalled();

    crewIdentity.mockResolvedValueOnce(null);
    const noEmployee = makeApp();
    expect((await noEmployee.getStatus()).status).toBe(403);
    expect(readCheckinStatus).not.toHaveBeenCalled();

    profileEvidence.mockResolvedValueOnce({
      empresaId: 130, profileCode: 'HELICOPTER_OFFSHORE', regulatoryProfileId: 'offshore',
    });
    const offshore = makeApp();
    expect((await offshore.getStatus()).status).toBe(503);
    expect(readCheckinStatus).not.toHaveBeenCalled();
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

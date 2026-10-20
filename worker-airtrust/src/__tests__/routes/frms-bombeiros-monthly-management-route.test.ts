import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono, type ExecutionContext } from 'hono';
import frmsBombeiros from '../../routes/frms-bombeiros';

const evidenceMock = vi.fn();
const policyMock = vi.fn();
const accessMock = vi.fn();
const crewScopeMock = vi.fn();
const reportMock = vi.fn();

vi.mock('../../lib/frms/parameter-governance', async original => ({
  ...(await original<typeof import('../../lib/frms/parameter-governance')>()),
  resolveFrmsRegulatoryProfileEvidence: (...args: unknown[]) => evidenceMock(...args),
}));
vi.mock('../../lib/frms/db-service', async original => ({
  ...(await original<typeof import('../../lib/frms/db-service')>()),
  loadEffectiveFrmsConfiguration: (...args: unknown[]) => policyMock(...args),
}));
vi.mock('../../services/employee-sector-access', async original => ({
  ...(await original<typeof import('../../services/employee-sector-access')>()),
  getEmployeeSectorAccess: (...args: unknown[]) => accessMock(...args),
}));
vi.mock('../../lib/frms/report-access', async original => ({
  ...(await original<typeof import('../../lib/frms/report-access')>()),
  loadFrmsReportCrewScope: (...args: unknown[]) => crewScopeMock(...args),
}));
vi.mock('../../lib/frms/bombeiros-monthly-management-report', async original => ({
  ...(await original<typeof import('../../lib/frms/bombeiros-monthly-management-report')>()),
  loadBoaMonthlyManagementPreview: (...args: unknown[]) => reportMock(...args),
}));
const fakeContext = {
  waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {},
} as ExecutionContext;
function makeApp(id = 130, codigo = 'bombeiros', role = 'admin') {
  const db = { prepare: vi.fn() };
  const app = new Hono<{ Bindings: any; Variables: any }>();
  app.use('*', async (c, next) => {
    c.env = { DB: db, ENVIRONMENT: 'staging' };
    c.set('userId', '101');
    c.set('userRole', role);
    c.set('empresaId', id);
    c.set('tenantContext', {
      empresaId: id, empresaCodigo: codigo, empresaNome: codigo,
      role, plano: 'qa', permissions: [],
    });
    await next();
  });
  app.onError(error => new Response(JSON.stringify({ error: String(error) }), {
    status: (error as { statusCode?: number }).statusCode ?? 500,
  }));
  app.route('/', frmsBombeiros);
  return {
    db,
    get: (suffix = '?mes=2026-10') => app.fetch(
      new Request(`http://localhost/relatorios/gerencial-tecnico-previa${suffix}`),
      {}, fakeContext,
    ),
  };
}
const sampleReport = {
  method_version: 'BOA_MONTHLY_EVIDENCE_PREVIEW_V1',
  state: 'UNSIGNED_UNVALIDATED_PREVIEW',
  current: { month: '2026-10', participants: 6, checkin_receipts: 12 },
  previous: { month: '2026-09', participants: 6, checkin_receipts: 10 },
  receipt_delta: 2,
};
describe('BOA unsigned monthly management report — exact tenant and approved profile', () => {
  beforeEach(() => {
    evidenceMock.mockReset().mockResolvedValue({
      empresaId: 130, profileCode: 'FIREFIGHTER_AVIATION',
      regulatoryProfileId: 'boa-policy',
    });
    policyMock.mockReset().mockResolvedValue({
      empresaId: 130, profileCode: 'FIREFIGHTER_AVIATION',
      regulatoryProfileId: 'boa-policy',
      revision: { id: 'boa-r1', policy_version: 'boa-QA-policy-v1' },
    });
    accessMock.mockReset().mockResolvedValue({ mode: 'all', setorIds: [], funcionarioId: null });
    crewScopeMock.mockReset().mockResolvedValue({
      ids: new Set([10,11,12,13,14,15]),
    });
    reportMock.mockReset().mockResolvedValue(sampleReport);
  });

  it.each([
    [6, 'costadosol', 'admin'], [6, 'bombeiros', 'admin'],
    [130, 'costadosol', 'admin'], [130, 'airtrust', 'admin'],
  ] as const)('blocks %i / %s before DB or profile resolution', async (id, codigo, role) => {
    const { get, db } = makeApp(id, codigo, role);
    expect((await get('?mes=2026-10&empresa_id=130')).status).toBe(403);
    expect(db.prepare).not.toHaveBeenCalled();
    expect(evidenceMock).not.toHaveBeenCalled();
    expect(reportMock).not.toHaveBeenCalled();
  });

  it('does not expose a technical report to operational managers', async () => {
    const { get } = makeApp(130, 'bombeiros', 'manager');
    expect((await get()).status).toBe(403);
    expect(reportMock).not.toHaveBeenCalled();
  });

  it('rejects invalid month before reading any workforce data', async () => {
    const { get } = makeApp();
    expect((await get('?mes=0000-01')).status).toBe(400);
    expect(crewScopeMock).not.toHaveBeenCalled();
  });

  it('does not reuse offshore scientific policy', async () => {
    evidenceMock.mockResolvedValueOnce({
      empresaId: 130, profileCode: 'HELICOPTER_OFFSHORE',
      regulatoryProfileId: 'offshore-policy',
    });
    const { get } = makeApp();
    expect((await get()).status).toBe(503);
    expect(crewScopeMock).not.toHaveBeenCalled();
    expect(reportMock).not.toHaveBeenCalled();
  });

  it('blocks small authorized sectors before aggregating anything', async () => {
    crewScopeMock.mockResolvedValueOnce({ ids: new Set([1,2,3,4]) });
    const { get } = makeApp();
    expect((await get()).status).toBe(403);
    expect(reportMock).not.toHaveBeenCalled();
  });

  it('returns only guarded report and clearly marked unsigned provenance', async () => {
    const { get } = makeApp();
    const response = await get('?mes=2026-10&empresa_id=6');
    expect(response.status).toBe(200);
    const body = await response.json() as {
      data: typeof sampleReport; meta: { signature: string; permanent_archive: string;
        tenant_id: number; policy_revision: string };
    };
    expect(body.data).toMatchObject(sampleReport);
    expect(body.meta).toMatchObject({
      signature: 'NOT_SIGNED', permanent_archive: 'NOT_CREATED',
      tenant_id: 130, policy_revision: 'boa-r1',
    });
    expect(reportMock).toHaveBeenCalledWith(
      expect.anything(), 130, '2026-10', new Set([10,11,12,13,14,15]),
    );
  });

  it('fails closed on broken case event integrity instead of reporting zeros', async () => {
    reportMock.mockRejectedValueOnce(new Error('BOA_MONTHLY_CASE_STREAM_INTEGRITY_ERROR'));
    const { get } = makeApp();
    expect((await get()).status).toBe(503);
  });
});

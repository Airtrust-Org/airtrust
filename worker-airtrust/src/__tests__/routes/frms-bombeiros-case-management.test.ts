import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono, type ExecutionContext } from 'hono';
import frmsBombeiros from '../../routes/frms-bombeiros';

const profileEvidence = vi.fn();
const policyConfig = vi.fn();
const sectorAccess = vi.fn();
const loadCase = vi.fn();
const appendAction = vi.fn();
vi.mock('../../lib/frms/parameter-governance', async original => ({
  ...(await original<typeof import('../../lib/frms/parameter-governance')>()),
  resolveFrmsRegulatoryProfileEvidence: (...args: unknown[]) => profileEvidence(...args),
}));
vi.mock('../../lib/frms/db-service', async original => ({
  ...(await original<typeof import('../../lib/frms/db-service')>()),
  loadEffectiveFrmsConfiguration: (...args: unknown[]) => policyConfig(...args),
}));
vi.mock('../../services/employee-sector-access', async original => ({
  ...(await original<typeof import('../../services/employee-sector-access')>()),
  getEmployeeSectorAccess: (...args: unknown[]) => sectorAccess(...args),
}));
vi.mock('../../lib/frms/bombeiros-operational-events', async original => ({
  ...(await original<typeof import('../../lib/frms/bombeiros-operational-events')>()),
  loadBoaOperationalCase: (...args: unknown[]) => loadCase(...args),
  registerBoaCaseAction: (...args: unknown[]) => appendAction(...args),
}));

const execCtx = { waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {} } as ExecutionContext;
const sector = { mode: 'restricted', setorIds: [9], funcionarioId: null };
const status = {
  case_id: 'boa-case-1', state: 'ABERTO', created_at: '2026-10-20',
  closed_at: null, treatment_recorded: false,
};
function createApp(empresaId = 130, code = 'bombeiros', role = 'manager', environment = 'staging', approved = '130') {
  const app = new Hono<{ Bindings: any; Variables: any }>();
  app.use('*', async (c, next) => {
    c.env = { ENVIRONMENT: environment, DB: { prepare: vi.fn() },
      BOA_FRMS_QA_SENSITIVE_WRITES_TENANT_ID: approved };
    c.set('userId', 90);
    c.set('userRole', role);
    c.set('empresaId', empresaId);
    c.set('tenantContext', {
      empresaId, empresaCodigo: code, empresaNome: code, role, plano: 'qa', permissions: [],
    });
    await next();
  });
  app.onError(e => new Response(JSON.stringify({ message: String(e) }), {
    status: (e as { statusCode?: number }).statusCode ?? 500,
  }));
  app.route('/', frmsBombeiros);
  return (method: 'GET' | 'PUT', path: string, body?: unknown) => app.fetch(
    new Request(`http://localhost${path}`, {
      method,
      ...(body ? { headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body) } : {}),
    }), {}, execCtx,
  );
}

describe('BOA case event-stream route — security and lifecycle boundaries', () => {
  beforeEach(() => {
    profileEvidence.mockReset().mockResolvedValue({
      empresaId: 130, profileCode: 'FIREFIGHTER_AVIATION', regulatoryProfileId: 'boa-profile',
    });
    policyConfig.mockReset().mockResolvedValue({
      empresaId: 130, profileCode: 'FIREFIGHTER_AVIATION',
      regulatoryProfileId: 'boa-profile', revision: { id: 'boa-r1', policy_version: 'BOA-QA' },
    });
    sectorAccess.mockReset().mockResolvedValue(sector);
    loadCase.mockReset().mockResolvedValue({ status, treatment: null });
    appendAction.mockReset().mockResolvedValue('RECORDED');
  });

  it('denies company 6 before governance or event reads', async () => {
    const req = createApp(6, 'costadosol');
    expect((await req('GET', '/casos/boa-case-1')).status).toBe(403);
    expect(loadCase).not.toHaveBeenCalled();
    expect(appendAction).not.toHaveBeenCalled();
  });

  it('denies administrator access to individual incident view', async () => {
    const req = createApp(130, 'bombeiros', 'admin');
    expect((await req('GET', '/casos/boa-case-1')).status).toBe(403);
    expect(loadCase).not.toHaveBeenCalled();
  });

  it('returns no personal sleep, mission or KSS values to the manager', async () => {
    const req = createApp();
    const response = await req('GET', '/casos/boa-case-1');
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain('ABERTO');
    expect(text).not.toMatch(/funcionario_id|kss_reported|sleep_hours_24h|nome_guerra/);
    expect(loadCase).toHaveBeenCalledWith(expect.anything(), 130, 'boa-case-1', sector);
  });

  it('passes treatment to tenant-specific append-only event handler', async () => {
    const req = createApp();
    const input = { responsavel: 'Coordenador BOA', prazo: '2026-10-30',
      acao_mitigacao: 'Revisar escala e descanso documentado.',
      justificativa: 'Revisão exigida antes de nova missão.' };
    const response = await req('PUT', '/casos/boa-case-1/tratamento', input);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'EM_TRATAMENTO' });
    expect(appendAction).toHaveBeenCalledWith(
      expect.anything(), 130, 'boa-case-1', 90, input, 'treatment', sector,
    );
  });

  it('never records a manager action when profile is offshore', async () => {
    profileEvidence.mockResolvedValue({
      empresaId: 130, profileCode: 'HELICOPTER_OFFSHORE', regulatoryProfileId: 'off',
    });
    const req = createApp();
    const response = await req('PUT', '/casos/boa-case-1/resolver', {
      avaliacao_eficacia: 'Repouso verificado e reescala aprovada pelo responsável.',
    });
    expect(response.status).toBe(503);
    expect(appendAction).not.toHaveBeenCalled();
  });

  it('reports invalid efficacy without adding a decision event', async () => {
    appendAction.mockResolvedValue('INVALID');
    const req = createApp();
    const response = await req('PUT', '/casos/boa-case-1/resolver', {
      avaliacao_eficacia: 'curto',
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'BOMBEIROS_EFFECTIVENESS_REQUIRED' });
  });

  it('blocks unapproved BOA staging case writes before D1 read or append', async () => {
    const request = createApp(130, 'bombeiros', 'manager', 'staging', '');
    const response = await request('PUT', '/casos/boa-case-1/tratamento', {});
    expect(response.status).toBe(503);
    expect(appendAction).not.toHaveBeenCalled();
    expect(loadCase).not.toHaveBeenCalled();
  });

  it('blocks all case writes in production until governed activation', async () => {
    const req = createApp(130, 'bombeiros', 'manager', 'production');
    const response = await req('PUT', '/casos/boa-case-1/tratamento', {});
    expect(response.status).toBe(404);
    expect(appendAction).not.toHaveBeenCalled();
  });
});

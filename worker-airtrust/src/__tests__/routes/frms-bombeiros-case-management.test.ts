import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono, type ExecutionContext } from 'hono';
import frmsBombeiros from '../../routes/frms-bombeiros';
import { buildFrmsCaseTreatmentNotes } from '../../lib/frms/case-resolution';

const profileEvidenceMock = vi.fn();
const governedConfigMock = vi.fn();
const sectorMock = vi.fn();
const caseMock = vi.fn();
const treatMock = vi.fn();
const closeMock = vi.fn();

vi.mock('../../lib/frms/parameter-governance', async importOriginal => ({
  ...(await importOriginal<typeof import('../../lib/frms/parameter-governance')>()),
  resolveFrmsRegulatoryProfileEvidence: (...args: unknown[]) => profileEvidenceMock(...args),
}));
vi.mock('../../lib/frms/db-service', async importOriginal => ({
  ...(await importOriginal<typeof import('../../lib/frms/db-service')>()),
  loadEffectiveFrmsConfiguration: (...args: unknown[]) => governedConfigMock(...args),
  registrarTratamentoAlerta: (...args: unknown[]) => treatMock(...args),
  marcarAlertaResolvido: (...args: unknown[]) => closeMock(...args),
}));
vi.mock('../../services/employee-sector-access', async importOriginal => ({
  ...(await importOriginal<typeof import('../../services/employee-sector-access')>()),
  getEmployeeSectorAccess: (...args: unknown[]) => sectorMock(...args),
}));
vi.mock('../../lib/frms/bombeiros-case-access', async importOriginal => ({
  ...(await importOriginal<typeof import('../../lib/frms/bombeiros-case-access')>()),
  loadBombeirosManagerCase: (...args: unknown[]) => caseMock(...args),
}));

const sampleTreatment = {
  responsavel: 'Coordenador de Missão BOA',
  prazo: '2026-10-30',
  acao_mitigacao: 'Reorganizar equipe após verificação documentada da carga.',
  justificativa: 'Houve acionamento e é necessária reavaliação operacional.',
  evidencia_referencia: 'BOA-TEST-REFERENCE',
};
const fakeContext = {
  waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {},
} as ExecutionContext;
function appFor(empresaId = 130, codigo = 'bombeiros', role = 'manager') {
  const db = { prepare: () => { throw new Error('Unexpected D1 query'); } } as unknown as D1Database;
  const app = new Hono<{ Bindings: any; Variables: any }>();
  app.use('*', async (c, next) => {
    c.env = { DB: db, ENVIRONMENT: 'staging' };
    c.set('userId', '19');
    c.set('userRole', role);
    c.set('empresaId', empresaId);
    c.set('tenantContext', {
      empresaId, empresaCodigo: codigo, empresaNome: 'BOA QA', role, plano: 'qa', permissions: [],
    });
    await next();
  });
  app.onError(error => new Response(JSON.stringify({ code: (error as { code?: string }).code || 'ERROR' }), {
    status: (error as { statusCode?: number }).statusCode ?? 500,
    headers: { 'Content-Type': 'application/json' },
  }));
  app.route('/', frmsBombeiros);
  const req = (path: string, method: string, data?: unknown) => app.fetch(
    new Request(`http://localhost${path}`, {
      method, headers: { 'Content-Type': 'application/json' },
      ...(data == null ? {} : { body: JSON.stringify(data) }),
    }), {}, fakeContext,
  );
  return { req };
}
describe('BOA independent case workflow — action, deadline, efficacy and access', () => {
  beforeEach(() => {
    profileEvidenceMock.mockReset().mockResolvedValue({
      empresaId: 130, profileCode: 'FIREFIGHTER_AVIATION', regulatoryProfileId: 'boa-prof',
    });
    governedConfigMock.mockReset().mockResolvedValue({
      empresaId: 130, profileCode: 'FIREFIGHTER_AVIATION', regulatoryProfileId: 'boa-prof',
      revision: { id: 'boa-approved-r1' },
    });
    sectorMock.mockReset().mockResolvedValue({
      mode: 'restricted', setorIds: [9], funcionarioId: null,
    });
    caseMock.mockReset().mockResolvedValue({
      id: 'BOA-QA-ALERT-1', resolvido: 0, notas_resolucao: null,
      created_at: '2026-10-20', resolvido_em: null,
    });
    treatMock.mockReset().mockResolvedValue(true);
    closeMock.mockReset().mockResolvedValue(true);
  });

  it('denies Costa do Sol and never calls the case service', async () => {
    const { req } = appFor(6, 'costadosol');
    const r = await req('/casos/BOA-QA-ALERT-1/tratamento', 'PUT', sampleTreatment);
    expect(r.status).toBe(403);
    expect(caseMock).not.toHaveBeenCalled();
    expect(treatMock).not.toHaveBeenCalled();
  });

  it('never lets an admin query the identifiable operational-case API', async () => {
    const { req } = appFor(130, 'bombeiros', 'admin');
    const r = await req('/casos/BOA-QA-ALERT-1', 'GET');
    expect(r.status).toBe(403);
    expect(caseMock).not.toHaveBeenCalled();
  });

  it('creates audited pending treatment without prematurely closing the case', async () => {
    const { req } = appFor();
    const response = await req('/casos/BOA-QA-ALERT-1/tratamento', 'PUT', sampleTreatment);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, status: 'EM_TRATAMENTO' });
    expect(treatMock).toHaveBeenCalledOnce();
    const args = treatMock.mock.calls[0];
    expect(args[1]).toBe('BOA-QA-ALERT-1');
    expect(args[2]).toBe('19');
    expect(args[4]).toBe(130);
    expect(JSON.parse(String(args[3]))).toMatchObject({
      schema: 'FRMS_CASE_TREATMENT_V1', responsavel: sampleTreatment.responsavel,
    });
    expect(closeMock).not.toHaveBeenCalled();
    expect(sectorMock).toHaveBeenCalled();
  });

  it('refuses closure without a prior recorded treatment and efficacy', async () => {
    const { req } = appFor();
    const absent = await req('/casos/BOA-QA-ALERT-1/resolver', 'PUT', {
      avaliacao_eficacia: 'Indicadores de jornada checados.',
    });
    expect(absent.status).toBe(409);
    expect(closeMock).not.toHaveBeenCalled();
    caseMock.mockResolvedValueOnce({
      id: 'BOA-QA-ALERT-1', resolvido: 0,
      notas_resolucao: buildFrmsCaseTreatmentNotes(sampleTreatment, 'test-actor'),
    });
    const invalid = await req('/casos/BOA-QA-ALERT-1/resolver', 'PUT', {
      avaliacao_eficacia: 'sem prova',
    });
    expect(invalid.status).toBe(400);
    expect(closeMock).not.toHaveBeenCalled();
  });

  it('closes only an existing BOA treatment with documented efficacy and tenant-bound write', async () => {
    caseMock.mockResolvedValue({
      id: 'BOA-QA-ALERT-1', resolvido: 0,
      notas_resolucao: buildFrmsCaseTreatmentNotes(sampleTreatment, 'test-actor'),
    });
    const { req } = appFor();
    const response = await req('/casos/BOA-QA-ALERT-1/resolver', 'PUT', {
      avaliacao_eficacia: 'Após reescalonamento, período de recuperação documentado e verificado.',
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, status: 'RESOLVIDO' });
    expect(closeMock).toHaveBeenCalledOnce();
    const args = closeMock.mock.calls[0];
    expect(args[1]).toBe('BOA-QA-ALERT-1');
    expect(args[4]).toBe(130);
    expect(JSON.parse(String(args[3]))).toMatchObject({ schema: 'FRMS_CASE_RESOLUTION_V1' });
  });

  it('reads only status and timestamps, excluding clinical notes from response', async () => {
    caseMock.mockResolvedValue({
      id: 'BOA-QA-ALERT-1', resolvido: 0,
      notas_resolucao: buildFrmsCaseTreatmentNotes(sampleTreatment, 'test-actor'),
      created_at: '2026-10-20', resolvido_em: null,
    });
    const { req } = appFor();
    const response = await req('/casos/BOA-QA-ALERT-1', 'GET');
    expect(response.status).toBe(200);
    const bodyText = await response.text();
    expect(bodyText).toContain('EM_TRATAMENTO');
    expect(bodyText).not.toContain(sampleTreatment.acao_mitigacao);
    expect(bodyText).not.toContain(sampleTreatment.responsavel);
    expect(bodyText).not.toContain('KSS');
  });

  it('prevents replacing previously recorded treatment notes', async () => {
    caseMock.mockResolvedValue({
      id: 'BOA-QA-ALERT-1', resolvido: 0,
      notas_resolucao: buildFrmsCaseTreatmentNotes(sampleTreatment, 'test-actor'),
    });
    const { req } = appFor();
    const response = await req('/casos/BOA-QA-ALERT-1/tratamento', 'PUT', sampleTreatment);
    expect(response.status).toBe(409);
    expect(treatMock).not.toHaveBeenCalled();
  });
});

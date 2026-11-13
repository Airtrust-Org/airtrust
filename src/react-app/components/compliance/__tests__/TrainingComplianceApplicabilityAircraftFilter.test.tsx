import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TrainingComplianceApplicabilityEditor } from '../TrainingComplianceApplicabilityEditor';

const { fetchWithAuthMock, toastMock } = vi.hoisted(() => ({
  fetchWithAuthMock: vi.fn(),
  toastMock: { success: vi.fn(), error: vi.fn() },
}));

const { tenantMock } = vi.hoisted(() => ({ tenantMock: { empresaId: 6 } }));
vi.mock('@/react-app/hooks/useTenantQueryKey', () => ({
  useTenantQueryKey: () => ({ empresaId: tenantMock.empresaId, tenantKey: (...parts:unknown[]) => parts }),
}));

vi.mock('@/react-app/config/api', () => ({
  fetchWithAuth: (...args: unknown[]) => fetchWithAuthMock(...args),
}));
vi.mock('@/react-app/utils/toast', () => ({ showToast: toastMock }));
vi.mock('@/react-app/hooks/usePermissions', () => ({
  usePermissions: () => ({ isAdmin: true, isGestor: false }),
}));

function ok(data: unknown) {
  return { ok: true, json: async () => ({ success: true, data }) } as Response;
}

function renderEditor() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <TrainingComplianceApplicabilityEditor qualificacaoTipoId={300} />
    </QueryClientProvider>,
  );
}

describe('TrainingComplianceApplicabilityEditor aircraft scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tenantMock.empresaId = 6;
    fetchWithAuthMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/capabilities')) {
        return ok({ schema_ready: true, aircraft_scope_ready: true });
      }
      if (url.endsWith('/catalogos')) {
        return ok({
          setores: [
            { id: 1, codigo: 'TRIP', nome: 'Tripulação' },
            { id: 2, codigo: 'ADM', nome: 'Administrativo' },
          ],
          funcoes: [{ id: 10, codigo: 'CMD', nome: 'Comandante' }],
          setor_funcoes: [{ setor_id: 1, funcao_id: 10 }],
          aeronaves_modelos: [
            { modelo: 'AW139', aeronaves: 3 },
            { modelo: 'SK76', aeronaves: 2 },
          ],
          access_mode: 'all',
        });
      }
      if (url.includes('/regras?qualificacao_tipo_id=300')) return ok([]);
      if (url === '/api/compliance-treinamentos/regras' && init?.method === 'POST') {
        return ok({ id: 999 });
      }
      throw new Error(`unexpected url ${url}`);
    });
  });

  it('shows aircraft only for Tripulação and persists the selected model', async () => {
    renderEditor();

    await screen.findByRole('option', { name: 'Tripulação' });
    expect(screen.queryByLabelText('Modelo de aeronave')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Setor'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Função'), { target: { value: '10' } });

    const aircraft = await screen.findByLabelText('Modelo de aeronave');
    expect(screen.getByRole('option', { name: 'AW139' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'SK76' })).toBeInTheDocument();
    fireEvent.change(aircraft, { target: { value: 'SK76' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar requisito' }));

    await waitFor(() =>
      expect(fetchWithAuthMock).toHaveBeenCalledWith(
        '/api/compliance-treinamentos/regras',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    const call = fetchWithAuthMock.mock.calls.find(
      ([url, init]) => url === '/api/compliance-treinamentos/regras' && init?.method === 'POST',
    );
    expect(JSON.parse(String((call?.[1] as RequestInit)?.body))).toMatchObject({
      qualificacao_tipo_id: 300,
      escopo: 'SETOR_FUNCAO',
      setor_id: 1,
      funcao_id: 10,
      aeronave_modelo: 'SK76',
      obrigatoriedade: 'OBRIGATORIA',
    });
  });

  it('keeps governed designation rules visible but read-only in the generic editor', async () => {
    fetchWithAuthMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/capabilities')) {
        return ok({ schema_ready: true, aircraft_scope_ready: true, conditional_scope_ready: true });
      }
      if (url.includes('/condicoes/catalogos')) {
        return ok({ condicoes: [{ id: 55, codigo: 'RBAC119_TESTE', nome: 'RBAC 119 — Teste', tipo: 'DESIGNACAO' }], funcionarios: [] });
      }
      if (url.endsWith('/catalogos')) {
        return ok({ setores: [], funcoes: [], setor_funcoes: [], aeronaves_modelos: [], access_mode: 'all' });
      }
      if (url.includes('/regras?qualificacao_tipo_id=300')) {
        return ok([
          { id: 501, qualificacao_tipo_id: 300, escopo: 'EMPRESA', setor_id: null, funcao_id: null, funcionario_id: null, condicao_id: 55, condicao_nome: 'RBAC 119 — Teste', justificativa: 'Regra regulatória', fundamento_tipo: 'PADRAO_EXCLUSAO', obrigatoriedade: 'NAO_APLICA', critico_operacional: 0, origem: 'REGULATORIO' },
          { id: 502, qualificacao_tipo_id: 300, escopo: 'EMPRESA', setor_id: null, funcao_id: null, funcionario_id: null, condicao_id: null, justificativa: null, fundamento_tipo: null, obrigatoriedade: 'OBRIGATORIA', critico_operacional: 0, origem: 'EMPRESA' },
        ]);
      }
      throw new Error(`unexpected url ${url}`);
    });

    renderEditor();
    const badge = await screen.findByText('Regra governada');
    const governedRow = badge.closest('div.flex.flex-col') as HTMLElement;
    expect(governedRow).toBeTruthy();
    expect(within(governedRow).getByRole('combobox')).toBeDisabled();
    expect(within(governedRow).getByRole('button', { name: 'Remover requisito' })).toBeDisabled();
    expect(screen.getByText(/ocupantes são gerenciados na área de designações/)).toBeInTheDocument();

    const normalRuleText = screen
      .getAllByText('Toda a empresa')
      .find((element) => element.tagName === 'SPAN') as HTMLElement;
    const normalRow = normalRuleText.closest('div.flex.flex-col') as HTMLElement;
    expect(within(normalRow).getByRole('button', { name: 'Remover requisito' })).not.toBeDisabled();
    expect(normalRow).not.toHaveClass('md:flex-row');
    const statusSelect = within(normalRow).getByRole('combobox');
    expect(statusSelect).toHaveClass('flex-1', 'min-w-0');
    expect(statusSelect.parentElement).toHaveClass('border-t', 'pt-3');
  });

  it('explains that não se aplica is only an explicit exception', async () => {
    renderEditor();
    await screen.findByRole('option', { name: 'Tripulação' });
    const label = screen.getByText('Efeito da regra').closest('label') as HTMLElement;
    const effect = within(label).getByRole('combobox');
    expect(within(effect).getByRole('option', { name: 'Excluir / não se aplica (exceção)' })).toBeInTheDocument();
    fireEvent.change(effect, { target: { value: 'NAO_APLICA' } });
    expect(screen.getByText(/Sem regra aplicável, o treinamento já não é obrigatório/)).toBeInTheDocument();
  });

  it('requires explicit EAD opt-in, then sends auto enrollment only when selected', async () => {
    renderEditor();
    await screen.findByRole('option', { name: 'Tripulação' });
    fireEvent.change(screen.getByLabelText('Setor'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Função'), { target: { value: '10' } });
    const auto = screen.getByLabelText(/Matrícula automática no LMS ao salvar o requisito/);
    expect(auto).not.toBeChecked();
    fireEvent.click(auto);
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar requisito' }));
    await waitFor(() => expect(fetchWithAuthMock).toHaveBeenCalledWith(
      '/api/compliance-treinamentos/regras', expect.objectContaining({ method: 'POST' }),
    ));
    const call = fetchWithAuthMock.mock.calls.find(([url, init]) =>
      url === '/api/compliance-treinamentos/regras' && init?.method === 'POST');
    const body = JSON.parse(String((call?.[1] as RequestInit)?.body));
    expect(body.modalidade_requerida).toBe('EAD');
    expect(body.auto_matricular_ead).toBe(true);
  });

  it('defaults to no EAD automation and disables opt-in for a different modality', async () => {
    renderEditor();
    await screen.findByRole('option', { name: 'Tripulação' });
    fireEvent.change(screen.getByLabelText('Setor'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Função'), { target: { value: '10' } });
    fireEvent.click(screen.getByLabelText(/Matrícula automática no LMS ao salvar o requisito/));
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar referência e criticidade' }));
    fireEvent.change(screen.getByLabelText('Modalidade requerida'), { target: { value: 'PRESENCIAL' } });
    expect(screen.getByLabelText(/Matrícula automática no LMS ao salvar o requisito/)).not.toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar requisito' }));
    await waitFor(() => expect(fetchWithAuthMock).toHaveBeenCalledWith(
      '/api/compliance-treinamentos/regras', expect.objectContaining({ method: 'POST' }),
    ));
    const call = fetchWithAuthMock.mock.calls.find(([url, init]) =>
      url === '/api/compliance-treinamentos/regras' && init?.method === 'POST');
    expect(JSON.parse(String((call?.[1] as RequestInit)?.body))).toMatchObject({
      modalidade_requerida: 'PRESENCIAL', auto_matricular_ead: false,
    });
  });

  it.each([
    { tenant:6, needsExplicitModality:false },
    { tenant:7, needsExplicitModality:true },
  ])('enables null-modality EAD only with tenant-scoped behavior $tenant', async ({tenant,needsExplicitModality})=>{
    tenantMock.empresaId=tenant;
    const oldImplementation=fetchWithAuthMock.getMockImplementation();
    fetchWithAuthMock.mockImplementation(async (url:string, init?:RequestInit)=>{
      if(url.includes('/regras?qualificacao_tipo_id=300')) return ok([{
        id:991,qualificacao_tipo_id:300,escopo:'FUNCAO',setor_id:null,funcao_id:10,
        funcionario_id:null,obrigatoriedade:'OBRIGATORIA',critico_operacional:0,
        auto_matricular_ead:0,modalidade_requerida:null,origem:'EMPRESA',
      }]);
      if(url.includes('/regras/991') && init?.method==='PUT') return ok({id:991});
      return oldImplementation?.(url,init);
    });
    renderEditor();
    const checkbox=await screen.findByRole('checkbox',{name:'Habilitar matrícula EAD automática da regra 991'});
    fireEvent.click(checkbox);
    await waitFor(()=>expect(fetchWithAuthMock.mock.calls.some(
      ([url,init])=>url==='/api/compliance-treinamentos/regras/991' && init?.method==='PUT'
    )).toBe(true));
    const call=fetchWithAuthMock.mock.calls.find(([url,init])=>
      url==='/api/compliance-treinamentos/regras/991' && init?.method==='PUT');
    const payload=JSON.parse(String((call?.[1] as RequestInit)?.body));
    expect(payload.auto_matricular_ead).toBe(true);
    if(needsExplicitModality)expect(payload.modalidade_requerida).toBe('EAD');
    else expect(payload).not.toHaveProperty('modalidade_requerida');
  });

  it('keeps aircraft hidden for non-crew sectors', async () => {
    renderEditor();

    await screen.findByRole('option', { name: 'Administrativo' });
    fireEvent.change(screen.getByLabelText('Setor'), { target: { value: '2' } });

    expect(screen.queryByLabelText('Modelo de aeronave')).not.toBeInTheDocument();
  });
});

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TrainingComplianceApplicabilityEditor } from '../TrainingComplianceApplicabilityEditor';

const { fetchWithAuthMock, toastMock } = vi.hoisted(() => ({
  fetchWithAuthMock: vi.fn(),
  toastMock: { success: vi.fn(), error: vi.fn() },
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
  });

  it('keeps aircraft hidden for non-crew sectors', async () => {
    renderEditor();

    await screen.findByRole('option', { name: 'Administrativo' });
    fireEvent.change(screen.getByLabelText('Setor'), { target: { value: '2' } });

    expect(screen.queryByLabelText('Modelo de aeronave')).not.toBeInTheDocument();
  });
});

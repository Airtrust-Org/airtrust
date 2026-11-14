import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import GuiasInstrutorAdmin from '../GuiasInstrutorAdmin';
import { fetchWithAuth } from '@/react-app/config/api';

function renderAdmin() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <GuiasInstrutorAdmin />
    </QueryClientProvider>,
  );
}

// Gate de gestão — nunca deriva de texto de role/perfil. Cobre
// especificamente o requisito de que Platform Admin/Administrador Master
// tem acesso incondicional (via bypass real no backend, refletido aqui
// pelo mock de useGuiasInstrutorPermissions).
const mockPermissoes = { podeGerenciar: false, isLoading: true };

vi.mock('@/react-app/components/AppLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/react-app/components/shared/Breadcrumbs', () => ({ Breadcrumbs: () => null }));
vi.mock('@/react-app/hooks/guias-instrutor/useGuiasInstrutorPermissions', () => ({
  useGuiasInstrutorPermissions: () => mockPermissoes,
}));
vi.mock('@/react-app/hooks/useTenantQueryKey', () => ({
  useTenantQueryKey: () => ({ tenantKey: (...args: unknown[]) => args, empresaId: 1 }),
}));
vi.mock('@/react-app/config/api', () => ({
  API_BASE_URL: 'https://api.airtrust.online/api',
  fetchWithAuth: vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [] }) }),
}));
vi.mock('@/react-app/hooks/guias-instrutor/api', () => ({
  useGuiasInstrutor: () => ({ data: [], isLoading: false, refetch: vi.fn() }),
}));

describe('GuiasInstrutorAdmin — gate de acesso', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('enquanto a permissão carrega, NUNCA mostra "Acesso restrito"', () => {
    mockPermissoes.podeGerenciar = false;
    mockPermissoes.isLoading = true;
    renderAdmin();
    expect(screen.queryByText('Acesso restrito')).not.toBeInTheDocument();
  });

  it('após carregar, sem podeGerenciar mostra "Acesso restrito"', () => {
    mockPermissoes.podeGerenciar = false;
    mockPermissoes.isLoading = false;
    renderAdmin();
    expect(screen.getByText('Acesso restrito')).toBeInTheDocument();
  });

  it('após carregar, com podeGerenciar (Platform Admin ou GRANT) renderiza a administração', () => {
    mockPermissoes.podeGerenciar = true;
    mockPermissoes.isLoading = false;
    renderAdmin();
    expect(screen.queryByText('Acesso restrito')).not.toBeInTheDocument();
  });

  it('desabilita e limpa aeronave ao escolher programa funcional (INSTRUTOR/EXAMINADOR) evitando guia oculto', async () => {
    mockPermissoes.podeGerenciar = true;
    mockPermissoes.isLoading = false;
    const mockedFetch = vi.mocked(fetchWithAuth);
    mockedFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/modelos-aeronave')) {
        return { ok: true, json: async () => ({ data: [{ id: 5, nome: 'AW139' }] }) } as Response;
      }
      if (init?.method === 'POST') {
        return { ok: true, json: async () => ({ success: true, data: { id: 99 } }) } as Response;
      }
      return { ok: true, json: async () => ({ data: [] }) } as Response;
    });

    renderAdmin();

    const aeronaveSelect = (await screen.findByLabelText('Aeronave')) as HTMLSelectElement;
    const programaSelect = screen.getByLabelText('Programa') as HTMLSelectElement;

    // Seleciona aeronave AW139 primeiro
    await waitFor(() => expect(aeronaveSelect.querySelector('option[value="5"]')).toBeTruthy());
    fireEvent.change(aeronaveSelect, { target: { value: '5' } });
    expect(aeronaveSelect.value).toBe('5');

    // Troca para INSTRUTOR -> campo aeronave deve ser limpo e desabilitado
    fireEvent.change(programaSelect, { target: { value: 'INSTRUTOR' } });
    expect(aeronaveSelect.disabled).toBe(true);
    expect(aeronaveSelect.value).toBe('');

    fireEvent.change(screen.getByPlaceholderText('Código oficial (ex: A139-P-02/04-C1)'), {
      target: { value: 'INST-E01' },
    });
    fireEvent.change(screen.getByPlaceholderText('Título amigável'), {
      target: { value: 'Instrutor Etapa 01' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Criar rascunho' }));

    await waitFor(() => {
      const postCall = mockedFetch.mock.calls.find(
        ([u, i]) => u.endsWith('/simuladores/guias-instrutor') && i?.method === 'POST',
      );
      expect(postCall).toBeDefined();
      const sent = JSON.parse(String(postCall![1]?.body));
      expect(sent.programa).toBe('INSTRUTOR');
      expect(sent.modelo_aeronave_id).toBeNull();
    });
  });
});

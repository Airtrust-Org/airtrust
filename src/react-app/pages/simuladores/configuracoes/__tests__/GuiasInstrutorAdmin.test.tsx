import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import GuiasInstrutorAdmin from '../GuiasInstrutorAdmin';

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
vi.mock('@/react-app/lib/useTenantQueryKey', () => ({
  useTenantQueryKey: () => ({ tenantKey: (...args: unknown[]) => args, empresaId: 1 }),
}));
vi.mock('@/react-app/config/api', () => ({
  API_BASE_URL: 'https://api.airtrust.online/api',
  fetchWithAuth: vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [] }) }),
}));
vi.mock('@/react-app/lib/guias-instrutor/api', () => ({
  useGuiasInstrutor: () => ({ data: [], isLoading: false, refetch: vi.fn() }),
}));

describe('GuiasInstrutorAdmin — gate de acesso', () => {
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
});

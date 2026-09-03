/**
 * Focused regression tests for #281 / PR #285.
 *
 * Proves the visual + interaction contract for the four destructive surfaces
 * that were moved behind the shared `RowActionsMenu` in `Qualificacoes.tsx`:
 *   1. Histórico — qualificação concluída  (handleDeletear -> ConfirmDeleteModal)
 *   2. Histórico — qualificação planejada  (handleCancelar -> confirmDialog)
 *   3. Modelos (aba "tipos")                (safeDelete)
 *   4. Classificações (aba "categorias")    (confirmDialog + fetchWithAuth)
 *
 * Contract asserted per surface:
 *   - destructive action is NOT an always-visible row control;
 *   - a "Mais ações" trigger exists;
 *   - opening the menu exposes the destructive action with role="menuitem"
 *     and the exact existing label;
 *   - cancelling the confirmation fires no mutation;
 *   - confirming fires exactly the pre-existing handler/endpoint;
 *   - RBAC gating (canManageTipos) is unchanged.
 *
 * The heavy mock scaffold mirrors Qualificacoes.behavior.test.tsx (the smallest
 * reliable full-render strategy already used in this repo for this page).
 */
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import Qualificacoes from '../Qualificacoes';

const {
  mockCarregarHistorico,
  mockRefetchTipos,
  mockRefetchPlanejados,
  mockMutateAsync,
  historicoRef,
  tiposRef,
  categoriasRef,
} = vi.hoisted(() => ({
  mockCarregarHistorico: vi.fn(),
  mockRefetchTipos: vi.fn(),
  mockRefetchPlanejados: vi.fn(),
  mockMutateAsync: vi.fn(),
  historicoRef: { current: [] as Array<Record<string, unknown>> },
  tiposRef: { current: [] as Array<Record<string, unknown>> },
  categoriasRef: { current: [] as Array<Record<string, unknown>> },
}));

vi.mock('@/react-app/components/AppLayout', () => ({
  default: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/react-app/components/modals/ModalAtribuirQualificacao', () => ({
  ModalAtribuirQualificacao: ({ isOpen }: { isOpen?: boolean }) =>
    isOpen ? <div data-testid="modal-atribuir" /> : null,
}));
vi.mock('@/react-app/components/modals/ModalRenovarQualificacao', () => ({
  ModalRenovarQualificacao: ({ isOpen }: { isOpen?: boolean }) =>
    isOpen ? <div data-testid="modal-renovar" /> : null,
}));

vi.mock('@/react-app/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 1, role: 'ADMINISTRADOR', permissions: [] },
    empresaAtualId: 1,
    empresas: [{ id: 1, nome: 'Test Corp', role: 'ADMINISTRADOR' }],
    getAccessToken: () => 'fake-token',
  }),
}));
vi.mock('@/react-app/hooks/qualificacoes/useFuncionariosAtivos', () => ({
  useFuncionariosAtivos: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/react-app/hooks/useAeronavesConfig', () => ({
  useAeronavesConfig: () => ({ aeronaves: [], isLoading: false }),
}));

const { showToastMock } = vi.hoisted(() => ({
  showToastMock: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));
vi.mock('@/react-app/utils/toast', () => ({ showToast: showToastMock }));

vi.mock('@/react-app/hooks/useApi', () => ({
  useApi: (url?: string) => ({
    data: url && url.includes('/categorias') ? categoriasRef.current : [],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  clearApiCacheByPattern: vi.fn(),
}));

vi.mock('@/react-app/hooks/useQualificacoesExt', () => ({
  useQualificacaoTipos: () => ({
    tipos: tiposRef.current,
    isLoading: false,
    error: null,
    refetch: mockRefetchTipos,
  }),
  useQualificacoesHistorico: () => ({
    historico: historicoRef.current,
    isLoading: false,
    loading: false,
    error: null,
    refetch: vi.fn(),
    carregarHistorico: mockCarregarHistorico,
    meta: { total: historicoRef.current.length },
    stats: { total: historicoRef.current.length, validas: 0, renovadas: 0, planejadas: 0 },
  }),
  useEnviarConvocacaoTreinamento: () => ({ mutateAsync: mockMutateAsync, isLoading: false }),
  usePreviewConvocacaoTreinamento: () => ({ mutateAsync: mockMutateAsync, isLoading: false }),
  useReenviarConvocacaoTreinamento: () => ({ mutateAsync: mockMutateAsync, isLoading: false }),
  useConcluirTreinamentoPlanejadoLote: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
}));

vi.mock('@/react-app/hooks/useTreinamentosPlanejados', () => ({
  useTreinamentosPlanejados: () => ({
    planejadosData: { list: [], count: 0 },
    isLoading: false,
    error: null,
    refetch: mockRefetchPlanejados,
  }),
  usePreviewConvocacaoTreinamento: () => ({ mutateAsync: mockMutateAsync, isLoading: false }),
  useEnviarConvocacaoTreinamento: () => ({ mutateAsync: mockMutateAsync, isLoading: false }),
  useReenviarConvocacaoTreinamento: () => ({ mutateAsync: mockMutateAsync, isLoading: false }),
}));

vi.mock('@/react-app/hooks/usePermissions', () => ({
  usePermissions: () => ({ can: () => true, isAdmin: true, isGestor: false }),
}));

vi.mock('@/react-app/utils/lazyWithRetry', () => ({
  lazyWithRetry: (importer: Parameters<typeof React.lazy>[0]) => {
    const LazyComp = React.lazy(importer);
    return (props: Record<string, unknown>) => (
      <React.Suspense fallback={null}>
        <LazyComp {...props} />
      </React.Suspense>
    );
  },
}));

const { fetchWithAuthMock } = vi.hoisted(() => ({ fetchWithAuthMock: vi.fn() }));
vi.mock('@/react-app/config/api', () => ({
  fetchWithAuth: (...args: unknown[]) => fetchWithAuthMock(...args),
  API_BASE_URL: 'http://localhost/api',
  getAccessToken: () => 'fake-token',
}));
vi.mock('@/react-app/lib/apiFetch', () => ({ apiFetch: vi.fn(async () => ({ ok: true, json: async () => [] })) }));

function jsonOk(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
  historicoRef.current = [];
  tiposRef.current = [];
  categoriasRef.current = [];
  fetchWithAuthMock.mockImplementation(async (url: string) => {
    if (url.includes('/dashboard/qualificacoes')) {
      return jsonOk({ stats: {}, list: [] });
    }
    if (url.includes('/historico/') && url.endsWith('/cancelar')) {
      return jsonOk({ success: true });
    }
    if (url.includes('/qualificacoes/historico/')) {
      return jsonOk({ success: true });
    }
    if (url.includes('/categorias')) {
      return jsonOk({ success: true, data: categoriasRef.current });
    }
    return jsonOk([]);
  });
  // global fetch is used by safeDelete (Modelos surface)
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => jsonOk({ success: true })),
  );
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const renderPage = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Qualificacoes />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

const deleteWithAuthCalls = (predicate: (url: string, init: RequestInit) => boolean) =>
  fetchWithAuthMock.mock.calls.filter(([url, init]) =>
    predicate(String(url), (init ?? {}) as RequestInit),
  );

describe('Qualificacoes — destructive surfaces are secondary + confirmed (#281)', () => {
  it('1. histórico concluída: delete lives only in the "Mais ações" menu and still confirms', async () => {
    const user = userEvent.setup();
    historicoRef.current = [
      {
        id: 501,
        funcionario_id: 9,
        funcionario_nome: 'Ana Piloto',
        qualificacao_nome: 'CRM Recorrente',
        qualificacao_codigo: 'CRM',
        qualificacao_status: 'CONCLUIDA',
        status: 'VALIDA',
        data_conclusao: '2026-01-10',
        data_vencimento: '2027-01-10',
      },
    ];

    renderPage();
    await screen.findByText('Ana Piloto');

    // not an always-visible control
    expect(
      screen.queryByRole('button', { name: /^Deletar qualificação$/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Deletar qualificação' })).not.toBeInTheDocument();

    const trigger = screen.getByRole('button', { name: 'Mais ações' });
    expect(trigger.className).toMatch(/min-h-11/);
    await user.click(trigger);

    const item = await screen.findByRole('menuitem', { name: 'Deletar qualificação' });
    expect(item.className).toMatch(/text-red-700/);
    await user.click(item);

    const dialog = await screen.findByRole('alertdialog');

    // cancel -> no mutation
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(
      deleteWithAuthCalls(
        (url, init) => /\/qualificacoes\/historico\/501$/.test(url) && init.method === 'DELETE',
      ),
    ).toHaveLength(0);

    // confirm -> exactly the pre-existing DELETE endpoint, once
    await user.click(screen.getByRole('button', { name: 'Mais ações' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Deletar qualificação' }));
    const dialog2 = await screen.findByRole('alertdialog');
    await user.click(within(dialog2).getByRole('button', { name: 'Excluir' }));

    await waitFor(() =>
      expect(
        deleteWithAuthCalls(
          (url, init) => /\/qualificacoes\/historico\/501$/.test(url) && init.method === 'DELETE',
        ),
      ).toHaveLength(1),
    );
  });

  it('2. histórico planejada: cancel-planned action is secondary and keeps its confirmation', async () => {
    const user = userEvent.setup();
    historicoRef.current = [
      {
        id: 777,
        funcionario_id: 3,
        funcionario_nome: 'Beto Copiloto',
        qualificacao_nome: 'Simulador A320',
        qualificacao_codigo: 'SIM',
        qualificacao_status: 'PLANEJADA',
        status: 'PLANEJADA',
        data_realizacao: '2999-12-31',
      },
    ];

    renderPage();
    await screen.findByText('Beto Copiloto');

    expect(
      screen.queryByRole('button', { name: /Excluir qualificação planejada/ }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Mais ações' }));
    const item = await screen.findByRole('menuitem', { name: 'Excluir qualificação planejada' });
    expect(item.className).toMatch(/text-red-700/);

    // window.confirm is mocked true -> PATCH /cancelar fires exactly once
    await user.click(item);
    await waitFor(() =>
      expect(
        deleteWithAuthCalls(
          (url, init) => /\/qualificacoes\/historico\/777\/cancelar$/.test(url) && init.method === 'PATCH',
        ),
      ).toHaveLength(1),
    );

    // and the confirmation copy was not bypassed
    expect(window.confirm).toHaveBeenCalledWith(
      expect.stringContaining('Cancelar esta qualificação planejada'),
    );
  });

  it('3. Modelos: delete is behind "Mais ações"; Editar stays a primary target; RBAC gate unchanged', async () => {
    const user = userEvent.setup();
    tiposRef.current = [{ id: 42, nome: 'Modelo CRM', codigo: 'CRM', categoria: 'TREINAMENTO' }];

    renderPage();
    await user.click(await screen.findByRole('tab', { name: /Modelos/ }));
    await screen.findByText('Modelo CRM');

    expect(screen.queryByRole('button', { name: 'Excluir modelo' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar modelo' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Mais ações' }));
    const item = await screen.findByRole('menuitem', { name: 'Excluir modelo' });
    expect(item.className).toMatch(/text-red-700/);

    // safeDelete -> confirmDialog (window.confirm mocked true) -> DELETE via global fetch
    await user.click(item);
    await waitFor(() => {
      const calls = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
      expect(
        calls.some(
          ([url, init]) =>
            String(url).includes('/qualificacoes/tipos/42') &&
            (init as RequestInit | undefined)?.method === 'DELETE',
        ),
      ).toBe(true);
    });
  });

  it('3b. Modelos: no "Mais ações" / delete affordance when RBAC (canManageTipos) is false', async () => {
    // Non-admin role -> canManageTipos === false
    const authModule = await import('@/react-app/hooks/useAuth');
    vi.spyOn(authModule, 'useAuth').mockReturnValue({
      user: { id: 2, role: 'INSTRUTOR', permissions: [] },
      empresaAtualId: 1,
      empresas: [{ id: 1, nome: 'Test Corp', role: 'INSTRUTOR' }],
      getAccessToken: () => 'fake-token',
    } as never);

    const user = userEvent.setup();
    tiposRef.current = [{ id: 42, nome: 'Modelo CRM', codigo: 'CRM', categoria: 'TREINAMENTO' }];

    renderPage();
    await user.click(await screen.findByRole('tab', { name: /Modelos/ }));
    await screen.findByText('Modelo CRM');

    expect(screen.queryByRole('button', { name: 'Mais ações' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar modelo' })).not.toBeInTheDocument();
  });

  it('4. Classificações: category delete is behind "Mais ações" and keeps its confirmation', async () => {
    const user = userEvent.setup();
    categoriasRef.current = [{ id: 88, nome: 'Emergências', descricao: 'cat', cor: '#ff0000' }];

    renderPage();
    await user.click(await screen.findByRole('tab', { name: /Classificações/ }));
    await screen.findByText('Emergências');

    expect(screen.queryByRole('button', { name: 'Deletar categoria' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Mais ações' }));
    const item = await screen.findByRole('menuitem', { name: 'Deletar categoria' });
    expect(item.className).toMatch(/text-red-700/);

    await user.click(item);
    await waitFor(() =>
      expect(
        deleteWithAuthCalls(
          (url, init) => /\/categorias\/88$/.test(url) && init.method === 'DELETE',
        ),
      ).toHaveLength(1),
    );
    expect(window.confirm).toHaveBeenCalledWith(
      expect.stringContaining('Tem certeza que deseja deletar esta categoria'),
    );
  });
});

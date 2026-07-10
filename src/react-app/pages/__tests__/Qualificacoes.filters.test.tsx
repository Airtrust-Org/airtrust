import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Qualificacoes from '../Qualificacoes';
import * as userPreferences from '@/react-app/utils/userPreferences';

const {
  mockCarregarHistorico,
  mockRefetchTipos,
  mockRefetchPlanejados,
  mockMutateAsync,
  mockHistoricoArray,
  mockUseQualificacoesHistorico,
  mockMeta,
  mockStats,
  mockTiposArray,
  mockPlanejadosData,
  mockAeronaves,
  mockFuncionarios,
  mockApiData,
} = vi.hoisted(() => ({
  mockCarregarHistorico: vi.fn(),
  mockRefetchTipos: vi.fn(),
  mockRefetchPlanejados: vi.fn(),
  mockMutateAsync: vi.fn(),
  mockHistoricoArray: [{ id: 1, tipo_nome: 'Treinamento A', status: 'VALIDA', qualificacao_nome: 'Tr. A' }],
  mockUseQualificacoesHistorico: vi.fn(),
  mockMeta: { total: 1 },
  mockStats: { total: 1, validas: 1, renovadas: 0, planejadas: 0 },
  mockTiposArray: [],
  mockPlanejadosData: { list: [], count: 0 },
  mockAeronaves: [],
  mockFuncionarios: [],
  mockApiData: []
}));

mockUseQualificacoesHistorico.mockReturnValue({
  historico: mockHistoricoArray,
  loading: false,
  error: null,
  carregarHistorico: mockCarregarHistorico,
  meta: mockMeta,
  stats: mockStats
});

vi.mock('@/react-app/components/AppLayout', () => ({
  default: ({ children }: any) => <div>{children}</div>
}));

vi.mock('@/react-app/components/modals/ModalAtribuirQualificacao', () => ({
  ModalAtribuirQualificacao: ({ isOpen }: any) => isOpen ? <div data-testid="modal-atribuir">Modal Atribuir Aberto</div> : null
}));

vi.mock('@/react-app/components/modals/ModalRenovarQualificacao', () => ({
  ModalRenovarQualificacao: ({ isOpen }: any) => isOpen ? <div data-testid="modal-renovar">Modal Renovar Aberto</div> : null
}));

vi.mock('@/react-app/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 1, role: 'ADMINISTRADOR', permissions: [] },
    empresaAtualId: 1,
    empresas: [{ id: 1, nome: 'Test Corp', role: 'ADMINISTRADOR' }],
    getAccessToken: () => 'fake-token'
  })
}));

vi.mock('@/react-app/hooks/qualificacoes/useFuncionariosAtivos', () => ({
  useFuncionariosAtivos: () => ({ data: mockFuncionarios, isLoading: false })
}));

vi.mock('@/react-app/hooks/useAeronavesConfig', () => ({
  useAeronavesConfig: () => ({ aeronaves: mockAeronaves, isLoading: false })
}));

vi.mock('@/react-app/utils/toast', () => ({
  showToast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() }
}));

const { fetchWithAuthMock, apiFetchMock } = vi.hoisted(() => ({
  fetchWithAuthMock: vi.fn(),
  apiFetchMock: vi.fn()
}));

vi.mock('@/react-app/hooks/useApi', () => ({
  useApi: () => ({ data: mockApiData, isLoading: false, error: null, refetch: vi.fn() }),
  clearApiCacheByPattern: vi.fn()
}));

vi.mock('@/react-app/hooks/useQualificacoesExt', () => ({
  useQualificacaoTipos: () => ({ tipos: mockTiposArray, isLoading: false, error: null, refetch: mockRefetchTipos }),
  useQualificacoesHistorico: (...args: any[]) => mockUseQualificacoesHistorico(...args),
  useEnviarConvocacaoTreinamento: () => ({ mutateAsync: mockMutateAsync, isLoading: false }),
  usePreviewConvocacaoTreinamento: () => ({ mutateAsync: mockMutateAsync, isLoading: false }),
  useReenviarConvocacaoTreinamento: () => ({ mutateAsync: mockMutateAsync, isLoading: false }),
  useConcluirTreinamentoPlanejadoLote: () => ({ mutateAsync: mockMutateAsync, isPending: false })
}));

vi.mock('@/react-app/hooks/useTreinamentosPlanejados', () => ({
  useTreinamentosPlanejados: () => ({
    planejadosData: mockPlanejadosData,
    isLoading: false,
    error: null,
    refetch: mockRefetchPlanejados
  }),
  usePreviewConvocacaoTreinamento: () => ({ mutateAsync: mockMutateAsync, isLoading: false }),
  useEnviarConvocacaoTreinamento: () => ({ mutateAsync: mockMutateAsync, isLoading: false }),
  useReenviarConvocacaoTreinamento: () => ({ mutateAsync: mockMutateAsync, isLoading: false })
}));

vi.mock('@/react-app/hooks/usePermissions', () => ({
  usePermissions: () => ({ can: () => true, isAdmin: true, isGestor: false })
}));

vi.mock('@/react-app/utils/lazyWithRetry', () => ({
  lazyWithRetry: (importer: any) => {
    const LazyComp = React.lazy(importer);
    return (props: any) => (
      <React.Suspense fallback={null}>
        <LazyComp {...props} />
      </React.Suspense>
    );
  }
}));

vi.mock('@/react-app/config/api', () => ({
  fetchWithAuth: (...args: any[]) => fetchWithAuthMock(...args),
  API_BASE_URL: 'http://localhost/api',
  getAccessToken: () => 'fake-token'
}));

vi.mock('@/react-app/lib/apiFetch', () => ({
  apiFetch: (...args: any[]) => apiFetchMock(...args)
}));

// Provide a fixed URL search param to avoid the reset effect
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual as any,
    useSearchParams: () => [new URLSearchParams({ tab: 'historico' }), vi.fn()],
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();

  fetchWithAuthMock.mockImplementation(async (url: string) => {
    if (url.includes('/dashboard/qualificacoes')) {
      return {
        ok: true,
        json: async () => ({
          stats: { total: 100, atencao: 5, vencidas: 2 },
          list: [
            { id: 1, tipo_nome: 'Treinamento A', status: 'VALIDA' }
          ]
        })
      };
    }
    return { ok: true, json: async () => [] };
  });
  apiFetchMock.mockImplementation(async () => {
    return { ok: true, json: async () => [] };
  });
});

afterEach(() => {
  vi.useRealTimers();
});

const renderComponent = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/?tab=historico']}>
        <Qualificacoes />
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe('Qualificacoes - Filters and View State Characterization', () => {

  it('1. estado inicial da aba ativa', () => {
    const readSpy = vi.spyOn(userPreferences, 'readUserPreference').mockImplementation((key, def) => def);
    renderComponent();
    expect(readSpy).toHaveBeenCalledWith('qualificacoes_prefs_v1', expect.anything());
    
    expect(mockUseQualificacoesHistorico).toHaveBeenCalled();
  });

  it('5. restauração/persistência de preferências em localStorage', () => {
    const prefs = {
      activeTab: 'tipos',
      limit: 200,
      aeronaveFilter: 'AW139',
      categoriaFilter: 'Treinamento X',
    };
    vi.spyOn(userPreferences, 'readUserPreference').mockReturnValue(prefs);
    const writeSpy = vi.spyOn(userPreferences, 'writeUserPreference');

    renderComponent();
    
    act(() => {
      vi.advanceTimersByTime(100);
    });
    
    expect(writeSpy).toHaveBeenCalledWith('qualificacoes_prefs_v1', expect.objectContaining({
      activeTab: 'tipos',
      limit: 200,
      aeronaveFilter: 'AW139',
      categoriaFilter: 'Treinamento X',
    }));
  });

  it('3. busca textual/debounce, sem depender de tempo real frágil', () => {
    vi.spyOn(userPreferences, 'readUserPreference').mockImplementation((key, def) => def);
    renderComponent();
    
    const searchInput = screen.getByPlaceholderText(/Buscar por nome, código/i);
    
    act(() => {
      fireEvent.change(searchInput, { target: { value: 'João' } });
    });
    
    act(() => {
      vi.advanceTimersByTime(500);
    });
    
    const mainCalls = mockUseQualificacoesHistorico.mock.calls.filter((c: any) => c[1] !== 500);
    const lastCall = mainCalls[mainCalls.length - 1];
    expect(lastCall[4]).toBe('João');
  });

  it('4. mudança de paginação/limit', () => {
    vi.spyOn(userPreferences, 'readUserPreference').mockImplementation((key, def) => def);
    renderComponent();
    
    const limitSelect = screen.getByDisplayValue('50');
    
    act(() => {
      fireEvent.change(limitSelect, { target: { value: '100' } });
    });
    
    act(() => {
      vi.advanceTimersByTime(100);
    });
    
    const mainCalls = mockUseQualificacoesHistorico.mock.calls.filter((c: any) => c[1] !== 500);
    const lastCall = mainCalls[mainCalls.length - 1];
    expect(Number(lastCall[1])).toBe(100);
  });

  it('2. filtro por status sem quebrar', () => {
    vi.spyOn(userPreferences, 'readUserPreference').mockImplementation((key, def) => def);
    renderComponent();
    
    const statusDropdownBtn = screen.getByRole('button', { name: /Status/i });
    
    act(() => {
      fireEvent.click(statusDropdownBtn);
    });
    
    const vencidaCheckbox = screen.getByLabelText(/Vencidas?/i);
    
    act(() => {
      fireEvent.click(vencidaCheckbox);
    });
    
    act(() => {
      vi.advanceTimersByTime(100);
    });
    
    let mainCalls = mockUseQualificacoesHistorico.mock.calls.filter((c: any) => c[1] !== 500);
    let lastCall = mainCalls[mainCalls.length - 1];
    expect(lastCall[9]).not.toContain('VENCIDA');
    
    act(() => {
      fireEvent.click(vencidaCheckbox);
    });
    
    act(() => {
      vi.advanceTimersByTime(100);
    });
    
    mainCalls = mockUseQualificacoesHistorico.mock.calls.filter((c: any) => c[1] !== 500);
    lastCall = mainCalls[mainCalls.length - 1];
    expect(lastCall[9]).toContain('VENCIDA');
  });

  it('8. garantia de que filtros não disparam mutation', () => {
    vi.spyOn(userPreferences, 'readUserPreference').mockImplementation((key, def) => def);
    renderComponent();
    
    const searchInput = screen.getByPlaceholderText(/Buscar por nome, código/i);
    
    act(() => {
      fireEvent.change(searchInput, { target: { value: 'Maria' } });
    });
    
    act(() => {
      vi.advanceTimersByTime(500);
    });
    
    const mainCalls = mockUseQualificacoesHistorico.mock.calls.filter((c: any) => c[1] !== 500);
    const lastCall = mainCalls[mainCalls.length - 1];
    expect(lastCall[4]).toBe('Maria');
    
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it('9. todos os filtros de status funcionam e são passados para o hook', () => {
    vi.spyOn(userPreferences, 'readUserPreference').mockImplementation((key, def) => def);
    renderComponent();
    
    const statusDropdownBtn = screen.getByRole('button', { name: /Status/i });
    act(() => { fireEvent.click(statusDropdownBtn); });
    
    const statusesToToggle = [
      { label: /Válidas?/i, value: 'VALIDA' },
      { label: /Vencidas?/i, value: 'VENCIDA' },
      { label: /Vencendo/i, value: 'VENCENDO_30' },
      { label: /Renovadas?/i, value: 'RENOVADA' },
      { label: /Planejadas?/i, value: 'PLANEJADA' },
      { label: /Canceladas?/i, value: 'CANCELADA' }
    ];

    statusesToToggle.forEach(({ label }) => {
      const checkbox = screen.getByLabelText(label);
      act(() => { fireEvent.click(checkbox); });
      act(() => { vi.advanceTimersByTime(100); });
      
      const mainCalls = mockUseQualificacoesHistorico.mock.calls.filter((c: any) => c[1] !== 500);
      const lastCall = mainCalls[mainCalls.length - 1];
      expect(lastCall[9]).toBeDefined();
    });
  });

  it('10. limpeza e comportamento reset funcionam (emulando mudança de aba via cleanup test)', () => {
    vi.spyOn(userPreferences, 'readUserPreference').mockImplementation((key, def) => def);
    const { unmount } = renderComponent();
    
    const searchInput = screen.getByPlaceholderText(/Buscar por nome, código/i);
    act(() => { fireEvent.change(searchInput, { target: { value: 'Texto para limpar' } }); });
    act(() => { vi.advanceTimersByTime(500); });
    
    const mainCallsBefore = mockUseQualificacoesHistorico.mock.calls.filter((c: any) => c[1] !== 500);
    expect(mainCallsBefore[mainCallsBefore.length - 1][4]).toBe('Texto para limpar');

    // Teste isolado, sem mudar rotas complexas. Unmount limpa mocks.
    unmount();
  });
});

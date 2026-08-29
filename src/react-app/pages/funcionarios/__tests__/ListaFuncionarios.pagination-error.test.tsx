import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ListaFuncionarios } from '../ListaFuncionarios';

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock('@/react-app/hooks/useAuth', () => ({
  useAuth: () => ({
    token: 'test-token',
  }),
}));

vi.mock('@/react-app/hooks/useDebounce', () => ({
  useDebounce: <T,>(value: T) => value,
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});

vi.mock('../ModalFuncionario', () => ({
  default: () => null,
}));

vi.mock('../ConfigurarColunas', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../ConfigurarColunas')>()),
  default: () => null,
}));

vi.mock('../AdicionarFiltro', () => ({
  default: () => null,
}));

vi.mock('@/react-app/components/UI/Skeleton', () => ({
  SkeletonTable: () => <div>loading</div>,
}));

vi.mock('@/react-app/components/UI/EmptyState', () => ({
  EmptyState: ({ title, description }: { title: string; description: string }) => (
    <div>
      <div>{title}</div>
      <div>{description}</div>
    </div>
  ),
}));

vi.mock('@/react-app/utils/confirmDialog', () => ({
  confirmDialog: vi.fn(async () => false),
}));

vi.mock('@/react-app/utils/pasta360', () => ({
  buildPasta360Url: () => '/funcionarios/1/pasta-360',
}));

const fetchMock = vi.fn();

describe('ListaFuncionarios pagination on fetch error', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  function findPaginationText(fragment: string) {
    return screen.getAllByText((_, element) => {
      if (element?.tagName !== 'P') return false;
      return element.textContent?.includes(fragment) ?? false;
    })[0];
  }

  it('resets stale pagination metadata after a subsequent fetch failure', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ id: 1, nome: 'Funcionario A', status: 'ATIVO' }],
          pagination: {
            page: 1,
            limit: 50,
            total: 500,
            totalPages: 10,
            hasNext: true,
            hasPrev: false,
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
      });

    const baseProps = {
      statusFilter: 'ativos',
      configColunasAberto: false,
      onToggleConfigColunas: vi.fn(),
    };

    const { rerender } = render(<ListaFuncionarios {...baseProps} termoBusca="" />);

    await waitFor(() => {
      expect(findPaginationText('Página 1 de 10')).toBeInTheDocument();
    });
    expect(screen.getByText(/500/)).toBeInTheDocument();

    rerender(<ListaFuncionarios {...baseProps} termoBusca="rodrigo" />);

    await waitFor(() => {
      expect(
        screen.getByText(/Não foi possível carregar os funcionários\. Tente novamente\./i),
      ).toBeInTheDocument();
    });

    expect(findPaginationText('Página 1 de 1')).toBeInTheDocument();
    expect(screen.queryByText(/500/)).not.toBeInTheDocument();
  });
});

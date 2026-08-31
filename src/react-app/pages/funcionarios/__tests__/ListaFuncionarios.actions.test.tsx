import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  useAuth: () => ({ token: 'test-token' }),
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
  default: ({ funcionario }: { funcionario?: { nome?: string } | null }) => (
    <div role="dialog">Editando {funcionario?.nome || 'novo funcionário'}</div>
  ),
}));

vi.mock('../ConfigurarColunas', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../ConfigurarColunas')>()),
  default: () => null,
}));

vi.mock('../AdicionarFiltro', () => ({ default: () => null }));
vi.mock('@/react-app/components/UI/Skeleton', () => ({ SkeletonTable: () => <div>loading</div> }));
vi.mock('@/react-app/components/UI/EmptyState', () => ({ EmptyState: () => null }));
vi.mock('@/react-app/utils/confirmDialog', () => ({ confirmDialog: vi.fn(async () => false) }));
vi.mock('@/react-app/utils/pasta360', () => ({
  buildPasta360Url: () => '/funcionarios/1/pasta-360',
}));

const fetchMock = vi.fn();

const props = {
  termoBusca: '',
  statusFilter: 'ativos',
  configColunasAberto: false,
  onToggleConfigColunas: vi.fn(),
};

function successfulEmployeesResponse() {
  return {
    ok: true,
    json: async () => ({
      data: [
        {
          id: 1,
          nome: 'Silvio Cesar de Sant Anna',
          guerra: "Sant'anna",
          funcao: 'Comandante',
          setor: 'Tripulação',
          aeronave: 'SK76',
          status: 'ATIVO',
        },
      ],
      pagination: {
        page: 1,
        limit: 50,
        total: 1,
        totalPages: 1,
        hasNext: false,
        hasPrev: false,
      },
    }),
  };
}

describe('ListaFuncionarios row actions', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(successfulEmployeesResponse());
    vi.stubGlobal('fetch', fetchMock);
    localStorage.clear();
  });

  it('restores the direct edit action and opens the employee edit modal', async () => {
    render(<ListaFuncionarios {...props} />);

    const editButton = await screen.findByRole('button', {
      name: 'Editar Silvio Cesar de Sant Anna',
    });

    fireEvent.click(editButton);

    expect(await screen.findByRole('dialog')).toHaveTextContent('Editando Silvio Cesar de Sant Anna');
  });

  it('opens the overflow menu with visible edit and delete actions', async () => {
    render(<ListaFuncionarios {...props} />);

    const moreActionsButton = await screen.findByRole('button', {
      name: 'Mais ações para Silvio Cesar de Sant Anna',
    });

    fireEvent.click(moreActionsButton);

    const menu = await screen.findByRole('menu', {
      name: 'Ações para Silvio Cesar de Sant Anna',
    });
    expect(menu).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Editar' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Excluir' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Editar' }));

    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
    expect(await screen.findByRole('dialog')).toHaveTextContent('Editando Silvio Cesar de Sant Anna');
  });
});

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Funcionarios from './Funcionarios';

const mockContext = vi.hoisted(() => ({
  selected: ['2'],
  setPreferences: vi.fn(),
  setSearchParams: vi.fn(),
}));

vi.mock('@/react-app/hooks/useAuth', () => ({
  useAuth: () => ({ token: 'test-token', empresaAtualId: 6 }),
}));
vi.mock('@/react-app/hooks/useTablePreferences', () => ({
  useTablePreferences: () => ({
    preferences: {
      searchTerm: '',
      statusFilter: 'ativos',
      funcaoFilter: '',
      aeronaveFilter: '',
      quinzenaFilter: '',
      setorFilter: mockContext.selected,
    },
    setPreferences: mockContext.setPreferences,
    ready: true,
  }),
}));
vi.mock('react-router-dom', () => ({
  useSearchParams: () => [new URLSearchParams(), mockContext.setSearchParams],
}));
vi.mock('@/react-app/components/AppLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/react-app/components/PageHeader', () => ({
  default: () => <div>Funcionários</div>,
}));
vi.mock('./funcionarios/ManagerAlertCenter', () => ({
  default: () => null,
}));
vi.mock('@/react-app/components/UI', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  MultiSelect: () => <div data-testid="sector-select" />,
}));
vi.mock('./funcionarios/ListaFuncionarios', () => ({
  ListaFuncionarios: ({ setorFilter }: { setorFilter: string[] }) => (
    <div data-testid="staff-list">{JSON.stringify(setorFilter)}</div>
  ),
}));

describe('Funcionarios persisted sector failure', () => {
  beforeEach(() => {
    mockContext.setPreferences.mockReset();
    mockContext.setSearchParams.mockReset();
    localStorage.clear();
  });

  it('does not mount the staff list if persisted sectors cannot be verified; retries explicitly', async () => {
    let failCatalog = true;
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).endsWith('/setores')) {
        if (failCatalog) return { ok: false, status: 503, json: async () => ({ success: false }) };
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: [{ id: 1, nome: 'A' }, { id: 2, nome: 'B' }] }),
        };
      }
      return { ok: true, status: 200, json: async () => ({ success: true, data: [] }) };
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<Funcionarios />);
    const retry = await screen.findByRole('button', { name: 'Tentar novamente' });
    expect(screen.queryByTestId('staff-list')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Nenhum funcionário foi exibido');

    failCatalog = false;
    fireEvent.click(retry);
    await waitFor(() => expect(screen.getByTestId('staff-list')).toHaveTextContent('["2"]'));
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/setores'),
      expect.objectContaining({ cache: 'no-cache' }),
    );
  });
});

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ListaFuncionarios } from '../ListaFuncionarios';

const mock = vi.hoisted(() => ({
  fetch: vi.fn(),
  invalidate: vi.fn(async () => undefined),
}));
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));
vi.mock('@/react-app/lib/compliance-source-invalidation', () => ({
  invalidateEmployeeComplianceProjections: mock.invalidate,
}));
vi.mock('@/react-app/lib/app-fetch', () => ({
  appFetch: (...args: Parameters<typeof fetch>) => globalThis.fetch(...args),
}));
vi.mock('@/react-app/hooks/useAuth', () => ({
  useAuth: () => ({ token: 'test-token', empresaAtualId: 6 }),
}));
vi.mock('@/react-app/hooks/useDebounce', () => ({
  useDebounce: <T,>(value: T) => value,
}));
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => vi.fn(),
}));
vi.mock('../ModalFuncionario', () => ({
  default: (props: {
    aberto: boolean;
    onSalvar: (data: { id: number; status: string }) => void;
  }) => props.aberto
    ? <button type="button" onClick={() => props.onSalvar({ id: 29, status: 'INATIVO' })}>Salvar edição</button>
    : null,
}));
vi.mock('../ConfigurarColunas', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../ConfigurarColunas')>()),
  default: () => null,
}));
vi.mock('../AdicionarFiltro', () => ({ default: () => null }));
vi.mock('@/react-app/components/UI/Skeleton', () => ({
  SkeletonTable: () => <div>Carregando...</div>,
}));
vi.mock('@/react-app/components/UI/EmptyState', () => ({
  EmptyState: () => <div>Sem funcionários</div>,
}));
vi.mock('@/react-app/utils/confirmDialog', () => ({
  confirmDialog: vi.fn(async () => false),
}));

const baseProps = {
  termoBusca: '',
  statusFilter: 'ativos',
  configColunasAberto: false,
  onToggleConfigColunas: vi.fn(),
};

describe('Actual HR editing page notifies Compliance after confirmed employee writes', () => {
  beforeEach(() => {
    mock.fetch.mockReset();
    mock.invalidate.mockReset();
    mock.invalidate.mockResolvedValue(undefined);
    vi.stubGlobal('fetch', mock.fetch);
  });

  function setupRequest(editSucceeds: boolean) {
    mock.fetch.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        return editSucceeds
          ? { ok: true, status: 200, json: async () => ({ success: true }) }
          : { ok: false, status: 403, json: async () => ({ error: 'Acesso negado' }) };
      }
      return {
        ok: true,
        json: async () => ({
          success: true,
          data: [{ id: 29, nome: 'Funcionário A', status: 'ATIVO', funcao: 'Piloto' }],
          meta: { total: 1, page: 1, limit: 50, totalPages: 1 },
        }),
      };
    });
  }

  async function editEmployee() {
    render(<ListaFuncionarios {...baseProps} />);
    await screen.findByText('Funcionário A');
    fireEvent.click(screen.getAllByTitle('Editar')[0]);
    fireEvent.click(await screen.findByRole('button', { name: 'Salvar edição' }));
  }

  it('invalidates the correct tenant after a real HR form save succeeds', async () => {
    setupRequest(true);
    await editEmployee();
    await waitFor(() => expect(mock.invalidate).toHaveBeenCalledTimes(1));
    expect(mock.invalidate).toHaveBeenCalledWith(expect.anything(), 6);
  });

  it('does not advertise a changed Compliance status after an HTTP 403 save failure', async () => {
    setupRequest(false);
    await editEmployee();
    await waitFor(() => expect(mock.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/funcionarios/29'), expect.objectContaining({ method: 'PUT' }),
    ));
    expect(mock.invalidate).not.toHaveBeenCalled();
  });
});

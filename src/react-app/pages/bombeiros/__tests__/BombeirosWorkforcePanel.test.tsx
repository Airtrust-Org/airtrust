import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BombeirosWorkforcePanel from '../BombeirosWorkforcePanel';

const useApiMock = vi.fn();
vi.mock('@/react-app/hooks/useApi', () => ({
  useApi: (...args: unknown[]) => useApiMock(...args),
}));

describe('BOA registered employees panel', () => {
  beforeEach(() => useApiMock.mockReset());

  it('calls only the dedicated BOA endpoint and shows zero employee data on unauthorized access', () => {
    useApiMock.mockReturnValue({
      data: null, error: '403', loading: false, refetch: vi.fn(),
    });
    render(<BombeirosWorkforcePanel />);
    expect(useApiMock).toHaveBeenCalledWith(
      '/api/bombeiros/frms/equipe?cursor=0&limit=50',
      expect.objectContaining({ requireAuth: true, bypassGetCache: true, staleTime: 0 }),
    );
    expect(screen.getByRole('alert')).toHaveTextContent('403');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('labels aviation role and unresolved workforce without declaring anyone fit', () => {
    useApiMock.mockReturnValue({
      data: { success: true, data: {
        source: 'FUNCIONARIOS',
        interpretation: 'Cadastro de pessoas; não determina aptidão.',
        next_cursor: null,
        items: [
          { id: 10, nome: 'QA Resgate', nome_guerra: 'QA R', cargo: 'Operador Aerotático',
            funcao: null, perfil_frms: 'flight' },
          { id: 11, nome: 'QA Sem Funcao', nome_guerra: null, cargo: 'Bombeiro Militar',
            funcao: null, perfil_frms: 'other' },
        ],
      }, meta: { profile_code: 'FIREFIGHTER_AVIATION' } },
      error: null, loading: false, refetch: vi.fn(),
    });
    render(<BombeirosWorkforcePanel />);
    expect(screen.getByText('QA R')).toBeInTheDocument();
    expect(screen.getByText('Função aeronáutica identificada')).toBeInTheDocument();
    expect(screen.getByText('Função FRMS ainda não classificada')).toBeInTheDocument();
    expect(screen.getByText(/não determina aptidão/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Próxima página' })).toBeDisabled();
  });

  it('paginates by server cursor without using employee IDs from another tenant', () => {
    useApiMock.mockReturnValue({
      data: { success: true, data: {
        source: 'FUNCIONARIOS', interpretation: 'Cadastro exclusivamente BOA.',
        next_cursor: 100,
        items: [{ id: 100, nome: 'QA', nome_guerra: null, cargo: 'Piloto',
          funcao: null, perfil_frms: 'flight' }],
      } },
      error: null, loading: false, refetch: vi.fn(),
    });
    render(<BombeirosWorkforcePanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Próxima página' }));
    expect(useApiMock).toHaveBeenLastCalledWith(
      '/api/bombeiros/frms/equipe?cursor=100&limit=50',
      expect.objectContaining({ requireAuth: true }),
    );
  });
});

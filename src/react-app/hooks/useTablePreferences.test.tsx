import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useTablePreferences } from './useTablePreferences';

const fetchWithAuthMock = vi.fn();

vi.mock('@/react-app/config/api', () => ({
  fetchWithAuth: (...args: unknown[]) => fetchWithAuthMock(...args),
}));

vi.mock('@/react-app/hooks/useAuth', () => ({
  useAuth: () => ({
    empresaAtualId: 1,
    user: { id: 10 },
  }),
}));

function Harness({ tick }: { tick: number }) {
  const { preferences, ready } = useTablePreferences('table.qualificacoes.modelos', {
    searchTerm: '',
    categoriaFilter: '',
    setorFilter: [],
  });

  return (
    <div>
      <span>{ready ? 'ready' : 'loading'}</span>
      <span>{preferences.searchTerm}</span>
      <span data-testid="tick">{tick}</span>
    </div>
  );
}

describe('useTablePreferences', () => {
  beforeEach(() => {
    fetchWithAuthMock.mockReset();
    localStorage.clear();
  });

  it('nao recarrega preferencias apenas porque o defaultValue recebeu nova referencia', async () => {
    fetchWithAuthMock.mockResolvedValue({
      ok: false,
      json: async () => ({}),
    });

    const { rerender } = render(<Harness tick={1} />);

    await waitFor(() => {
      expect(screen.getByText('ready')).toBeInTheDocument();
    });

    expect(fetchWithAuthMock).toHaveBeenCalledTimes(1);

    rerender(<Harness tick={2} />);

    await waitFor(() => {
      expect(screen.getByTestId('tick')).toHaveTextContent('2');
    });

    expect(fetchWithAuthMock).toHaveBeenCalledTimes(1);
  });
});

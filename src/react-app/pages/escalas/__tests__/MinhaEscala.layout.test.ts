import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import MinhaEscalaPage from '../MinhaEscalaPage';

vi.mock('@/react-app/components/AppLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-layout">{children}</div>
  ),
}));

vi.mock('@/react-app/components/PageHeader', () => ({
  default: () => <div>Minha Escala</div>,
}));

vi.mock('@/react-app/hooks/useAuth', () => ({
  useAuth: () => ({ user: { nome: 'Tripulante Teste', funcionario_id: 10 } }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: { eventos: [] }, isLoading: false }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock('@/react-app/hooks/useFrmsOperationalSnapshot', () => ({
  useFrmsOperationalSnapshot: () => ({ data: [], loading: false }),
}));

vi.mock('@/react-app/pages/frms/components/FortnightOperationalIndicator', () => ({
  FortnightCrewSummaryCard: () => <div>Resumo FRMS</div>,
}));

describe('Minha Escala layout shell', () => {
  it('keeps the operational calendar full-width instead of reintroducing a narrow centered cap', () => {
    const { getByTestId } = render(<MinhaEscalaPage />);
    const shell = getByTestId('app-layout').firstElementChild;

    expect(shell).not.toBeNull();
    expect(shell).toHaveClass('w-full');
    expect(shell).not.toHaveClass('max-w-5xl');
    expect(shell).not.toHaveClass('mx-auto');
  });
});

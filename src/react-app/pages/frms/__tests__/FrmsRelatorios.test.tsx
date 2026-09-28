import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FrmsRelatorios, { csvCell } from '../FrmsRelatorios';

const useApiMock = vi.fn();
const refetchMock = vi.fn();

vi.mock('@/react-app/components/AppLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/react-app/hooks/useApi', () => ({
  useApi: (...args: unknown[]) => useApiMock(...args),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

describe('FrmsRelatorios', () => {
  beforeEach(() => {
    useApiMock.mockReset();
    refetchMock.mockReset();
  });

  it('neutraliza células que poderiam ser interpretadas como fórmula no CSV', () => {
    expect(csvCell('=HYPERLINK("https://evil.invalid")')).toBe('"\'=HYPERLINK(""https://evil.invalid"")"');
    expect(csvCell('+SUM(1,1)')).toBe('"\'+SUM(1,1)"');
    expect(csvCell('texto normal')).toBe('"texto normal"');
  });

  it('encerra o carregamento com erro explícito e permite tentar novamente', () => {
    useApiMock.mockReturnValue({
      data: null,
      loading: false,
      error: 'HTTP 500 — falha interna',
      refetch: refetchMock,
    });

    render(<FrmsRelatorios />);

    expect(screen.getByText('Não foi possível gerar este relatório')).toBeInTheDocument();
    expect(screen.getByText(/HTTP 500/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(refetchMock).toHaveBeenCalledTimes(1);
  });

  it('não habilita exportação quando a resposta não traz metadados de governança', () => {
    useApiMock.mockReturnValue({
      data: [{ tripulante_id: 1, nome: 'Tripulante Teste', dias_avaliados: 1 }],
      loading: false,
      error: null,
      refetch: refetchMock,
    });

    render(<FrmsRelatorios />);

    expect(screen.getByRole('button', { name: 'CSV' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'PDF' })).toBeDisabled();
  });
});

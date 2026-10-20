import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FrmsMonthlyConsolidated from '../FrmsMonthlyConsolidated';

const useApiMock = vi.fn();
vi.mock('@/react-app/hooks/useApi', () => ({
  useApi: (...args: unknown[]) => useApiMock(...args),
}));

describe('FRMS mensal consolidado — UI administrativa', () => {
  beforeEach(() => useApiMock.mockReset());

  it('mostra indisponibilidade explícita quando acesso ou dado falha', () => {
    useApiMock.mockReturnValue({
      data: null, loading: false, error: '403 - acesso negado', refetch: vi.fn(),
    });
    render(<FrmsMonthlyConsolidated />);
    expect(screen.getByRole('alert')).toHaveTextContent('acesso negado');
    expect(screen.queryByText(/Dias avaliados/)).not.toBeInTheDocument();
  });

  it('nunca converte contagem suprimida em zero nem afirma aptidão', () => {
    const keys = [
      'dias_avaliados', 'dias_conformes', 'dias_violacao',
      'dias_nao_avaliados', 'dias_mitigacao', 'dias_atencao',
    ];
    const indicators = Object.fromEntries(keys.map(key => [key, {
      value: null, state: 'SMALL_CELL_SUPPRESSED',
    }]));
    const recorded_month_delta = Object.fromEntries(keys.map(key => [key, null]));
    useApiMock.mockReturnValue({
      data: { success: true, data: {
        status: 'PARTIAL_COVERAGE',
        authorized_crew: 130, represented_crew: null,
        indicators, recorded_month_delta,
        recommendations: ['Registrar mitigação e responsável.'],
        limitations: ['Cobertura insuficiente.'],
      }, meta: { revision_id: 'QA-V1', profile_code: 'FIREFIGHTER_AVIATION' } },
      loading: false, error: null, refetch: vi.fn(),
    });
    render(<FrmsMonthlyConsolidated />);
    expect(screen.getAllByText('Suprimido por privacidade')).toHaveLength(6);
    expect(screen.getByText(/Cobertura parcial/)).toBeInTheDocument();
    expect(screen.getByText(/Registrar mitigação e responsável/)).toBeInTheDocument();
    expect(screen.getByText(/FIREFIGHTER_AVIATION/)).toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });
});

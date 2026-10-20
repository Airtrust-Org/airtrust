import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FrmsMonthlyConsolidated from '../FrmsMonthlyConsolidated';

const useApiMock = vi.fn();
vi.mock('@/react-app/hooks/useApi', () => ({
  useApi: (...args: unknown[]) => useApiMock(...args),
}));

describe('BOA monthly check-in receipt evidence — UI', () => {
  beforeEach(() => useApiMock.mockReset());

  it('does not render any health data after authorization failure', () => {
    useApiMock.mockReturnValue({
      data: null, loading: false, error: '403 - acesso negado', refetch: vi.fn(),
    });
    render(<FrmsMonthlyConsolidated />);
    expect(screen.getByRole('alert')).toHaveTextContent('acesso negado');
    expect(screen.queryByText(/Pessoas com envio no mês/)).not.toBeInTheDocument();
  });

  it('never treats protected or missing monthly data as zeros or fit for duty', () => {
    useApiMock.mockReturnValue({
      data: { success: true, data: {
        current: { receipt_person_days: null, distinct_people: null,
          privacy_state: 'SMALL_PARTICIPANT_SET_SUPPRESSED' },
        previous: { receipt_person_days: null, distinct_people: null,
          privacy_state: 'SMALL_PARTICIPANT_SET_SUPPRESSED' },
        receipt_person_days_delta: null,
        source: 'FRMS_FADIGA_CHECKIN_TENANT_SCOPED',
        restrictions: ['Não confirma aptidão.'],
      }, meta: { profile_code: 'FIREFIGHTER_AVIATION', revision_id: 'BOA-QA-1' } },
      error: null, loading: false, refetch: vi.fn(),
    });
    render(<FrmsMonthlyConsolidated />);
    expect(screen.getAllByText('Suprimido por privacidade')).toHaveLength(2);
    expect(screen.getByText('Comparação não disponível')).toBeInTheDocument();
    expect(screen.getByText(/Não confirma aptidão/)).toBeInTheDocument();
    expect(screen.getByText(/FIREFIGHTER_AVIATION/)).toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('only renders receipt totals without calling the legacy FRMS API', () => {
    useApiMock.mockReturnValue({
      data: { success: true, data: {
        current: { receipt_person_days: 26, distinct_people: 6, privacy_state: 'OBSERVED' },
        previous: { receipt_person_days: 20, distinct_people: 6, privacy_state: 'OBSERVED' },
        receipt_person_days_delta: 6,
        source: 'FRMS_FADIGA_CHECKIN_TENANT_SCOPED',
        restrictions: ['Não é conformidade com normas operacionais.'],
      } }, error: null, loading: false, refetch: vi.fn(),
    });
    render(<FrmsMonthlyConsolidated />);
    expect(useApiMock.mock.calls[0][0]).toMatch(/^\/api\/bombeiros\/frms\/relatorios\/mensal-consolidado/);
    expect(screen.getByText('26')).toBeInTheDocument();
    expect(screen.getAllByText('6', { selector: 'p.text-xl' })).toHaveLength(2);
    expect(screen.queryByText(/Dias conformes registrados/)).not.toBeInTheDocument();
  });
});

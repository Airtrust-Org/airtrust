import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RecoveryActivityCard from '../RecoveryActivityCard';
import type { RecoveryContextData } from '@/react-app/hooks/useFrmsRecovery';

const stagePendingMock = vi.fn();
const clearPendingMock = vi.fn();
let contextValue: {
  data: RecoveryContextData | undefined;
  isLoading: boolean;
  isError: boolean;
};

vi.mock('@/react-app/hooks/useFrmsRecovery', async () => {
  const actual = await vi.importActual<typeof import('@/react-app/hooks/useFrmsRecovery')>(
    '@/react-app/hooks/useFrmsRecovery',
  );
  return {
    ...actual,
    useFrmsRecoveryContext: () => contextValue,
    stagePendingFrmsRecoveryActivity: (...args: unknown[]) => stagePendingMock(...args),
    clearPendingFrmsRecoveryActivity: (...args: unknown[]) => clearPendingMock(...args),
  };
});

function baseContext(overrides: Partial<RecoveryContextData> = {}): RecoveryContextData {
  return {
    reference_date: '2026-06-04',
    schema_ready: true,
    flight: {
      detected: false,
      sectorCount: 0,
      landingCount: 0,
      canonicalFlightMinutes: 0,
      source: 'NONE_FOUND',
    },
    requires_activity_classification: true,
    activity: null,
    assessment: null,
    prompt_reason: 'NO_FLIGHT_FOUND_IN_SIGVOOS',
    ...overrides,
  };
}

describe('RecoveryActivityCard', () => {
  beforeEach(() => {
    stagePendingMock.mockReset();
    clearPendingMock.mockReset();
    contextValue = { data: baseContext(), isLoading: false, isError: false };
  });

  it('does not render while loading, on error, or before the schema is ready', () => {
    contextValue = { data: undefined, isLoading: true, isError: false };
    const { container, rerender } = render(<RecoveryActivityCard today="2026-06-05" />);
    expect(container).toBeEmptyDOMElement();

    contextValue = { data: baseContext({ schema_ready: false }), isLoading: false, isError: false };
    rerender(<RecoveryActivityCard today="2026-06-05" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when SIGVOOS already has a flight for the previous day', () => {
    contextValue = {
      data: baseContext({ flight: { ...baseContext().flight, detected: true, source: 'SIGVOOS' } }),
      isLoading: false,
      isError: false,
    };
    const { container } = render(<RecoveryActivityCard today="2026-06-05" />);
    expect(container).toBeEmptyDOMElement();
    expect(clearPendingMock).toHaveBeenCalledWith('2026-06-04');
  });

  it('prioriza as quatro situações comuns e mantém exceções recolhidas', () => {
    render(<RecoveryActivityCard today="2026-06-05" />);
    expect(screen.getByText('Atividade de ontem')).toBeInTheDocument();
    expect(screen.getByText('Folga / descanso')).toBeInTheDocument();
    expect(screen.getByText('Standby em hotel ou residência')).toBeInTheDocument();
    expect(screen.getByText('Standby na base / aeroporto')).toBeInTheDocument();
    expect(screen.getByText('Administrativo / treinamento')).toBeInTheDocument();
    expect(screen.queryByText('Mais de uma situação')).not.toBeInTheDocument();
    expect(screen.queryByText('Houve voo, mas não aparece no sistema')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Outra situação' }));
    expect(screen.getByText('Mais de uma situação')).toBeInTheDocument();
    expect(screen.getByText('Houve voo, mas não aparece no sistema')).toBeInTheDocument();
    expect(screen.getByText(/será salva junto com as demais informações/i)).toBeInTheDocument();
  });

  it('pede início e fim também para standby, além do tipo de acionamento', () => {
    render(<RecoveryActivityCard today="2026-06-05" />);
    fireEvent.click(screen.getByText('Standby na base / aeroporto'));

    expect(screen.getByText('Horário da atividade')).toBeInTheDocument();
    expect(screen.getByText('Início')).toBeInTheDocument();
    expect(screen.getByText('Fim')).toBeInTheDocument();
    expect(screen.getByText(/acionado imediatamente/i)).toBeInTheDocument();
  });

  it('keeps an off-duty classification pending for the final check-in submit', async () => {
    render(<RecoveryActivityCard today="2026-06-05" />);
    fireEvent.click(screen.getByText('Folga / descanso'));

    await vi.waitFor(() =>
      expect(stagePendingMock).toHaveBeenCalledWith(
        '2026-06-04',
        expect.objectContaining({
          reference_date: '2026-06-04',
          activity_type: 'OFF_DUTY',
        }),
        true,
      ),
    );
    expect(screen.queryByRole('button', { name: /salvar condição de ontem/i })).not.toBeInTheDocument();
  });

  it('keeps a source discrepancy pending without persisting it before the final submit', async () => {
    render(<RecoveryActivityCard today="2026-06-05" />);
    fireEvent.click(screen.getByRole('button', { name: 'Outra situação' }));
    fireEvent.click(screen.getByText('Houve voo, mas não aparece no sistema'));
    expect(screen.getByText('Observação')).toBeInTheDocument();

    await vi.waitFor(() =>
      expect(stagePendingMock).toHaveBeenCalledWith(
        '2026-06-04',
        expect.objectContaining({ activity_type: 'FLIGHT_NOT_IN_SOURCE' }),
        true,
      ),
    );
  });

  it('shows the recorded classification without implying an automatic effectiveness bonus', () => {
    contextValue = {
      data: baseContext({ activity: { activity_type: 'OFF_DUTY' } }),
      isLoading: false,
      isError: false,
    };
    render(<RecoveryActivityCard today="2026-06-05" />);
    expect(screen.getByText('Atividade de ontem registrada')).toBeInTheDocument();
    expect(screen.getByText(/não cria bônus automático de efetividade/i)).toBeInTheDocument();
    expect(clearPendingMock).toHaveBeenCalledWith('2026-06-04');
  });
});

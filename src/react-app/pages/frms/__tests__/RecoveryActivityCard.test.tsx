import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RecoveryActivityCard from '../RecoveryActivityCard';
import type { RecoveryContextData } from '@/react-app/hooks/useFrmsRecovery';

const submitMutateAsync = vi.fn();
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
    useSubmitFrmsRecoveryActivity: () => ({ mutateAsync: submitMutateAsync, isPending: false }),
  };
});

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

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
    submitMutateAsync.mockReset();
    submitMutateAsync.mockResolvedValue({ source_discrepancy: false });
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
  });

  it('asks for the previous-day activity when SIGVOOS has no flight, including the source-gap option', () => {
    render(<RecoveryActivityCard today="2026-06-05" />);
    expect(screen.getByText('Atividade de ontem')).toBeInTheDocument();
    expect(screen.getByText('Folga / descanso')).toBeInTheDocument();
    expect(screen.getByText('Standby em hotel ou residência')).toBeInTheDocument();
    expect(screen.getByText('Standby na base / aeroporto')).toBeInTheDocument();
    expect(screen.getByText('Administrativo / treinamento')).toBeInTheDocument();
    expect(screen.getByText('Mais de uma situação')).toBeInTheDocument();
    expect(screen.getByText('Houve voo, mas não aparece no sistema')).toBeInTheDocument();
  });

  it('saves an off-duty classification with the previous operational date', async () => {
    render(<RecoveryActivityCard today="2026-06-05" />);
    fireEvent.click(screen.getByText('Folga / descanso'));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar condição de ontem' }));
    await vi.waitFor(() => expect(submitMutateAsync).toHaveBeenCalledTimes(1));
    expect(submitMutateAsync.mock.calls[0][0]).toMatchObject({
      reference_date: '2026-06-04',
      activity_type: 'OFF_DUTY',
    });
  });

  it('records "flight not in source" without granting recovery and surfaces a discrepancy warning', async () => {
    const { toast } = await import('sonner');
    submitMutateAsync.mockResolvedValue({ source_discrepancy: true });
    render(<RecoveryActivityCard today="2026-06-05" />);
    fireEvent.click(screen.getByText('Houve voo, mas não aparece no sistema'));
    // The observation field appears for the source-gap answer.
    expect(screen.getByText('Observação')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar condição de ontem' }));
    await vi.waitFor(() => expect(submitMutateAsync).toHaveBeenCalledTimes(1));
    expect(submitMutateAsync.mock.calls[0][0]).toMatchObject({
      activity_type: 'FLIGHT_NOT_IN_SOURCE',
    });
    await vi.waitFor(() => expect(toast.warning).toHaveBeenCalled());
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
  });
});

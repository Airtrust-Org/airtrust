import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { recoveryMock, apiFetchMock } = vi.hoisted(() => ({
  recoveryMock: vi.fn(),
  apiFetchMock: vi.fn(),
}));

vi.mock('@/react-app/hooks/useFrmsRecovery', () => ({
  submitPendingFrmsRecoveryActivity: recoveryMock,
}));
vi.mock('@/react-app/lib/apiFetch', () => ({ apiFetch: apiFetchMock }));
vi.mock('@/react-app/config/api', () => ({ getAccessToken: () => null }));

import { useSubmitCheckin } from '../useFadigaCheckin';

const DATE = '2026-10-27';
const SYNTHETIC_FORM = {
  reference_date: DATE,
  data_checkin: DATE,
  kss_score: 3,
  horas_sono_24h: 7,
  qualidade_sono: 4,
  fit_for_duty: true,
  aceite_termos: true as const,
  aceite_privacidade: true as const,
};

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return function TestWrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('FRMS daily check-in: previous-day guard and commit receipt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('never sends the check-in POST when the previous-day recovery guard rejects', async () => {
    recoveryMock.mockRejectedValue(
      new Error('Informe como foi sua condição operacional ontem antes de concluir o check-in.'),
    );
    const { result } = renderHook(() => useSubmitCheckin(), { wrapper: createWrapper() });

    await act(async () => {
      await expect(result.current.mutateAsync(SYNTHETIC_FORM)).rejects.toThrow(
        /Informe como foi sua condição operacional ontem/,
      );
    });

    expect(recoveryMock).toHaveBeenCalledTimes(1);
    expect(recoveryMock).toHaveBeenCalledWith(DATE);
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('sends one dated check-in POST only after the recovery guard succeeds', async () => {
    recoveryMock.mockResolvedValue(null);
    apiFetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { checkin: { id: 'qa-checkin' } } }),
    });
    const { result } = renderHook(() => useSubmitCheckin(), { wrapper: createWrapper() });

    await act(async () => {
      await expect(result.current.mutateAsync(SYNTHETIC_FORM)).resolves.toEqual({
        checkin: { id: 'qa-checkin' },
      });
    });

    expect(recoveryMock).toHaveBeenCalledTimes(1);
    expect(recoveryMock).toHaveBeenCalledWith(DATE);
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    expect(apiFetchMock).toHaveBeenCalledWith(
      '/api/frms/fadiga-checkin',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(SYNTHETIC_FORM),
      }),
    );
  });

  it('does not retry a committed check-in after downstream processing fails', async () => {
    recoveryMock.mockResolvedValue(null);
    apiFetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({
        success: false,
        error: 'FRMS_CHECKIN_COMMITTED_POST_PROCESSING_FAILED',
        checkin_committed: true,
        retry_submission: false,
      }),
    });
    const { result } = renderHook(() => useSubmitCheckin(), { wrapper: createWrapper() });

    await act(async () => {
      await expect(result.current.mutateAsync(SYNTHETIC_FORM)).rejects.toThrow(
        /check-in foi gravado.*não envie novamente/i,
      );
    });

    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    expect(recoveryMock).toHaveBeenCalledTimes(1);
  });
});

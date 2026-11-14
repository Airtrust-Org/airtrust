import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  useReadinessBaseline,
  useReadinessToday,
  useSubmitReadiness,
} from '../useOperationalReadiness';

const useQueryMock = vi.fn();
const useMutationMock = vi.fn();
const invalidateQueriesMock = vi.fn();

const authState = {
  isLoading: false,
  isAuthenticated: true,
  empresaAtualId: 6,
  user: { id: 42, role: 'TRIPULANTE' },
};

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => useQueryMock(options),
  useMutation: (options: unknown) => useMutationMock(options),
  useQueryClient: () => ({ invalidateQueries: invalidateQueriesMock }),
}));

vi.mock('@/react-app/hooks/useAuth', () => ({
  useAuth: () => authState,
}));

describe('useOperationalReadiness cache isolation & maintenance propagation', () => {
  beforeEach(() => {
    useQueryMock.mockReset();
    useMutationMock.mockReset();
    invalidateQueriesMock.mockReset();
    authState.empresaAtualId = 6;
    authState.user = { id: 42, role: 'TRIPULANTE' };
  });

  it('isola queryKey de baseline e today por empresaAtualId e user.id', () => {
    renderHook(() => useReadinessBaseline('2026-11-13'));
    expect(useQueryMock.mock.lastCall?.[0].queryKey).toEqual([
      'frms-readiness-baseline',
      '2026-11-13',
      6,
      42,
    ]);

    renderHook(() => useReadinessToday('2026-11-13'));
    expect(useQueryMock.mock.lastCall?.[0].queryKey).toEqual([
      'frms-readiness-today',
      '2026-11-13',
      6,
      42,
    ]);

    authState.empresaAtualId = 8;
    authState.user = { id: 99, role: 'GESTOR' };
    renderHook(() => useReadinessToday('2026-11-13'));
    expect(useQueryMock.mock.lastCall?.[0].queryKey).toEqual([
      'frms-readiness-today',
      '2026-11-13',
      8,
      99,
    ]);
  });

  it('invalida frms-maintenance-team após concluir envio de PVT/Readiness', () => {
    useMutationMock.mockImplementation((opts: any) => opts);
    const { result } = renderHook(() => useSubmitReadiness());
    (result.current as any).onSuccess({}, { reference_date: '2026-11-13' });

    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['frms-maintenance-team', '2026-11-13'],
    });
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['frms-readiness-today', '2026-11-13'],
    });
  });
});

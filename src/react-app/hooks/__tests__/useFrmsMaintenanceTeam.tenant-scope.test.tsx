import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFrmsMaintenanceTeam } from '../useFrmsOperationalAccess';

const { authState, useQueryMock } = vi.hoisted(() => ({
  authState: { empresaAtualId: 6 as number | null, isLoading: false, isAuthenticated: true, user: { id: 55, role: 'manager' } },
  useQueryMock: vi.fn((options: unknown) => options),
}));
vi.mock('@/react-app/hooks/useAuth', () => ({ useAuth: () => authState }));
vi.mock('@tanstack/react-query', () => ({
  useQuery: (args: unknown) => useQueryMock(args),
  useMutation: vi.fn(),
  useQueryClient: vi.fn(),
}));

describe('FRMS manutenção — isolamento da consulta por tenant e identidade', () => {
  beforeEach(() => {
    authState.empresaAtualId = 6;
    authState.isAuthenticated = true;
    authState.isLoading = false;
    authState.user = { id: 55, role: 'manager' };
    useQueryMock.mockClear();
  });

  it('não reutiliza a chave de cache da empresa 6 quando há troca para empresa 8', () => {
    const result = renderHook(() => useFrmsMaintenanceTeam('2026-11-13'));
    const key6 = useQueryMock.mock.lastCall?.[0].queryKey;
    expect(key6).toEqual(['frms-maintenance-team', '2026-11-13', 6, 55, 'manager']);
    authState.empresaAtualId = 8;
    result.rerender();
    expect(useQueryMock.mock.lastCall?.[0].queryKey).toEqual(['frms-maintenance-team', '2026-11-13', 8, 55, 'manager']);
    expect(useQueryMock.mock.lastCall?.[0].queryKey).not.toEqual(key6);
  });

  it('separa sessões de usuários e não consulta durante autenticação incompleta', () => {
    const result = renderHook(() => useFrmsMaintenanceTeam('2026-11-13'));
    authState.user = { id: 99, role: 'manager' };
    result.rerender();
    expect(useQueryMock.mock.lastCall?.[0].queryKey).toContain(99);
    authState.isLoading = true;
    result.rerender();
    expect(useQueryMock.mock.lastCall?.[0].enabled).toBe(false);
    authState.isLoading = false;
    authState.isAuthenticated = false;
    result.rerender();
    expect(useQueryMock.mock.lastCall?.[0].enabled).toBe(false);
  });
});

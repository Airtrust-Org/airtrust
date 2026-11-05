import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMinhasMatriculas } from '../useLms';

const request = vi.hoisted(() => vi.fn());

vi.mock('@/react-app/config/api', () => ({
  API_BASE_URL: '/api',
  fetchWithAuth: request,
  getAccessToken: () => null,
}));

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe('useMinhasMatriculas — employee-link boundary', () => {
  beforeEach(() => {
    request.mockReset();
    request.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: [] }),
    });
  });

  it('does not request personal enrollments while an administrator is in a management view', () => {
    const { result } = renderHook(() => useMinhasMatriculas(false), {
      wrapper: makeWrapper(),
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(request).not.toHaveBeenCalled();
  });

  it('requests enrollments once the learner view is explicitly enabled', async () => {
    const { rerender } = renderHook(
      ({ studentMode }) => useMinhasMatriculas(studentMode),
      { initialProps: { studentMode: false }, wrapper: makeWrapper() },
    );
    expect(request).not.toHaveBeenCalled();

    rerender({ studentMode: true });
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith(
        '/api/lms/matriculas/minhas',
        expect.any(Object),
      ),
    );
  });

  it('uses the strict employee link contract in administrator learner mode', async () => {
    renderHook(() => useMinhasMatriculas(true, true), { wrapper: makeWrapper() });
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith(
        '/api/lms/matriculas/minhas?strict_link=1',
        expect.any(Object),
      ),
    );
  });

  it('propagates an explicit missing-link conflict instead of silently showing zero courses', async () => {
    request.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ success: false, error: 'Conta sem vínculo funcional confirmado' }),
    });
    const { result } = renderHook(() => useMinhasMatriculas(true, true), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  it('returns existing enrollment for a non-manager who explicitly enables the learner query', async () => {
    request.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: [{ id: 81, curso_id: 55, status: 'EM_ANDAMENTO' }] }),
    });
    const { result } = renderHook(() => useMinhasMatriculas(true), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.data?.[0]?.curso_id).toBe(55));
    expect(result.current.data?.[0]?.status).toBe('EM_ANDAMENTO');
  });

  it('retains the default learner behavior when no enablement flag is passed', async () => {
    renderHook(() => useMinhasMatriculas(), { wrapper: makeWrapper() });
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  });
});

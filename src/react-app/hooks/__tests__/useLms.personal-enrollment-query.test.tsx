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

  it('retains the default learner behavior when no enablement flag is passed', async () => {
    renderHook(() => useMinhasMatriculas(), { wrapper: makeWrapper() });
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  });
});

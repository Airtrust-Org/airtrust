import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import Sistema from '@/react-app/pages/Sistema';

const mock = vi.hoisted(() => ({
  calls: [] as Array<{ url: string; enabled?: boolean }>,
  deepData: null as any,
  deepError: null as string | null,
  quickError: null as string | null,
  refetch: vi.fn(),
}));

vi.mock('@/react-app/hooks/useApi', () => ({
  useApi: (url: string, options?: { enabled?: boolean }) => {
    mock.calls.push({ url, enabled: options?.enabled });
    if (url === '/api/health?depth=light') {
      return {
        data: {
          success: true,
          status: 'partial',
          checks: {
            database: { status: 'ok', latency: 10 },
            storage: { status: 'not_checked' },
          },
          stats: { version: 'test-sha', timestamp: '2026-11-14T04:00:00Z', environment: 'staging' },
          latency: 10,
        },
        loading: false, error: mock.quickError,
      };
    }
    if (url === '/api/health') {
      return {
        data: mock.deepData,
        loading: false,
        error: mock.deepError,
        refetch: mock.refetch,
      };
    }
    return {
      data: { version: 'test-sha', environment: 'staging', builtAt: null, deploymentId: 'test-sha' },
      loading: false, error: null,
    };
  },
}));

beforeEach(() => {
  mock.calls.length = 0;
  mock.deepData = null;
  mock.deepError = null;
  mock.quickError = null;
  mock.refetch.mockClear();
});
afterEach(() => cleanup());

describe('Sistema progressive health user experience', () => {
  it('loads only quick health by default and explicitly requests deep R2 when clicked', () => {
    render(<Sistema />);
    expect(screen.getByText('Verificação rápida')).toBeTruthy();
    expect(screen.getByText('Não verificado; execute a verificação completa.')).toBeTruthy();
    expect(mock.calls.some((x) => x.url === '/api/health?depth=light')).toBe(true);
    expect(mock.calls.find((x) => x.url === '/api/health')?.enabled).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Verificação completa (D1 + R2)' }));
    expect(mock.calls.some((x) => x.url === '/api/health' && x.enabled === true)).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Verificação completa (D1 + R2)' }));
    expect(mock.refetch).toHaveBeenCalledOnce();
  });

  it('shows a successful deep probe after the quick probe failed transiently', () => {
    mock.quickError = 'D1 timeout';
    mock.deepData = {
      status: 'healthy',
      checks: { database: { status: 'ok' }, storage: { status: 'ok' } },
      stats: { environment: 'staging', version: 'new-sha' },
    };
    render(<Sistema />);
    expect(screen.getByText(/Erro ao carregar \/api\/health: D1 timeout/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Verificação completa (D1 + R2)' }));
    expect(screen.getAllByText('HEALTHY').length).toBeGreaterThan(0);
    expect(screen.queryByText(/Erro ao carregar \/api\/health: D1 timeout/)).toBeNull();
    expect(screen.getByText('storage')).toBeTruthy();
  });

  it('does not reuse an old healthy deep result after a new deep request fails', () => {
    mock.deepData = {
      status: 'healthy',
      checks: { database: { status: 'ok' }, storage: { status: 'ok' } },
      stats: { environment: 'staging', version: 'old-sha' },
    };
    mock.deepError = 'R2 indisponível';
    render(<Sistema />);
    fireEvent.click(screen.getByRole('button', { name: 'Verificação completa (D1 + R2)' }));
    expect(screen.getAllByText('PARTIAL').length).toBeGreaterThan(0);
    expect(screen.queryByText('HEALTHY')).toBeNull();
    expect(screen.getByRole('alert').textContent).toContain('R2 indisponível');
  });
});

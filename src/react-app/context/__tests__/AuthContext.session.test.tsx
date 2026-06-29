import React, { useContext } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { ensureValidAccessTokenMock, apiFetchMock } = vi.hoisted(() => ({
  ensureValidAccessTokenMock: vi.fn(),
  apiFetchMock: vi.fn(),
}));

vi.mock('@/react-app/config/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/react-app/config/api')>();
  return {
    ...actual,
    ensureValidAccessToken: ensureValidAccessTokenMock,
  };
});

vi.mock('@/react-app/lib/apiFetch', () => ({
  apiFetch: apiFetchMock,
}));

vi.mock('@/react-app/lib/query-client', () => ({
  queryClient: {
    clear: vi.fn(),
  },
}));

vi.mock('@/react-app/utils/devCredentials', () => ({
  getDevLoginCredentials: vi.fn(() => ({ email: '', password: '' })),
}));

import { AuthProvider } from '../AuthContext';
import { AuthContext } from '../auth-context';

function createStorage(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));

  return {
    getItem: vi.fn((key: string) => (store.has(key) ? store.get(key)! : null)),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, String(value));
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
    clear: vi.fn(() => {
      store.clear();
    }),
    key: vi.fn((index: number) => [...store.keys()][index] ?? null),
    get length() {
      return store.size;
    },
  };
}

function Consumer() {
  const auth = useContext(AuthContext);
  if (!auth) return null;

  return (
    <div>
      <div data-testid="auth-state">{auth.isAuthenticated ? 'auth' : 'anon'}</div>
      <div data-testid="user-email">{auth.user?.email || ''}</div>
    </div>
  );
}

describe('AuthProvider session recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    Object.defineProperty(globalThis, 'localStorage', {
      value: createStorage({
        airtrust_token: 'token-antigo',
        airtrust_refresh_token: 'refresh-token',
        airtrust_user: JSON.stringify({
          id: 1,
          email: 'admin@airtrust.com',
          nome: 'Admin',
          role: 'ADMINISTRADOR',
          permissions: [],
          funcionario_id: 100,
        }),
      }),
      configurable: true,
    });
    Object.defineProperty(globalThis, 'sessionStorage', {
      value: createStorage(),
      configurable: true,
    });
  });

  it('mantém usuário autenticado quando o refresh silencioso funciona na abertura do app', async () => {
    ensureValidAccessTokenMock.mockResolvedValue('token-renovado');
    apiFetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes('/api/auth/me')) {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              id: 1,
              email: 'admin@airtrust.com',
              nome: 'Admin',
              role: 'ADMINISTRADOR',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (url.includes('/api/auth/empresas')) {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              empresaAtualId: 10,
              empresas: [{ id: 10, nome: 'AirTrust', codigo: 'airtrust', role: 'admin' }],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      return new Response(JSON.stringify({ success: false }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('auth-state')).toHaveTextContent('auth');
    });

    expect(screen.getByTestId('user-email')).toHaveTextContent('admin@airtrust.com');
    expect(ensureValidAccessTokenMock).toHaveBeenCalled();
  });
});

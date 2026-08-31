import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  apiFetchMock,
  ensureValidAccessTokenMock,
  getAccessTokenMock,
  getRefreshTokenMock,
  isTerminalAuthRefreshErrorMock,
  refreshAccessTokenMock,
} = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  ensureValidAccessTokenMock: vi.fn(),
  getAccessTokenMock: vi.fn(),
  getRefreshTokenMock: vi.fn(),
  isTerminalAuthRefreshErrorMock: vi.fn(),
  refreshAccessTokenMock: vi.fn(),
}));

vi.mock('@/react-app/config/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/react-app/config/api')>();
  return {
    ...actual,
    ensureValidAccessToken: ensureValidAccessTokenMock,
    getAccessToken: getAccessTokenMock,
    getRefreshToken: getRefreshTokenMock,
    isTerminalAuthRefreshError: isTerminalAuthRefreshErrorMock,
    refreshAccessToken: refreshAccessTokenMock,
  };
});

vi.mock('@/react-app/lib/apiFetch', () => ({
  apiFetch: apiFetchMock,
}));

vi.mock('@/react-app/lib/query-client', () => ({
  queryClient: { clear: vi.fn() },
}));

vi.mock('@/react-app/utils/devCredentials', () => ({
  getDevLoginCredentials: vi.fn(() => ({ email: '', password: '' })),
}));

vi.mock('@/react-app/hooks/usePermissions', () => ({
  usePermissions: () => ({ can: () => true }),
}));

vi.mock('@/react-app/hooks/useOperationalAccess', () => ({
  useOperationalAccess: () => ({
    enabled: false,
    hasDomain: () => false,
  }),
}));

vi.mock('@/react-app/i18n/useLanguage', () => ({
  useLanguage: () => ({ t: (key: string) => key }),
}));

import ProtectedRoute from '../ProtectedRoute';
import { AuthProvider } from '../../context/AuthContext';

function createStorage(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    getItem: vi.fn((key: string) => (store.has(key) ? store.get(key)! : null)),
    setItem: vi.fn((key: string, value: string) => store.set(key, String(value))),
    removeItem: vi.fn((key: string) => store.delete(key)),
    clear: vi.fn(() => store.clear()),
    key: vi.fn((index: number) => [...store.keys()][index] ?? null),
    get length() {
      return store.size;
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const storedUser = {
  id: 1,
  email: 'qa@example.test',
  nome: 'QA User',
  role: 'ADMINISTRADOR',
  permissions: [],
  funcionario_id: null,
};

function meResponse() {
  return new Response(
    JSON.stringify({
      success: true,
      data: storedUser,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

function empresasResponse() {
  return new Response(
    JSON.stringify({
      success: true,
      data: { empresaAtualId: 10, empresas: [] },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

function renderProtectedRoute() {
  return render(
    <MemoryRouter initialEntries={['/rota-protegida']}>
      <AuthProvider>
        <LocationProbe />
        <Routes>
          <Route
            path="/rota-protegida"
            element={
              <ProtectedRoute>
                <div>conteúdo protegido</div>
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<div>login</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('ProtectedRoute auth hydration', () => {
  let currentAccessToken: string | null;
  let currentRefreshToken: string | null;

  beforeEach(() => {
    vi.clearAllMocks();
    currentAccessToken = 'token-valido';
    currentRefreshToken = 'refresh-valido';

    Object.defineProperty(globalThis, 'localStorage', {
      value: createStorage({
        airtrust_token: 'token-valido',
        airtrust_refresh_token: 'refresh-valido',
        airtrust_user: JSON.stringify(storedUser),
      }),
      configurable: true,
    });
    Object.defineProperty(globalThis, 'sessionStorage', {
      value: createStorage(),
      configurable: true,
    });

    ensureValidAccessTokenMock.mockResolvedValue('token-valido');
    getAccessTokenMock.mockImplementation(() => currentAccessToken);
    getRefreshTokenMock.mockImplementation(() => currentRefreshToken);
    isTerminalAuthRefreshErrorMock.mockImplementation(
      (error: { terminal?: boolean } | undefined) => error?.terminal === true,
    );
    refreshAccessTokenMock.mockResolvedValue(undefined);
    apiFetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input).includes('/api/auth/me')) return meResponse();
      return empresasResponse();
    });
  });

  it('cold load com token válido mantém a rota protegida durante e após a hidratação', async () => {
    renderProtectedRoute();

    expect(screen.getByText('protected.loading')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/rota-protegida');
    expect(screen.queryByText('login')).not.toBeInTheDocument();

    await waitFor(() => expect(screen.getByText('conteúdo protegido')).toBeInTheDocument());
    expect(screen.getByTestId('location')).toHaveTextContent('/rota-protegida');
  });

  it('sessão armazenada e /auth/me lento nunca produz redirecionamento transitório', async () => {
    const me = deferred<Response>();
    apiFetchMock.mockImplementation((input: RequestInfo | URL) => {
      if (String(input).includes('/api/auth/me')) return me.promise;
      return Promise.resolve(empresasResponse());
    });

    renderProtectedRoute();

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(1));
    expect(screen.getByText('protected.loading')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/rota-protegida');
    expect(screen.queryByText('login')).not.toBeInTheDocument();

    await act(async () => me.resolve(meResponse()));

    await waitFor(() => expect(screen.getByText('conteúdo protegido')).toBeInTheDocument());
    expect(screen.getByTestId('location')).toHaveTextContent('/rota-protegida');
  });

  it('mantém a rota enquanto refresh é necessário e libera normalmente após a rotação', async () => {
    const refresh = deferred<void>();
    apiFetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input).includes('/api/auth/me')) return new Response(null, { status: 401 });
      return empresasResponse();
    });
    refreshAccessTokenMock.mockImplementation(async () => {
      await refresh.promise;
      currentAccessToken = 'token-rotacionado';
      currentRefreshToken = 'refresh-rotacionado';
    });

    renderProtectedRoute();

    await waitFor(() => expect(refreshAccessTokenMock).toHaveBeenCalledTimes(1));
    expect(screen.getByText('protected.loading')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/rota-protegida');

    await act(async () => refresh.resolve());

    await waitFor(() => expect(screen.getByText('conteúdo protegido')).toBeInTheDocument());
    expect(screen.getByTestId('location')).toHaveTextContent('/rota-protegida');
  });

  it('token inválido termina em login, sem permanecer em loading', async () => {
    apiFetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));
    refreshAccessTokenMock.mockRejectedValue({ terminal: true });

    renderProtectedRoute();

    expect(screen.getByText('protected.loading')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('login')).toBeInTheDocument());
    expect(screen.getByTestId('location')).toHaveTextContent('/login');
  });

  it('token expirado falha fechado e não chama /auth/me', async () => {
    ensureValidAccessTokenMock.mockRejectedValue({ terminal: true });

    renderProtectedRoute();

    await waitFor(() => expect(screen.getByText('login')).toBeInTheDocument());
    expect(screen.getByTestId('location')).toHaveTextContent('/login');
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('ausência de sessão redireciona para login após a hidratação inicial', async () => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: createStorage(),
      configurable: true,
    });

    renderProtectedRoute();

    expect(screen.getByText('protected.loading')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('login')).toBeInTheDocument());
    expect(screen.getByTestId('location')).toHaveTextContent('/login');
    expect(ensureValidAccessTokenMock).not.toHaveBeenCalled();
  });

  it('falha de infraestrutura preserva sessão local e conclui a hidratação', async () => {
    apiFetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input).includes('/api/auth/me')) throw new TypeError('network unavailable');
      return empresasResponse();
    });

    renderProtectedRoute();

    await waitFor(() => expect(screen.getByText('conteúdo protegido')).toBeInTheDocument());
    expect(screen.getByTestId('location')).toHaveTextContent('/rota-protegida');
  });
});

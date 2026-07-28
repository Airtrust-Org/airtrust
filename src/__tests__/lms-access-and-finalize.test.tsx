import React from 'react';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import ProtectedRoute from '@/react-app/components/ProtectedRoute';
import { useFinalizarMatricula } from '@/react-app/hooks/useLms';

const authState = vi.hoisted(() => ({
  isAuthenticated: true,
  isLoading: false,
  user: {
    id: 1,
    email: 'admin@airtrust.online',
    nome: 'Admin Alias',
    role: 'ADMIN',
    permissions: [],
    funcionario_id: 7,
  },
  token: 'token',
}));

const fetchWithAuthMock = vi.hoisted(() => vi.fn());

vi.mock('@/react-app/hooks/useAuth', () => ({
  useAuth: () => authState,
}));

// This suite exercises legacy funcionarios.view/role-based ProtectedRoute
// gating — unrelated to the operational-domain RBAC gate, which stays
// disabled (legacy behavior) by default here.
vi.mock('@/react-app/hooks/useOperationalAccess', () => ({
  useOperationalAccess: () => ({
    enabled: false,
    domains: [],
    setor_ids: [],
    actions: {},
    canOperate: () => false,
    hasDomain: () => false,
    isLoading: false,
    isAuthenticated: true,
  }),
}));

vi.mock('@/react-app/i18n/useLanguage', () => ({
  useLanguage: () => ({
    t: (key: string) =>
      ({
        'protected.loading': 'Carregando',
        'protected.denied.title': 'Acesso Negado',
        'protected.denied.description': 'Sem permissão',
        'protected.denied.backHome': 'Voltar ao Início',
      })[key] ?? key,
  }),
}));

vi.mock('@/react-app/config/api', () => ({
  API_BASE_URL: 'http://localhost:8787/api',
  fetchWithAuth: fetchWithAuthMock,
  getAccessToken: () => 'token',
}));

function FinalizarHarness() {
  const mutation = useFinalizarMatricula();

  return (
    <button type="button" onClick={() => mutation.mutate(10)}>
      Finalizar matrícula
    </button>
  );
}

const funcionariosRoutes = [
  '/funcionarios',
  '/funcionarios/7',
  '/funcionarios/7/perfil',
  '/funcionarios/7/ficha',
] as const;

function renderFuncionariosRoute(pathname: string) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <Routes>
        <Route
          path="*"
          element={
            <ProtectedRoute requiredPermission="funcionarios.view">
              <div>Gestao de funcionarios</div>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('LMS access and finalize regressions', () => {
  beforeEach(() => {
    authState.user.role = 'ADMIN';
    authState.user.permissions = [];
    fetchWithAuthMock.mockReset();
    fetchWithAuthMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          matricula_id: 10,
          novo_status: 'CONCLUIDO',
          progresso_pct: 100,
          qualificacao_gerada: {
            qualificacao_historico_id: 99,
          },
        },
      }),
    });
  });

  it('accepts admin alias in ProtectedRoute requiredRole checks', () => {
    render(
      <MemoryRouter initialEntries={['/treinamentos/planejados']}>
        <Routes>
          <Route
            path="/treinamentos/planejados"
            element={
              <ProtectedRoute requiredRole={['ADMINISTRADOR', 'GESTOR', 'INSTRUTOR']}>
                <div>Central liberada</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Central liberada')).toBeInTheDocument();
    expect(screen.queryByText('Acesso Negado')).not.toBeInTheDocument();
  });

  it.each(funcionariosRoutes)(
    'blocks direct %s access when the user lacks funcionarios.view',
    (pathname) => {
      authState.user.role = 'USUARIO';

      renderFuncionariosRoute(pathname);

      expect(screen.queryByText('Gestao de funcionarios')).not.toBeInTheDocument();
      expect(screen.getByText('Acesso Negado')).toBeInTheDocument();
    },
  );

  it.each(funcionariosRoutes)(
    'keeps %s available for non-manager roles that do have funcionarios.view',
    (pathname) => {
      authState.user.role = 'COMPLIANCE';

      renderFuncionariosRoute(pathname);

      expect(screen.getByText('Gestao de funcionarios')).toBeInTheDocument();
      expect(screen.queryByText('Acesso Negado')).not.toBeInTheDocument();
    },
  );

  it.each([
    ['ADMIN', '/funcionarios/7/perfil'],
    ['GESTOR', '/funcionarios/7/ficha'],
  ])('keeps %s access to protected funcionarios deep links', (role, pathname) => {
    authState.user.role = role;

    renderFuncionariosRoute(pathname);

    expect(screen.getByText('Gestao de funcionarios')).toBeInTheDocument();
    expect(screen.queryByText('Acesso Negado')).not.toBeInTheDocument();
  });

  it('keeps App funcionarios route config protected on every direct deep link', () => {
    const appSource = readFileSync('src/react-app/App.tsx', 'utf8');

    expect(appSource).toMatch(
      /path="\/funcionarios"[\s\S]*?<ProtectedRoute requiredPermission="funcionarios\.view">/,
    );
    expect(appSource).toMatch(
      /path="\/funcionarios\/:id\/ficha"[\s\S]*?<ProtectedRoute requiredPermission="funcionarios\.view">/,
    );
    expect(appSource).toMatch(
      /path="\/funcionarios\/:id"[\s\S]*?<ProtectedRoute requiredPermission="funcionarios\.view">/,
    );
    expect(appSource).toMatch(
      /path="\/funcionarios\/:id\/perfil"[\s\S]*?<ProtectedRoute requiredPermission="funcionarios\.view">/,
    );
  });

  it('posts manual LMS finalization to the endpoint used by content players', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <FinalizarHarness />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /finalizar matrícula/i }));

    await waitFor(() => {
      expect(fetchWithAuthMock).toHaveBeenCalledWith('/api/lms/matriculas/10/finalizar', {
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
    });
  });
});

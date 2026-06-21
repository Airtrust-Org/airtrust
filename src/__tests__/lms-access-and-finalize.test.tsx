import React from 'react';
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

  it('blocks direct /funcionarios access when the user lacks funcionarios.view', () => {
    authState.user.role = 'USUARIO';

    render(
      <MemoryRouter initialEntries={['/funcionarios']}>
        <Routes>
          <Route
            path="/funcionarios"
            element={
              <ProtectedRoute requiredPermission="funcionarios.view">
                <div>Gestao de funcionarios</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.queryByText('Gestao de funcionarios')).not.toBeInTheDocument();
    expect(screen.getByText('Acesso Negado')).toBeInTheDocument();
  });

  it('keeps /funcionarios available for non-manager roles that do have funcionarios.view', () => {
    authState.user.role = 'COMPLIANCE';

    render(
      <MemoryRouter initialEntries={['/funcionarios']}>
        <Routes>
          <Route
            path="/funcionarios"
            element={
              <ProtectedRoute requiredPermission="funcionarios.view">
                <div>Gestao de funcionarios</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Gestao de funcionarios')).toBeInTheDocument();
    expect(screen.queryByText('Acesso Negado')).not.toBeInTheDocument();
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

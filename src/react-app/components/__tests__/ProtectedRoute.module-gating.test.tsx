import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProtectedRoute from '../ProtectedRoute';

const { authMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
}));

vi.mock('@/react-app/hooks/useAuth', () => ({
  useAuth: () => authMock(),
}));

vi.mock('@/react-app/i18n/useLanguage', () => ({
  useLanguage: () => ({
    t: (key: string) => key,
  }),
}));

function renderAt(pathname: string) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <Routes>
        <Route
          path="*"
          element={
            <ProtectedRoute>
              <div>conteudo liberado</div>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ProtectedRoute module gating', () => {
  beforeEach(() => {
    authMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      user: { name: 'Teste Usuario', role: 'GESTOR' },
      empresas: [{ id: 1, nome: 'AirTrust', modulos_ativos: ['dashboard', 'funcionarios'] }],
      empresaAtualId: 1,
    });
  });

  it.each([
    ['/hospedagem', ['dashboard', 'funcionarios']],
    ['/sgso', ['dashboard', 'funcionarios']],
    ['/lms/cursos', ['dashboard', 'funcionarios']],
    ['/treinamentos/planejados', ['dashboard', 'funcionarios']],
  ])('bloqueia %s quando o modulo nao esta ativo', (pathname, modulosAtivos) => {
    authMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      user: { name: 'Teste Usuario', role: 'GESTOR' },
      empresas: [{ id: 1, nome: 'AirTrust', modulos_ativos: modulosAtivos }],
      empresaAtualId: 1,
    });

    renderAt(pathname as string);

    expect(screen.getByText('Modulo indisponivel')).toBeInTheDocument();
    expect(screen.queryByText('conteudo liberado')).toBeNull();
  });

  it.each([
    ['/hospedagem', ['dashboard', 'funcionarios', 'hospedagem']],
    ['/sgso', ['dashboard', 'funcionarios', 'sgso']],
    ['/lms/cursos', ['dashboard', 'funcionarios', 'lms']],
    ['/treinamentos/planejados', ['dashboard', 'funcionarios', 'treinamentos_planejados']],
  ])('permite %s quando o modulo esta ativo', (pathname, modulosAtivos) => {
    authMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      user: { name: 'Teste Usuario', role: 'GESTOR' },
      empresas: [{ id: 1, nome: 'AirTrust', modulos_ativos: modulosAtivos }],
      empresaAtualId: 1,
    });

    renderAt(pathname as string);

    expect(screen.queryByText('Modulo indisponivel')).toBeNull();
    expect(screen.getByText('conteudo liberado')).toBeInTheDocument();
  });

  it('mantem o legado quando modulos_ativos e null', () => {
    authMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      user: { name: 'Teste Usuario', role: 'GESTOR' },
      empresas: [{ id: 1, nome: 'AirTrust', modulos_ativos: null }],
      empresaAtualId: 1,
    });

    renderAt('/sgso');

    expect(screen.queryByText('Modulo indisponivel')).toBeNull();
    expect(screen.getByText('conteudo liberado')).toBeInTheDocument();
  });
});

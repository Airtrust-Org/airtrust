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

function renderAt(pathname: string, requiredRole?: string[]) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <Routes>
        <Route
          path="*"
          element={
            <ProtectedRoute requiredRole={requiredRole}>
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
    ['/mro', ['dashboard', 'funcionarios']],
    ['/controle-voos', ['dashboard', 'funcionarios']],
  ])('bloqueia %s quando o modulo nao esta ativo', (pathname, modulosAtivos) => {
    authMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      user: { name: 'Teste Usuario', role: 'GESTOR' },
      empresas: [{ id: 1, nome: 'AirTrust', modulos_ativos: modulosAtivos }],
      empresaAtualId: 1,
    });

    renderAt(pathname as string);

    expect(screen.getByText('Módulo indisponível')).toBeInTheDocument();
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

    expect(screen.queryByText('Módulo indisponível')).toBeNull();
    expect(screen.getByText('conteudo liberado')).toBeInTheDocument();
  });

  it.each([
    ['/mro', ['dashboard', 'funcionarios', 'mro']],
    ['/controle-voos', ['dashboard', 'funcionarios', 'controle_voos']],
  ])('bloqueia %s para gestor mesmo com modulo ativo', (pathname, modulosAtivos) => {
    authMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      user: { name: 'Gestor', email: 'gestor@empresa.com', role: 'GESTOR' },
      empresas: [{ id: 1, nome: 'AirTrust', modulos_ativos: modulosAtivos }],
      empresaAtualId: 1,
    });

    renderAt(pathname as string);

    expect(screen.getByText('protected.denied.title')).toBeInTheDocument();
    expect(screen.queryByText('conteudo liberado')).toBeNull();
  });

  it.each([
    ['/mro', ['dashboard', 'funcionarios', 'mro']],
    ['/controle-voos', ['dashboard', 'funcionarios', 'controle_voos']],
  ])('permite %s para admin principal allowlisted', (pathname, modulosAtivos) => {
    authMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      user: {
        name: 'Admin Principal',
        email: 'filipe.daumas@icloud.com',
        role: 'ADMINISTRADOR',
      },
      empresas: [{ id: 1, nome: 'AirTrust', modulos_ativos: modulosAtivos }],
      empresaAtualId: 1,
    });

    renderAt(pathname as string);

    expect(screen.queryByText('protected.denied.title')).toBeNull();
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

    expect(screen.queryByText('Módulo indisponível')).toBeNull();
    expect(screen.getByText('conteudo liberado')).toBeInTheDocument();
  });

  it('bloqueia configuracoes para usuario comum', () => {
    authMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      user: { name: 'Aluno', role: 'ALUNO' },
      empresas: [{ id: 1, nome: 'AirTrust', modulos_ativos: ['dashboard', 'funcionarios'] }],
      empresaAtualId: 1,
    });

    renderAt('/configuracoes');

    expect(screen.getByText('protected.denied.title')).toBeInTheDocument();
    expect(screen.queryByText('conteudo liberado')).toBeNull();
  });

  it('permite configuracoes para gestor', () => {
    authMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      user: { name: 'Gestor', role: 'GESTOR' },
      empresas: [{ id: 1, nome: 'AirTrust', modulos_ativos: ['dashboard', 'funcionarios'] }],
      empresaAtualId: 1,
    });

    renderAt('/configuracoes');

    expect(screen.queryByText('protected.denied.title')).toBeNull();
    expect(screen.getByText('conteudo liberado')).toBeInTheDocument();
  });

  it('bloqueia paginas admin para gestor', () => {
    renderAt('/admin/permissoes');

    expect(screen.getByText('protected.denied.title')).toBeInTheDocument();
    expect(screen.queryByText('conteudo liberado')).toBeNull();
  });

  it('permite paginas admin para administrador', () => {
    authMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      user: { name: 'Admin', role: 'ADMINISTRADOR' },
      empresas: [{ id: 1, nome: 'AirTrust', modulos_ativos: ['dashboard', 'funcionarios'] }],
      empresaAtualId: 1,
    });

    renderAt('/admin/permissoes');

    expect(screen.queryByText('protected.denied.title')).toBeNull();
    expect(screen.getByText('conteudo liberado')).toBeInTheDocument();
  });

  it('bloqueia rota administrativa LMS quando requiredRole exclui aluno', () => {
    authMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      user: { name: 'Aluno', role: 'ALUNO' },
      empresas: [{ id: 1, nome: 'AirTrust', modulos_ativos: ['lms'] }],
      empresaAtualId: 1,
    });

    renderAt('/lms/admin/cursos', ['ADMIN', 'GESTOR']);

    expect(screen.getByText('protected.denied.title')).toBeInTheDocument();
    expect(screen.queryByText('conteudo liberado')).toBeNull();
  });
});

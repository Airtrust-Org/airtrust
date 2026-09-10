import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProtectedRoute, { resolveImplicitRequiredRole } from '../ProtectedRoute';

const { authMock, canMock, operationalMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  canMock: vi.fn(),
  operationalMock: vi.fn(),
}));

vi.mock('@/react-app/hooks/useAuth', () => ({
  useAuth: () => authMock(),
}));

vi.mock('@/react-app/hooks/usePermissions', () => ({
  usePermissions: () => ({ can: canMock }),
}));

vi.mock('@/react-app/hooks/useOperationalAccess', () => ({
  useOperationalAccess: () => operationalMock(),
}));

vi.mock('@/react-app/i18n/useLanguage', () => ({
  useLanguage: () => ({ t: (key: string) => key }),
}));

function renderAt(pathname: string, props?: { requiredRole?: string[]; requiredPermission?: string | string[] }) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <Routes>
        <Route path="/login" element={<div>login</div>} />
        <Route
          path="*"
          element={
            <ProtectedRoute
              requiredRole={props?.requiredRole}
              requiredPermission={props?.requiredPermission}
            >
              <div>conteudo liberado</div>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ProtectedRoute coverage guard', () => {
  beforeEach(() => {
    authMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      user: { name: 'Admin', email: 'admin@airtrust.test', role: 'ADMINISTRADOR' },
      empresas: [{ id: 1, nome: 'AirTrust', modulos_ativos: null }],
      empresaAtualId: 1,
    });
    canMock.mockReturnValue(true);
    operationalMock.mockReturnValue({
      enabled: false,
      domains: [],
      setor_ids: [],
      actions: {},
      canOperate: () => false,
      hasDomain: () => true,
      isLoading: false,
      isAuthenticated: true,
    });
  });

  it('resolve papéis implícitos e normaliza barras finais', () => {
    expect(resolveImplicitRequiredRole('/admin/usuarios/')).toEqual(['ADMINISTRADOR']);
    expect(resolveImplicitRequiredRole('/configuracoes/')).toEqual(['ADMINISTRADOR', 'GESTOR']);
    expect(resolveImplicitRequiredRole('/sistema')).toEqual(['ADMINISTRADOR', 'GESTOR']);
    expect(resolveImplicitRequiredRole('/importacao/lote')).toEqual(['ADMINISTRADOR', 'GESTOR']);
    expect(resolveImplicitRequiredRole('/')).toBeUndefined();
    expect(resolveImplicitRequiredRole('')).toBeUndefined();
  });

  it('mostra loading enquanto autenticação carrega', () => {
    authMock.mockReturnValue({ isAuthenticated: false, isLoading: true, user: null, empresas: [], empresaAtualId: null });
    renderAt('/');
    expect(screen.getByText('protected.loading')).toBeInTheDocument();
  });

  it('redireciona usuário não autenticado para login', () => {
    authMock.mockReturnValue({ isAuthenticated: false, isLoading: false, user: null, empresas: [], empresaAtualId: null });
    renderAt('/qualquer');
    expect(screen.getByText('login')).toBeInTheDocument();
  });

  it('bloqueia módulo desativado para a empresa atual', () => {
    authMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      user: { role: 'ADMINISTRADOR' },
      empresas: [{ id: 1, nome: 'AirTrust', modulos_ativos: ['dashboard'] }],
      empresaAtualId: 1,
    });
    renderAt('/mro');
    expect(screen.getByText('Módulo indisponível')).toBeInTheDocument();
  });

  it('bloqueia domínio operacional MRO ausente', () => {
    operationalMock.mockReturnValue({
      enabled: true,
      domains: [],
      setor_ids: [],
      actions: {},
      canOperate: () => false,
      hasDomain: () => false,
      isLoading: false,
      isAuthenticated: true,
    });
    renderAt('/mro');
    expect(screen.getByText('protected.denied.title')).toBeInTheDocument();
  });

  it('bloqueia requiredPermission quando can retorna false', () => {
    canMock.mockReturnValue(false);
    renderAt('/dashboard', { requiredPermission: ['voos.edit', 'voos.create'] });
    expect(screen.getByText('protected.denied.title')).toBeInTheDocument();
  });

  it('permite requiredPermission quando can retorna true', () => {
    renderAt('/dashboard', { requiredPermission: 'voos.view' });
    expect(screen.getByText('conteudo liberado')).toBeInTheDocument();
  });

  it.each([
    ['ADMIN', ['ADMINISTRADOR']],
    ['MANAGER', ['GESTOR']],
    ['INSTRUCTOR', ['INSTRUTOR']],
    ['STUDENT', ['ALUNO']],
  ])('aceita alias legado de role %s', (role, requiredRole) => {
    authMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      user: { role },
      empresas: [{ id: 1, nome: 'AirTrust', modulos_ativos: null }],
      empresaAtualId: 1,
    });
    renderAt('/dashboard', { requiredRole });
    expect(screen.getByText('conteudo liberado')).toBeInTheDocument();
  });

  it('nega role incompatível explicitamente', () => {
    authMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      user: { role: 'ALUNO' },
      empresas: [{ id: 1, nome: 'AirTrust', modulos_ativos: null }],
      empresaAtualId: 1,
    });
    renderAt('/dashboard', { requiredRole: ['GESTOR'] });
    expect(screen.getByText('protected.denied.title')).toBeInTheDocument();
  });

  it('ignora requiredRole vazio e libera a rota', () => {
    authMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      user: { role: 'ALUNO' },
      empresas: [{ id: 1, nome: 'AirTrust', modulos_ativos: null }],
      empresaAtualId: 1,
    });
    renderAt('/dashboard', { requiredRole: [] });
    expect(screen.getByText('conteudo liberado')).toBeInTheDocument();
  });
});

import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Configuracoes from '../Configuracoes';

const { authMock, permissionsMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  permissionsMock: vi.fn(),
}));

vi.mock('../../components/AppLayout', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => authMock(),
}));

vi.mock('../../hooks/usePermissions', () => ({
  usePermissions: () => permissionsMock(),
}));

vi.mock('../../utils/lazyWithRetry', () => ({
  lazyWithRetry: (_loader: unknown, name: string) => () => <div>{name}</div>,
}));

vi.mock('../../i18n/useLanguage', () => ({
  useLanguage: () => ({
    t: (key: string) =>
      ({
        'settings.page.title': 'Configurações',
        'settings.page.subtitle': 'Gerencie as configurações do sistema e da sua organização',
        'settings.tab.companies': 'Empresas',
        'settings.tab.users': 'Usuários',
        'settings.tab.registry': 'Cadastros',
        'settings.tab.backup': 'Backup',
        'settings.tab.imports': 'Importações e Exportações',
        'settings.tab.integrations': 'Integrações',
        'settings.tab.system': 'Sistema',
      })[key] ?? key,
  }),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <Configuracoes />
    </MemoryRouter>,
  );
}

describe('Configuracoes visibility', () => {
  beforeEach(() => {
    authMock.mockReturnValue({
      empresaAtualId: 1,
      empresas: [{ id: 1, nome: 'AirTrust', codigo: 'AT', role: 'GESTOR' }],
    });
  });

  it('oculta abas administrativas restritas para gestor', () => {
    permissionsMock.mockReturnValue({
      isAdmin: false,
      isGestor: true,
    });

    renderPage();

    expect(screen.queryByRole('tab', { name: 'Empresas' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Usuários' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Backup' })).toBeNull();

    expect(screen.getByRole('tab', { name: 'Cadastros' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Gestores por Setor' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Matriz de Treinamentos' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Importações e Exportações' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Integrações' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Sistema' })).toBeInTheDocument();
  });

  it('mantem abas administrativas para admin geral', () => {
    permissionsMock.mockReturnValue({
      isAdmin: true,
      isGestor: false,
    });

    authMock.mockReturnValue({
      empresaAtualId: 1,
      empresas: [{ id: 1, nome: 'AirTrust', codigo: 'AT', role: 'ADMINISTRADOR' }],
    });

    renderPage();

    expect(screen.getByRole('tab', { name: 'Empresas' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Usuários' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Backup' })).toBeInTheDocument();
  });
});

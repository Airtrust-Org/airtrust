import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AppLayout from '../AppLayout';

const { authMock, permissionsMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  permissionsMock: vi.fn(),
}));

vi.mock('@/react-app/lib/hardRefresh', () => ({
  hardRefreshApp: vi.fn(async () => undefined),
}));

vi.mock('../VersionBadge', () => ({
  VersionBadge: () => <div>version</div>,
}));

vi.mock('../NotificacoesSistema', () => ({
  NotificacoesSistema: () => <div>notificacoes-sistema</div>,
}));

vi.mock('../NotificacoesEscala', () => ({
  NotificacoesEscala: () => <div>notificacoes-escala</div>,
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => authMock(),
}));

vi.mock('../../hooks/usePermissions', () => ({
  usePermissions: () => permissionsMock(),
}));

vi.mock('../../hooks/useSystemSettings', () => ({
  useSystemSettings: () => ({
    logoSrc: '/logo.png',
    settings: { compactHeader: false },
  }),
}));

vi.mock('../../i18n/useLanguage', () => ({
  useLanguage: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('../../theme/ThemeProvider', () => ({
  useTheme: () => ({
    isDark: false,
    toggleTheme: vi.fn(),
  }),
}));

describe('AppLayout module gating', () => {
  beforeEach(() => {
    authMock.mockReturnValue({
      user: { nome: 'Teste Usuario', role: 'GESTOR' },
      logout: vi.fn(),
      empresas: [{ id: 1, nome: 'AirTrust', modulos_ativos: ['dashboard', 'funcionarios'] }],
      empresaAtualId: 1,
      selectEmpresa: vi.fn(async () => undefined),
    });
    permissionsMock.mockReturnValue({
      can: (permission: string) => permission === 'dashboard.view' || permission === 'sgso.view',
      isAdmin: false,
      isGestor: true,
      isInstrutor: false,
      isAluno: false,
    });
  });

  it('oculta LMS e SGSO quando a empresa nao libera esses modulos', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppLayout>
          <div>conteudo</div>
        </AppLayout>
      </MemoryRouter>,
    );

    expect(screen.queryByRole('link', { name: 'LMS' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'SGSO' })).toBeNull();
    expect(screen.getAllByRole('link', { name: 'layout.nav.dashboard' }).length).toBeGreaterThan(0);
  });

  it('exibe LMS e SGSO quando os modulos beta estao ativos', () => {
    authMock.mockReturnValue({
      user: { nome: 'Teste Usuario', role: 'GESTOR' },
      logout: vi.fn(),
      empresas: [{ id: 1, nome: 'AirTrust', modulos_ativos: ['dashboard', 'lms', 'sgso'] }],
      empresaAtualId: 1,
      selectEmpresa: vi.fn(async () => undefined),
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <AppLayout>
          <div>conteudo</div>
        </AppLayout>
      </MemoryRouter>,
    );

    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Treinamentos' }));

    expect(screen.getByRole('link', { name: 'LMS / Cursos EAD' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Painel' })).toBeNull();
    expect(screen.getByRole('link', { name: 'SGSO PRÉVIA' })).toBeInTheDocument();
  });

  it('mantém a entrada LMS para aluno quando o módulo está ativo', () => {
    authMock.mockReturnValue({
      user: { nome: 'Aluno Teste', role: 'ALUNO' },
      logout: vi.fn(),
      empresas: [{ id: 1, nome: 'AirTrust', modulos_ativos: ['lms'] }],
      empresaAtualId: 1,
      selectEmpresa: vi.fn(async () => undefined),
    });
    permissionsMock.mockReturnValue({
      can: () => false,
      isAdmin: false,
      isGestor: false,
      isInstrutor: false,
      isAluno: true,
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <AppLayout>
          <div>conteudo</div>
        </AppLayout>
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'LMS' })).toHaveAttribute('href', '/lms/cursos');
  });

  it('oculta Manutencao e Controle de Voos para admin comum', () => {
    authMock.mockReturnValue({
      user: {
        nome: 'Admin Comum',
        email: 'admin@empresa.com',
        role: 'ADMINISTRADOR',
      },
      logout: vi.fn(),
      empresas: [
        {
          id: 1,
          nome: 'AirTrust',
          modulos_ativos: ['dashboard', 'mro', 'controle_voos'],
        },
      ],
      empresaAtualId: 1,
      selectEmpresa: vi.fn(async () => undefined),
    });
    permissionsMock.mockReturnValue({
      can: () => true,
      isAdmin: true,
      isGestor: false,
      isInstrutor: false,
      isAluno: false,
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <AppLayout>
          <div>conteudo</div>
        </AppLayout>
      </MemoryRouter>,
    );

    expect(screen.getAllByRole('link', { name: 'layout.nav.dashboard' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: /Manutenção/i })).toBeNull();
    expect(screen.queryByRole('link', { name: /Controle de Voos/i })).toBeNull();
  });

  it('exibe Manutencao e Controle de Voos para admin principal allowlisted', () => {
    authMock.mockReturnValue({
      user: {
        nome: 'Filipe Daumas',
        email: 'filipe.daumas@icloud.com',
        role: 'ADMINISTRADOR',
      },
      logout: vi.fn(),
      empresas: [
        {
          id: 1,
          nome: 'AirTrust',
          modulos_ativos: ['dashboard', 'mro', 'controle_voos'],
        },
      ],
      empresaAtualId: 1,
      selectEmpresa: vi.fn(async () => undefined),
    });
    permissionsMock.mockReturnValue({
      can: () => true,
      isAdmin: true,
      isGestor: false,
      isInstrutor: false,
      isAluno: false,
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <AppLayout>
          <div>conteudo</div>
        </AppLayout>
      </MemoryRouter>,
    );

    expect(screen.getAllByRole('link', { name: 'layout.nav.dashboard' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /Manutenção/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /Controle de Voos/i }).length).toBeGreaterThan(0);
  });
});

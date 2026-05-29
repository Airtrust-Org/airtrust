import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import AppLayout from '../AppLayout';
import { hardRefreshApp } from '@/react-app/lib/hardRefresh';

const logoutMock = vi.fn();
const toggleThemeMock = vi.fn();
const hardRefreshMock = vi.mocked(hardRefreshApp);

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
  useAuth: () => ({
    user: { nome: 'Teste Usuario', role: 'GESTOR' },
    logout: logoutMock,
    empresas: [{ id: 1, nome: 'AirTrust' }],
    empresaAtualId: 1,
    selectEmpresa: vi.fn(async () => undefined),
  }),
}));

vi.mock('../../hooks/usePermissions', () => ({
  usePermissions: () => ({
    can: (permission: string) => permission === 'frms.view',
    isAdmin: false,
    isGestor: true,
    isInstrutor: false,
    isAluno: false,
  }),
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
    toggleTheme: toggleThemeMock,
  }),
}));

describe('AppLayout hard refresh action', () => {
  beforeEach(() => {
    hardRefreshMock.mockClear();
    logoutMock.mockClear();
    toggleThemeMock.mockClear();
  });

  it('renderiza acao Atualizar app e dispara hard refresh no clique', async () => {
    render(
      <MemoryRouter initialEntries={['/frms/fadiga-checkin']}>
        <AppLayout>
          <div>conteudo</div>
        </AppLayout>
      </MemoryRouter>,
    );

    const updateButtons = screen.getAllByRole('button', { name: /Atualizar app/i });
    expect(updateButtons.length).toBeGreaterThan(0);

    fireEvent.click(updateButtons[0]);

    await waitFor(() => expect(hardRefreshMock).toHaveBeenCalledTimes(1));
  });
});

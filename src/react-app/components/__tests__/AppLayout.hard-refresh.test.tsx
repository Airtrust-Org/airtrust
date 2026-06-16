import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import AppLayout from '../AppLayout';
import { hardRefreshApp } from '@/react-app/lib/hardRefresh';
import { apiClient } from '@/react-app/services/apiClient';

const logoutMock = vi.fn();
const toggleThemeMock = vi.fn();
const hardRefreshMock = vi.mocked(hardRefreshApp);
const apiPostMock = vi.mocked(apiClient.post);

vi.mock('@/react-app/lib/hardRefresh', () => ({
  hardRefreshApp: vi.fn(async () => undefined),
}));

vi.mock('@/react-app/services/apiClient', () => ({
  apiClient: {
    post: vi.fn(async () => ({
      success: true,
      data: {
        success: true,
        data: {
          mode: 'preview',
          enabled: true,
          tenantScoped: true,
          writesEnabled: false,
          realApiCalled: false,
          status: 'READY',
          counts: {
            stagingTotal: 0,
            stagingPending: 0,
            stagingProcessed: 0,
            stagingConflict: 0,
            openConflicts: 0,
            importedFlights: 0,
            importedStages: 0,
            importedCrew: 0,
          },
        },
      },
    })),
  },
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
    vi.stubEnv('VITE_SIGVOOS_REFRESH_PREVIEW_ENABLED', 'false');
    (import.meta as unknown as { env: Record<string, string> }).env.VITE_SIGVOOS_REFRESH_PREVIEW_ENABLED =
      'false';
    hardRefreshMock.mockClear();
    apiPostMock.mockClear();
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
    expect(apiPostMock).not.toHaveBeenCalled();
  });

  it('chama preview SIGVOOS antes do hard refresh quando flag esta ativa', async () => {
    vi.stubEnv('VITE_SIGVOOS_REFRESH_PREVIEW_ENABLED', 'true');
    (import.meta as unknown as { env: Record<string, string> }).env.VITE_SIGVOOS_REFRESH_PREVIEW_ENABLED =
      'true';

    render(
      <MemoryRouter initialEntries={['/controle-voos']}>
        <AppLayout>
          <div>conteudo</div>
        </AppLayout>
      </MemoryRouter>,
    );

    const updateButtons = screen.getAllByRole('button', { name: /Atualizar app/i });
    fireEvent.click(updateButtons[0]);

    await waitFor(() =>
      expect(apiPostMock).toHaveBeenCalledWith(
        '/controle-voos/sigvoos/sync-preview',
        {},
        { retry: 0, skipRequestControl: true },
      ),
    );
    await waitFor(() => expect(hardRefreshMock).toHaveBeenCalledTimes(1));
  });
});

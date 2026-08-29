import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { FrmsOperationalAccess } from '@/react-app/hooks/useFrmsOperationalAccess';
import FrmsWorkspaceNav from '../components/FrmsWorkspaceNav';

const useFrmsOperationalAccessMock = vi.fn();

vi.mock('@/react-app/hooks/useFrmsOperationalAccess', () => ({
  useFrmsOperationalAccess: (...args: unknown[]) => useFrmsOperationalAccessMock(...args),
}));

vi.mock('../components/FrmsSourcePolicyBanner', () => ({
  default: () => <div data-testid="sigvoos-health">Saúde SIGVOOS</div>,
}));

function access(overrides: Partial<FrmsOperationalAccess> = {}): FrmsOperationalAccess {
  return {
    administrative_role: 'ADMIN',
    enabled: true,
    domains: ['FRMS'],
    setor_ids: [],
    actions: {},
    frms_profile: 'flight',
    employee: null,
    can_manage_maintenance: true,
    maintenance_setor_ids: [],
    ...overrides,
  };
}

function mockAccess(data: FrmsOperationalAccess) {
  useFrmsOperationalAccessMock.mockReturnValue({
    data,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  });
}

function renderNav(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <FrmsWorkspaceNav />
    </MemoryRouter>,
  );
}

describe('FrmsWorkspaceNav', () => {
  it('separa Operações e Manutenção e expõe o check-in de fadiga como ação direta', () => {
    mockAccess(access());
    renderNav('/frms');

    const nav = screen.getByRole('navigation', { name: 'Áreas FRMS' });
    expect(within(nav).getAllByRole('link').map((link) => link.textContent?.trim())).toEqual([
      'Operações',
      'Manutenção',
      'Casos',
      'Administração',
      'Check-in de fadiga',
    ]);
    expect(within(nav).getByRole('link', { name: 'Operações' })).toHaveAttribute('href', '/frms?area=operacoes');
    expect(within(nav).getByRole('link', { name: 'Manutenção' })).toHaveAttribute('href', '/frms?area=manutencao');
    expect(within(nav).getByRole('link', { name: /check-in de fadiga/i })).toHaveAttribute('href', '/frms/checkin');
    expect(screen.queryByRole('navigation', { name: 'Administração FRMS' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('sigvoos-health')).not.toBeInTheDocument();
  });

  it('não oferece Manutenção a quem gerencia apenas operações, mesmo com ?area=manutencao', () => {
    mockAccess(access({ administrative_role: 'GESTOR', domains: ['OPERACOES'], can_manage_maintenance: false }));
    renderNav('/frms?area=manutencao');

    const nav = screen.getByRole('navigation', { name: 'Áreas FRMS' });
    expect(within(nav).queryByRole('link', { name: 'Manutenção' })).not.toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'Operações' })).toBeInTheDocument();
  });

  it('agrupa Administração e não duplica o check-in dentro dos dados de entrada', () => {
    mockAccess(access());
    renderNav('/frms/configuracoes');

    expect(screen.getByTestId('sigvoos-health')).toBeInTheDocument();
    const admin = screen.getByRole('navigation', { name: 'Administração FRMS' });
    expect(within(admin).getByText('Configuração')).toBeInTheDocument();
    expect(within(admin).getByText('Dados de entrada')).toBeInTheDocument();
    expect(within(admin).getByText('Consulta')).toBeInTheDocument();
    expect(within(admin).getByRole('link', { name: 'Parâmetros' })).toHaveAttribute('href', '/frms/configuracoes');
    expect(within(admin).getByRole('link', { name: 'SIGVOOS' })).toHaveAttribute('href', '/frms/sigvoos');
    expect(within(admin).queryByRole('link', { name: /check-in/i })).not.toBeInTheDocument();
    expect(within(admin).getByRole('link', { name: 'Relatórios' })).toHaveAttribute('href', '/frms/relatorios');
  });

  it('marca o check-in como ação ativa sem transformar a tela em Administração', () => {
    mockAccess(access());
    renderNav('/frms/checkin');

    const checkin = screen.getByRole('link', { name: /check-in de fadiga/i });
    expect(checkin.className).toContain('bg-emerald-600');
    expect(screen.queryByRole('navigation', { name: 'Administração FRMS' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('sigvoos-health')).not.toBeInTheDocument();
  });
});

import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import FrmsWorkspaceNav from '../components/FrmsWorkspaceNav';

vi.mock('../components/FrmsSourcePolicyBanner', () => ({
  default: () => <div data-testid="sigvoos-health">Saúde SIGVOOS</div>,
}));

function renderNav(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <FrmsWorkspaceNav />
    </MemoryRouter>,
  );
}

describe('FrmsWorkspaceNav', () => {
  it('mantém as três áreas primárias e expõe o check-in de fadiga como ação direta', () => {
    renderNav('/frms');

    const nav = screen.getByRole('navigation', { name: 'Áreas FRMS' });
    expect(within(nav).getAllByRole('link').map((link) => link.textContent?.trim())).toEqual([
      'Operação',
      'Casos',
      'Administração',
      'Check-in de fadiga',
    ]);
    expect(within(nav).getByRole('link', { name: /check-in de fadiga/i })).toHaveAttribute('href', '/frms/checkin');
    expect(screen.queryByRole('navigation', { name: 'Administração FRMS' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('sigvoos-health')).not.toBeInTheDocument();
  });

  it('agrupa Administração e não duplica o check-in dentro dos dados de entrada', () => {
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
    renderNav('/frms/checkin');

    const checkin = screen.getByRole('link', { name: /check-in de fadiga/i });
    expect(checkin.className).toContain('bg-emerald-600');
    expect(screen.queryByRole('navigation', { name: 'Administração FRMS' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('sigvoos-health')).not.toBeInTheDocument();
  });
});

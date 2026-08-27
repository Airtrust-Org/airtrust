import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import FrmsWorkspaceNav from '../components/FrmsWorkspaceNav';

function renderNav(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <FrmsWorkspaceNav />
    </MemoryRouter>,
  );
}

describe('FrmsWorkspaceNav', () => {
  it('mantém somente Operação, Casos e Administração como áreas primárias', () => {
    renderNav('/frms');

    const nav = screen.getByRole('navigation', { name: 'Áreas FRMS' });
    expect(within(nav).getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Operação',
      'Casos',
      'Administração',
    ]);
    expect(screen.queryByRole('navigation', { name: 'Administração FRMS' })).not.toBeInTheDocument();
  });

  it('agrupa Administração em configuração, dados de entrada e consulta', () => {
    renderNav('/frms/configuracoes');

    const admin = screen.getByRole('navigation', { name: 'Administração FRMS' });
    expect(within(admin).getByText('Configuração')).toBeInTheDocument();
    expect(within(admin).getByText('Dados de entrada')).toBeInTheDocument();
    expect(within(admin).getByText('Consulta')).toBeInTheDocument();
    expect(within(admin).getByRole('link', { name: 'Parâmetros' })).toHaveAttribute('href', '/frms/configuracoes');
    expect(within(admin).getByRole('link', { name: 'SIGVOOS' })).toHaveAttribute('href', '/frms/sigvoos');
    expect(within(admin).getByRole('link', { name: 'Check-in diário' })).toHaveAttribute('href', '/frms/checkin');
    expect(within(admin).getByRole('link', { name: 'Relatórios' })).toHaveAttribute('href', '/frms/relatorios');
  });
});

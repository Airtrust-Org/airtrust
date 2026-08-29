import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigate = vi.hoisted(() => vi.fn());

vi.mock('@/react-app/components/AppLayout', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@/react-app/components/PageHeader', () => ({
  default: ({ title, subtitle }: { title: string; subtitle?: string }) => (
    <header>
      <h1>{title}</h1>
      {subtitle ? <p>{subtitle}</p> : null}
    </header>
  ),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

import ConfiguracoesCadastros from '../index';

describe('ConfiguracoesCadastros', () => {
  beforeEach(() => {
    navigate.mockReset();
  });

  it('uses the canonical page chrome and presents configuration instead of dashboard counters', () => {
    render(<ConfiguracoesCadastros />);

    expect(screen.getByRole('heading', { name: 'Configurações de Simuladores' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Cadastros operacionais' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Simuladores/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Modelos de sessão/i })).toBeInTheDocument();
    expect(screen.queryByText(/^0$/)).not.toBeInTheDocument();
  });

  it('navigates directly from the route without requiring an injected callback', () => {
    render(<ConfiguracoesCadastros />);

    fireEvent.click(screen.getByRole('button', { name: /Manobras/i }));
    expect(navigate).toHaveBeenCalledWith('/simuladores/cadastros/manobras');
  });
});

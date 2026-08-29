import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../components/AppLayout', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('../../components/PageHeader', () => ({
  default: ({ title, subtitle }: { title: string; subtitle?: string }) => (
    <header>
      <h1>{title}</h1>
      {subtitle ? <p>{subtitle}</p> : null}
    </header>
  ),
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    empresaAtualId: 1,
    empresas: [{ id: 1, nome: 'Empresa Teste', codigo: 'TESTE' }],
  }),
}));

vi.mock('../../hooks/usePermissions', () => ({
  usePermissions: () => ({ isAdmin: true, isGestor: true }),
}));

vi.mock('@/react-app/i18n/useLanguage', () => ({
  useLanguage: () => ({ t: (key: string) => key }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useSearchParams: () => [new URLSearchParams()],
  };
});

vi.mock('../../utils/lazyWithRetry', () => ({
  lazyWithRetry: (_loader: unknown, key: string) => () => <div data-testid={key}>{key}</div>,
}));

import Configuracoes from '../Configuracoes';

describe('Configuracoes information architecture', () => {
  it('opens organization settings instead of company administration by default', () => {
    render(<Configuracoes />);

    expect(screen.getByText('Configuração da organização')).toBeInTheDocument();
    expect(screen.getByText('Administração e manutenção')).toBeInTheDocument();
    expect(screen.getByTestId('ConfiguracoesCadastrosTab')).toBeInTheDocument();
    expect(screen.queryByTestId('ConfiguracoesGestaoEmpresasTab')).not.toBeInTheDocument();

    const registryTab = screen.getByRole('tab', { name: 'settings.tab.registry' });
    const companyTab = screen.getByRole('tab', { name: 'settings.tab.companies' });
    expect(registryTab).toHaveAttribute('aria-selected', 'true');
    expect(companyTab).toHaveAttribute('aria-selected', 'false');
  });

  it('keeps administration available without making it the default context', () => {
    render(<Configuracoes />);

    fireEvent.click(screen.getByRole('tab', { name: 'settings.tab.companies' }));

    expect(screen.getByTestId('ConfiguracoesGestaoEmpresasTab')).toBeInTheDocument();
    expect(screen.queryByTestId('ConfiguracoesCadastrosTab')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'settings.tab.companies' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('uses the canonical header and keeps organization/admin groups distinct', () => {
    render(<Configuracoes />);

    expect(screen.getByRole('heading', { name: 'settings.page.title' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Configure primeiro a operação da organização. Administração e manutenção ficam separadas abaixo.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('tablist', { name: 'Configuração da organização' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('tablist', { name: 'Administração e manutenção' })).toBeInTheDocument();
  });
});

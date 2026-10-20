import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BombeirosFrmsPage, { isBombeirosPortalTenant } from '../BombeirosFrmsPage';

const useAuthMock = vi.fn();
vi.mock('@/react-app/hooks/useAuth', () => ({
  useAuth: (...args: unknown[]) => useAuthMock(...args),
}));
vi.mock('@/react-app/components/AppLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('../BombeirosMethodologyDemo', () => ({
  default: () => <div data-testid="boa-methodology-consumer">Método BOA</div>,
}));
vi.mock('../BombeirosWorkforcePanel', () => ({
  default: () => <div data-testid="boa-workforce-consumer">Funcionários BOA</div>,
}));
vi.mock('../BombeirosMonthlyReportPreview', () => ({
  default: () => <div data-testid="boa-monthly-management-preview">Painel mensal exclusivo</div>,
}));

describe('Portal separado BOA/CBMMG', () => {
  beforeEach(() => useAuthMock.mockReset());

  it.each([
    { id: 6, codigo: 'costadosol' },
    { id: 6, codigo: 'bombeiros' },
    { id: 130, codigo: 'airtrust' },
    { id: 130, codigo: 'costadosol' },
  ])('recusa exibição de BOA para empresa $id / $codigo', (empresa) => {
    expect(isBombeirosPortalTenant(empresa)).toBe(false);
    useAuthMock.mockReturnValue({
      empresaAtualId: empresa.id,
      empresas: [{ ...empresa, nome: 'QA', role: 'ADMINISTRADOR', is_primary: 1, is_current: 1 }],
    });
    render(<BombeirosFrmsPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('exclusivo da empresa Bombeiros');
    expect(screen.queryByTestId('boa-monthly-management-preview')).not.toBeInTheDocument();
    expect(screen.queryByTestId('boa-workforce-consumer')).not.toBeInTheDocument();
    expect(screen.queryByTestId('boa-methodology-consumer')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Cadastro de funcionários/i })).not.toBeInTheDocument();
  });

  it('permite UI exclusiva quando código e ID são do tenant Bombeiros', () => {
    useAuthMock.mockReturnValue({
      empresaAtualId: 130,
      empresas: [{ id: 130, codigo: 'bombeiros', nome: 'Bombeiros',
        role: 'ADMINISTRADOR', is_primary: 1, is_current: 1 }],
    });
    render(<BombeirosFrmsPage />);
    expect(screen.getByTestId('boa-monthly-management-preview')).toBeInTheDocument();
    expect(screen.getByTestId('boa-workforce-consumer')).toBeInTheDocument();
    expect(screen.getByTestId('boa-methodology-consumer')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Cadastro de funcionários/i })).toHaveAttribute('href', '/funcionarios');
  });
});

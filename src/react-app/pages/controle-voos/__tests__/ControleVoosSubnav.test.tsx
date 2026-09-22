import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ControleVoosSubnav, {
  CONTROLE_VOOS_NAV_LINKS,
  getVisibleControleVoosNavLinks,
  isControleVoosLinkActive,
  resolveActiveControleVoosLink,
} from '../components/ControleVoosSubnav';

const mockNavigate = vi.fn();
const authMock = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('@/react-app/hooks/useAuth', () => ({
  useAuth: () => authMock(),
}));

describe('ControleVoosSubnav navigation contract (N-03)', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    authMock.mockReturnValue({
      user: {
        email: 'filipe.daumas@icloud.com',
        role: 'ADMINISTRADOR',
      },
    });
  });

  it('keeps five registered destinations while visibility is role-oriented', () => {
    expect(CONTROLE_VOOS_NAV_LINKS).toHaveLength(5);
    const paths = CONTROLE_VOOS_NAV_LINKS.map((link) => link.to);
    expect(paths).toEqual([
      '/controle-voos',
      '/controle-voos/meus-voos',
      '/controle-voos/coordenacao/fila',
      '/controle-voos/relatorios',
      '/controle-voos/tabelas',
    ]);
  });

  it('limits pilot navigation to self-service routes instead of showing denied tabs', () => {
    const links = getVisibleControleVoosNavLinks({
      email: 'piloto@empresa.com',
      role: 'ALUNO',
    });
    expect(links.map((link) => link.to)).toEqual(['/controle-voos/meus-voos']);
  });

  it('shows operational navigation to Gestor/Manager without the pilot-only Meus voos tab', () => {
    for (const role of ['GESTOR', 'MANAGER']) {
      const links = getVisibleControleVoosNavLinks({
        email: 'coordenacao@empresa.com',
        role,
      });
      expect(links.map((link) => link.to)).toEqual([
        '/controle-voos',
        '/controle-voos/coordenacao/fila',
        '/controle-voos/relatorios',
        '/controle-voos/tabelas',
      ]);
    }
  });

  it('shows coordination navigation without Meus voos to a configurable Coordenação grant', () => {
    const links = getVisibleControleVoosNavLinks({
      email: 'coordenacao@empresa.com',
      role: 'USUARIO',
      permissions: ['GRANT:controle_voos.view'],
    });
    expect(links.map((link) => link.to)).toEqual([
      '/controle-voos',
      '/controle-voos/coordenacao/fila',
      '/controle-voos/relatorios',
      '/controle-voos/tabelas',
    ]);
  });

  it('honors explicit deny above Gestor role', () => {
    const links = getVisibleControleVoosNavLinks({
      email: 'gestor@empresa.com',
      role: 'GESTOR',
      permissions: ['DENY:controle_voos.view'],
    });
    expect(links.map((link) => link.to)).toEqual(['/controle-voos/meus-voos']);
  });

  it('correctly resolves active link on exact and nested routes', () => {
    expect(
      isControleVoosLinkActive('/controle-voos', {
        to: '/controle-voos',
        label: 'Operação',
        exact: true,
        activePrefixes: ['/controle-voos/voos', '/controle-voos/rdv'],
      }),
    ).toBe(true);
    expect(
      isControleVoosLinkActive('/controle-voos/dashboard', {
        to: '/controle-voos',
        label: 'Operação',
        exact: true,
        activePrefixes: ['/controle-voos/voos', '/controle-voos/rdv'],
      }),
    ).toBe(true);
    expect(resolveActiveControleVoosLink('/controle-voos/voos/123').label).toBe('Operação');
    expect(resolveActiveControleVoosLink('/controle-voos/rdv/456').label).toBe('Operação');
    expect(resolveActiveControleVoosLink('/controle-voos/jornadas').label).toBe(
      'Relatórios e exportações',
    );

    const activeForNested = resolveActiveControleVoosLink('/controle-voos/coordenacao/fila');
    expect(activeForNested.label).toBe('Coordenação');
  });

  it('renders mobile accessible select without pilot-only Meus voos for the primary admin', () => {
    render(
      <MemoryRouter initialEntries={['/controle-voos/relatorios']}>
        <ControleVoosSubnav />
      </MemoryRouter>,
    );

    const mobileSelect = screen.getByRole('combobox', {
      name: /navegação do controle de voos/i,
    });
    expect(mobileSelect).toBeInTheDocument();
    expect(mobileSelect).toHaveClass('min-h-[44px]');
    expect(mobileSelect).toHaveValue('/controle-voos/relatorios');

    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(4);
    expect(options.map((opt) => (opt as HTMLOptionElement).value)).toEqual([
      '/controle-voos',
      '/controle-voos/coordenacao/fila',
      '/controle-voos/relatorios',
      '/controle-voos/tabelas',
    ]);
  });

  it('renders only Meus voos for pilot/aluno', () => {
    authMock.mockReturnValue({
      user: { email: 'piloto@empresa.com', role: 'ALUNO' },
    });
    render(
      <MemoryRouter initialEntries={['/controle-voos/meus-voos']}>
        <ControleVoosSubnav />
      </MemoryRouter>,
    );

    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getByRole('link')).toHaveTextContent('Meus voos');
    expect(screen.queryByText('Cadastros')).toBeNull();
    expect(screen.queryByText('Coordenação')).toBeNull();
  });

  it('navigates via mobile select while preserving query search params', () => {
    render(
      <MemoryRouter initialEntries={['/controle-voos?data=2026-09-04']}>
        <ControleVoosSubnav />
      </MemoryRouter>,
    );

    const mobileSelect = screen.getByRole('combobox', {
      name: /navegação do controle de voos/i,
    });
    fireEvent.change(mobileSelect, { target: { value: '/controle-voos/coordenacao/fila' } });

    expect(mockNavigate).toHaveBeenCalledWith('/controle-voos/coordenacao/fila?data=2026-09-04');
  });

  it('renders desktop navigation with accessible landmark, aria-current and touch target height', () => {
    render(
      <MemoryRouter initialEntries={['/controle-voos/voos']}>
        <ControleVoosSubnav />
      </MemoryRouter>,
    );

    const nav = screen.getByRole('navigation', {
      name: /navegação do controle de voos/i,
    });
    expect(nav).toBeInTheDocument();

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(4);

    const activeLink = links.find((link) => link.getAttribute('aria-current') === 'page');
    expect(activeLink).toBeDefined();
    expect(activeLink).toHaveTextContent('Operação');
    expect(activeLink).toHaveAttribute('href', '/controle-voos');
    expect(activeLink).toHaveClass('min-h-[44px]');
  });
});

import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import ControleVoosSubnav, {
  CONTROLE_VOOS_NAV_LINKS,
  isControleVoosLinkActive,
  resolveActiveControleVoosLink,
} from '../components/ControleVoosSubnav';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe('ControleVoosSubnav navigation contract (N-03)', () => {
  it('contains exactly 10 canonical options without loss of routes', () => {
    expect(CONTROLE_VOOS_NAV_LINKS).toHaveLength(10);
    const paths = CONTROLE_VOOS_NAV_LINKS.map((link) => link.to);
    expect(paths).toEqual([
      '/controle-voos',
      '/controle-voos/voos',
      '/controle-voos/rdv',
      '/controle-voos/meus-voos',
      '/controle-voos/coordenacao/fila',
      '/controle-voos/jornadas',
      '/controle-voos/indisponibilidades',
      '/controle-voos/hangaragem',
      '/controle-voos/relatorios',
      '/controle-voos/tabelas',
    ]);
  });

  it('correctly resolves active link on exact and nested routes', () => {
    expect(
      isControleVoosLinkActive('/controle-voos', {
        to: '/controle-voos',
        label: 'Dashboard',
        exact: true,
      }),
    ).toBe(true);
    expect(
      isControleVoosLinkActive('/controle-voos/dashboard', {
        to: '/controle-voos',
        label: 'Dashboard',
        exact: true,
      }),
    ).toBe(true);
    expect(
      isControleVoosLinkActive('/controle-voos/voos/123', {
        to: '/controle-voos/voos',
        label: 'Voos',
      }),
    ).toBe(true);
    expect(
      isControleVoosLinkActive('/controle-voos/rdv/456', {
        to: '/controle-voos/rdv',
        label: 'RDV',
      }),
    ).toBe(true);

    const activeForNested = resolveActiveControleVoosLink('/controle-voos/coordenacao/fila');
    expect(activeForNested.label).toBe('Fila da Coordenação');
  });

  it('renders mobile accessible select with all 10 options and touch target height >= 44px', () => {
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
    expect(options).toHaveLength(10);
    expect(options.map((opt) => (opt as HTMLOptionElement).value)).toEqual(
      CONTROLE_VOOS_NAV_LINKS.map((link) => link.to),
    );
  });

  it('navigates via mobile select while preserving query search params', () => {
    mockNavigate.mockClear();
    render(
      <MemoryRouter initialEntries={['/controle-voos?data=2026-09-04']}>
        <ControleVoosSubnav />
      </MemoryRouter>,
    );

    const mobileSelect = screen.getByRole('combobox', {
      name: /navegação do controle de voos/i,
    });
    fireEvent.change(mobileSelect, { target: { value: '/controle-voos/jornadas' } });

    expect(mockNavigate).toHaveBeenCalledWith('/controle-voos/jornadas?data=2026-09-04');
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
    expect(links).toHaveLength(10);

    const activeLink = links.find((link) => link.getAttribute('aria-current') === 'page');
    expect(activeLink).toBeDefined();
    expect(activeLink).toHaveTextContent('Voos');
    expect(activeLink).toHaveAttribute('href', '/controle-voos/voos');
    expect(activeLink).toHaveClass('min-h-[44px]');
  });
});

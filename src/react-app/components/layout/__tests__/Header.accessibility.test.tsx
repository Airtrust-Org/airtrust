import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Header } from '../Header';

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));

vi.mock('@/react-app/hooks/useAuth', () => ({
  useAuth: () => authMock(),
}));

describe('Header accessibility', () => {
  beforeEach(() => {
    authMock.mockReturnValue({
      user: { name: 'Usuário Teste', email: 'usuario@airtrust.test' },
      logout: vi.fn(async () => undefined),
      empresas: [{ id: 6, nome: 'Empresa Teste', modulos_ativos: ['dashboard'] }],
      empresaAtualId: 6,
    });
  });

  it('supports keyboard focus and complete menu interaction without implicit form submissions', async () => {
    const user = userEvent.setup();

    const { container } = render(
      <MemoryRouter initialEntries={['/']}>
        <Header />
      </MemoryRouter>,
    );

    const dashboard = screen.getByRole('button', { name: 'Painel' });
    const notifications = screen.getByRole('button', { name: 'Notificações' });
    const settings = screen.getByRole('button', { name: 'Configurações' });
    const profile = screen.getByRole('button', { name: 'Menu do perfil' });
    const mobileMenu = screen.getByRole('button', { name: 'Menu principal' });

    for (const button of screen.getAllByRole('button')) {
      expect(button).toHaveAttribute('type', 'button');
    }

    await user.tab();
    expect(dashboard).toHaveFocus();
    await user.tab();
    expect(notifications).toHaveFocus();
    await user.tab();
    expect(settings).toHaveFocus();
    await user.tab();
    expect(profile).toHaveFocus();
    await user.tab();
    expect(mobileMenu).toHaveFocus();

    for (const button of [notifications, settings, profile, mobileMenu]) {
      expect(button).toHaveAttribute('title');
      expect(button).toHaveClass('focus-visible:ring-2');
    }

    expect(container.querySelector('header svg')).toHaveAttribute('aria-hidden', 'true');
    expect(notifications.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(settings.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');

    expect(profile).toHaveAttribute('aria-haspopup', 'menu');
    expect(profile).toHaveAttribute('aria-controls', 'profile-menu');
    expect(profile).toHaveAttribute('aria-expanded', 'false');

    await user.tab({ shift: true });
    expect(profile).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(profile).toHaveAttribute('aria-expanded', 'true');

    const profilePopup = screen.getByRole('menu', { name: 'Menu do perfil' });
    const profileItems = within(profilePopup).getAllByRole('menuitem');
    expect(profileItems[0]).toHaveFocus();

    for (const item of profileItems) {
      expect(item).toHaveAttribute('type', 'button');
    }

    await user.keyboard('{ArrowDown}');
    expect(profileItems[1]).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(profileItems[0]).toHaveFocus();
    await user.keyboard('{End}');
    expect(profileItems[1]).toHaveFocus();
    await user.keyboard('{Home}');
    expect(profileItems[0]).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(profile).toHaveFocus();
    expect(profile).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu', { name: 'Menu do perfil' })).not.toBeInTheDocument();

    expect(mobileMenu).toHaveAttribute('aria-haspopup', 'menu');
    expect(mobileMenu).toHaveAttribute('aria-controls', 'mobile-navigation-menu');
    expect(mobileMenu).toHaveAttribute('aria-expanded', 'false');
    expect(mobileMenu.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');

    await user.tab();
    expect(mobileMenu).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(mobileMenu).toHaveAttribute('aria-expanded', 'true');

    const mobilePopup = screen.getByRole('menu', { name: 'Menu principal' });
    const mobileItems = within(mobilePopup).getAllByRole('menuitem');
    expect(mobileItems[0]).toHaveFocus();

    for (const item of mobileItems) {
      expect(item).toHaveAttribute('type', 'button');
      for (const icon of item.querySelectorAll('svg')) {
        expect(icon).toHaveAttribute('aria-hidden', 'true');
      }
    }

    await user.keyboard('{ArrowDown}');
    expect(mobileItems[1]).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(mobileItems[0]).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(mobileMenu).toHaveFocus();
    expect(mobileMenu).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu', { name: 'Menu principal' })).not.toBeInTheDocument();
  });
});

import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../hooks/useAuth', () => ({
  clearActiveSessionRole: vi.fn(),
  useAuth: () => ({ login: vi.fn() }),
}));

vi.mock('../../hooks/useSystemSettings', () => ({
  useSystemSettings: () => ({ logoSrc: '/airtrust-logo.svg' }),
}));

vi.mock('../../i18n/useLanguage', () => ({
  useLanguage: () => ({
    t: (key: string) => {
      const values: Record<string, string> = {
        'auth.login.title': 'Entrar',
        'auth.login.email': 'E-mail',
        'auth.login.password': 'Senha',
        'auth.login.submit': 'Entrar',
        'auth.login.submitting': 'Entrando...',
        'auth.login.forgotPassword': 'Esqueci minha senha',
        'auth.login.error': 'Não foi possível entrar',
      };
      return values[key] ?? key;
    },
  }),
}));

vi.mock('../../config/api', () => ({
  API_BASE_URL: '/api',
  fetchWithAuth: vi.fn(),
  getPersistLogin: () => false,
  setPersistLogin: vi.fn(),
  setTokens: vi.fn(),
}));

vi.mock('../../utils/devCredentials', () => ({
  getDevLoginCredentials: () => ({ email: '', password: '' }),
}));

vi.mock('../../utils/logger', () => ({
  logger: { error: vi.fn() },
}));

import LoginSimple from '../LoginSimple';

describe('LoginSimple password recovery entry', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/login');
  });

  it('renders the public recovery link pointing to forgot-password', () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <LoginSimple />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Esqueci minha senha' })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
  });
});

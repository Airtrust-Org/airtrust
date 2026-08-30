import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ForgotPasswordPage from '../ForgotPasswordPage';
import ResetPasswordPage from '../ResetPasswordPage';

const originalFetch = globalThis.fetch;

describe('password recovery public UI', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('submits forgot-password without revealing whether the user exists', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    globalThis.fetch = fetchMock as typeof fetch;

    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'usuario@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar instruções' }));

    await waitFor(() => expect(screen.getByText('Confira seu e-mail')).toBeInTheDocument());
    expect(screen.getByText(/não confirmamos se o e-mail está cadastrado/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/auth/forgot-password'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'usuario@example.com' }),
      }),
    );
  });

  it('shows a safe retry message when forgot-password is unavailable', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('', { status: 503 })) as typeof fetch;

    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'usuario@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar instruções' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Não foi possível solicitar a recuperação agora',
      ),
    );
  });

  it('fails closed when reset-password has no token', () => {
    window.history.replaceState({}, '', '/reset-password');
    render(<ResetPasswordPage />);

    expect(screen.getByRole('alert')).toHaveTextContent('Link de recuperação inválido');
    expect(screen.getByRole('link', { name: 'Solicitar novo link' })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
  });

  it('validates matching password locally before calling reset-password', () => {
    window.history.replaceState({}, '', '/reset-password?token=abc123');
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as typeof fetch;

    render(<ResetPasswordPage />);
    const fields = screen.getAllByLabelText(/senha/i);
    fireEvent.change(fields[0], { target: { value: 'senha1234' } });
    fireEvent.change(fields[1], { target: { value: 'senha5678' } });
    fireEvent.click(screen.getByRole('button', { name: 'Redefinir senha' }));

    expect(screen.getByRole('alert')).toHaveTextContent('As senhas informadas não conferem');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('submits token and password and returns the user to login after success', async () => {
    window.history.replaceState({}, '', '/reset-password?token=abc123');
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    globalThis.fetch = fetchMock as typeof fetch;

    render(<ResetPasswordPage />);
    const fields = screen.getAllByLabelText(/senha/i);
    fireEvent.change(fields[0], { target: { value: 'senha1234' } });
    fireEvent.change(fields[1], { target: { value: 'senha1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Redefinir senha' }));

    await waitFor(() => expect(screen.getByText('Senha redefinida')).toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'Ir para o login' })).toHaveAttribute('href', '/login');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/auth/reset-password'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ token: 'abc123', password: 'senha1234' }),
      }),
    );
  });

  it('does not expose backend reset details for an expired or invalid token', async () => {
    window.history.replaceState({}, '', '/reset-password?token=expired');
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: false, error: 'SQLSTATE internal detail' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    ) as typeof fetch;

    render(<ResetPasswordPage />);
    const fields = screen.getAllByLabelText(/senha/i);
    fireEvent.change(fields[0], { target: { value: 'senha1234' } });
    fireEvent.change(fields[1], { target: { value: 'senha1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Redefinir senha' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('link expirou'));
    expect(screen.queryByText(/SQLSTATE/i)).not.toBeInTheDocument();
  });
});

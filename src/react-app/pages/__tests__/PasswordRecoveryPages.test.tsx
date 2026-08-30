import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { controlledFetchMock } = vi.hoisted(() => ({
  controlledFetchMock: vi.fn(),
}));

vi.mock('../../utils/request-control', () => ({
  controlledFetch: (...args: unknown[]) => controlledFetchMock(...args),
}));

import ForgotPasswordPage from '../ForgotPasswordPage';
import ResetPasswordPage from '../ResetPasswordPage';

describe('password recovery public UI', () => {
  beforeEach(() => {
    controlledFetchMock.mockReset();
    window.history.replaceState({}, '', '/');
  });

  it('submits forgot-password without revealing whether the user exists', async () => {
    controlledFetchMock.mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'usuario@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar instruções' }));

    await waitFor(() => expect(screen.getByText('Confira seu e-mail')).toBeInTheDocument());
    expect(screen.getByText(/não confirmamos se o e-mail está cadastrado/i)).toBeInTheDocument();
    expect(controlledFetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/auth/forgot-password'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'usuario@example.com' }),
      }),
    );
  });

  it('shows a safe retry message when forgot-password is unavailable', async () => {
    controlledFetchMock.mockResolvedValue(new Response('', { status: 503 }));

    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'usuario@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar instruções' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Não foi possível solicitar a recuperação agora',
      ),
    );
  });

  it('shows the same safe retry message when the forgot-password request rejects', async () => {
    controlledFetchMock.mockRejectedValue(new TypeError('network down'));

    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'usuario@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar instruções' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Não foi possível solicitar a recuperação agora',
      ),
    );
    expect(screen.queryByText(/network down/i)).not.toBeInTheDocument();
  });

  it('does not call recovery when a programmatic submit has no email', () => {
    const { container } = render(<ForgotPasswordPage />);
    const form = container.querySelector('form');
    expect(form).not.toBeNull();
    fireEvent.submit(form!);

    expect(controlledFetchMock).not.toHaveBeenCalled();
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

  it('rejects a password shorter than eight characters before calling the API', () => {
    window.history.replaceState({}, '', '/reset-password?token=abc123');

    const { container } = render(<ResetPasswordPage />);
    const fields = screen.getAllByLabelText(/senha/i);
    fireEvent.change(fields[0], { target: { value: 'curta12' } });
    fireEvent.change(fields[1], { target: { value: 'curta12' } });
    fireEvent.submit(container.querySelector('form')!);

    expect(screen.getByRole('alert')).toHaveTextContent('no mínimo 8 caracteres');
    expect(controlledFetchMock).not.toHaveBeenCalled();
  });

  it('validates matching password locally before calling reset-password', () => {
    window.history.replaceState({}, '', '/reset-password?token=abc123');

    render(<ResetPasswordPage />);
    const fields = screen.getAllByLabelText(/senha/i);
    fireEvent.change(fields[0], { target: { value: 'senha1234' } });
    fireEvent.change(fields[1], { target: { value: 'senha5678' } });
    fireEvent.click(screen.getByRole('button', { name: 'Redefinir senha' }));

    expect(screen.getByRole('alert')).toHaveTextContent('As senhas informadas não conferem');
    expect(controlledFetchMock).not.toHaveBeenCalled();
  });

  it('submits token and password and returns the user to login after success', async () => {
    window.history.replaceState({}, '', '/reset-password?token=abc123');
    controlledFetchMock.mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    render(<ResetPasswordPage />);
    const fields = screen.getAllByLabelText(/senha/i);
    fireEvent.change(fields[0], { target: { value: 'senha1234' } });
    fireEvent.change(fields[1], { target: { value: 'senha1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Redefinir senha' }));

    await waitFor(() => expect(screen.getByText('Senha redefinida')).toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'Ir para o login' })).toHaveAttribute('href', '/login');
    expect(controlledFetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/auth/reset-password'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ token: 'abc123', password: 'senha1234' }),
      }),
    );
  });

  it.each([400, 401, 404])('treats HTTP %s as an invalid recovery link', async (status) => {
    window.history.replaceState({}, '', '/reset-password?token=invalid');
    controlledFetchMock.mockResolvedValue(
      new Response(JSON.stringify({ success: false, error: 'SQLSTATE internal detail' }), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    render(<ResetPasswordPage />);
    const fields = screen.getAllByLabelText(/senha/i);
    fireEvent.change(fields[0], { target: { value: 'senha1234' } });
    fireEvent.change(fields[1], { target: { value: 'senha1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Redefinir senha' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('link expirou'));
    expect(screen.queryByText(/SQLSTATE/i)).not.toBeInTheDocument();
  });

  it('treats a successful HTTP response with success false as a reset failure', async () => {
    window.history.replaceState({}, '', '/reset-password?token=abc123');
    controlledFetchMock.mockResolvedValue(
      new Response(JSON.stringify({ success: false }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    render(<ResetPasswordPage />);
    const fields = screen.getAllByLabelText(/senha/i);
    fireEvent.change(fields[0], { target: { value: 'senha1234' } });
    fireEvent.change(fields[1], { target: { value: 'senha1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Redefinir senha' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível redefinir a senha agora'),
    );
  });

  it('fails safely when a reset error response has malformed JSON', async () => {
    window.history.replaceState({}, '', '/reset-password?token=abc123');
    controlledFetchMock.mockResolvedValue(
      new Response('not-json', {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    render(<ResetPasswordPage />);
    const fields = screen.getAllByLabelText(/senha/i);
    fireEvent.change(fields[0], { target: { value: 'senha1234' } });
    fireEvent.change(fields[1], { target: { value: 'senha1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Redefinir senha' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível redefinir a senha agora'),
    );
  });

  it('uses a generic retry message for reset server failures', async () => {
    window.history.replaceState({}, '', '/reset-password?token=abc123');
    controlledFetchMock.mockResolvedValue(
      new Response(JSON.stringify({ success: false, error: 'internal stack detail' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    render(<ResetPasswordPage />);
    const fields = screen.getAllByLabelText(/senha/i);
    fireEvent.change(fields[0], { target: { value: 'senha1234' } });
    fireEvent.change(fields[1], { target: { value: 'senha1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Redefinir senha' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível redefinir a senha agora'),
    );
    expect(screen.queryByText(/internal stack detail/i)).not.toBeInTheDocument();
  });

  it('uses the same generic retry message when the reset request rejects', async () => {
    window.history.replaceState({}, '', '/reset-password?token=abc123');
    controlledFetchMock.mockRejectedValue(new TypeError('network down'));

    render(<ResetPasswordPage />);
    const fields = screen.getAllByLabelText(/senha/i);
    fireEvent.change(fields[0], { target: { value: 'senha1234' } });
    fireEvent.change(fields[1], { target: { value: 'senha1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Redefinir senha' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível redefinir a senha agora'),
    );
    expect(screen.queryByText(/network down/i)).not.toBeInTheDocument();
  });
});

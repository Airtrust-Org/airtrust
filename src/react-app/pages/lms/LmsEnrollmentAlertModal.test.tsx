import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  isLmsEnrollmentAlertable,
  LmsEnrollmentAlertModal,
} from './LmsEnrollmentAlertModal';

const { fetchWithAuthMock, toastMock } = vi.hoisted(() => ({
  fetchWithAuthMock: vi.fn(),
  toastMock: {
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/react-app/config/api', () => ({
  fetchWithAuth: (...args: unknown[]) => fetchWithAuthMock(...args),
}));

vi.mock('sonner', () => ({
  toast: toastMock,
}));

function ok(data: unknown) {
  return {
    ok: true,
    json: async () => ({ success: true, data }),
  } as Response;
}

const targets = [
  {
    id: 11,
    funcionario_id: 101,
    funcionario_nome: 'Ana Piloto',
    status: 'NAO_INICIADO' as const,
  },
  {
    id: 12,
    funcionario_id: 102,
    funcionario_nome: 'Bruno Piloto',
    status: 'EM_ANDAMENTO' as const,
  },
];

describe('LmsEnrollmentAlertModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('envia as matrículas selecionadas por e-mail e WhatsApp', async () => {
    fetchWithAuthMock.mockResolvedValueOnce(ok({
      selecionados: 2, processados: 2, email_ja_alertado: 0, whatsapp_ja_alertado: 0,
    })).mockResolvedValue(ok({
        selecionados: 2,
        processados: 2,
        email_enviados: 2,
        email_falhas: 0,
        sem_email: 0,
        whatsapp_enviados: 2,
        whatsapp_falhas: 0,
        sem_whatsapp: 0,
        nao_encontradas: 0,
      }),
    );
    const onClose = vi.fn();
    const onSent = vi.fn();

    render(
      <LmsEnrollmentAlertModal
        isOpen
        onClose={onClose}
        targets={targets}
        cursoTitulo="Integração Corporativa"
        onSent={onSent}
      />,
    );

    expect(screen.getByText('2 matrícula(s) selecionada(s)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Verificar e enviar 2 alerta(s)' }));

    await waitFor(() => expect(fetchWithAuthMock).toHaveBeenCalledTimes(2));
    expect(fetchWithAuthMock).toHaveBeenCalledWith(
      '/api/lms/matriculas/convites/lote',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          matricula_ids: [11, 12],
          modo: 'alerta',
          canais: { email: true, whatsapp: true },
          reenviar_hoje: false,
        }),
      }),
    );
    await waitFor(() => expect(toastMock.success).toHaveBeenCalled());
    expect(onSent).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('permite escolher somente e-mail', async () => {
    fetchWithAuthMock.mockResolvedValueOnce(ok({
      selecionados: 1, processados: 1, email_ja_alertado: 0, whatsapp_ja_alertado: 0,
    })).mockResolvedValue(ok({
        selecionados: 1,
        processados: 1,
        email_enviados: 1,
        email_falhas: 0,
        sem_email: 0,
        whatsapp_enviados: 0,
        whatsapp_falhas: 0,
        sem_whatsapp: 0,
        nao_encontradas: 0,
      }),
    );

    render(
      <LmsEnrollmentAlertModal
        isOpen
        onClose={vi.fn()}
        targets={[targets[0]]}
        cursoTitulo="Integração Corporativa"
      />,
    );

    const whatsAppCheckbox = screen.getByLabelText('WhatsApp');
    fireEvent.click(whatsAppCheckbox);
    fireEvent.click(screen.getByRole('button', { name: 'Verificar e enviar 1 alerta(s)' }));

    await waitFor(() => expect(fetchWithAuthMock).toHaveBeenCalledTimes(2));
    const body = JSON.parse(String(fetchWithAuthMock.mock.calls[1][1].body));
    expect(body.canais).toEqual({ email: true, whatsapp: false });
  });


  it('warns on a same-day alert and only resends with an explicit checkbox', async () => {
    fetchWithAuthMock.mockResolvedValueOnce(ok({
      selecionados: 1, processados: 1, email_ja_alertado: 1, whatsapp_ja_alertado: 1,
    })).mockResolvedValue(ok({
      selecionados: 1, processados: 1, email_enviados: 1, email_falhas: 0, sem_email: 0,
      whatsapp_enviados: 1, whatsapp_falhas: 0, sem_whatsapp: 0, nao_encontradas: 0,
    }));
    render(<LmsEnrollmentAlertModal
      isOpen onClose={vi.fn()} targets={[targets[0]]} cursoTitulo="Integração Corporativa"
    />);
    fireEvent.click(screen.getByRole('button', { name: 'Verificar e enviar 1 alerta(s)' }));
    await waitFor(() => expect(screen.getByText(/Já houve alertas aceitos/)).toBeInTheDocument());
    expect(fetchWithAuthMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('checkbox', { name: /Reenviar também os alertas/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar envio' }));
    await waitFor(() => expect(fetchWithAuthMock).toHaveBeenCalledTimes(2));
    const body = JSON.parse(String(fetchWithAuthMock.mock.calls[1][1].body));
    expect(body.reenviar_hoje).toBe(true);
  });

  it('clears resend consent after cancellation and checks the new selection again', async () => {
    fetchWithAuthMock.mockResolvedValueOnce(ok({
      selecionados: 1, processados: 1, email_ja_alertado: 1, whatsapp_ja_alertado: 0,
    })).mockResolvedValueOnce(ok({
      selecionados: 1, processados: 1, email_ja_alertado: 1, whatsapp_ja_alertado: 0,
    }));
    const onClose = vi.fn();
    const { rerender } = render(
      <LmsEnrollmentAlertModal
        isOpen onClose={onClose} targets={[targets[0]]} cursoTitulo="CRM"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Verificar e enviar 1 alerta(s)' }));
    const checkbox = await screen.findByRole('checkbox', { name: /Reenviar também os alertas/ });
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    rerender(<LmsEnrollmentAlertModal
      isOpen={false} onClose={onClose} targets={[]} cursoTitulo="CRM"
    />);
    rerender(<LmsEnrollmentAlertModal
      isOpen onClose={onClose} targets={[targets[1]]} cursoTitulo="AVSEC"
    />);
    const start = screen.getByRole('button', { name: 'Verificar e enviar 1 alerta(s)' });
    fireEvent.click(start);
    await waitFor(() => expect(fetchWithAuthMock).toHaveBeenCalledTimes(2));
    expect(fetchWithAuthMock.mock.calls[1][0]).toBe('/api/lms/matriculas/convites/lote/preview');
    const newResend = await screen.findByRole('checkbox', { name: /Reenviar também os alertas/ });
    expect(newResend).not.toBeChecked();
  });

  it('considera alertáveis apenas matrículas não iniciadas ou em andamento', () => {
    expect(isLmsEnrollmentAlertable({ status: 'NAO_INICIADO' })).toBe(true);
    expect(isLmsEnrollmentAlertable({ status: 'EM_ANDAMENTO' })).toBe(true);
    expect(isLmsEnrollmentAlertable({ status: 'CONCLUIDO' })).toBe(false);
    expect(isLmsEnrollmentAlertable({ status: 'CANCELADO' })).toBe(false);
    expect(isLmsEnrollmentAlertable({ status: 'REPROVADO' })).toBe(false);
  });
});

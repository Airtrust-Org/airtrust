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
    fetchWithAuthMock.mockResolvedValue(
      ok({
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
    fireEvent.click(screen.getByRole('button', { name: 'Enviar 2 alerta(s)' }));

    await waitFor(() => expect(fetchWithAuthMock).toHaveBeenCalledTimes(1));
    expect(fetchWithAuthMock).toHaveBeenCalledWith(
      '/api/lms/matriculas/convites/lote',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          matricula_ids: [11, 12],
          modo: 'alerta',
          canais: { email: true, whatsapp: true },
        }),
      }),
    );
    await waitFor(() => expect(toastMock.success).toHaveBeenCalled());
    expect(onSent).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('permite escolher somente e-mail', async () => {
    fetchWithAuthMock.mockResolvedValue(
      ok({
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
    fireEvent.click(screen.getByRole('button', { name: 'Enviar 1 alerta(s)' }));

    await waitFor(() => expect(fetchWithAuthMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse(String(fetchWithAuthMock.mock.calls[0][1].body));
    expect(body.canais).toEqual({ email: true, whatsapp: false });
  });

  it('considera alertáveis apenas matrículas não iniciadas ou em andamento', () => {
    expect(isLmsEnrollmentAlertable({ status: 'NAO_INICIADO' })).toBe(true);
    expect(isLmsEnrollmentAlertable({ status: 'EM_ANDAMENTO' })).toBe(true);
    expect(isLmsEnrollmentAlertable({ status: 'CONCLUIDO' })).toBe(false);
    expect(isLmsEnrollmentAlertable({ status: 'CANCELADO' })).toBe(false);
    expect(isLmsEnrollmentAlertable({ status: 'REPROVADO' })).toBe(false);
  });
});

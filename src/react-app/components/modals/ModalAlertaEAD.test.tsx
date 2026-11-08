import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { ModalAlertaEAD } from './ModalAlertaEAD';

const { warningMock, successMock, errorMock } = vi.hoisted(() => ({
  warningMock: vi.fn(),
  successMock: vi.fn(),
  errorMock: vi.fn(),
}));

vi.mock('@/react-app/utils/toast', () => ({
  showToast: {
    warning: warningMock,
    success: successMock,
    error: errorMock,
  },
}));

vi.mock('@/react-app/config/api', () => ({
  API_BASE_URL: 'http://localhost:3000/api',
  getAccessToken: () => 'token-teste',
}));

describe('ModalAlertaEAD', () => {
  beforeEach(() => {
    warningMock.mockReset();
    successMock.mockReset();
    errorMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('permite alerta de qualificação sem data de vencimento sem exibir vencimento fictício', () => {
    render(
      <ModalAlertaEAD
        isOpen
        onClose={vi.fn()}
        qualificacao={{
          id: 99,
          funcionario_nome: 'Daniel da Silva Cunha',
          qualificacao_nome: 'Regras de Ouro — Petrobras',
        }}
      />,
    );

    expect(screen.getAllByText(/Sem vencimento definido/i).length).toBeGreaterThan(0);
    expect(screen.getByDisplayValue(/Vencimento: Não se aplica/i)).toBeInTheDocument();
    expect(screen.queryByText(/Vencida há 0 dias/i)).not.toBeInTheDocument();
  });

  it('usa toast de warning com duration customizado no envio parcial', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            alertas: [
              { tipo: 'email', status: 'enviado' },
              { tipo: 'whatsapp', status: 'erro' },
            ],
          },
        }),
      }),
    );

    render(
      <ModalAlertaEAD
        isOpen
        onClose={vi.fn()}
        qualificacao={{
          id: 84,
          funcionario_nome: 'Filipe Daumas',
          qualificacao_nome: 'Treinamento EAD',
          data_vencimento: '2026-03-20',
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /enviar alerta/i }));

    await waitFor(() => {
      expect(warningMock).toHaveBeenCalledWith(
        expect.stringContaining('Alerta enviado parcialmente.'),
        { duration: 8000 },
      );
    });
  });

  it('solicita confirmação explícita antes de reenviar alerta já registrado hoje', async () => {
    const confirmMock = vi.fn(() => true);
    vi.stubGlobal('confirm', confirmMock);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: false, status: 409,
        json: async () => ({
          success: false,
          code: 'ALERTA_ALREADY_SENT_TODAY',
          reenvio_permitido: true,
          canais_ja_alertados_hoje: ['EMAIL', 'WHATSAPP'],
        }),
      })
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({
          success: true,
          data: { alertas: [{ tipo: 'email', status: 'enviado' }] },
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <ModalAlertaEAD isOpen onClose={vi.fn()}
        qualificacao={{ id: 84, funcionario_nome: 'Pessoa Sintetica', qualificacao_nome: 'CMA' }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /enviar alerta/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).reenviar_hoje).toBe(false);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).reenviar_hoje).toBe(true);
  });

  it('não reenvia se a confirmação de duplicidade for recusada', async () => {
    const confirmMock = vi.fn(() => false);
    vi.stubGlobal('confirm', confirmMock);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false, status: 409,
      json: async () => ({
        success: false,
        code: 'ALERTA_ALREADY_SENT_TODAY',
        reenvio_permitido: true,
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    render(
      <ModalAlertaEAD isOpen onClose={vi.fn()}
        qualificacao={{ id: 84, funcionario_nome: 'Pessoa Sintetica', qualificacao_nome: 'CMA' }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /enviar alerta/i }));
    await waitFor(() => expect(warningMock).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).reenviar_hoje).toBe(false);
  });

  it('não oferece reenvio de reserva indeterminada', async () => {
    const confirmMock = vi.fn(() => true);
    vi.stubGlobal('confirm', confirmMock);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false, status: 409,
      json: async () => ({
        success: false, code: 'ALERTA_PENDING_RECONCILIATION',
        error: 'Envio bloqueado até reconciliação da reserva de notificação',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    render(
      <ModalAlertaEAD isOpen onClose={vi.fn()}
        qualificacao={{ id: 84, funcionario_nome: 'Pessoa Sintetica', qualificacao_nome: 'CMA' }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /enviar alerta/i }));
    await waitFor(() => expect(errorMock).toHaveBeenCalled());
    expect(confirmMock).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('mostra falha final do Twilio e link para envio manual quando o WhatsApp e bloqueado apos queued', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            success: true,
            data: {
              alertas: [
                {
                  tipo: 'whatsapp',
                  destino: 'whatsapp:+5522998209617',
                  status: 'enviado',
                  provider: 'twilio',
                  providerStatus: 'queued',
                  providerMessageId: 'SM123',
                  deliveryStatusPath: '/alertas/whatsapp/delivery/SM123',
                  manualFallbackUrl: 'https://wa.me/5522998209617?text=Mensagem%20de%20teste',
                },
              ],
            },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            success: true,
            data: {
              sid: 'SM123',
              status: 'undelivered',
              errorCode: '63016',
              diagnosis: 'Mensagem fora da janela de 24 horas.',
            },
          }),
        }),
    );

    render(
      <ModalAlertaEAD
        isOpen
        onClose={vi.fn()}
        qualificacao={{
          id: 84,
          funcionario_nome: 'Filipe Daumas',
          qualificacao_nome: 'Treinamento EAD',
          data_vencimento: '2026-03-20',
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /enviar alerta/i }));

    await waitFor(() => {
      expect(errorMock).toHaveBeenCalledWith(expect.stringContaining('WhatsApp nao entregue.'), {
        duration: 10000,
      });
    });

    expect(screen.getAllByText(/Mensagem fora da janela de 24 horas/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: /abrir whatsapp para envio manual/i })).toHaveAttribute(
      'href',
      'https://wa.me/5522998209617?text=Mensagem%20de%20teste',
    );
  });
});

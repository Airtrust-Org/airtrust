import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ModalAvaliarFicha from './ModalAvaliarFicha';
import { toast } from 'sonner';

vi.mock('@/react-app/config/api', () => ({
  API_BASE_URL: 'http://localhost:3000/api',
  getAccessToken: () => 'token-teste',
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

describe('ModalAvaliarFicha', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('mostra mensagem operacional quando backend bloqueia ficha sem manobras', async () => {
    const fetchMock = vi.fn(
      async () =>
        ({
          ok: false,
          status: 409,
          json: async () => ({
            success: false,
            code: 'FICHA_MODELO_SEM_MANOBRAS',
            error:
              'Ficha modelo sem manobras cadastradas. Cadastre as manobras do modelo antes de avaliar o tripulante.',
          }),
        }) as Response,
    );
    const onClose = vi.fn();

    vi.stubGlobal('fetch', fetchMock);

    render(<ModalAvaliarFicha isOpen fichaId={901} onClose={onClose} onSucesso={vi.fn()} />);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Ficha modelo sem manobras cadastradas. Cadastre as manobras do modelo antes de avaliar o tripulante.',
      );
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    expect(toast.error).not.toHaveBeenCalledWith(
      'Erro: ficha sem manobras após população automática',
    );
  });

  it('renderiza em portal, restaura o scroll e salva rascunho sem recalcular status', async () => {
    const onClose = vi.fn();
    const onSucesso = vi.fn();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            updated_at: '2026-08-13T10:00:00.000Z',
            manobras: [{ id: 1, ordem: 1, codigo: 'M1', nome: 'Manobra 1', resultado: null }],
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { status: 'AVALIACAO_PENDENTE', updated_at: '2026-08-13T10:01:00.000Z' },
        }),
      });
    vi.stubGlobal('fetch', fetchMock);
    document.body.style.overflow = 'auto';

    const { unmount } = render(
      <div data-testid="clipped-parent" className="overflow-hidden">
        <ModalAvaliarFicha isOpen fichaId={901} onClose={onClose} onSucesso={onSucesso} />
      </div>,
    );

    await screen.findByText(/Manobra 1/);
    expect(screen.getByTestId('ficha-evaluation-modal').parentElement).toBe(document.body);
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.click(screen.getByRole('button', { name: /Salvar Rascunho/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toMatchObject({
      expected_updated_at: '2026-08-13T10:00:00.000Z',
      recalculate_status: false,
      manobras: [{ ordem: 1, resultado: null }],
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(onSucesso).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith('Rascunho salvo');

    unmount();
    expect(document.body.style.overflow).toBe('auto');
  });

  it('não finaliza com manobra ausente e aceita NR como avaliação válida', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            updated_at: '2026-08-13T10:00:00.000Z',
            manobras: [{ id: 1, ordem: 1, codigo: 'M1', nome: 'Manobra 1', resultado: null }],
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            status: 'AGUARDANDO_ASSINATURA_ALUNO',
            updated_at: '2026-08-13T10:01:00.000Z',
          },
        }),
      });
    vi.stubGlobal('fetch', fetchMock);
    const onClose = vi.fn();
    const onSucesso = vi.fn();

    render(<ModalAvaliarFicha isOpen fichaId={901} onClose={onClose} onSucesso={onSucesso} />);
    await screen.findByText(/Manobra 1/);

    fireEvent.click(screen.getByRole('button', { name: 'Finalizar' }));
    expect(toast.error).toHaveBeenCalledWith('Existem 1 manobras sem avaliação.');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'NR' }));
    fireEvent.click(screen.getByRole('button', { name: 'Finalizar' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toMatchObject({
      recalculate_status: true,
      manobras: [{ ordem: 1, resultado: 'NR' }],
    });
    expect(onSucesso).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

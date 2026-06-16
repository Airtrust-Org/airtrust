import { render, waitFor } from '@testing-library/react';
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
});

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ToastContainer, type Toast } from './Toast';

const toasts: Toast[] = [
  {
    id: 'info-1',
    type: 'info',
    message: 'Atualização concluída',
    duration: 60_000,
  },
  {
    id: 'error-1',
    type: 'error',
    message: 'Falha ao salvar',
    duration: 60_000,
  },
];

describe('ToastContainer accessibility', () => {
  it('mantem a regiao nomeada sem duplicar anuncios dos itens', () => {
    render(<ToastContainer toasts={toasts} onClose={vi.fn()} />);

    const region = screen.getByRole('region', { name: 'Notificações' });
    expect(region).not.toHaveAttribute('aria-live');
    expect(region).not.toHaveAttribute('aria-atomic');

    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByRole('alert')).toHaveAttribute('aria-live', 'assertive');
  });

  it('torna os controles de fechamento explicitos e oculta os icones decorativos', () => {
    render(<ToastContainer toasts={[toasts[0]]} onClose={vi.fn()} />);

    const closeButton = screen.getByRole('button', { name: 'Fechar notificação' });
    expect(closeButton).toHaveAttribute('type', 'button');
    expect(closeButton.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});

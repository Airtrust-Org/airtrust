import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import AlertModal from './AlertModal';

describe('AlertModal accessibility', () => {
  it('associa titulo e mensagem ao alertdialog', () => {
    render(
      <AlertModal
        isOpen
        onClose={vi.fn()}
        title="Atenção operacional"
        message="Revise os dados antes de continuar."
      />,
    );

    const dialog = screen.getByRole('alertdialog', { name: 'Atenção operacional' });
    const title = within(dialog).getByText('Atenção operacional');
    const message = within(dialog).getByText('Revise os dados antes de continuar.');

    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', title.id);
    expect(dialog).toHaveAttribute('aria-describedby', message.id);
  });

  it('torna os botoes seguros e oculta os icones decorativos', () => {
    render(
      <AlertModal
        isOpen
        onClose={vi.fn()}
        title="Aviso"
        message="Mensagem de teste"
        confirmText="Confirmar"
      />,
    );

    const closeButton = screen.getByRole('button', { name: 'Fechar' });
    const confirmButton = screen.getByRole('button', { name: 'Confirmar' });
    const dialog = screen.getByRole('alertdialog');

    expect(closeButton).toHaveAttribute('type', 'button');
    expect(closeButton).toHaveAttribute('title', 'Fechar');
    expect(closeButton).toHaveClass(
      'focus-visible:outline-none',
      'focus-visible:ring-2',
      'focus-visible:ring-primary-500',
      'focus-visible:ring-offset-2',
    );
    expect(confirmButton).toHaveAttribute('type', 'button');
    expect(closeButton.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(dialog.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(2);
  });

  it('nao renderiza o dialogo quando fechado', () => {
    render(<AlertModal isOpen={false} onClose={vi.fn()} message="Oculto" />);

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});

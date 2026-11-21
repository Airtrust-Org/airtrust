import React, { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ModalOverlay } from './ModalOverlay';

function WithBackdropClose() {
  const [open, setOpen] = useState(true);
  if (!open) return <p>fechado</p>;
  return (
    <ModalOverlay className="fixed inset-0 bg-black/50" onClick={() => setOpen(false)}>
      <div role="presentation" onClick={(e) => e.stopPropagation()}>
        <h2>Editar usuário</h2>
        <input aria-label="Nome" />
        <button type="button">Salvar</button>
      </div>
    </ModalOverlay>
  );
}

describe('ModalOverlay', () => {
  it('dá semântica de diálogo ao painel e o nomeia pelo primeiro título', () => {
    render(<WithBackdropClose />);
    const dialog = screen.getByRole('dialog', { name: 'Editar usuário' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('foca o primeiro campo, mantém Tab dentro do painel e fecha com Escape pelo clique do backdrop', async () => {
    const user = userEvent.setup();
    render(<WithBackdropClose />);

    expect(document.activeElement).toBe(screen.getByLabelText('Nome'));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Salvar' }));
    await user.tab();
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);

    await user.keyboard('{Escape}');
    expect(screen.getByText('fechado')).toBeTruthy();
  });

  it('sem onClick no overlay, Escape aciona o botão Cancelar/Fechar do painel', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <ModalOverlay className="fixed inset-0">
        <div>
          <h2>Confirmar</h2>
          <button type="button" onClick={onCancel}>
            Cancelar
          </button>
        </div>
      </ModalOverlay>,
    );
    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

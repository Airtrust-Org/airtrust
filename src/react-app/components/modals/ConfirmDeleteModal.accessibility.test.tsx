import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ConfirmDeleteModal } from './ConfirmDeleteModal';

describe('ConfirmDeleteModal accessibility', () => {
  it('nao renderiza o dialogo quando esta fechado', () => {
    render(
      <ConfirmDeleteModal
        isOpen={false}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        message="Mensagem de confirmação"
      />,
    );

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('associa titulo, mensagem, item e aviso ao dialogo', () => {
    render(
      <ConfirmDeleteModal
        isOpen
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        title="Excluir relatório"
        message="A exclusão removerá o relatório selecionado."
        itemName="Relatório 42"
      />,
    );

    const dialog = screen.getByRole('alertdialog', { name: 'Excluir relatório' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-busy', 'false');

    const title = screen.getByRole('heading', { name: 'Excluir relatório' });
    expect(dialog).toHaveAttribute('aria-labelledby', title.id);

    const describedIds = dialog.getAttribute('aria-describedby')?.split(' ') ?? [];
    expect(describedIds).toHaveLength(3);
    expect(describedIds.map((id) => document.getElementById(id)?.textContent)).toEqual([
      'A exclusão removerá o relatório selecionado.',
      'Item: Relatório 42',
      '⚠️ Esta ação não pode ser desfeita.',
    ]);
  });

  it('mantem os controles explicitos e preserva as acoes', () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();

    render(
      <ConfirmDeleteModal
        isOpen
        onClose={onClose}
        onConfirm={onConfirm}
        message="Confirma a exclusão?"
      />,
    );

    const closeButton = screen.getByRole('button', { name: 'Fechar confirmação' });
    const cancelButton = screen.getByRole('button', { name: 'Cancelar' });
    const confirmButton = screen.getByRole('button', { name: 'Excluir' });

    expect(closeButton).toHaveAttribute('type', 'button');
    expect(closeButton).toHaveAttribute('title', 'Fechar confirmação');
    expect(closeButton).toHaveClass(
      'focus-visible:outline-none',
      'focus-visible:ring-2',
      'focus-visible:ring-primary-500',
      'focus-visible:ring-offset-2',
    );
    expect(cancelButton).toHaveAttribute('type', 'button');
    expect(confirmButton).toHaveAttribute('type', 'button');
    expect(closeButton.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');

    fireEvent.click(cancelButton);
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(confirmButton);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('informa estado ocupado e bloqueia as acoes durante exclusao', () => {
    render(
      <ConfirmDeleteModal
        isOpen
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        message="Confirma a exclusão?"
        loading
      />,
    );

    expect(screen.getByRole('alertdialog')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Excluir' })).toBeDisabled();
  });
});

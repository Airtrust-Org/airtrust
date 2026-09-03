import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Trash2 } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';

import { RowActionsMenu } from './RowActionsMenu';

describe('RowActionsMenu', () => {
  it('keeps destructive actions hidden until the secondary menu is opened', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();

    render(
      <RowActionsMenu
        actions={[
          {
            label: 'Excluir',
            destructive: true,
            icon: Trash2,
            onSelect: onDelete,
          },
        ]}
      />,
    );

    expect(screen.queryByRole('menuitem', { name: 'Excluir' })).not.toBeInTheDocument();

    const trigger = screen.getByRole('button', { name: 'Mais ações' });
    await user.click(trigger);
    await user.click(screen.getByRole('menuitem', { name: 'Excluir' }));

    expect(onDelete).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'false'));
  });

  it('closes on Escape and returns focus to the menu trigger', async () => {
    const user = userEvent.setup();

    render(
      <RowActionsMenu
        actions={[
          {
            label: 'Excluir',
            destructive: true,
            icon: Trash2,
            onSelect: vi.fn(),
          },
        ]}
      />,
    );

    const trigger = screen.getByRole('button', { name: 'Mais ações' });
    await user.click(trigger);
    expect(screen.getByRole('menuitem', { name: 'Excluir' })).toBeInTheDocument();

    await user.keyboard('{Escape}');

    await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'false'));
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('uses the 44px minimum touch-target contract on the trigger', () => {
    render(
      <RowActionsMenu
        actions={[{ label: 'Excluir', destructive: true, onSelect: vi.fn() }]}
      />,
    );

    expect(screen.getByRole('button', { name: 'Mais ações' })).toHaveClass('min-h-11', 'min-w-11');
  });

  it('renders nothing when there are no available actions', () => {
    const { container } = render(<RowActionsMenu actions={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('supports a custom label, left alignment and a non-destructive action without an icon', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();

    render(
      <RowActionsMenu
        label="Ações do registro"
        align="left"
        actions={[{ label: 'Abrir', onSelect: onOpen }]}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Ações do registro' }));

    const action = screen.getByRole('menuitem', { name: 'Abrir' });
    expect(action).toHaveClass('text-slate-700');
    expect(action.querySelector('svg')).toBeNull();

    await user.click(action);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('keeps disabled actions inert', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(
      <RowActionsMenu
        actions={[
          {
            label: 'Excluir bloqueado',
            destructive: true,
            disabled: true,
            onSelect,
          },
        ]}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Mais ações' }));

    const action = screen.getByRole('menuitem', { name: 'Excluir bloqueado' });
    expect(action).toBeDisabled();
    await user.click(action);
    expect(onSelect).not.toHaveBeenCalled();
  });
});

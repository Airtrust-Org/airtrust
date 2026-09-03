import { render, screen } from '@testing-library/react';
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

    expect(screen.queryByRole('button', { name: 'Excluir' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Mais ações' }));
    await user.click(screen.getByRole('button', { name: 'Excluir' }));

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Excluir' })).not.toBeInTheDocument();
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
    expect(screen.getByRole('button', { name: 'Excluir' })).toBeInTheDocument();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('button', { name: 'Excluir' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('uses the 44px minimum touch-target contract on the trigger', () => {
    render(
      <RowActionsMenu
        actions={[{ label: 'Excluir', destructive: true, onSelect: vi.fn() }]}
      />,
    );

    expect(screen.getByRole('button', { name: 'Mais ações' })).toHaveClass('min-h-11', 'min-w-11');
  });
});

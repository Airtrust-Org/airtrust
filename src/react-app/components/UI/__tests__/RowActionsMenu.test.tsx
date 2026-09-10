import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { RowActionsMenu } from '../RowActionsMenu';

describe('RowActionsMenu', () => {
  it('portals the menu outside overflow containers and keeps the action clickable', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    const { container } = render(
      <div data-testid="overflow-container" className="overflow-auto">
        <RowActionsMenu actions={[{ label: 'Deletar qualificação', onSelect, destructive: true }]} />
      </div>,
    );

    await user.click(screen.getByRole('button', { name: 'Mais ações' }));

    const menuItem = await screen.findByRole('menuitem', { name: 'Deletar qualificação' });
    const overflowContainer = screen.getByTestId('overflow-container');

    expect(overflowContainer.contains(menuItem)).toBe(false);
    expect(container.contains(menuItem)).toBe(false);

    await user.click(menuItem);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});

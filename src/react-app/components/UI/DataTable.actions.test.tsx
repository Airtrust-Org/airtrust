import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DataTable } from './DataTable';

describe('DataTable destructive row actions', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not expose delete as an always-visible row action', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(
      <DataTable
        columns={[{ key: 'nome', label: 'Nome' }]}
        data={[{ id: 42, nome: 'Registro sensível' }]}
        onDelete={onDelete}
      />,
    );

    expect(screen.queryByRole('button', { name: /deletar|excluir/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Mais ações' }));
    await user.click(screen.getByRole('button', { name: 'Excluir' }));

    expect(window.confirm).toHaveBeenCalledWith('Tem certeza que deseja deletar?');
    expect(onDelete).toHaveBeenCalledWith(42);
  });

  it('preserves useful non-destructive actions as 44px quick targets', () => {
    render(
      <DataTable
        columns={[{ key: 'nome', label: 'Nome' }]}
        data={[{ id: 7, nome: 'Registro' }]}
        onView={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Visualizar' })).toHaveClass('min-h-11', 'min-w-11');
    expect(screen.getByRole('button', { name: 'Editar' })).toHaveClass('min-h-11', 'min-w-11');
    expect(screen.getByRole('button', { name: 'Mais ações' })).toHaveClass('min-h-11', 'min-w-11');
  });
});

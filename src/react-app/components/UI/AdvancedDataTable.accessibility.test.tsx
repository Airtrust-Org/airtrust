import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdvancedDataTable } from './AdvancedDataTable';

const columns = [{ key: 'nome', label: 'Nome' }];
const data = Array.from({ length: 11 }, (_, index) => ({
  id: index + 1,
  nome: `Pessoa ${index + 1}`,
}));

type TableProps = React.ComponentProps<typeof AdvancedDataTable>;

function renderTable(overrides: Partial<TableProps> = {}) {
  const onView = vi.fn();
  const onEdit = vi.fn();
  const onDelete = vi.fn();
  const onPageChange = vi.fn();

  render(
    <AdvancedDataTable
      columns={columns}
      data={data}
      onView={onView}
      onEdit={onEdit}
      onDelete={onDelete}
      onPageChange={onPageChange}
      pageSize={10}
      enableCheckboxes={false}
      enableExport={false}
      columnResizable={false}
      {...overrides}
    />,
  );

  return { onView, onEdit, onDelete, onPageChange };
}

describe('AdvancedDataTable accessibility', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('exposes named icon controls with visible keyboard focus', () => {
    renderTable();

    const firstView = screen.getAllByRole('button', { name: 'Visualizar' })[0];
    const firstEdit = screen.getAllByRole('button', { name: 'Editar' })[0];
    const firstDelete = screen.getAllByRole('button', { name: 'Deletar' })[0];
    const previousPage = screen.getByRole('button', { name: 'Página anterior' });
    const nextPage = screen.getByRole('button', { name: 'Próxima página' });

    for (const button of [firstView, firstEdit, previousPage, nextPage]) {
      expect(button).toHaveClass('focus-visible:ring-2', 'focus-visible:ring-primary-600');
      expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    }

    expect(firstDelete).toHaveClass('focus-visible:ring-2', 'focus-visible:ring-red-600');
    expect(firstDelete.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(previousPage).toHaveAttribute('title', 'Página anterior');
    expect(nextPage).toHaveAttribute('title', 'Próxima página');

    fireEvent.change(screen.getByPlaceholderText('Pesquisar...'), {
      target: { value: 'Pessoa' },
    });

    const clearSearch = screen.getByRole('button', { name: 'Limpar busca' });
    expect(clearSearch).toHaveClass('focus-visible:ring-2', 'focus-visible:ring-primary-600');
    expect(clearSearch).toHaveAttribute('title', 'Limpar busca');
    expect(clearSearch.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('preserves row actions, search clearing and pagination', () => {
    const { onView, onPageChange } = renderTable();

    fireEvent.click(screen.getAllByRole('button', { name: 'Visualizar' })[0]);
    expect(onView).toHaveBeenCalledWith(1);

    const searchInput = screen.getByPlaceholderText('Pesquisar...');
    fireEvent.change(searchInput, { target: { value: 'Pessoa' } });
    fireEvent.click(screen.getByRole('button', { name: 'Limpar busca' }));
    expect(searchInput).toHaveValue('');

    fireEvent.click(screen.getByRole('button', { name: 'Próxima página' }));
    expect(onPageChange).toHaveBeenCalledWith(2);
    expect(screen.getByText('Pessoa 11')).toBeInTheDocument();
  });
});
